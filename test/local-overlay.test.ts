import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockLibrary, defineBlock } from "../src/lib/blocks/defineBlock";
import { checkFieldValue, overlayRows } from "../src/lib/devlocal/fields";
import { mountLocalOverlay as mountInlineOverlay } from "../src/lib/devlocal/inlineOverlay";
import { mountLocalOverlay, OVERLAY_STATE_KEY } from "../src/lib/devlocal/overlay";
import { createLocalContentHandler } from "../src/lib/devlocal/handler";
import { applyContentEdit } from "../src/lib/devlocal/writeContent";

// ── the block every test edits ─────────────────────────────────────────────

const hero = defineBlock({
  type: "hero",
  label: "Hero",
  fields: [
    { key: "heading", kind: "text", label: "Rubrik", maxLength: 40 },
    { key: "body", kind: "richtext" },
    { key: "cover", kind: "image" },
    { key: "cta", kind: "link" },
    { key: "tone", kind: "select", options: ["light", "dark"] },
    { key: "compact", kind: "boolean" },
    { key: "price", kind: "text", label: "Pris", locked: true },
  ],
});

const library = blockLibrary(hero);

const PAGE = {
  slug: "",
  order: 0,
  sections: [
    {
      id: "sec-1",
      type: "block",
      content: {
        type: "block",
        blockType: "hero",
        version: 1,
        props: { heading: "Före", price: "1 000 kr" },
      },
    },
  ],
};

/** A content directory holding one page, thrown away with the temp dir. */
async function contentDir(page: unknown = PAGE): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "snabbsite-overlay-"));
  const dir = join(root, "snabbsajt", "content");
  await mkdir(join(dir, "pages"), { recursive: true });
  await writeFile(join(dir, "pages", "start.json"), JSON.stringify(page, null, 2));
  return dir;
}

async function pageOnDisk(dir: string) {
  return JSON.parse(await readFile(join(dir, "pages", "start.json"), "utf8"));
}

// ── a document stand-in ────────────────────────────────────────────────────
//
// Same spirit as `fakeWindow` in visual-editing.test.ts: the overlay's DOM
// surface is deliberately tiny, so faking it is cheaper than adding jsdom to a
// package that has no DOM dependency at all.

type FakeElement = ReturnType<typeof element>;

function element(tag: string) {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const node = {
    _fakeElement: true,
    tag,
    children: [] as FakeElement[],
    attributes: {} as Record<string, string>,
    style: {} as Record<string, string>,
    value: "",
    checked: false,
    disabled: false,
    removed: false,
    _text: "",
    get textContent() {
      return node._text;
    },
    set textContent(next: string) {
      node._text = next;
      // Real `textContent = ""` drops every child. The panel redraws that way.
      if (next === "") node.children = [];
    },
    get innerText() {
      return node._text;
    },
    set innerText(next: string) {
      node._text = next;
    },
    setAttribute(name: string, value: string) {
      node.attributes[name] = value;
    },
    getAttribute(name: string) {
      return node.attributes[name] ?? null;
    },
    removeAttribute(name: string) {
      delete node.attributes[name];
    },
    appendChild(child: FakeElement) {
      node.children.push(child);
      return child;
    },
    append(...children: FakeElement[]) {
      node.children.push(...children);
    },
    addEventListener(type: string, listener: (event: unknown) => void) {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    removeEventListener(type: string, listener: (event: unknown) => void) {
      const list = listeners.get(type) ?? [];
      const at = list.indexOf(listener);
      if (at >= 0) list.splice(at, 1);
    },
    remove() {
      node.removed = true;
    },
    focus() {},
    blur() {
      node.fire("blur");
    },
    closest(selector: string) {
      if (
        selector === "[data-snabbsite-toolbar]" &&
        "data-snabbsite-toolbar" in node.attributes
      ) {
        return node;
      }
      if (
        selector === "[data-sajt-section][data-sajt-field]" &&
        "data-sajt-section" in node.attributes &&
        "data-sajt-field" in node.attributes
      ) {
        return node;
      }
      if (
        selector ===
          "[data-sajt-section][data-sajt-field][contenteditable]" &&
        "data-sajt-section" in node.attributes &&
        "data-sajt-field" in node.attributes &&
        "contenteditable" in node.attributes
      ) {
        return node;
      }
      return null;
    },
    getBoundingClientRect() {
      return { left: 0, bottom: 20 };
    },
    fire(type: string, event: unknown = {}) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener(event);
    },
    listenerCount(type: string) {
      return listeners.get(type)?.length ?? 0;
    },
    /** Every node under here, flattened, so a test can find one control. */
    all(): FakeElement[] {
      return node.children.flatMap((child) => [child, ...child.all()]);
    },
    text(): string {
      return [node._text, ...node.children.map((child) => child.text())].join(" ");
    },
  };
  return node;
}

