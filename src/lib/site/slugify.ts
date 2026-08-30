// Shared URL-slug normalisation. Lives outside `convex/` so client components
// can preview the address a title/slug will produce WITHOUT importing Convex
// server code (backlog 0311). `convex/lib/slug.ts` re-exports this, so the
// editor preview and the server write can never drift apart.

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 48)
    // Trim AFTER slicing so a truncation that lands on a "-" boundary can't
    // leave a trailing dash (e.g. a long name cut mid-word → "studio-…-").
    .replace(/^-+|-+$/g, "");
  return base || "min-sida";
}

// ---------------------------------------------------------------------------
// Short address candidates (owner directive 2026-08-27). "Exempel Bygg i
// Gävleborg" used to become exempel-bygg-i-gavleborg.snabbsite.website. The
// address should be the shortest form of the name that is still the name:
// drop a trailing place ("i Gävleborg"), a legal form ("AB"), and "& Co".
// The server tries these first and falls back to the full slug on collision.
// ---------------------------------------------------------------------------

const MIN_SHORT_SLUG_LENGTH = 4;

// " i Gävleborg", " in Stockholm", " på Södermalm", " från Umeå": the place
// and everything after it. Case-insensitive, whole words only.
const LOCATION_PHRASE = /\s+(?:i|in|på|från|from)\s+\S.*$/iu;

// Legal forms as whole words at the end. "AS" (Norwegian) is upper-case only,
// because "as" is an ordinary English word.
const LEGAL_FORM = /\s+(?:AB|HB|KB|Aktiebolag|Handelsbolag|Ltd|Inc|LLC|Oy|ApS)\.?$/iu;
const LEGAL_FORM_AS = /\s+AS$/u;

// " & Co", " och Co", " and Co" at the end.
const AND_CO = /\s+(?:&|och|and)\s+Co\.?$/iu;

/** The name with its trailing place, legal form and "& Co" removed. Returns
 *  the input unchanged when there is nothing to strip. */
function stripNameNoise(name: string): string {
  let out = name.trim();
  for (;;) {
    const next = out
      .replace(LOCATION_PHRASE, "")
      .replace(LEGAL_FORM, "")
      .replace(LEGAL_FORM_AS, "")
      .replace(AND_CO, "")
      .trim();
    if (next === out) return out;
    out = next;
  }
}

/**
 * Slug candidates for a business name, in order of preference: the shortened
 * name with hyphens, then the same without hyphens. Each is at least four
 * characters, never a reserved subdomain, and never the full `slugify(name)`,
 * which the caller appends last. A name with nothing to strip yields `[]`.
 *
 *   "Exempel Bygg i Gävleborg" -> ["exempel-bygg", "exempelbygg"]
 *   "Annas Salong AB"         -> ["annas-salong", "annassalong"]
 *   "Exempel Bygg"            -> []
 */
export function shortNameCandidates(
  name: string,
  /** Subdomains a site may never take (`lib/site/reserved.ts`). Passed in
   *  rather than imported: this file is mirrored into the Site Kit SDK, and
   *  the reserved list is app-only. */
  reserved: ReadonlySet<string> = new Set(),
): string[] {
  const full = slugify(name);
  const stripped = stripNameNoise(name);
  if (!stripped || stripped === name.trim()) return [];
  const short = slugify(stripped);
  const out: string[] = [];
  for (const candidate of [short, short.replace(/-/g, "")]) {
    if (candidate.length < MIN_SHORT_SLUG_LENGTH) continue;
    if (candidate === full) continue;
    if (reserved.has(candidate)) continue;
    if (out.includes(candidate)) continue;
    out.push(candidate);
  }
  return out;
}

/** The address a NEW website will most likely get: the first short candidate,
 *  else the full slug. The server may still suffix it on collision. */
export function preferredSlug(name: string, reserved?: ReadonlySet<string>): string {
  return shortNameCandidates(name, reserved)[0] ?? slugify(name);
}
