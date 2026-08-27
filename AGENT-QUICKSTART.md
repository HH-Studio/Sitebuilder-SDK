# Move a website into SnabbSajt: one-paste agent prompt

You are a technical user with a coding agent (Claude Code or Codex). You want
your existing website inside SnabbSajt so its owner can edit it there.

**The default outcome is a copy that looks exactly like your site today.** The
agent's first job is to pick the lane that gives you that. Two lanes do. The
third lane, the package lane, rebuilds the site on SnabbSajt's own blocks. That
is a redesign, and the agent may only take it when you ask for a new design.

**Copy the block below, paste it into your agent as a single message, and replace
`<SOURCE>` with your website** (a live URL, a `.html` file, an HTML/CSS/assets
`.zip`, a static Next.js `out/` export, a WordPress URL + WXR export, or a
Next.js/React repo path). That is the only edit you make.

---

```text
I want the website at <SOURCE> in SnabbSajt.

Step 0, before any tool runs: ask me ONE question.
  "Should the site look exactly like it does today?"
Default answer is YES. "Import it", "move it", "same site", "yes" all mean
yes. Only "I want a new design on SnabbSajt blocks" means no. Then route:

  A. <SOURCE> is my own Next.js/React repo and I keep deploying it myself.
     -> Use the `make-site-editable` skill:
          npx @snabbsajt/cli@latest skills install --agent auto
          npx @snabbsajt/cli@latest init --agency
        My code keeps rendering the site. SnabbSajt holds the content and
        the editor. It looks identical because it IS my site.

  B. <SOURCE> is a live URL, a static export (Next.js `out/`), or an HTML zip.
     -> Do NOT build a package. Do NOT run `site import html`.
        Hand me the address and these steps, then stop:
          New account:  onboarding -> "Move your website" (Swedish:
                        "Flytta din hemsida") -> paste the address, or drop
                        the zip.
          Existing account: Settings -> Backup & move (Swedish:
                        Inställningar -> Säkerhetskopia och flytt) -> paste
                        the address, or drop the zip.
        The app captures the rendered page itself. Text, images and links
        stay editable. Measured difference: 0.5 to 1.5 % of pixels. There
        is nothing for you to build; a package cannot do this.

  C. I said, in my own words, "new design on SnabbSajt blocks".
     -> Only now use the package workflow below. Before you start, say this
        sentence in chat, word for word, and repeat it in the final report:
        "This rebuilds the site on SnabbSajt blocks. It will not look like
        the current site."

Package workflow (lane C only):
  npx @snabbsajt/cli@latest skills install --agent auto
Then READ the installed `import-website` skill and follow it exactly. Do not
guess the package format; the skill and the CLI validators are the truth.

Rules (non-negotiable):
- Never execute my source code. Read Next.js/React/HTML/WordPress ONLY as
  content and design evidence: no npm install, no builds, no scripts.
- Never invent facts. Keep my real wording, prices, hours, contact details.
  Anything you cannot find stays a review item. "Don't know" beats guessing.
- No raw HTML, no custom components, no tracking scripts, no iframes. Every
  region becomes a registered SnabbSajt section type; report what you skip.
- Set `provenance.sourceUrl` in `site.json` whenever the source has an
  address, so the app can offer me the exact copy instead.

Steps:
1. Get the source locally (clone/unpack/fetch rendered HTML; respect robots).
2. Convert:
   - Live URL / .html / HTML zip:
       npx @snabbsajt/cli@latest site import html <SOURCE> -o ./import
   - WordPress (needs both):
       npx @snabbsajt/cli@latest site import wordpress --url <SOURCE> --wxr <export.xml> --out ./import
   - Next.js/React repo: build the package by hand per the import-website
     skill into ./import.
3. Show me the import report BEFORE approving: what was carried over,
   merged, skipped (and why), and what needs a human.
4. Approve, validate, pack:
       npx @snabbsajt/cli@latest site import approve ./import --yes
       npx @snabbsajt/cli@latest site validate ./import
       npx @snabbsajt/cli@latest site pack ./import -o site.zip
   Fix every validation error and re-run until it reports 0 errors.
5. Give me site.zip plus an honest report: pages produced, source pages
   merged/skipped, section types used, facts carried vs missing, every
   manual action required before publish, and the lane C sentence.

Import: sign in to SnabbSajt -> Settings -> Backup & move -> import site.zip.
It creates a NEW unpublished draft. It never overwrites or publishes an
existing site. I review it there and publish when I am ready.
```

---

## Which lane

| Your source | You want | Lane | The agent |
| --- | --- | --- | --- |
| Your own Next.js/React repo, you keep deploying it | the same look | `make-site-editable` | wraps your components in `defineBlock`, pushes content; your code still draws the site |
| Live URL, static export, HTML zip | the same look | exact copy in the app | hands you the address and the click path; builds nothing |
| Any of the above | a new design on SnabbSajt blocks | package (`import-website`) | converts, validates, packs, and says out loud that it will not look the same |

Why the split exists: a package of typed sections is a rebuild. It keeps your
words, images and facts, and it throws away your layout, fonts and colours in
favour of SnabbSajt's. The first time an agent shipped that as "your site,
imported", the owner did not recognise his own website. The exact copy in the
app and the agency lane both keep the look because neither one redraws it.

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

- **Hands-free (MCP)**: connect the SnabbSajt MCP server to your agent, grant a
  connection `content:write` + the advanced-editor capability, and the agent
  calls the **`import_site`** tool with the converted `PortableSiteV1` payload.
  It creates a new unpublished draft directly and returns the editor URL. No
  manual step. (Create-mode only for now; nothing is published or overwritten.)
- **Manual upload**: no MCP connection: sign in to SnabbSajt, then Settings,
  then Backup & move, then import the `site.zip` the CLI packed. Same
  server-side validation, same "new draft, nothing published" guarantee.

## Prefer the skill directly?

If you already have the skills installed, you do not need this prompt. Tell
your agent *"use the snabbsajt-getting-started skill; I want `<SOURCE>` in
SnabbSajt"* and it asks the Step 0 question itself. This file is the
zero-setup onboarding version for someone who has never touched Site Kit.

Full contracts: [`skills/make-site-editable/SKILL.md`](skills/make-site-editable/SKILL.md),
[`skills/import-website/SKILL.md`](skills/import-website/SKILL.md) and the
developer docs at <https://snabbsajt.com/docs/en/developer/site-kit>.
