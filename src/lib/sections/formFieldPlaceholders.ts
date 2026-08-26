// ---------------------------------------------------------------------------
// The grey example text a form field offers before the visitor types.
//
// One table, read by every surface that CREATES a form field: the contact and
// lead-form section defaults, the per-service intake suggestion, and booking's
// three fixed questions. Nothing reads it at render time, so a hemsida that
// already exists keeps whatever it has and never changes on its own.
//
// Hand-authored for sv/en/pl only, exactly like every other seed table in this
// folder (see `arrayDefaultFor` in convex/lib/sectionOps.ts): a site on a newer
// SITE_LOCALE seeds the English string and the publish translate pass carries
// it into the primary language. Inventing a Finnish phone format here would be
// a guess, and a wrong example is worse than none.
//
// An example is never a person and never a company. `Namn@email.com` says what
// SHAPE the field wants without pretending Anna Andersson exists (owner
// directive 2026-08-25).
// ---------------------------------------------------------------------------

import type { FormField } from "../../convex/model/content";
import type { GenerationLocale } from "../i18n/site-locales";

type FieldType = FormField["type"];

/** Empty means "no honest example exists for this type". A free-text field can
 *  hold anything, so any example we invent narrows what the visitor thinks is
 *  allowed. The owner writes one when the question is specific enough to have
 *  a shape. */
const NONE = { sv: "", en: "", pl: "" } as const;

const SUGGESTIONS: Record<FieldType, Record<GenerationLocale, string>> = {
  text: NONE,
  email: {
    sv: "Namn@email.com",
    en: "Name@email.com",
    pl: "Imie@email.com",
  },
  phone: {
    sv: "070-123 45 67",
    en: "070-123 45 67",
    pl: "601 234 567",
  },
  address: {
    sv: "Gatan 1",
    en: "Main Street 1",
    pl: "Ulica 1",
  },
  postalCode: {
    sv: "123 45",
    en: "123 45",
    pl: "00-001",
  },
  city: {
    sv: "Stockholm",
    en: "Stockholm",
    pl: "Warszawa",
  },
  country: {
    sv: "Sverige",
    en: "Sweden",
    pl: "Polska",
  },
  // A message box asks an open question, so the example says what to write
  // about rather than writing it for them.
  textarea: {
    sv: "Vad gäller det?",
    en: "What is it about?",
    pl: "Czego dotyczy sprawa?",
  },
  // Mirrors the fallback `SiteForm` already prints on a required select with no
  // placeholder, so seeding it changes nothing a visitor sees.
  select: {
    sv: "Välj ett alternativ",
    en: "Choose an option",
    pl: "Wybierz opcję",
  },
};

/** Every field type the table decides about. Exported so the suite can compare
 *  it against the validator's own union: a tenth field type fails there until
 *  somebody chooses whether it has an honest example. */
export const SUGGESTED_FIELD_TYPES = Object.keys(SUGGESTIONS) as FieldType[];

/** The example text a NEW field of this type arrives with. Empty string when no
 *  honest example exists, which the caller stores as no placeholder at all.
 *
 *  Takes a plain `string` rather than the union on purpose: one caller reads a
 *  type out of stored content, where a row written by an older schema could
 *  hold anything. An unknown type gets no example instead of a crash. */
export function placeholderFor(type: string, lang: GenerationLocale): string {
  return SUGGESTIONS[type as FieldType]?.[lang] ?? "";
}

/** `placeholder` for a new field, ready to spread into a `FormField`. Absent
 *  rather than empty when there is no suggestion, so the stored object stays
 *  the same shape it has today. */
export function placeholderSeed(
  type: string,
  lang: GenerationLocale,
): { placeholder?: string } {
  const value = placeholderFor(type, lang);
  return value ? { placeholder: value } : {};
}
