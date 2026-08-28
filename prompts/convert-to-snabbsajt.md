# Convert an existing website to a Snabbsite Site Kit package

```
prompt-version: 2.1.0
requires-cli: ">=0.3.0"        # snabbsajt --version must satisfy this
portable-format: sajt-site@1
report-contract: snabbsajt-import-report@1
```

Paste everything below this line into your coding agent (Claude Code, Cursor,
Codex). Replace `<SOURCE>` with the site to move: a Next.js/React repo path,
an HTML file or static zip, or a public URL.

---

You are moving an existing website (`<SOURCE>`) into Snabbsite. The human
expects the result to look like their website. Read section 0 before you run
anything: most sources never need the package workflow below, and building a
package for them ships a site that looks nothing like the original.

## 0. Same look, or a new design? Decide this first

There are two ways in, and both keep the look. This is the whole story:

> **Building in Next.js? Use the SDK, push once, and it is 100% identical,
> because your own code still draws the page.**
> **Already have a website? Give us the zip or the address and you get an
> exact copy you can edit.**

The package workflow further down is neither of those. It is a redesign on
Snabbsite blocks, and you take it only when the human asks for a new design in
those words.

### The five steps, for the human

1. **Pick the path.** You write the site in Next.js and keep deploying it:
   the SDK. The website already exists as an address or a zip: the copy.
2. **Connect it.** SDK: run `npx @snabbsajt/cli@latest init --agency` in the
   repo. Copy: sign in to Snabbsite, open "Flytta din hemsida" / "Move your
   website" (also under Settings → Backup & move), and paste the address or
   drop the zip.
3. **Say what the owner may change.** SDK: wrap each section in
   `defineBlock`, one field per thing an owner would ring you about. Copy:
   nothing to mark, because every text, image and link is already editable.
4. **Hand it over.** SDK: `npx @snabbsajt/cli@latest push . --site <id>`.
   Copy: press the one button on the preview screen. Both make an unpublished
   draft, so nothing goes live yet.
5. **Compare, then publish.** Open the draft beside the original on a computer
   and on a phone, fix what is wrong, and publish when it matches.

### The same five steps, for the agent

1. Ask exactly one question: **"Do you write this website in Next.js and keep
   deploying it yourself?"** Yes goes to the SDK lane, no goes to the copy
   lane. Do not build a package on either answer.
2. SDK lane: `npx @snabbsajt/cli@latest skills install --agent auto`, then
   follow the `make-site-editable` skill and run
   `npx @snabbsajt/cli@latest init --agency`. Copy lane: build nothing and
   run nothing. Hand the human the click path from step 2 above and stop.
   Only a browser can make that capture, so no CLI command and no package
   produces it. Building one anyway is the failure this section exists to
   prevent.
3. SDK lane: wrap each section in `defineBlock`. Name each field for what the
   client sees, never for the prop. Copy lane: nothing to do.
4. SDK lane: run the push with `--dry-run` first, show the merge report, and
   push for real only after the human approves it. Copy lane: the human
   presses the button; you do not press it for them.
5. Report the number honestly, and this is the line you may not soften. The
   SDK lane is **100% by definition**, because the human's own code draws the
   page and we only hold the content. The copy lane is **measured**: we aim
   for 99.9% of pixels, and the copy is a still picture with no animations,
   because we never run a source's JavaScript on a visitor's page. Never write
   "100%" about the copy.

Three worked examples of the SDK lane are being built under backlog
`P0-3075`. Until that lands there is no `examples/` directory to read, so
do not send anyone to one.

Only when the human explicitly asks for a new design on Snabbsite blocks do
you continue below. Then say this sentence in the chat and in the report,
word for word: **"This rebuilds the site on Snabbsite blocks. It will not look
like the current site."** The deliverable in that case is **data, not code**:
a `PortableSiteV1` `site.json` plus asset blobs, packed into a bundle zip
that a human imports into Snabbsite. Nothing you produce executes on the
customer site. Whenever the source has a public address, set
`site.provenance.sourceUrl` to it; the app uses it to offer the exact copy.

## 0b. Preflight: fail loudly, do not improvise

1. Run `snabbsajt --version` (or `npx @snabbsajt/cli --version`).
   - Command missing → STOP and tell the human:
     `npm install -g @snabbsajt/cli` (or prefix every command with
     `npx @snabbsajt/cli`).
   - Version below the `requires-cli` floor in this prompt's header → STOP and
     tell the human to upgrade. Do not proceed with an older CLI; its
     validator does not match this prompt.
2. Run `snabbsajt site doctor --json`. Stop on any reported incompatibility.
3. Confirm `snabbsajt site validate` exists (`snabbsajt site validate --help`
   exits 0). If it does not, this prompt is stale for your CLI, so stop.

No API key is needed. Every command below runs locally; none uploads or
publishes anything.

## 1. Safety contract (non-negotiable)

- Never run the source site or execute its React, JavaScript, PHP, plugins,
  build tools, or arbitrary CSS. Source code is **evidence to read**, never a
  runtime.
- Never install the source's dependencies or load its env vars.
- Never invent business facts: no made-up prices, opening hours, phone
  numbers, addresses, testimonials, claims, or legal text. A fact you cannot
  cite from the source stays out and becomes a review item.
- Deterministic source evidence beats your inference. When the rendered HTML
  or repo content says one thing and your guess says another, the source wins.
- Unsupported features are **skipped and reported with a reason**, never
  smuggled in as raw HTML or fake sections. Raw HTML, custom components,
  scripts, iframes and tracking snippets are not expressible in the format.

