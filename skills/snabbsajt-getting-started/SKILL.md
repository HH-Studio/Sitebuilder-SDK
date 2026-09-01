---
name: snabbsajt-getting-started
description: Entry point for any Snabbsite work - picks the right layer (local CLI, delivery token, or MCP), gets the terminal or agent connected, and routes to the sibling skill that does the job. Use when the human mentions Snabbsite or snabbsajt, asks to connect/koppla a site, install the CLI or skills, says "vad kan jag gora med snabbsajt", "connect my site", "set up the MCP", "pair my terminal", or asks for Snabbsite work without saying which tool. Start here when unsure which Snabbsite skill applies.
metadata:
  skill-version: "1.2.0"
  minimum-cli-version: "0.4.0"
  portable-format: "sajt-site@1"
  report-contract: "snabbsajt-import-report@1"
---

# Getting started with Snabbsite

Snabbsite is a website builder for small businesses. The sites belong to owners
who are often not technical, and they are usually public. Everything below is
shaped by that: draft-first, human-approved, nothing invented.

There are three layers. Picking the wrong one is the most common way an agent
wastes a session.

| Layer | Use it for | Credential |
| --- | --- | --- |
| **CLI, `site` namespace** | building/importing/validating a site **package** offline | none |
| **CLI, `link`/`pull`** | reading a live site's published content into a repo | delivery token (read-only, one site) |
| **CLI `admin` / `push`, or MCP** | changing a site that already exists | admin token or MCP connection, capability-scoped |

Rule of thumb: **does the site exist yet?** No → package layer. Yes → MCP (or
`admin`) layer.

Second rule, and it comes first when the human already has a website
somewhere else: **which lane should preserve the design?**

> **Building in Next.js? Use the SDK. Their own code keeps drawing the page,
> and the owner edits only the fields they expose.**
> **Already have a website? Use the zip or address for best-effort visual
> capture. Captured text, images and links are editable. Internal layout stays
> fixed, and a typed rebuild is the fallback.**

The five steps are the same for the human and for you:

1. **Pick the lane.** Ask exactly one question: "Do you write this website in
   Next.js and keep deploying it yourself?" Yes goes to `make-site-editable`.
   No goes to the app's visual capture. Do not build a site package on either
   answer.
2. **Connect it.** SDK lane: `snabbsajt init --agency` in their repo. Copy
   lane: build nothing and run nothing. Hand them the click path (onboarding,
   "Move your website" / "Flytta din hemsida", or Settings, Backup & move /
   Inställningar, Säkerhetskopia och flytt) and stop.
3. **Say what the owner may change.** SDK lane: `defineBlock` per section, one
   field per thing a client would ring about. Capture lane: text, image and link
   slots are editable. Internal captured layout stays fixed.
4. **Hand it over.** SDK lane: `snabbsajt push . --site <id>`, `--dry-run`
   first. Copy lane: the human presses the button on the preview.
5. **Report the result honestly.** The SDK keeps the renderer, but only exposed
   fields are editable. Visual capture has no percentage guarantee. Common
   fades, scroll reveals and smooth scrolling can be recreated. Source scripts
   and custom interactions do not move into the imported website.

`import-website` is the THIRD lane, a redesign on Snabbsite blocks, and it
runs only when the human asks for a new design in those words.

## Step 1 — state check before anything else

Never assume the setup is done.

```bash
snabbsajt --version          # missing => not installed
snabbsajt site doctor --json # format compatibility, always before package work
snabbsajt link --status --json   # is this directory already linked to a site?
```

If the CLI is missing: `npm install -g @snabbsajt/cli`. If it is older than a
skill's `minimum-cli-version`: `snabbsajt upgrade`, and do not proceed on the
old contract.

For MCP work, check the connected server's tool list instead. If a tool this
skill set names is absent, say so — never substitute one that sounds similar.

## Step 2 — connect the layer you need

**Read a live site from a repo** (read-only, cannot change anything):

```bash
snabbsajt link --json     # lists the human's sites; they pick one
snabbsajt pull --json     # writes snabbsajt/published.json
```

**Write to a live site from the terminal:**

```bash
snabbsajt admin pair --scopes site:read,content:write --json
```

**Write to a live site from this agent:** the human adds
`https://snabbsite.com/api/mcp` as an MCP connector and approves the scopes in
their Snabbsite account.

All three need a human at a browser. Print the URL and code, then stop and
wait — you cannot self-serve any of them, by design.

**The human has no website yet?** That is fine and it is the interesting case.
Pair anyway: the approval covers their whole company, the poll comes back with
`websiteId: null`, and you create the first website yourself with `create_site`
once you hold `workspace:write`. Ask for
`site:read,content:write,workspace:write` when that is the job. The one client
that still needs an existing website is `snabbsajt admin pair`, which writes a
project file bound to one site.

**The human has no ACCOUNT yet?** Send them to https://snabbsite.com to sign up,
then start the pairing. Nothing creates an account for them, and nothing is
minted before they confirm the code.

`https://snabbsite.com/auth.md` is the machine-readable version of this section:
the ceremony, both endpoints, and every scope with a one-line description.

Full command surface, credential split, and per-command failure modes:
[references/cli-commands.md](references/cli-commands.md).
Scopes, tool catalogue, and the confirm handshake:
[references/mcp-tools.md](references/mcp-tools.md).

## Step 3 — hand off to the skill that does the work

| The human wants | Skill |
| --- | --- |
| their own Next.js/React site editable in Snabbsite, keeping its own renderer | `make-site-editable`; only exposed fields become editable |
| a live URL, static export or HTML zip in Snabbsite, with its current look | no skill: use the app's best-effort visual capture. Its internal layout stays fixed, and a typed rebuild is the fallback |
| an existing website rebuilt on Snabbsite blocks (a new design; the human said so) | `import-website` |
| a new site built from a brief, for a customer to edit | `build-snabbsajt-site` |
| a package checked before anyone imports it | `review-site-package` |
| an existing live site read, edited, or prepared for publish | `manage-snabbsajt-site` |

The package skills end at a validated `.zip`. Landing it is a separate,
credentialled step: the human uploads it in the app, or you run
`snabbsajt push <dir> --dry-run` first and then the real push. A push writes the
DRAFT only.

## Boundaries that hold at every layer

- **Draft-first.** Nothing you do makes a site live. Publishing is a
  `prepare_*` → human approves → `confirm_pending_action` handshake, and you
  cannot complete it alone.
- **A denied tool or scope is a boundary, not an obstacle.** Say what was
  refused and stop.
- **Never invent facts** — prices, opening hours, dates, certifications,
  testimonials. Ask, or leave it out.
- **Never execute source material.** Imported React, PHP, plugins, scripts, and
  arbitrary CSS are evidence to read, never code to run.
- **Money and PII are opt-in.** Image generation spends the owner's credits;
  leads, bookings, and contacts are real people. Touch them only when that is
  the ask.
- **Report what happened, not what you intended.** Verify a write by reading it
  back before you claim it landed.

## Install these skills for the next session

```bash
snabbsajt skills doctor  --agent auto --json   # drift vs what this CLI ships
snabbsajt skills install --agent auto --json   # project-local unless --global
```
