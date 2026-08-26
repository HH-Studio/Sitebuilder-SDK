// ---------------------------------------------------------------------------
// The field model behind the local overlay: one row per declared field, and
// one checker that decides whether a typed value may be written.
//
// Plan: the app's docs/plans/verifying/P3-2026-08-25-local-overlay-without-the-
// dashboard.md. The overlay draws in the agency's OWN app while it runs
// locally, so there is no dashboard, no login and no network. That makes this
// file the whole contract: what the panel shows, and what it accepts.
//
// Deliberately pure. No DOM, no filesystem, no `process`. The browser half
// (`overlay.ts`) and the node half (`writeContent.ts`) both import it, and they
// have to agree. A value the panel offers and the writer refuses is a control
// that looks broken, and a value the writer accepts and the panel cannot show
// is a field that silently disappears.
//
// The rules are `defineBlock`'s rules, not new ones:
//
//  - **Only declared fields.** A key the block never declared is refused, so a
//    typo in a request cannot grow a prop the component does not read.
//  - **`locked` is honoured.** A locked field is drawn read-only and refused on
//    write. It is the agency's own price line and legal text.
//  - **The same six kinds.** `text`, `richtext`, `image`, `link`, `select`,
//    `boolean`. A seventh here would be a second editor drifting from the dock.
// ---------------------------------------------------------------------------

import type { BlockDefinition, BlockField } from "../blocks/defineBlock";

/** How the panel draws one field. One control per kind, and nothing clever:
 *  the overlay is a narrow strip in the corner of somebody else's design. */
export type OverlayControl =
  | { control: "line" }
  | { control: "multiline" }
  | { control: "choice"; options: readonly string[] }
  | { control: "toggle" }
  /** Two boxes: the address and the words on it. */
  | { control: "link" }
  /** Two boxes: the asset id and its alt text. There is no file picker here on
   *  purpose, because uploading needs our storage and this overlay works on a
   *  plane. */
  | { control: "image" };

export type LinkValue = { href: string; label?: string };
export type ImageValue = { assetId: string; alt?: string };
export type OverlayValue = string | boolean | LinkValue | ImageValue | undefined;

export type OverlayRow = {
  field: BlockField;
  /** What the panel prints above the control. The agency's own word when they
   *  wrote one, the prop name when they did not. */
  label: string;
  /** True when the client may not change it. Drawn, but read-only. */
  locked: boolean;
  /** The value currently in the file, already narrowed to the kind's shape. */
  value: OverlayValue;
} & OverlayControl;

/** How long a field may be before the app would refuse it anyway. Matched to
 *  `defineBlock`'s own note that the app clamps `maxLength` to a ceiling:
 *  refusing here means the message lands in the developer's overlay instead of
 *  hours later in a push. */
export const OVERLAY_TEXT_CEILING = 2_000;
export const OVERLAY_RICHTEXT_CEILING = 20_000;

function controlFor(field: BlockField): OverlayControl {
  switch (field.kind) {
    case "richtext":
      return { control: "multiline" };
    case "select":
      return { control: "choice", options: field.options ?? [] };
    case "boolean":
      return { control: "toggle" };
    case "link":
      return { control: "link" };
    case "image":
      return { control: "image" };
    default:
      return { control: "line" };
  }
}

function isLink(value: unknown): value is LinkValue {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { href?: unknown }).href === "string"
  );
}

function isImage(value: unknown): value is ImageValue {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { assetId?: unknown }).assetId === "string"
  );
}

function narrow(field: BlockField, raw: unknown): OverlayValue {
  switch (field.kind) {
    case "boolean":
      return typeof raw === "boolean" ? raw : undefined;
    case "link":
      return isLink(raw) ? raw : undefined;
    case "image":
      return isImage(raw) ? raw : undefined;
    default:
      return typeof raw === "string" ? raw : undefined;
  }
}

/**
 * The panel's contents for one placed block.
 *
 * Driven by the DECLARATION, never by the props actually present: a field the
 * agency declared but the client has not filled in still gets a row, otherwise
 * a fresh hemsida would offer nothing to type into. The reverse, a prop in the
 * file that no field declares, is left out rather than drawn, because writing
 * it back would re-save a key `defineBlock` has already refused.
 */
