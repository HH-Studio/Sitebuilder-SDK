# Get a website into Snabbsite: one-paste agent prompt

There are two ways in when keeping the look matters:

> **Building in Next.js? Use the SDK. Your code keeps drawing the page, and
> the owner edits only the fields you expose.**
> **Already have a website? Use the zip or address for best-effort visual
> capture. Captured text, images and links are editable. Internal layout stays
> fixed, and a typed rebuild is the fallback.**

The third route, the package lane, rebuilds the site on
Snabbsite's own blocks. That is a redesign, and an agent may only take it when
you ask for a new design in those words.

## The five steps, for you

1. **Pick the path.** You write the website in Next.js and keep deploying it:
   the SDK. The website already exists as an address or a zip: visual capture.
2. **Connect it.** SDK: run `npx @snabbsajt/cli@latest init --agency` in your
   repo. Capture: sign in to Snabbsite, open "Move your website" ("Flytta din
   hemsida"), and paste the address or drop the zip. On an account that already
   has a site the same lane sits under Settings, Backup & move
   (Inställningar, Säkerhetskopia och flytt).
3. **Say what the owner may change.** SDK: wrap each section in `defineBlock`,
   one field per thing an owner would ring you about. Capture: text, image and
   link slots are editable. Internal captured layout stays fixed.
4. **Hand it over.** SDK: `npx @snabbsajt/cli@latest push . --site <id>`.
   Copy: press the one button on the preview screen. Both make an unpublished
   draft, so nothing goes live yet.
5. **Compare, then publish.** Open the draft beside the original on a computer
   and on a phone, fix what is wrong, and publish when it matches.

## The same five steps, for your agent

**Copy the block below, paste it into your agent as a single message, and
replace `<SOURCE>` with your website** (a live URL, a `.html` file, an
HTML/CSS/assets `.zip`, a static Next.js `out/` export, a WordPress URL plus a
WXR export, or a Next.js/React repo path). That is the only edit you make.

---

```text
I want the website at <SOURCE> in Snabbsite.

Step 1. Before any tool runs, ask me ONE question:
  "Do you write this website in Next.js and keep deploying it yourself?"
  Yes  -> the SDK lane (A below).
  No   -> the copy lane (B below).
Do not build a site package on either answer. A package is a redesign on
Snabbsite blocks and runs only if I ask for a new design in those words (C).

Step 2. Connect it.
  A (SDK lane):
       npx @snabbsajt/cli@latest skills install --agent auto
       npx @snabbsajt/cli@latest init --agency
     Then follow the `make-site-editable` skill. My code keeps drawing the
     site; Snabbsite holds the content and the editor.
  B (copy lane):
     Build nothing. Run nothing. Hand me these steps and stop:
       New account:      onboarding -> "Move your website"
                         (Swedish: "Flytta din hemsida") -> paste the address,
                         or drop the zip.
       Existing account: Settings -> Backup & move (Swedish: Inställningar ->
                         Säkerhetskopia och flytt) -> paste the address, or
                         drop the zip.
     The app captures the rendered page in its own browser. Only a browser can
     make that capture, so no CLI command and no package produces it.

Step 3. Say what I may change.
  A: wrap each section in `defineBlock`, one field per thing a client would
     ring me about. Name fields for what the CLIENT sees, never for the prop.
  B: text, image and link slots are editable. Internal captured layout stays
     fixed.

Step 4. Hand it over.
  A: npx @snabbsajt/cli@latest push . --site <id>
     Run it with --dry-run first, show me the merge report, and push for real
     only after I approve that report. A push writes the DRAFT only.
  B: I press the button on the preview screen. You do not press it for me.

Step 5. Report the result honestly.
  A keeps my renderer, but only the fields I expose are editable.
  B has no pixel percentage guarantee. Common fades, scroll reveals and smooth
    scrolling can be recreated with Snabbsite code. Source JavaScript and
    custom interactions do not move into the imported website.

C. Only if I say, in my own words, "new design on Snabbsite blocks":
   Say this sentence in chat, word for word, and repeat it in the final
   report: "This rebuilds the site on Snabbsite blocks. It will not look like
   the current site." Then run:
       npx @snabbsajt/cli@latest skills install --agent auto
   READ the installed `import-website` skill and follow it exactly. Do not
   guess the package format; the skill and the CLI validators are the truth.

Rules (non-negotiable, all three lanes):
- Never execute my source code. Read Next.js/React/HTML/WordPress ONLY as
  content and design evidence: no npm install, no builds, no scripts.
- Never invent facts. Keep my real wording, prices, hours, contact details.
  Anything you cannot find stays a review item. "Don't know" beats guessing.
- No raw HTML, no custom components, no tracking scripts, no iframes in a
  package. Every region becomes a registered Snabbsite section type; report
  what you skip.
- Set `provenance.sourceUrl` in `site.json` whenever the source has an
  address, so the app can offer me the visual capture path instead.
```

---

## Which lane

| Your source | You want | Lane | The agent |
| --- | --- | --- | --- |
| Your own Next.js/React repo, you keep deploying it | the same look | `make-site-editable` | wraps your components in `defineBlock`, pushes content; your code still draws the site |
| Live URL, static export, HTML zip | the same look | best-effort visual capture in the app | hands you the address and the click path; builds nothing |
| Any of the above | a new design on Snabbsite blocks | package (`import-website`) | converts, validates, packs, and says out loud that it will not look the same |

Why the split exists: a package of typed sections is a rebuild. It keeps your
words, images and facts, and it throws away your layout, fonts and colours in
favour of Snabbsite's. The first time an agent shipped that as "your site,
imported", the owner did not recognise his own website. Visual capture tries to
keep the rendered look. The SDK lane keeps the look because it does not redraw
the site.

## What stays the same, and what can change

**The SDK lane keeps your renderer.** Your components still draw the page.
Snabbsite stores only the words and pictures you expose to the editor.

**Visual capture is best effort.** We capture the rendered page and expose its
text, images and links. Internal section layout stays fixed. There is no pixel
percentage guarantee. Common fades, scroll reveals and smooth scrolling can be
recreated with Snabbsite code. Source JavaScript and custom interactions do not
move into the imported or published website.

## Worked examples

Three example projects (basic, medium, advanced) that walk the SDK lane end to
end, with a fidelity score per section, are being built under backlog
`P0-3075`. Until that lands there is no `examples/` directory in this
repository, so do not send anyone to one and do not write a command that reads
from it.

## What the package lane does and does not do

| Step | Automated by the agent | Who does it |
| --- | --- | --- |
| Install skills + CLI | yes, `skills install` | agent |
| Convert Next.js / HTML / WordPress to a typed package | yes | agent |
| Validate against production import rules | yes | agent |
| Pack a checksum-protected bundle | yes | agent |
| **Import into your account** | yes via MCP, or manual upload | agent **or** you |
| Edit text/images and publish | no, normal editor | you |

Two ways to land a package:

- **Hands-free (MCP)**: connect the Snabbsite MCP server to your agent, grant a
  connection `content:write` plus the advanced-editor capability, and the agent
  calls the **`import_site`** tool with the converted `PortableSiteV1` payload.
  It creates a new unpublished draft directly and returns the editor URL. No
  manual step. (Create-mode only for now; nothing is published or overwritten.)
- **Manual upload**: with no MCP connection, sign in to Snabbsite, then
  Settings, then Backup & move, then import the `site.zip` the CLI packed. Same
  server-side validation, same "new draft, nothing published" guarantee.

## Installing the CLI

```bash
npm install -g @snabbsajt/cli
```

`@snabbsajt/cli` and `@snabbsajt/site-kit` are published on npm. Prefixing
every command with `npx @snabbsajt/cli@latest` works too and needs no global
install. Two things to know before you rely on a version number: the newest
import fixes on this repository's `main` reach you only when a release is cut,
and the `make-site-editable` skill declares a `minimum-cli-version` of `0.5.0`
that no published build meets yet. Until that release lands, use the newest
published CLI and expect the agency lane to run ahead of it in this repository.

## Prefer the skill directly?

If you already have the skills installed, you do not need this prompt. Tell
your agent *"use the snabbsajt-getting-started skill; I want `<SOURCE>` in
Snabbsite"* and it asks the step 1 question itself. This file is the zero-setup
onboarding version for someone who has never touched Site Kit.

Full contracts: [`skills/make-site-editable/SKILL.md`](skills/make-site-editable/SKILL.md),
[`skills/import-website/SKILL.md`](skills/import-website/SKILL.md) and the
developer docs at <https://snabbsajt.com/docs/en/developer/site-kit>.
