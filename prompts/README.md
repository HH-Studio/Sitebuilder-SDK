# prompts/

Copy-paste prompts a developer hands their coding agent. Each prompt is the
portable distillation of a packaged skill in [`skills/`](../skills/): same
contracts, no install step.

| Prompt | Contract |
| --- | --- |
| [`convert-to-snabbsajt.md`](convert-to-snabbsajt.md) | Routes a developer to the lane that keeps their site's look, and converts an existing site (Next.js repo, HTML, URL, WordPress) into a validated `sajt-site@1` package with a `snabbsajt-import-report@1` conversion report only when they asked for a new design. Stops before import; the human reviews and imports the bundle. |

Every prompt carries a version header with a `requires-cli` floor, so a stale
prompt fails loudly at preflight instead of drifting against the validator.

## This directory is GENERATED. Do not edit it by hand.

`convert-to-snabbsajt.md` is a byte-for-byte copy of `CONVERSION_PROMPT_DOC` in
the Snabbsite application repository, at `lib/import/conversionPrompt.ts`. That
file is the single source, because the same text is rendered to customers on
`/for-utvecklare` and has to obey that repository's copy rules. A guard there,
`lib/import/conversionPrompt.test.ts`, fails the suite when this file and that
one differ, so an edit made here alone is caught rather than shipped.

Change the prompt in the application repository first, then regenerate this
copy in the same change:

```bash
bun -e 'import { CONVERSION_PROMPT_DOC } from "./lib/import/conversionPrompt.ts";
import { writeFileSync } from "node:fs";
writeFileSync("Sajtbuilder-SDK/prompts/convert-to-snabbsajt.md", CONVERSION_PROMPT_DOC);'
```

An earlier note here said the canonical copy was this directory. That stopped
being true when the prompt moved into the application repository, and the
sentence is what let this file drift for weeks behind the gate the owner added
on 2026-08-27.
