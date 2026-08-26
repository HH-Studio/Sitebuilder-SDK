// ---------------------------------------------------------------------------
// The write half of the local overlay: one edit, into the developer's own file.
//
// Plan: the app's docs/plans/verifying/P3-2026-08-25-local-overlay-without-the-
// dashboard.md, step 4. The overlay draws inside the agency's own app while it
// runs locally, so the shortest honest path from a click to a file is a route
// handler in that same app. No agent, no port, no certificate, no login, which
// is the whole point of this plan over the editor-in-a-tab one.
//
// What it may touch, and nothing else:
//
//  - `snabbsajt/content/pages/*.json`, the files `snabbsajt pull` writes. The
//    filename is never taken from the request: the section is found by reading
//    the directory, so a crafted id cannot climb out of it.
//  - The `props` of ONE block section. Never a component, never a config file,
//    never the page's slug, order, or id.
//
// And the checks are `defineBlock`'s, applied a second time. The browser half
// already greys out a locked field, but the browser half is the agency's own
// page: a request can arrive without it, from a script on the same machine, so
// the file is defended here rather than in the panel.
// ---------------------------------------------------------------------------

import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BlockLibrary } from "../blocks/defineBlock";
import { checkFieldValue, fieldFor } from "./fields";

/** Where `snabbsajt pull --format portable` puts a page. Relative to the repo
 *  root, which is where a Next.js dev server runs. */
export const DEFAULT_CONTENT_DIR = "snabbsajt/content";

export type ContentEdit = {
  /** The section the click came from, as `sajtField` marked it. */
  sectionId: string;
  /** The declared field key. A path with a dot in it is refused: nothing in
   *  `defineBlock` is nested, so a nested path means the caller is guessing. */
  key: string;
  value: unknown;
};

export type ApplyContentEditOptions = ContentEdit & {
  library: BlockLibrary;
  /** Defaults to `snabbsajt/content`. */
  dir?: string;
};

export type ApplyContentEditResult =
  | { ok: true; file: string; blockType: string }
  | { ok: false; reason: string };

type PageFile = {
  path: string;
  page: {
    sections?: Array<{
      id?: unknown;
      type?: unknown;
      content?: {
        type?: unknown;
        blockType?: unknown;
        props?: Record<string, unknown>;
      };
    }>;
  };
};

/** Read every page in the directory. A directory that has never been pulled has
 *  no pages, which is an empty list rather than a crash. Same choice the
 *  starter template's `loadSite` makes. */
async function readPages(dir: string): Promise<PageFile[]> {
  const pagesDir = join(dir, "pages");
  const names = await readdir(pagesDir).catch(() => [] as string[]);
  const pages: PageFile[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const path = join(pagesDir, name);
    try {
      pages.push({ path, page: JSON.parse(await readFile(path, "utf8")) });
    } catch {
      // A half-written or hand-edited page is skipped rather than fatal: the
      // developer is mid-edit in another window, and refusing every edit on the
      // site because one unrelated page has a stray comma would read as this
      // feature being broken.
      continue;
    }
  }
  return pages;
}

/**
 * Write one field of one block section into the file that holds it.
 *
 * Atomic: the new document is written to a sibling temp file and renamed over
 * the original, so a dev server watching the directory never reads a half-file
 * and a crash mid-write leaves the old page intact.
 */
export async function applyContentEdit(
  options: ApplyContentEditOptions,
): Promise<ApplyContentEditResult> {
  const dir = options.dir ?? DEFAULT_CONTENT_DIR;
  const { sectionId, key, value, library } = options;

  if (typeof sectionId !== "string" || sectionId.length === 0) {
    return { ok: false, reason: "No section was named." };
  }
  if (typeof key !== "string" || !/^[a-z][a-z0-9_-]*$/.test(key)) {
    return { ok: false, reason: `"${key}" is not a field key.` };
  }

  for (const file of await readPages(dir)) {
    const section = file.page.sections?.find(
      (candidate) => candidate?.id === sectionId,
    );
    if (!section) continue;

    const content = section.content;
    if (section.type !== "block" || content?.type !== "block") {
      return {
        ok: false,
        reason: `Section "${sectionId}" is not one of your blocks.`,
      };
    }
    const blockType = content.blockType;
    if (typeof blockType !== "string") {
      return { ok: false, reason: `Section "${sectionId}" names no block.` };
    }
    const definition = library[blockType];
    if (!definition) {
      return {
        ok: false,
        reason: `No block called "${blockType}" is declared in this repository.`,
      };
    }
    const field = fieldFor(definition, key);
    if (!field) {
      return { ok: false, reason: `Block "${blockType}" declares no "${key}".` };
    }

    const checked = checkFieldValue(field, value);
    if (!checked.ok) return { ok: false, reason: checked.reason };

    content.props = { ...(content.props ?? {}), [key]: checked.value };

    const temp = `${file.path}.${process.pid}.tmp`;
    // Two spaces and a trailing newline: the shape `snabbsajt pull` writes, so
    // an overlay edit reads as one changed line in `git diff` rather than a
    // reformat of the whole page.
    await writeFile(temp, `${JSON.stringify(file.page, null, 2)}\n`, "utf8");
    await rename(temp, file.path);
    return { ok: true, file: file.path, blockType };
  }

  return { ok: false, reason: `No page holds a section called "${sectionId}".` };
}