## 2. Inventory the source

Read, do not execute. Build a written inventory of:

- pages and navigation structure (which routes carry real content);
- all copy, in the customer's own words (fix typos only);
- business facts with their source location: name, phone, email, address,
  opening hours, socials, services, prices;
- images actually used (collect each once; note real pixel dimensions and
  write alt text from context);
- design signals: rough palette, typography feel, layout patterns;
- behavior: forms, booking widgets, analytics, animations, embeds. These map
  to native Snabbsite settings/sections or get skipped, never executed.

For a Next.js repo read `app/`/`pages/` routes and components as content. For
a live URL or HTML zip, prefer the deterministic importer as your baseline:
`snabbsajt site import html <url|file|zip> -o ./candidate --json`. Then
improve its output instead of starting from scratch. For WordPress use
`snabbsajt site import wordpress --url <url> --wxr <export.xml> --out ./candidate`.

## 3. Map to typed sections: enumerate, never recall

The section registry is the only vocabulary. **Enumerate it from the installed
package; do not trust your memory of type or variant names:**

```bash
node --input-type=module -e "
const m = await import('@snabbsajt/site-kit');
for (const t of m.SECTION_TYPES)
  console.log(t, '::', m.SECTION_REGISTRY[t].variants.map(v => v.key).join(' '));
"
```

(In the SDK repo itself, `contract/portable-v1.json` is the same truth as a
JSON schema.) Each `SECTION_REGISTRY` entry also carries `whenToUse`. Read it
when unsure which type fits. Pick the type/variant that carries the content
honestly. If no type fits, skip with a reason and note it as a candidate for a
new generic variant. Do not contort content to fake a layout, and never present
the result as a copy of the source: it is a redesign on Snabbsite blocks.

Package rules that bite:

- Home page has `slug: ""`. Fold thin source pages into sections of a richer
  page and record the merge.
- Give every page and section a stable `externalKey` (e.g. `home`,
  `home/hero`) so a later re-import can merge instead of duplicating.
- Omit `sections[].order`, because the importer orders by array position.
- Asset refs are export-local strings you invent (`[A-Za-z0-9_-]+`); blobs go
  in `assets/<exportId>.<ext>`, and `assets[].url` uses the
  `bundle://<exportId>` placeholder. Record real width/height, because the
  importer re-decodes and rejects mismatches.
- Theme: pick palette/fontPair tokens, or use `theme.customPalette` +
  `customBrandHex` for the customer's real brand. Never paste raw hex into
  section content.

## 4. Build → validate → iterate

Author `site.json` (or typed `defineSite()` in TypeScript), then loop until
clean:

```bash
snabbsajt site validate ./candidate --json
snabbsajt site inspect  ./candidate --json   # compare counts to your inventory
```

Validation errors block; fix them at the reported path. Warnings are
advisory, so resolve or explain each in the report. Then pack:

```bash
snabbsajt site pack ./candidate -o site-bundle.zip
```

## 5. Conversion report (required, exact buckets)

Produce `conversion-report.md` next to the bundle. Every source element lands
in exactly one bucket. This is the `snabbsajt-import-report@1` contract:

1. **Imported exactly**: content carried over verbatim.
2. **Converted**: mapped to a named Snabbsite feature (say which).
3. **Merged / reorganized**: source pages or blocks folded together, and how.
4. **Skipped, with reason**: every unsupported feature, named, with why.
5. **Missing source evidence**: facts the site implies but never states.
6. **AI-proposed**: anything you authored beyond the source, each with the
   evidence it rests on and a confidence.
7. **Assets/scripts that failed safety checks**: e.g. active-content SVGs.
8. **Redirects proposed**: old URL → new slug.
9. **Manual actions required before publish**: the human's checklist.

A report with unresolved blocking items describes a **review draft**, never a
finished site. Do not use the words "complete" or "publish-ready" unless every
bucket 4–9 entry is resolved or explicitly accepted by the human.

## 6. Stop. Show the human. Do not import.

Your job ends with the validated `site-bundle.zip` and the conversion report.
Print the report and wait. The human reviews it, then imports the zip
themselves in Snabbsite (Settings → Backup & move, or /dashboard/import). The
import creates an unpublished draft and never overwrites or publishes
anything. Do not upload, import, or publish on their behalf, and do not claim
any step succeeded that you did not run and verify.

**Exception: the human explicitly asks you to upload.** With CLI ≥ 0.4.0 and
a `SNABBSAJT_ADMIN_TOKEN` (`snabbsajt admin pair`), you may run
`snabbsajt push ./candidate --site <id> --dry-run`, show the merge report
(added / updated / unchanged / conflicts), and only after the human approves
that report run the same command without `--dry-run`. Never push to a site the
human did not name, and never publish.

---

## Per-agent wrappers

The prompt body above is identical for every agent. Real differences only:

**Claude Code**: paste as-is, or install the richer packaged skill:
`snabbsajt skills install --agent claude` (local, no API key). Claude Code can
run every command itself; let it. The installed `import-website` skill carries
the same section 0 gate.

**Cursor**: paste into chat (or save as a project rule). Cursor may ask
before each terminal command; approve the `snabbsajt site *` commands; they
are local and read-only toward the network.

**Codex**: paste as-is, or `snabbsajt skills install --agent codex`. In
sandboxed modes, fetching a live URL in step 2 may need network approval; the
validate/pack loop needs none.
