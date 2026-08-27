import { SITE_ICON_KEYS } from "./siteIcons";

// ---------------------------------------------------------------------------
// The `composed` grammar: the small, closed vocabulary a model may write and
// `Composed.tsx` may draw.
//
// Why a grammar and not markup. `imported` stores a captured page's own DOM and
// leans on a sanitiser for its real authority, which is fine for evidence we
// only ever re-render. This block is AUTHORED — a model writes it from a
// screenshot — so the shape has to be authoritative on its own. Every value
// here is an enum or a bounded string; there is no number, no colour, no unit
// and no CSS anywhere in it. The worst a bad guess can produce is an ugly
// section, never a broken or unsafe site (plan P2-2026-08-25-egna-block).
//
// Two consequences worth stating out loud, because they are the trade:
//   * A composed block follows the site's THEME, not the screenshot. Change the
//     palette later and the block changes with it, and stops matching the
//     picture it came from. On-brand beats faithful.
//   * There is no h1 in the role list on purpose. See COMPOSED_TEXT_ROLE.
//
// Pure module: no Convex, no React. The Convex validator built from these lists
// lives in `convex/model/composed.ts`, and the two are pinned together by
// `composed.test.ts`, so a kind added here without a validator fails the suite.
// ---------------------------------------------------------------------------

/** Steps on the site's own spacing scale (`--site-space-*`). `none` is 0. */
export const COMPOSED_SPACE = [
  "none",
  "2xs",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
] as const;
export type ComposedSpace = (typeof COMPOSED_SPACE)[number];

/** Surface ROLES, never colours. Each resolves to a palette pair that is
 *  already contrast-checked, so a composed block cannot be given text that
 *  fails AA — the same rule captured bands follow, and for the same reason. */
export const COMPOSED_SURFACE = [
  "none",
  "muted",
  "card",
  "primary",
  "accent",
] as const;
export type ComposedSurface = (typeof COMPOSED_SURFACE)[number];

export const COMPOSED_ALIGN = ["start", "center", "end"] as const;
export type ComposedAlign = (typeof COMPOSED_ALIGN)[number];

/**
 * Roles on the SITE type scale (`--site-text-*`), never the admin ladder.
 *
 * `display` is the largest and it still renders as an `<h2>`. No role in this
 * list ever emits an `<h1>`, and that is deliberate rather than an oversight:
 * `expectedHomeHeading` (convex/publishVerify.ts) derives the page's expected
 * `<h1>` from the section list, and a block whose heading level the model
 * chooses would make that derivation guess. A composed block that could own the
 * page's `<h1>` would either silence the home-heading check for every page
 * carrying one — which is what `imported` costs us — or make it report a
 * mismatch that is not real. A hero owns the `<h1>`; this block never does.
 */
export const COMPOSED_TEXT_ROLE = [
  "display",
  "h2",
  "h3",
  "lead",
  "body",
  "sm",
  "eyebrow",
] as const;
export type ComposedTextRole = (typeof COMPOSED_TEXT_ROLE)[number];

/** Aspect ratios an image slot may reserve. A fixed list, so the renderer can
 *  hold the box before the picture arrives and nothing shifts. */
export const COMPOSED_RATIO = [
  "square",
  "landscape", // 4:3
  "wide", // 16:9
  "portrait", // 3:4
  "tall", // 2:3
] as const;
export type ComposedRatio = (typeof COMPOSED_RATIO)[number];

/** Grid columns. Two to four: one is a stack, five is slivers on a phone. */
export const COMPOSED_COLUMNS = [2, 3, 4] as const;
export type ComposedColumns = (typeof COMPOSED_COLUMNS)[number];

export const COMPOSED_ICON_SIZE = ["sm", "md", "lg"] as const;
export type ComposedIconSize = (typeof COMPOSED_ICON_SIZE)[number];

export const COMPOSED_KINDS = [
  "stack",
  "row",
  "grid",
  "card",
  "text",
  "image",
  "button",
  "badge",
  "icon",
  "divider",
  "spacer",
] as const;
export type ComposedKind = (typeof COMPOSED_KINDS)[number];

/** Kinds that may hold children. Everything else is a leaf, and a node
 *  parented to a leaf is rejected rather than silently reparented. */
export const COMPOSED_CONTAINER_KINDS: ReadonlySet<ComposedKind> = new Set([
  "stack",
  "row",
  "grid",
  "card",
]);

