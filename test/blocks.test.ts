import { describe, expect, it } from "vitest";
import {
  BLOCK_FIELD_KINDS,
  blockLibrary,
  BlockDefinitionError,
  blockSchemasForPackage,
  defineBlock,
} from "../src/lib/blocks/defineBlock";
import {
  blockVersionDrift,
  isBlockSection,
  missingBlocks,
  pageForSegments,
  resolveBlockSection,
  staticParamsFor,
} from "../src/lib/blocks/pages";
import {
  parseSiteMessage,
  VISUAL_EDITING_CHANNEL,
  VISUAL_EDITING_PROTOCOL_VERSION,
  VISUAL_EDITING_PROTOCOL_VERSIONS,
  speaksProtocolVersion,
} from "../src/lib/visual-editing/protocol";
import type { RenderSite } from "../src/lib/delivery/renderModel";

// The agency half of the block contract: what a developer declares in their own
// repo, and how a page SnabbSajt knows about is served by their app.
//
// The app half already shipped (`blockSchemas`, the props checker, the `block`
// section). What these cases defend is the promise this end makes: a
// declaration the app would refuse fails in the developer's own build instead
// of hours later in a push, and a live page never grows a hole because a deploy
// went out before a component did.

const pricing = defineBlock({
  type: "pricing-table",
  label: "Prislista",
  fields: [
    { key: "title", kind: "text", label: "Rubrik" },
    { key: "note", kind: "richtext", optional: true },
    { key: "cta", kind: "link" },
  ],
  variants: ["light", "dark"],
});

function siteWith(blockType: string, version = 1): RenderSite {
  return {
    source: "published",
    businessName: "Kund AB",
    language: "sv",
    theme: {},
    assets: {},
    pages: [
      {
        slug: "",
        title: "Hem",
        order: 0,
        showInNav: true,
        sections: [
          {
            type: "block",
            variant: "light",
            content: {
              type: "block",
              blockType,
              version,
              props: { title: "Priser" },
            },
          },
        ],
      },
      {
        slug: "om-oss",
        title: "Om oss",
        order: 1,
        showInNav: true,
        sections: [],
      },
    ],
  };
}

describe("declaring a block", () => {
  it("keeps what the developer wrote, and fills in the version", () => {
    expect(pricing.type).toBe("pricing-table");
    expect(pricing.label).toBe("Prislista");
    // A first `defineBlock` should not have to think about versioning.
    expect(pricing.version).toBe(1);
  });

  it("fails in the developer's own build, not in a later push", () => {
    // The whole reason this throws rather than returns a result: the message
    // lands in the terminal next to the file that caused it.
    expect(() => defineBlock({ type: "Pricing Table", label: "x", fields: [] })).toThrow(
      BlockDefinitionError,
    );
    expect(() =>
      defineBlock({
        type: "ok",
        label: "x",
        fields: [{ key: "a", kind: "text" }, { key: "a", kind: "richtext" }],
      }),
    ).toThrow(/twice/);
    expect(() =>
      defineBlock({ type: "ok", label: "x", fields: [{ key: "pick", kind: "select" }] }),
    ).toThrow(/no options/);
    expect(() =>
      // @ts-expect-error a kind the app does not know would be stored and then
      // refused on the client's first edit.
      defineBlock({ type: "ok", label: "x", fields: [{ key: "a", kind: "markdown" }] }),
    ).toThrow(/kind/);
  });

  it("refuses two blocks with the same name in one library", () => {
    expect(() => blockLibrary(pricing, { ...pricing, label: "Annan" })).toThrow(
      /both called/,
    );
  });
});

// ---------------------------------------------------------------------------
// The two kinds a client actually asks for: reorderable cards, and the little
// picture beside one. Added 2026-08-28 (the app's plan
// P0-2026-08-28-same-website-sdk-examples-100-percent.md, slice 3).
//
// Both halves of this contract have to agree or the feature fails SILENTLY: a
// kind this file accepts and the app does not is stored by `snabbsajt push`
// and then refused on the client's first edit, hours later, in a place the
// developer is not looking. So the list itself is pinned here as well.
// ---------------------------------------------------------------------------