function fakeDocument() {
  const body = element("body");
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  return {
    body,
    documentElement: { clientWidth: 1024 },
    createElement: (tag: string) => element(tag),
    addEventListener(type: string, listener: (event: unknown) => void) {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    removeEventListener(type: string, listener: (event: unknown) => void) {
      const list = listeners.get(type) ?? [];
      const at = list.indexOf(listener);
      if (at >= 0) list.splice(at, 1);
    },
    fire(type: string, event: unknown) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener(event);
    },
    querySelector() {
      return null;
    },
    /** The overlay's own root, which is the only thing it appends to body. */
    overlay() {
      return body.children[0];
    },
  };
}

function fakeStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    store,
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  };
}

/** A marked element as `sajtField` writes it, for the click test. */
function markedTarget(sectionId: string, path: string) {
  return {
    closest(selector: string) {
      if (selector !== "[data-sajt-section][data-sajt-field]") return null;
      return {
        getAttribute: (name: string) =>
          name === "data-sajt-section" ? sectionId : name === "data-sajt-field" ? path : null,
      };
    },
  };
}

/** Route every overlay request at a real handler over a real temp directory,
 *  so the browser half and the node half are proved against each other rather
 *  than against a stub that agrees with whichever one is wrong. */
function wiredFetch(dir: string) {
  const handler = createLocalContentHandler({ library, dir, enabled: true });
  return (input: unknown, init?: RequestInit) =>
    handler(new Request(new URL(String(input), "http://localhost:3000"), init));
}

