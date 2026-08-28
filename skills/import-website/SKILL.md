---
name: import-website
description: Bring an existing website into Snabbsite, and route to the lane that keeps its look. Two lanes do: building in Next.js means the SDK (make-site-editable), push once, 100% identical because the human's own code still draws the page; already having a website means handing over the zip or the address for an exact copy they can edit. The package workflow in this skill is the third lane, a public URL, rendered HTML, a static zip, a Next.js export or a WordPress WXR converted into typed Snabbsite sections, and it is a redesign on Snabbsite blocks that runs only when the human asks for a new design. Use when the human says "import this website", "importera den har hemsidan", "migrate <customer> to Snabbsite", "flytta kundens sajt", "convert this WordPress site", or hands over a URL, zip, or repo that should become a Snabbsite site. build-snabbsajt-site starts from a brief instead.
metadata:
  skill-version: "3.0.0"
  minimum-cli-version: "0.1.0"
  portable-format: "sajt-site@1"
  report-contract: "snabbsajt-import-report@1"
---

# Import a website into Snabbsite

## Step 0: which lane? (hard gate)

There are two ways into Snabbsite, and both keep the look. This is the whole
story, and it is the same story the app, the marketing page, the SDK
quickstart and the MCP tool descriptions tell:

> **Building in Next.js? Use the SDK, push once, and it is 100% identical,
> because your own code still draws the page.**
> **Already have a website? Give us the zip or the address and you get an
> exact copy you can edit.**

The package workflow in this skill is neither of those. It is a redesign on
Snabbsite blocks, and it runs only when the human asks for a new design in
those words.

### The five steps, for the human

1. **Pick the path.** They write the website in Next.js and keep deploying it:
   the SDK. The website already exists as an address or a zip: the copy.
2. **Connect it.** SDK: `npx @snabbsajt/cli@latest init --agency` in the repo.
   Copy: sign in, open "Move your website" ("Flytta din hemsida"), and paste
   the address or drop the zip.
3. **Say what the owner may change.** SDK: wrap each section in `defineBlock`,
   one field per thing an owner would ring about. Copy: nothing to mark.
4. **Hand it over.** SDK: `npx @snabbsajt/cli@latest push . --site <id>`.
   Copy: press the one button on the preview screen. Both make an unpublished
   draft.
5. **Compare, then publish.**

### The same five steps, for you

1. Ask exactly one question, before any tool runs:

   > "Do you write this website in Next.js and keep deploying it yourself?"

   Yes goes to the SDK lane. No goes to the copy lane. Do not build a package
   on either answer.
2. SDK lane: stop here and switch to the `make-site-editable` skill
   (`snabbsajt init --agency`, `defineBlock`, push). Their code keeps drawing
   the site; Snabbsite holds the content and the editor. Copy lane: stop here,
   build nothing, run nothing, and do **not** run `site import html`. Hand the
   human the address and these steps: new account, onboarding, "Move your
   website" ("Flytta din hemsida"), paste the address or drop the zip.
   Existing account: Settings, Backup & move (Inställningar, Säkerhetskopia
   och flytt), paste the address or drop the zip. The app captures the
   rendered page in its own browser, so a CLI cannot do this and there is
   nothing for you to build.
3. SDK lane: name each field for what the CLIENT sees, never for the prop.
   Copy lane: nothing to mark, because every text, image and link is already
   editable.
4. SDK lane: `--dry-run` first, show the merge report, push for real only
   after the human approves it. Copy lane: the human presses the button.
5. Report the number honestly, and do not soften this line. The SDK lane is
   **100% by definition**, because the human's own code draws the page and
   Snabbsite only holds the content. The copy lane is **measured**: the goal is
   99.9% of the pixels, runs on real customer sites have landed between roughly
   98.5% and 99.5%, and the copy is a still picture with no animations, because
   Snabbsite never runs a source's JavaScript in a visitor's browser. Never
   write "100%" about the copy.

Three worked SDK-lane examples with a score per section are being built under
backlog `P0-3075`. Until that lands there is no `examples/` directory, so do
not point anyone at one.

### Only then, the third lane

When the human says, in their own words, "a new design on Snabbsite blocks",
continue with the package workflow below. First say this in chat, word for
word, and repeat it in the final report: **"This rebuilds the site on
Snabbsite blocks. It will not look like the current site."**

A package of typed sections keeps the words, images and facts and replaces the
layout, fonts and colours with Snabbsite's. Never present it as "your site,
imported". The first time an agent did, the owner did not recognise his own
website. Read the fidelity contract in
[the shared mapping rules](references/import-mapping-rules.md) before you go
on.

## Package workflow (redesign lane only)

Use this when the human asked for a new design on Snabbsite blocks. The
deterministic importer runs first. AI may then improve the native mapping, but
it cannot invent facts or bypass review.

Read [the shared mapping rules](references/import-mapping-rules.md) completely
before inspecting or changing a candidate package. Command flags, import
statuses, and per-command failure modes are in
[references/cli-commands.md](references/cli-commands.md).

### Safety contract

- Never run the source or execute imported React, JavaScript, PHP, plugins,
  scripts, build tools, or arbitrary CSS.
- Never install source dependencies or load its environment variables.
- Never forward cookies, authorization headers, credentials, or secrets.
- Convert evidence into `PortableSiteV1` through native Snabbsite sections.
- Preserve and cite every loss, replacement, warning, proposal, and manual
  follow-up in `ImportReportV1`.
- Set `provenance.sourceUrl` in `site.json` whenever the source is reachable
  at a URL. The app uses it to offer the exact copy instead.

### Workflow

1. Run `snabbsajt site doctor --json` and stop on incompatible formats.
2. Run `snabbsajt site import html <source> -o <candidate-dir> --json` for a
   public URL, local HTML entry, or static zip.
3. Read the deterministic evidence and report. Preserve their ids and hashes.
4. Inventory routes, copy, media, SEO, forms, analytics, booking, animations,
   redirects, and unsupported behavior without executing the source.
5. Improve `site.json` only with native, evidence-backed sections/settings. The
   allowed section types, their variants, and every field are in
   [references/section-schema.md](references/section-schema.md). Use a
   registered type; never invent one. When no type fits a region, skip it with
   a reason instead of forcing content into the nearest shape.
6. Add every AI-created mapping as an `ai_proposed` report item with real
   evidence ids and confidence, following the shared lint rules.
7. Run `snabbsajt site validate <candidate-dir> --json` after each meaningful
   proposal.
8. Run `snabbsajt site inspect <candidate-dir> --json` and compare page,
   section, content, and asset counts to the evidence inventory.
9. Run `snabbsajt site doctor --json` again before handoff.
10. Require human approval for all `ai_proposed`, `missing`, `unsafe`, and
    `manual` findings. The human records it with
    `snabbsajt site import approve <candidate-dir> --yes`.
11. Pack only after approval: `snabbsajt site pack <candidate-dir> -o site.zip`.

Do not claim the migration, browser import, edit, publish, or restore succeeded
unless that exact step was verified. Local conversion requires no Snabbsite API
key or bundled model client.

### Handoff

The report and the chat message both carry the sentence from Step 0: the site
was rebuilt on Snabbsite blocks and will not look the same. Review the packed
bundle with the `review-site-package` skill before anyone imports it. The
human lands it either by uploading the zip in the app or with
`snabbsajt push <package-dir>`; always `--dry-run` first, and never
`--force-key` on your own judgement, since a conflict is the customer's own
edit. A push writes the DRAFT only. For content edits and the publish handshake
afterwards, use the `manage-snabbsajt-site` skill.
