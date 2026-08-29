// ---------------------------------------------------------------------------
// `defineBlock` — how an agency tells SnabbSajt what its own component accepts.
//
// Plan: the app's docs/plans/doing/P0-2026-08-19-agency-program-master.md,
// slice 1.3. The app half of this shipped first: `blockSchemas` stores a
// library per hemsida, `lib/blocks/schema.ts` is the one checker that decides
// whether a block's content may be stored, and a `block` section carries
// `{blockType, version, props}`. This file is the other end of that contract,
// the part a developer actually writes.
//
// What a block IS: their React component, rendered by their own Next.js app.
// SnabbSajt never sees it, never runs it and never draws it. What we hold is
// the CONTENT — the words, the pictures, the links their client edits — and the
// shape of it, which is what this declaration describes.
//
// Deliberately tiny, and deliberately not clever:
//
//  - **No runtime.** `defineBlock` returns its own input, checked. It does not
//    register anything with a server, does not read the filesystem and has no
//    side effects, so it is safe to call at module scope in a client component.
//  - **No inference from the component.** A prop type cannot say "this is a
//    picture the client may swap" or "this text is one line". The declaration
//    is the source of truth precisely because the type system cannot be.
//  - **The same eight field kinds as the app**, no more: `text`, `richtext`,
//    `image`, `link`, `select`, `boolean`, `list`, `icon`. A ninth here that the
//    app does not know would be stored and then refused on the first edit.
// ---------------------------------------------------------------------------

/** What one field in a block may hold. Mirrors the app's `BlockFieldKind`.
 *
 *  `list` and `icon` joined the six on 2026-08-28, because they are the last
 *  two things a client actually asks for on a page you built: move the third
 *  card above the second, and pick the little picture beside a service.
 *
 *  A `list` is ONE level deep. A list inside a list is refused, because the
 *  moment items nest, "move this one up" stops having a single answer.
 *
 *  An `icon` is a `select` over names YOU register beside your own components.
 *  We ship you no icon set and we never draw one: the name travels, your
 *  component decides what it draws. */
export const BLOCK_FIELD_KINDS = [
  "text",
  "richtext",
  "image",
  "link",
  "select",
  "boolean",
  "list",
  "icon",
] as const;

export type BlockFieldKind = (typeof BLOCK_FIELD_KINDS)[number];

export type BlockField = {
  /** The prop name your component reads. */
  key: string;
  kind: BlockFieldKind;
  /** What the client sees above the input. Your words, in your language. */
  label?: string;
  /** A field the client may leave empty. Absent means required, because your
   *  component is written against props that exist. */
  optional?: boolean;
  /** `select` and `icon` only: the values you handle. For an `icon` these are
   *  the names you registered beside your own components. */
  options?: readonly string[];
  /** `text` and `richtext` only. The app clamps this to its own ceiling. */
  maxLength?: number;
  /** `list` only: the fields ONE item carries. Required and non-empty, and none
   *  of them may itself be a `list`. */
  fields?: readonly BlockField[];
  /** `list` only: how many items the client may keep. The app clamps this to
   *  its own ceiling of 40. */
  maxItems?: number;
  /** Keep this field for yourselves. Every NEW placement of the block arrives
   *  with it locked, so the price you negotiated and the legal line are frozen
   *  for the client without anyone locking them section by section.
   *
   *  A DEFAULT, not a rule. The placed section is the authority: a Byggare who
   *  unlocks one placement in the dock has unlocked it, and pushing this file
   *  again never locks it back. The reverse would let a file the client cannot
   *  see quietly take back what they were told they could change.
   *
   *  You can still write the field yourself. A lock is about the client. */
  locked?: boolean;
};

export type BlockDefinition = {
  /** Stable id, lowercase, e.g. `"pricing-table"`. Changing it is a new block. */
  type: string;
  /** What the block is called in the client's "lägg till sektion" list. */
  label: string;
  /** Bump when the props change shape. A section keeps the version it was
   *  written against, so an older page stays valid until you migrate it. */
  version?: number;
  fields: readonly BlockField[];
  /** Layout choices your component understands. Same idea as a section
   *  variant: it changes layout, never the shape of the content. */
  variants?: readonly string[];
};

