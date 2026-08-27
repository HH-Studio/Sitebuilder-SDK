import { v, type Infer, type Validator } from "convex/values";
import { assetRef, ctaRef, siteIconKey } from "./content";
import {
  COMPOSED_ALIGN,
  COMPOSED_COLUMNS,
  COMPOSED_ICON_SIZE,
  COMPOSED_RATIO,
  COMPOSED_SPACE,
  COMPOSED_SURFACE,
  COMPOSED_TEXT_ROLE,
} from "../../lib/sections/composed";

// ---------------------------------------------------------------------------
// The Convex validator for the `composed` grammar.
//
// Every enum here is built FROM the list in `lib/sections/composed.ts`, so the
// database and the pure validator can never disagree about what a legal value
// is. The one thing this file adds is authority: Convex rejects a write that
// does not match, which is what makes the grammar a real ceiling rather than a
// convention the generator happens to follow.
//
// Note what is absent, because the absence is the design: no colour, no number
// with a unit, no CSS string, no free-form class. A model writing this cannot
// express a broken layout, only an ugly one.
// ---------------------------------------------------------------------------

/** `v.union` over a `readonly string[]`, keeping the literal types. */
function enumOf<T extends readonly string[]>(values: T) {
  return v.union(
    ...(values.map((value) => v.literal(value)) as unknown as [
      Validator<T[number]>,
      Validator<T[number]>,
      ...Validator<T[number]>[],
    ]),
  );
}

const space = enumOf(COMPOSED_SPACE);
const surface = enumOf(COMPOSED_SURFACE);
const align = enumOf(COMPOSED_ALIGN);
const textRole = enumOf(COMPOSED_TEXT_ROLE);
const ratio = enumOf(COMPOSED_RATIO);
const iconSize = enumOf(COMPOSED_ICON_SIZE);
const columns = v.union(
  ...(COMPOSED_COLUMNS.map((n) => v.literal(n)) as unknown as [
    Validator<2>,
    Validator<3>,
    Validator<4>,
  ]),
);

/** Index of the parent node; -1 for a root. ALWAYS strictly less than this
 *  node's own index — the invariant that makes a cycle unrepresentable and lets
 *  the renderer walk in one forward pass. Enforced by
 *  `validateComposedNodes`, which every write path runs. */
const parent = v.number();

export const composedNode = v.union(
  v.object({
    kind: v.literal("stack"),
    parent,
    gap: v.optional(space),
    pad: v.optional(space),
    surface: v.optional(surface),
    align: v.optional(align),
  }),
  v.object({
    kind: v.literal("row"),
    parent,
    gap: v.optional(space),
    pad: v.optional(space),
    surface: v.optional(surface),
    align: v.optional(align),
  }),
  v.object({
    kind: v.literal("grid"),
    parent,
    columns,
    gap: v.optional(space),
    pad: v.optional(space),
    surface: v.optional(surface),
  }),
  v.object({
    kind: v.literal("card"),
    parent,
    gap: v.optional(space),
    pad: v.optional(space),
    align: v.optional(align),
  }),
  v.object({
    kind: v.literal("text"),
    parent,
    role: textRole,
    text: v.string(),
    align: v.optional(align),
    muted: v.optional(v.boolean()),
  }),
  v.object({
    kind: v.literal("image"),
    parent,
    ratio,
    /** Absent = an empty, visibly labelled slot. The owner fills it through the
     *  ordinary picker; the model never puts a picture here, and the uploaded
     *  screenshot never becomes site content. */
    ref: v.optional(assetRef),
    /** The model's guess at what belongs in the slot, read off someone else's
     *  design. A suggestion shown on the placeholder — never stored as the
     *  owner's alt text. */
    hint: v.optional(v.string()),
  }),
  v.object({ kind: v.literal("button"), parent, cta: ctaRef }),
  v.object({ kind: v.literal("badge"), parent, text: v.string() }),
  v.object({
    kind: v.literal("icon"),
    parent,
    name: siteIconKey,
    size: v.optional(iconSize),
  }),
  v.object({ kind: v.literal("divider"), parent }),
  v.object({ kind: v.literal("spacer"), parent, size: v.optional(space) }),
);

export type ComposedNode = Infer<typeof composedNode>;
export type ComposedNodeKind = ComposedNode["kind"];