const services = defineBlock({
  type: "service-cards",
  label: "Tjänster",
  fields: [
    { key: "heading", kind: "text", label: "Rubrik" },
    {
      key: "items",
      kind: "list",
      label: "Kort",
      maxItems: 6,
      fields: [
        { key: "title", kind: "text", label: "Rubrik" },
        { key: "body", kind: "richtext", label: "Text", optional: true },
        { key: "mark", kind: "icon", label: "Ikon", options: ["star", "bolt"] },
        { key: "more", kind: "link", label: "Läs mer", optional: true },
      ],
    },
    { key: "tone", kind: "select", label: "Ton", options: ["light", "dark"] },
  ],
});

describe("lists, icons and declared style choices", () => {
  it("declares the same eight kinds the app knows", () => {
    // A ninth here, or a missing one, is the drift that ships a block the app
    // refuses. Both ends carry this literal so neither can move alone.
    expect([...BLOCK_FIELD_KINDS].sort()).toEqual([
      "boolean",
      "icon",
      "image",
      "link",
      "list",
      "richtext",
      "select",
      "text",
    ]);
  });

  it("keeps a list's own fields, and carries them into the package", () => {
    const list = services.fields.find((f) => f.key === "items");
    expect(list?.kind).toBe("list");
    expect(list?.fields?.map((f) => f.key)).toEqual([
      "title",
      "body",
      "mark",
      "more",
    ]);
    expect(list?.maxItems).toBe(6);
    // What `snabbsajt push` actually sends. A sub-field lost here is a card the
    // client can never fill in.
    const [packaged] = blockSchemasForPackage(blockLibrary(services));
    const packagedList = packaged.fields.find((f) => f.key === "items");
    expect(packagedList?.fields?.map((f) => f.kind)).toEqual([
      "text",
      "richtext",
      "icon",
      "link",
    ]);
  });

  it("refuses a list inside a list, and says why", () => {
    expect(() =>
      defineBlock({
        type: "nested",
        label: "x",
        fields: [
          {
            key: "outer",
            kind: "list",
            fields: [
              { key: "inner", kind: "list", fields: [{ key: "a", kind: "text" }] },
            ],
          },
        ],
      }),
    ).toThrow(/one level deep/);
  });

  it("refuses a list that never says what one item holds", () => {
    expect(() =>
      defineBlock({
        type: "empty-list",
        label: "x",
        fields: [{ key: "items", kind: "list" }],
      }),
    ).toThrow(/list with no fields/);
    expect(() =>
      defineBlock({
        type: "empty-list",
        label: "x",
        fields: [{ key: "items", kind: "list", fields: [] }],
      }),
    ).toThrow(/list with no fields/);
  });

  it("checks a list item's fields with the same rules as the top level", () => {
    // The whole point of one recursive checker. A looser second copy is how an
    // icon with no options reaches a client's editor one level down and draws
    // an empty menu.
    expect(() =>
      defineBlock({
        type: "bad-item",
        label: "x",
        fields: [
          {
            key: "items",
            kind: "list",
            fields: [{ key: "mark", kind: "icon" }],
          },
        ],
      }),
    ).toThrow(/icon with no options/);
    expect(() =>
      defineBlock({
        type: "bad-item",
        label: "x",
        fields: [
          {
            key: "items",
            kind: "list",
            fields: [
              { key: "a", kind: "text" },
              { key: "a", kind: "text" },
            ],
          },
        ],
      }),
    ).toThrow(/items\.a" twice/);
  });

  it("names the field by its path, so a message points at a box", () => {
    expect(() =>
      defineBlock({
        type: "bad-item",
        label: "x",
        fields: [
          {
            key: "items",
            kind: "list",
            // @ts-expect-error the app would refuse this kind on first edit.
            fields: [{ key: "size", kind: "number" }],
          },
        ],
      }),
    ).toThrow(/items\.size/);
  });

  it("refuses a lock inside a list rather than dropping it in silence", () => {
    // A lock is one content PATH, and a list's items have no fixed count, so
    // "the price on every card" is not a path the app could name. Throwing is
    // the difference between a lock you think you shipped and one you know you
    // did not.
    expect(() =>
      defineBlock({
        type: "locked-item",
        label: "x",
        fields: [
          {
            key: "items",
            kind: "list",
            fields: [{ key: "price", kind: "text", locked: true }],
          },
        ],
      }),
    ).toThrow(/Lock the list itself/);
  });

  it("treats a declared style choice as an ordinary select, with no third kind", () => {
    // Owner answer 2026-08-28: light/dark and image left/right are `select`.
    // Nothing else was built for them, and nothing needs to be.
    const tone = services.fields.find((f) => f.key === "tone");
    expect(tone?.kind).toBe("select");
    expect(tone?.options).toEqual(["light", "dark"]);
  });
});

describe("serving a page SnabbSajt knows about", () => {
  const library = blockLibrary(pricing);

  it("finds the home page for an empty catch-all", () => {
    // Next hands a catch-all no segments at all for the home route, and an app
    // that only handles `[""]` falls through on its most important page.
    const site = siteWith("pricing-table");
    expect(pageForSegments(site, undefined)?.slug).toBe("");
    expect(pageForSegments(site, [])?.slug).toBe("");
    expect(pageForSegments(site, ["om-oss"])?.slug).toBe("om-oss");
    expect(pageForSegments(site, ["nope"])).toBeUndefined();
  });

  it("lists every path for generateStaticParams, home included", () => {
    expect(staticParamsFor(siteWith("pricing-table"))).toEqual([
      { slug: [] },
      { slug: ["om-oss"] },
    ]);
  });

  it("resolves a block section against the repo's own components", () => {
    const site = siteWith("pricing-table");
    const section = site.pages[0].sections[0];
    expect(isBlockSection(section)).toBe(true);
    if (!isBlockSection(section)) return;
    const resolved = resolveBlockSection(section, library);
    expect(resolved.definition).toBe(pricing);
    expect(resolved.variant).toBe("light");
    // Passed through as data: the client's content is what the client wrote.
    expect(resolved.props).toEqual({ title: "Priser" });
  });

  it("names a block the repo does not declare instead of rendering a hole", () => {
    const site = siteWith("gone-missing");
    expect(missingBlocks(site, library)).toEqual(["gone-missing"]);
    const section = site.pages[0].sections[0];
    if (!isBlockSection(section)) return;
    // Resolved with no definition: the caller renders nothing and the build log
    // gets to complain, rather than the visitor seeing a grey box.
    expect(resolveBlockSection(section, library).definition).toBeUndefined();
  });

  it("reports a page still written against an older version of a block", () => {
    const drift = blockVersionDrift(siteWith("pricing-table", 1), {
      "pricing-table": { ...pricing, version: 3 },
    });
    expect(drift).toEqual([
      {
        blockType: "pricing-table",
        pageSlug: "",
        contentVersion: 1,
        libraryVersion: 3,
      },
    ]);
  });
});

describe("agreeing a protocol version with the editor", () => {
  it("speaks every version it lists, and nothing else", () => {
    for (const version of VISUAL_EDITING_PROTOCOL_VERSIONS) {
      expect(speaksProtocolVersion(version)).toBe(true);
    }
    expect(speaksProtocolVersion(99)).toBe(false);
    expect(speaksProtocolVersion("1")).toBe(false);
  });

  it("accepts a message in any version it still speaks", () => {
    for (const version of VISUAL_EDITING_PROTOCOL_VERSIONS) {
      const parsed = parseSiteMessage({
        channel: VISUAL_EDITING_CHANNEL,
        version,
        type: "ready",
      });
      expect(parsed?.type, `version ${version}`).toBe("ready");
      // Answered in the version it arrived in, not blindly in the newest.
      expect(parsed?.version).toBe(version);
    }
    expect(
      parseSiteMessage({
        channel: VISUAL_EDITING_CHANNEL,
        version: VISUAL_EDITING_PROTOCOL_VERSION + 50,
        type: "ready",
      }),
    ).toBeUndefined();
  });
});