const BLOCK_FIELD_LIMITS = {
  topLevel: 64,
  listItem: 20,
} as const;

const ID_RE = /^[a-z][a-z0-9_-]*$/;

export class BlockDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockDefinitionError";
  }
}

/**
 * Check one declared field list, and the field lists inside it.
 *
 * Recursive so a list item's fields get the SAME checks as the top level: a
 * second, looser copy for sub-fields is exactly how a select with no options
 * would reach a client's editor one level down.
 *
 * `depth` is what keeps a list one level deep. At depth 1 the `list` kind is
 * refused, and the message says so rather than naming an unknown kind.
 */
function checkFields(
  type: string,
  fields: readonly BlockField[] | undefined,
  depth: 0 | 1,
  path: string,
): void {
  if (!Array.isArray(fields)) {
    throw new BlockDefinitionError(`Block "${type}" has no fields array${path ? ` at "${path}"` : ""}.`);
  }
  const maxFields = depth === 0 ? BLOCK_FIELD_LIMITS.topLevel : BLOCK_FIELD_LIMITS.listItem;
  if (fields.length > maxFields) {
    throw new BlockDefinitionError(
      `Block "${type}" declares ${fields.length} fields${path ? ` at "${path}"` : ""}; the limit is ${maxFields}.`,
    );
  }
  const seen = new Set<string>();
  for (const field of fields) {
    const key = field?.key?.trim() ?? "";
    const at = `${path}${key}`;
    if (!ID_RE.test(key)) {
      throw new BlockDefinitionError(
        `Block "${type}" has a field key "${field?.key}" that is not a plain identifier.`,
      );
    }
    // Refused rather than collapsed: your component reads one of them and we
    // cannot know which, so the page's behaviour would depend on key ordering.
    if (seen.has(key)) {
      throw new BlockDefinitionError(`Block "${type}" declares "${at}" twice.`);
    }
    seen.add(key);
    if (!BLOCK_FIELD_KINDS.includes(field.kind)) {
      throw new BlockDefinitionError(
        `Block "${type}" field "${at}" has kind "${field.kind}", which is not one of: ${BLOCK_FIELD_KINDS.join(", ")}.`,
      );
    }
    if (
      (field.kind === "select" || field.kind === "icon") &&
      (!field.options || field.options.length === 0)
    ) {
      throw new BlockDefinitionError(
        `Block "${type}" field "${at}" is a ${field.kind} with no options.`,
      );
    }
    if (field.kind === "list") {
      if (depth !== 0) {
        throw new BlockDefinitionError(
          `Block "${type}" field "${at}" is a list inside a list. A list is one level deep: give the item a text, image, link, select, icon or boolean field instead.`,
        );
      }
      if (!Array.isArray(field.fields) || field.fields.length === 0) {
        throw new BlockDefinitionError(
          `Block "${type}" field "${at}" is a list with no fields. Declare what one item holds.`,
        );
      }
      checkFields(type, field.fields, 1, `${at}.`);
    }
    // Refused rather than coerced. The app only ever carries `locked: true`, so
    // a truthy string here would read as locked in your editor and arrive
    // unlocked on the client's hemsida - the one way this feature can fail
    // silently.
    if (field.locked !== undefined && typeof field.locked !== "boolean") {
      throw new BlockDefinitionError(
        `Block "${type}" field "${at}" has a non-boolean "locked".`,
      );
    }
    // A lock is a content PATH, and a list's items have no fixed count, so
    // "the price on every card" is not one path the app could name. The app
    // drops it silently; saying so here is the difference between a lock you
    // think you shipped and one you know you did not.
    if (field.locked === true && depth !== 0) {
      throw new BlockDefinitionError(
        `Block "${type}" field "${at}" is locked inside a list. Lock the list itself instead - a lock is one path, and a list's items have no fixed count.`,
      );
    }
  }
}