/** The overlay talks to a real handler that reads a real directory, so a test
 *  has to let the filesystem round trip finish. Generous on purpose: a flaky
 *  wait reads as a broken feature. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const mounted: Array<{ destroy(): void }> = [];
const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  process.env.NODE_ENV = "development";
});

afterEach(() => {
  while (mounted.length) mounted.pop()?.destroy();
  vi.unstubAllGlobals();
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

function mount(dir: string, extra: Record<string, unknown> = {}) {
  const doc = fakeDocument();
  const storage = fakeStorage({ [OVERLAY_STATE_KEY]: "1" });
  const handle = mountLocalOverlay({
    library,
    enabled: true,
    document: doc as never,
    storage,
    fetch: wiredFetch(dir) as never,
    ...extra,
  });
  mounted.push(handle);
  return { doc, storage, handle };
}

// ── step 1: the overlay never draws outside a development build ────────────

describe("the development-only boundary", () => {
  it("draws nothing and touches no DOM in a production build", () => {
    const doc = fakeDocument();
    const handle = mountLocalOverlay({
      library,
      enabled: false,
      document: doc as never,
    });
    expect(handle.active).toBe(false);
    expect(doc.body.children).toHaveLength(0);
    // Every method still answers, so a caller does not have to branch.
    expect(() => {
      handle.select("sec-1");
      handle.destroy();
    }).not.toThrow();
  });

  it("answers a production request with the same 404 a missing route gives", async () => {
    process.env.NODE_ENV = "production";
    const handler = createLocalContentHandler({ library, enabled: true });
    const response = await handler(
      new Request("http://localhost:3000/__snabbsite/content", {
        method: "POST",
        body: JSON.stringify({ sectionId: "sec-1", key: "heading", value: "Efter" }),
      }),
    );
    expect(response.status).toBe(404);
  });

  it("refuses a write asked for by another origin", async () => {
    const dir = await contentDir();
    const handler = createLocalContentHandler({ library, dir, enabled: true });
    const response = await handler(
      new Request("http://localhost:3000/__snabbsite/content", {
        method: "POST",
        headers: { origin: "https://evil.example" },
        body: JSON.stringify({ sectionId: "sec-1", key: "heading", value: "Efter" }),
      }),
    );
    expect(response.status).toBe(403);
    expect((await pageOnDisk(dir)).sections[0].content.props.heading).toBe("Före");
  });
});

// ── step 2: one row per declared field, one control per kind ───────────────

describe("the field renderer", () => {
  it("gives every declared field a row, in declaration order", () => {
    const rows = overlayRows(hero, { heading: "Före" });
    expect(rows.map((row) => row.field.key)).toEqual([
      "heading",
      "body",
      "cover",
      "cta",
      "tone",
      "compact",
      "price",
    ]);
    // A field with no value yet still gets a row, or a fresh page would offer
    // nothing to type into.
    expect(rows[1].value).toBeUndefined();
    expect(rows[0].label).toBe("Rubrik");
    // No label declared, so the prop name stands in.
    expect(rows[1].label).toBe("body");
    expect(rows.find((row) => row.field.key === "price")?.locked).toBe(true);
  });

  it("picks the right control for each kind that has one", () => {
    const byKey = Object.fromEntries(
      overlayRows(hero, {}).map((row) => [row.field.key, row.control]),
    );
    expect(byKey).toMatchObject({
      heading: "line",
      body: "multiline",
      cover: "image",
      cta: "link",
      tone: "choice",
      compact: "toggle",
    });
  });

  it("shows a select its declared options", () => {
    const tone = overlayRows(hero, {}).find((row) => row.field.key === "tone");
    expect(tone).toMatchObject({ control: "choice", options: ["light", "dark"] });
  });

  it("drops a value whose shape does not match its kind", () => {
    // A hand-edited file with a string where a link belongs draws an empty
    // control rather than crashing the panel.
    const rows = overlayRows(hero, { cta: "https://example.com", compact: "yes" });
    expect(rows.find((row) => row.field.key === "cta")?.value).toBeUndefined();
    expect(rows.find((row) => row.field.key === "compact")?.value).toBeUndefined();
  });

  // The two kinds added 2026-08-28. An `icon` is a choice; a `list` is the one
  // kind this overlay does not offer, and it says so by drawing nothing.
  const withNewKinds = defineBlock({
    type: "cards",
    label: "Kort",
    fields: [
      { key: "heading", kind: "text" },
      { key: "mark", kind: "icon", label: "Ikon", options: ["star", "bolt"] },
      {
        key: "items",
        kind: "list",
        label: "Kort",
        fields: [{ key: "title", kind: "text" }],
      },
    ],
  });

  it("draws an icon as a choice over the agency's own names", () => {
    const mark = overlayRows(withNewKinds, {}).find(
      (row) => row.field.key === "mark",
    );
    expect(mark).toMatchObject({ control: "choice", options: ["star", "bolt"] });
  });

  it("draws no row for a list, rather than a text box that would flatten it", () => {
    const rows = overlayRows(withNewKinds, { items: [{ title: "Tak" }] });
    expect(rows.map((row) => row.field.key)).toEqual(["heading", "mark"]);
  });

  it("refuses a write to an icon the agency never registered, and to a list", () => {
    const at = (key: string) =>
      withNewKinds.fields.find((one) => one.key === key)!;
    // Without an explicit case an icon falls through to the text branch, which
    // accepts ANY string - so a name their component cannot draw lands in their
    // file and is refused hours later on the push.
    expect(checkFieldValue(at("mark"), "star")).toMatchObject({ ok: true });
    expect(checkFieldValue(at("mark"), "IconStar")).toMatchObject({ ok: false });
    expect(checkFieldValue(at("items"), [{ title: "Tak" }])).toMatchObject({
      ok: false,
    });
    // And it says where the client CAN do it, rather than only refusing.
    const refusal = checkFieldValue(at("items"), [{ title: "Tak" }]);
    expect(refusal.ok === false && refusal.reason).toMatch(/dashboard/);
  });
});

describe("the checker", () => {
  const field = (key: string) => hero.fields.find((one) => one.key === key)!;

  it("accepts each kind's own shape", () => {
    expect(checkFieldValue(field("heading"), "Efter")).toEqual({
      ok: true,
      value: "Efter",
    });
    expect(checkFieldValue(field("body"), "<p>Hej</p>")).toMatchObject({ ok: true });
    expect(checkFieldValue(field("tone"), "dark")).toMatchObject({ ok: true });
    expect(checkFieldValue(field("compact"), true)).toMatchObject({ ok: true });
    expect(checkFieldValue(field("cta"), { href: "/kontakt", label: "Hej" })).toEqual({
      ok: true,
      value: { href: "/kontakt", label: "Hej" },
    });
    expect(checkFieldValue(field("cover"), { assetId: "a1", alt: "Bild" })).toEqual({
      ok: true,
      value: { assetId: "a1", alt: "Bild" },
    });
  });

  it("refuses a locked field", () => {
    expect(checkFieldValue(field("price"), "0 kr")).toMatchObject({ ok: false });
  });

  it("refuses a select value that is not one of the options", () => {
    expect(checkFieldValue(field("tone"), "neon")).toMatchObject({ ok: false });
  });

  it("refuses text over the field's own maxLength", () => {
    expect(checkFieldValue(field("heading"), "x".repeat(41))).toMatchObject({
      ok: false,
    });
  });

  it("flattens newlines in a one-line field", () => {
    expect(checkFieldValue(field("heading"), "a\nb")).toEqual({ ok: true, value: "a b" });
  });

  it("refuses an address that runs code, however it is spelled", () => {
    for (const href of [
      "javascript:alert(1)",
      "  JavaScript:alert(1)",
      "java\nscript:alert(1)",
      "data:text/html,<script>",
    ]) {
      expect(checkFieldValue(field("cta"), { href })).toMatchObject({ ok: false });
    }
  });
});

// ── step 3: clicking a marked element selects that section ─────────────────

describe("selecting by click", () => {
  it("opens the panel on the section a marked element names", async () => {
    const dir = await contentDir();
    const { doc } = mount(dir);

    doc.fire("click", { target: markedTarget("sec-1", "heading") });
    await settle();

    const text = doc.overlay().text();
    expect(text).toContain("Hero");
    expect(text).toContain("Rubrik");
    expect(text).toContain("(locked)");
  });

  it("ignores a click on anything that is not a marked field", async () => {
    const dir = await contentDir();
    const { doc } = mount(dir);
    doc.fire("click", { target: { closest: () => null } });
    await settle();
    expect(doc.overlay().text()).toContain("Click any text");
  });

  it("remembers whether the panel was open", async () => {
    const dir = await contentDir();
    const { doc, storage } = mount(dir);
    // The toggle is the second child of the host, after the panel.
    doc.overlay().children[1].fire("click");
    expect(storage.store[OVERLAY_STATE_KEY]).toBe("0");
    doc.overlay().children[1].fire("click");
    expect(storage.store[OVERLAY_STATE_KEY]).toBe("1");
  });
});

describe("inline text editing", () => {
  it("does not restart an edit when its contenteditable field is clicked", async () => {
    class FakeElementClass {
      static [Symbol.hasInstance](value: unknown): boolean {
        return Boolean(
          value &&
            typeof value === "object" &&
            "_fakeElement" in value,
        );
      }
    }
    vi.stubGlobal("Element", FakeElementClass);
    vi.stubGlobal("HTMLElement", FakeElementClass);

    const doc = fakeDocument();
    const target = element("h1");
    target.setAttribute("data-sajt-section", "sec-1");
    target.setAttribute("data-sajt-field", "heading");
    target.innerText = "Före";
    const request = vi.fn(async () =>
      new Response(
        JSON.stringify({
          blockType: "hero",
          props: { heading: "Före" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const handle = mountInlineOverlay({
      library,
      enabled: true,
      document: doc as never,
      fetch: request as never,
    });
    mounted.push(handle);

    const click = () =>
      doc.fire("click", {
        target,
        preventDefault() {},
        stopPropagation() {},
      });
    click();
    await settle();
    click();
    await settle();

    expect(request).toHaveBeenCalledTimes(1);
    expect(target.listenerCount("blur")).toBe(1);
    expect(target.attributes.contenteditable).toBe("plaintext-only");
  });

  it("cleans up an active edit when the overlay is destroyed", async () => {
    class FakeElementClass {
      static [Symbol.hasInstance](value: unknown): boolean {
        return Boolean(
          value &&
            typeof value === "object" &&
            "_fakeElement" in value,
        );
      }
    }
    vi.stubGlobal("Element", FakeElementClass);
    vi.stubGlobal("HTMLElement", FakeElementClass);

    const doc = fakeDocument();
    const target = element("h1");
    target.setAttribute("data-sajt-section", "sec-1");
    target.setAttribute("data-sajt-field", "heading");
    target.innerText = "Före";
    const request = vi.fn(async () =>
      new Response(
        JSON.stringify({
          blockType: "hero",
          props: { heading: "Före" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const handle = mountInlineOverlay({
      library,
      enabled: true,
      document: doc as never,
      fetch: request as never,
    });

    doc.fire("click", {
      target,
      preventDefault() {},
      stopPropagation() {},
    });
    await settle();
    target.innerText = "Osparad";
    handle.destroy();

    expect(target.innerText).toBe("Före");
    expect(target.attributes.contenteditable).toBeUndefined();
    expect(target.listenerCount("blur")).toBe(0);
    expect(target.listenerCount("keydown")).toBe(0);
  });
});

// ── step 4: an edit lands in the file ──────────────────────────────────────

describe("writing an edit into the developer's own file", () => {
  it("carries a typed heading from the panel to the JSON on disk", async () => {
    const dir = await contentDir();
    const { doc } = mount(dir);

    doc.fire("click", { target: markedTarget("sec-1", "heading") });
    await settle();

    const box = doc
      .overlay()
      .all()
      .find((node) => node.tag === "input" && node.value === "Före");
    expect(box).toBeDefined();
    box!.value = "Efter";
    box!.fire("change");
    await settle();

    const page = await pageOnDisk(dir);
    expect(page.sections[0].content.props.heading).toBe("Efter");
    // Nothing else moved: the price is still the agency's, and the section's
    // own identity is untouched.
    expect(page.sections[0].content.props.price).toBe("1 000 kr");
    expect(page.sections[0].id).toBe("sec-1");
  });

  it("writes each of the six kinds", async () => {
    const dir = await contentDir();
    const edits: Array<[string, unknown]> = [
      ["heading", "Ny rubrik"],
      ["body", "<p>Ny text</p>"],
      ["cover", { assetId: "asset-9", alt: "En bild" }],
      ["cta", { href: "/kontakt", label: "Kontakta oss" }],
      ["tone", "dark"],
      ["compact", true],
    ];
    for (const [key, value] of edits) {
      const result = await applyContentEdit({ sectionId: "sec-1", key, value, library, dir });
      expect(result, key).toMatchObject({ ok: true, blockType: "hero" });
    }
    const props = (await pageOnDisk(dir)).sections[0].content.props;
    expect(props).toMatchObject({
      heading: "Ny rubrik",
      body: "<p>Ny text</p>",
      cover: { assetId: "asset-9", alt: "En bild" },
      cta: { href: "/kontakt", label: "Kontakta oss" },
      tone: "dark",
      compact: true,
    });
  });

  it("keeps concurrent edits to different fields in the same page", async () => {
    const dir = await contentDir();
    const [heading, tone, compact] = await Promise.all([
      applyContentEdit({
        sectionId: "sec-1",
        key: "heading",
        value: "Ny rubrik",
        library,
        dir,
      }),
      applyContentEdit({
        sectionId: "sec-1",
        key: "tone",
        value: "dark",
        library,
        dir,
      }),
      applyContentEdit({
        sectionId: "sec-1",
        key: "compact",
        value: true,
        library,
        dir,
      }),
    ]);

    expect([heading, tone, compact]).toEqual([
      expect.objectContaining({ ok: true }),
      expect.objectContaining({ ok: true }),
      expect.objectContaining({ ok: true }),
    ]);
    expect((await pageOnDisk(dir)).sections[0].content.props).toMatchObject({
      heading: "Ny rubrik",
      tone: "dark",
      compact: true,
    });
  });

  it("refuses a locked field and leaves the file alone", async () => {
    const dir = await contentDir();
    const result = await applyContentEdit({
      sectionId: "sec-1",
      key: "price",
      value: "0 kr",
      library,
      dir,
    });
    expect(result).toMatchObject({ ok: false });
    expect((await pageOnDisk(dir)).sections[0].content.props.price).toBe("1 000 kr");
  });

  it("refuses a key the block never declared", async () => {
    const dir = await contentDir();
    const result = await applyContentEdit({
      sectionId: "sec-1",
      key: "onclick",
      value: "alert(1)",
      library,
      dir,
    });
    expect(result).toMatchObject({ ok: false });
    expect((await pageOnDisk(dir)).sections[0].content.props).not.toHaveProperty("onclick");
  });

  it("refuses a key that is not a plain identifier", async () => {
    const dir = await contentDir();
    for (const key of ["../../package", "content.props", "__proto__"]) {
      expect(
        await applyContentEdit({ sectionId: "sec-1", key, value: "x", library, dir }),
      ).toMatchObject({ ok: false });
    }
  });

  it("refuses a section that is not one of the agency's blocks", async () => {
    const dir = await contentDir({
      slug: "",
      sections: [{ id: "sec-2", type: "hero", content: { type: "hero", headline: "Hej" } }],
    });
    expect(
      await applyContentEdit({
        sectionId: "sec-2",
        key: "heading",
        value: "Efter",
        library,
        dir,
      }),
    ).toMatchObject({ ok: false });
  });

  it("says so when no page holds the section", async () => {
    const dir = await contentDir();
    expect(
      await applyContentEdit({
        sectionId: "nope",
        key: "heading",
        value: "Efter",
        library,
        dir,
      }),
    ).toMatchObject({ ok: false });
  });

  it("keeps the two-space shape `snabbsajt pull` writes", async () => {
    const dir = await contentDir();
    await applyContentEdit({
      sectionId: "sec-1",
      key: "heading",
      value: "Efter",
      library,
      dir,
    });
    const raw = await readFile(join(dir, "pages", "start.json"), "utf8");
    expect(raw.startsWith('{\n  "slug"')).toBe(true);
    expect(raw.endsWith("\n")).toBe(true);
  });

  it("skips a page that will not parse instead of refusing every edit", async () => {
    const dir = await contentDir();
    await writeFile(join(dir, "pages", "broken.json"), "{ not json");
    expect(
      await applyContentEdit({
        sectionId: "sec-1",
        key: "heading",
        value: "Efter",
        library,
        dir,
      }),
    ).toMatchObject({ ok: true });
  });
});

// ── the handler's own answers ──────────────────────────────────────────────

describe("the route handler", () => {
  it("answers a lookup with the block and props behind a section", async () => {
    const dir = await contentDir();
    const handler = createLocalContentHandler({ library, dir, enabled: true });
    const response = await handler(
      new Request("http://localhost:3000/__snabbsite/content?sectionId=sec-1"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sectionId: "sec-1",
      blockType: "hero",
      version: 1,
      props: { heading: "Före" },
    });
  });

  it("gives a reason a panel can print when the write is refused", async () => {
    const dir = await contentDir();
    const handler = createLocalContentHandler({ library, dir, enabled: true });
    const response = await handler(
      new Request("http://localhost:3000/__snabbsite/content", {
        method: "POST",
        body: JSON.stringify({ sectionId: "sec-1", key: "price", value: "0 kr" }),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      reason: expect.stringContaining("locked"),
    });
  });

  it("refuses a body that is not JSON", async () => {
    const dir = await contentDir();
    const handler = createLocalContentHandler({ library, dir, enabled: true });
    const response = await handler(
      new Request("http://localhost:3000/__snabbsite/content", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("refuses a method it does not answer", async () => {
    const dir = await contentDir();
    const handler = createLocalContentHandler({ library, dir, enabled: true });
    const response = await handler(
      new Request("http://localhost:3000/__snabbsite/content", { method: "DELETE" }),
    );
    expect(response.status).toBe(405);
  });
});
