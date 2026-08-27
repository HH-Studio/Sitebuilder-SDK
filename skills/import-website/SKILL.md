---
name: import-website
description: Bring an existing website into SnabbSajt. The default outcome is a copy that looks exactly like the site today, and this skill starts by routing to the lane that gives that (make-site-editable for the human's own Next.js/React repo, or the app's exact copy for a live URL, static export, or HTML zip). The package workflow here, a public URL, rendered HTML, a static zip, a Next.js export, or a WordPress WXR converted into typed SnabbSajt sections, is a redesign on SnabbSajt blocks and runs only when the human asks for a new design. Use when the human says "import this website", "importera den har hemsidan", "migrate <customer> to SnabbSajt", "flytta kundens sajt", "convert this WordPress site", or hands over a URL, zip, or repo that should become a SnabbSajt site. build-snabbsajt-site starts from a brief instead.
metadata:
  skill-version: "2.0.0"
  minimum-cli-version: "0.1.0"
  portable-format: "sajt-site@1"
  report-contract: "snabbsajt-import-report@1"
---

# Import a website into SnabbSajt

## Step 0: same look or new design? (hard gate)

Before any tool runs, ask the human one question:

> "Should the site look exactly like it does today?"

The default answer is **yes**. "Import it", "move it", "same site", "yes" and
no answer at all mean yes. Only an explicit "I want a new design on SnabbSajt
blocks" means no. Then route:

| The source | Same look | Do this |
| --- | --- | --- |
| The human's own Next.js/React repo, which they keep deploying | yes | Stop here. Use the `make-site-editable` skill (`snabbsajt init --agency`, `defineBlock`, push). Their code keeps drawing the site; SnabbSajt holds the content and the editor. Identical because it is their site. |
| A live URL, a static export (Next.js `out/`), or an HTML/CSS zip | yes | Stop here. Do **not** run `site import html`. Do not build a package. Hand the human the address and these steps: new account, onboarding, "Move your website" ("Flytta din hemsida"), paste the address or drop the zip. Existing account: Settings, Backup & move (Inställningar, Säkerhetskopia och flytt), paste the address or drop the zip. The app captures the rendered page itself; text, images and links stay editable; measured difference 0.5 to 1.5 % of pixels. A CLI cannot do this, so there is nothing for you to build. |
| Any source | **no**, the human wants a new design on SnabbSajt blocks | Continue with the package workflow below. First say this in chat, word for word, and repeat it in the final report: **"This rebuilds the site on SnabbSajt blocks. It will not look like the current site."** |

A package of typed sections keeps the words, images and facts and replaces the
layout, fonts and colours with SnabbSajt's. Never present it as "your site,
imported". The first time an agent did, the owner did not recognise his own
website. Read the fidelity contract in
[the shared mapping rules](references/import-mapping-rules.md) before you go
on.

## Package workflow (redesign lane only)

Use this when the human asked for a new design on SnabbSajt blocks. The
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
- Convert evidence into `PortableSiteV1` through native SnabbSajt sections.
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
unless that exact step was verified. Local conversion requires no SnabbSajt API
key or bundled model client.

### Handoff

The report and the chat message both carry the sentence from Step 0: the site
was rebuilt on SnabbSajt blocks and will not look the same. Review the packed
bundle with the `review-site-package` skill before anyone imports it. The
human lands it either by uploading the zip in the app or with
`snabbsajt push <package-dir>`; always `--dry-run` first, and never
`--force-key` on your own judgement, since a conflict is the customer's own
edit. A push writes the DRAFT only. For content edits and the publish handshake
afterwards, use the `manage-snabbsajt-site` skill.