/**
 * Declare one block.
 *
 * Throws on a declaration the app would refuse, and throws EARLY: this runs in
 * your build, where the message lands in your terminal next to the file that
 * caused it. The alternative is `snabbsajt push` failing hours later with a
 * block type and a code, which is the same information at the worst moment.
 *
 * ```ts
 * export const pricingTable = defineBlock({
 *   type: "pricing-table",
 *   label: "Prislista",
 *   fields: [
 *     { key: "title", kind: "text", label: "Rubrik" },
 *     { key: "note", kind: "richtext", optional: true },
 *     { key: "cta", kind: "link", label: "Knapp" },
 *     // The client reorders these in the editor, and each one carries its own
 *     // fields. `icon` names come from YOUR map, so `star` is whatever your
 *     // component draws for "star".
 *     {
 *       key: "tiers",
 *       kind: "list",
 *       label: "Paket",
 *       maxItems: 4,
 *       fields: [
 *         { key: "name", kind: "text", label: "Namn" },
 *         { key: "price", kind: "text", label: "Pris" },
 *         { key: "mark", kind: "icon", label: "Ikon", options: ["star", "bolt"] },
 *       ],
 *     },
 *     // A style choice is an ordinary `select`. There is no separate kind for
 *     // it, and there does not need to be: your component reads the string.
 *     { key: "tone", kind: "select", label: "Ton", options: ["light", "dark"] },
 *   ],
 *   variants: ["light", "dark"],
 * });
 * ```
 */
export function defineBlock(definition: BlockDefinition): BlockDefinition {
  const type = definition.type?.trim() ?? "";
  if (!ID_RE.test(type)) {
    throw new BlockDefinitionError(
      `Block type "${definition.type}" must be lowercase letters, digits, dash or underscore, starting with a letter.`,
    );
  }
  if (!Array.isArray(definition.fields)) {
    throw new BlockDefinitionError(`Block "${type}" has no fields array.`);
  }
  checkFields(type, definition.fields, 0, "");
  return {
    ...definition,
    type,
    label: definition.label?.trim() || type,
    version: definition.version ?? 1,
  };
}

/** Everything a repo declares, keyed by type. What `push` sends and what the
 *  catch-all route renders from. */
export type BlockLibrary = Record<string, BlockDefinition>;

/**
 * Collect the blocks a repo declares into the library the CLI sends.
 *
 * Takes the definitions rather than a directory: a glob would make the library
 * depend on file placement, and a developer moving a component would silently
 * withdraw a block their client's live page is built from.
 */
export function blockLibrary(...blocks: BlockDefinition[]): BlockLibrary {
  const library: BlockLibrary = {};
  for (const block of blocks) {
    if (library[block.type]) {
      throw new BlockDefinitionError(
        `Two blocks are both called "${block.type}".`,
      );
    }
    library[block.type] = block;
  }
  return library;
}

/** The shape `site.json` carries, and therefore what `snabbsajt push` sends.
 *  Same field names as the app's `blockSchemas` table, because it is the same
 *  data: this is a projection of your declarations, not a second format. */
export type PortableBlockSchema = {
  type: string;
  label: string;
  version: number;
  fields: BlockField[];
  variants?: string[];
};

/**
 * Turn the library your repo declares into the `blockSchemas` field of a site
 * package.
 *
 * Call it from whatever already writes your `site.json`:
 *
 * ```ts
 * import { blockLibrary, blockSchemasForPackage } from "@snabbsajt/site-kit";
 * import { pricingTable, heroBand } from "./snabbsajt/blocks";
 *
 * site.blockSchemas = blockSchemasForPackage(blockLibrary(pricingTable, heroBand));
 * ```
 *
 * A push carrying this registers the library on that one hemsida, so the
 * client's editor can offer the blocks and the app can check what they type
 * against the fields you declared. A push that omits it leaves the library
 * exactly as it was: a deploy from a repo mid-refactor must not empty the
 * blocks a live page is built from.
 */
export function blockSchemasForPackage(
  library: BlockLibrary,
): PortableBlockSchema[] {
  return Object.values(library)
    .map((block) => ({
      type: block.type,
      label: block.label,
      version: block.version ?? 1,
      fields: [...block.fields],
      ...(block.variants ? { variants: [...block.variants] } : {}),
    }))
    .sort((a, b) => a.type.localeCompare(b.type));
}