export function overlayRows(
  definition: BlockDefinition,
  props: Record<string, unknown> | undefined,
): OverlayRow[] {
  return definition.fields.map((field) => ({
    field,
    label: field.label?.trim() || field.key,
    locked: field.locked === true,
    value: narrow(field, props?.[field.key]),
    ...controlFor(field),
  }));
}

export type FieldCheck =
  | { ok: true; value: Exclude<OverlayValue, undefined> }
  | { ok: false; reason: string };

/** Schemes a link may never carry. `javascript:` and `data:` both execute in
 *  the visitor's browser, and `vbscript:` is the same trick on an old engine. */
const REFUSED_SCHEMES = ["javascript:", "data:", "vbscript:"];

/** True when an href is inert. Whitespace and C0 control characters are dropped
 *  before the scheme is read, because a browser drops them too: a newline
 *  wedged inside `java\nscript:` reaches the parser as `javascript:`, and a
 *  naive `startsWith` on the raw string would wave it through. */
function hrefIsSafe(href: string): boolean {
  const bare = href
    .split("")
    .filter((char) => char.charCodeAt(0) > 0x20)
    .join("")
    .toLowerCase();
  return !REFUSED_SCHEMES.some((scheme) => bare.startsWith(scheme));
}

/**
 * Decide whether one typed value may be written into the block's props.
 *
 * The single gate. The browser calls it to grey out a save, and the writer
 * calls it again before it touches the file, because the browser half is the
 * agency's own page and a request can be made without it.
 */
export function checkFieldValue(field: BlockField, raw: unknown): FieldCheck {
  if (field.locked === true) {
    return { ok: false, reason: `"${field.key}" is locked by the block.` };
  }

  switch (field.kind) {
    case "boolean": {
      if (typeof raw !== "boolean") {
        return { ok: false, reason: `"${field.key}" takes true or false.` };
      }
      return { ok: true, value: raw };
    }

    case "select": {
      const options = field.options ?? [];
      if (typeof raw !== "string" || !options.includes(raw)) {
        return {
          ok: false,
          reason: `"${field.key}" takes one of: ${options.join(", ")}.`,
        };
      }
      return { ok: true, value: raw };
    }

    case "link": {
      if (!isLink(raw)) {
        return { ok: false, reason: `"${field.key}" takes an href.` };
      }
      if (!hrefIsSafe(raw.href)) {
        return {
          ok: false,
          reason: `"${field.key}" has an address that runs code.`,
        };
      }
      const label = raw.label;
      if (label !== undefined && typeof label !== "string") {
        return { ok: false, reason: `"${field.key}" has a label that is not text.` };
      }
      const value: LinkValue = { href: raw.href.trim() };
      if (typeof label === "string" && label.length > 0) value.label = label;
      return { ok: true, value };
    }

    case "image": {
      if (!isImage(raw)) {
        return { ok: false, reason: `"${field.key}" takes an assetId.` };
      }
      const alt = raw.alt;
      if (alt !== undefined && typeof alt !== "string") {
        return { ok: false, reason: `"${field.key}" has alt text that is not text.` };
      }
      const value: ImageValue = { assetId: raw.assetId.trim() };
      if (typeof alt === "string" && alt.length > 0) value.alt = alt;
      return { ok: true, value };
    }

    default: {
      if (typeof raw !== "string") {
        return { ok: false, reason: `"${field.key}" takes text.` };
      }
      const ceiling =
        field.kind === "richtext" ? OVERLAY_RICHTEXT_CEILING : OVERLAY_TEXT_CEILING;
      const limit = Math.min(field.maxLength ?? ceiling, ceiling);
      if (raw.length > limit) {
        return {
          ok: false,
          reason: `"${field.key}" is ${raw.length} characters, over its ${limit} limit.`,
        };
      }
      // A one-line field that arrives with newlines would render as one run-on
      // line anyway, so the break is dropped here rather than in the component.
      return {
        ok: true,
        value: field.kind === "text" ? raw.replace(/[\r\n]+/g, " ") : raw,
      };
    }
  }
}

/** The field a key names, or nothing when the block never declared it. */
export function fieldFor(
  definition: BlockDefinition,
  key: string,
): BlockField | undefined {
  return definition.fields.find((field) => field.key === key);
}