/** Hard ceilings. 120 nodes is roughly four generous cards' worth of structure;
 *  depth 6 is `stack > grid > card > stack > row > text`, which is deeper than
 *  any real section band. Both are enforced on the write path
 *  (`assertSectionArrayLimits`) as well as here, because a validator that only
 *  the generator calls is not a limit. */
export const COMPOSED_MAX_NODES = 120;
export const COMPOSED_MAX_DEPTH = 6;

/** Per-node text ceilings. Long enough for a real paragraph, short enough that
 *  120 of them cannot make a document Convex refuses to store. */
export const COMPOSED_MAX_TEXT = 2000;
export const COMPOSED_MAX_LABEL = 120;

// The node and content TYPES are inferred from the Convex validator
// (`convex/model/composed.ts`), the same way every other section's content type
// is. Two hand-written shapes for one thing is how a union and its validator
// drift; there is exactly one here.

export type ComposedProblem =
  | { code: "too-many-nodes"; index?: number }
  | { code: "empty" }
  | { code: "bad-kind"; index: number }
  | { code: "bad-parent"; index: number }
  | { code: "parent-not-container"; index: number }
  | { code: "too-deep"; index: number }
  | { code: "text-too-long"; index: number }
  | { code: "unknown-icon"; index: number };

/**
 * Is this a legal tree?
 *
 * The one structural invariant, and the reason a cycle is impossible rather
 * than merely checked for: **a node's parent index is always strictly less than
 * its own**, or -1 for a root. `imported` relies on the same rule and states it
 * the same way. A forward or self reference cannot describe a tree that renders
 * top to bottom, so it is rejected here rather than guarded against downstream.
 *
 * Returns every problem it finds, not the first, so a repair round gets the
 * whole list in one pass instead of one error per attempt.
 */
export function validateComposedNodes(
  nodes: readonly unknown[],
): ComposedProblem[] {
  const problems: ComposedProblem[] = [];
  if (nodes.length === 0) return [{ code: "empty" }];
  if (nodes.length > COMPOSED_MAX_NODES) {
    problems.push({ code: "too-many-nodes" });
  }
  const kinds = new Set<string>(COMPOSED_KINDS);
  const icons = new Set<string>(SITE_ICON_KEYS);
  // Depth is computable in one forward pass precisely BECAUSE parent < index:
  // a parent's depth is already known by the time its child is read.
  const depth: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as Record<string, unknown> | null;
    depth.push(0);
    if (!node || typeof node !== "object") {
      problems.push({ code: "bad-kind", index: i });
      continue;
    }
    const kind = node.kind;
    if (typeof kind !== "string" || !kinds.has(kind)) {
      problems.push({ code: "bad-kind", index: i });
      continue;
    }
    const parent = node.parent;
    if (typeof parent !== "number" || !Number.isInteger(parent) || parent >= i || parent < -1) {
      problems.push({ code: "bad-parent", index: i });
      continue;
    }
    if (parent >= 0) {
      const parentKind = (nodes[parent] as { kind?: unknown } | undefined)?.kind;
      if (
        typeof parentKind !== "string" ||
        !COMPOSED_CONTAINER_KINDS.has(parentKind as ComposedKind)
      ) {
        problems.push({ code: "parent-not-container", index: i });
        continue;
      }
      depth[i] = depth[parent]! + 1;
      if (depth[i]! >= COMPOSED_MAX_DEPTH) {
        problems.push({ code: "too-deep", index: i });
      }
    }
    if (kind === "text" || kind === "badge") {
      const text = node.text;
      const max = kind === "badge" ? COMPOSED_MAX_LABEL : COMPOSED_MAX_TEXT;
      if (typeof text === "string" && text.length > max) {
        problems.push({ code: "text-too-long", index: i });
      }
    }
    if (kind === "icon" && !icons.has(String(node.name))) {
      problems.push({ code: "unknown-icon", index: i });
    }
  }
  return problems;
}

/** True when every node in the tree is legal. */
export function isValidComposedTree(nodes: readonly unknown[]): boolean {
  return validateComposedNodes(nodes).length === 0;
}

/** Indices of `nodes` that are direct children of `parent`, in document order.
 *  The renderer's only lookup, kept here so the walk and the validator agree on
 *  what "a child" means. */
export function composedChildren(
  nodes: readonly { parent: number }[],
  parent: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i]!.parent === parent) out.push(i);
  }
  return out;
}
