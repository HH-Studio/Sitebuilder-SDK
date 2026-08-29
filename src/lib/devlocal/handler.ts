// ---------------------------------------------------------------------------
// The route the local overlay talks to: `POST /__snabbsite/content`.
//
// Plan: the app's docs/plans/verifying/P3-2026-08-25-local-overlay-without-the-
// dashboard.md, step 4.
//
// It lives in the AGENCY's own app, not in ours and not in a separate agent.
// That is the whole shape of this plan: their dev server is already running,
// already on their machine, already able to write their files, and already the
// origin the overlay is drawn on. Adding a second process to do the same job
// would need a port, a key and a certificate, and would still only work while
// that process was up.
//
// Three refusals, in order:
//
//  1. **Not a development build**: 404, the same answer a route that does not
//     exist gives, so a production deploy that mounted this by mistake reveals
//     nothing about what it would have done.
//  2. **Not a same-origin request**: 403. The overlay is drawn on the page it
//     writes for, so a cross-origin write is somebody else's page reaching into
//     this developer's repository.
//  3. **Anything `defineBlock` refuses**: 400 with the reason, which the panel
//     prints under the field.
// ---------------------------------------------------------------------------

import type { BlockLibrary } from "../blocks/defineBlock";
import { isDevelopmentBuild } from "./devOnly";
import { LOCAL_CONTENT_PATH } from "./route";
import { applyContentEdit } from "./writeContent";

export { LOCAL_CONTENT_PATH };

export type LocalContentHandlerOptions = {
  /** The same library `snabbsajt push` sends. Import it from your
   *  `snabbsajt/blocks.ts` so one declaration drives both. */
  library: BlockLibrary;
  /** Where the page files live. Defaults to `snabbsajt/content`. */
  dir?: string;
  /** Injected in tests. Defaults to the real dev-build check, and there is no
   *  reason to pass it in an app: forcing it on in production is the one way
   *  this route becomes a hole. */
  enabled?: boolean;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      // Never cached, never shared. An edit is a one-off write.
      "cache-control": "no-store",
    },
  });
}

/** True when the request was made by a page on this same app. A request with
 *  no `origin` header at all is allowed: that is curl, or a same-origin GET,
 *  neither of which is a cross-site write. A MISMATCHED origin is not. */
function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function safeLocalRequest(request: Request): boolean {
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return false;
  }
  if (!isLoopback(requestUrl.hostname)) return false;

  const origin = request.headers.get("origin");
  if (!origin) return request.method === "GET";
  try {
    return new URL(origin).origin === requestUrl.origin;
  } catch {
    return false;
  }
}

/**
 * Build the handler for `app/%5F%5Fsnabbsite/content/route.ts`.
 * Next.js treats a folder beginning with `_` as private, so its escaped
 * filesystem spelling is required to expose `/__snabbsite/content`:
 *
 * ```ts
 * import { createLocalContentHandler } from "@snabbsajt/site-kit/local-content";
 * import { library } from "@/snabbsajt/blocks";
 *
 * const handler = createLocalContentHandler({ library });
 * export const GET = handler;
 * export const POST = handler;
 * ```
 *
 * `GET ?sectionId=…` answers with the block and props behind one section, so
 * the panel can fill its rows. `POST` writes one field.
 */
export function createLocalContentHandler(options: LocalContentHandlerOptions) {
  const enabled = options.enabled ?? isDevelopmentBuild();

  return async function handle(request: Request): Promise<Response> {
    if (!enabled) return new Response(null, { status: 404 });
    if (!safeLocalRequest(request)) return json({ reason: "Wrong origin." }, 403);

    if (request.method === "GET") {
      const sectionId = new URL(request.url).searchParams.get("sectionId") ?? "";
      const found = await findSection(sectionId, options);
      return found
        ? json(found, 200)
        : json({ reason: `No page holds a section called "${sectionId}".` }, 404);
    }

    if (request.method !== "POST") {
      return json({ reason: "Use GET or POST." }, 405);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ reason: "The request body is not JSON." }, 400);
    }
    const edit = body as { sectionId?: unknown; key?: unknown; value?: unknown };

    const result = await applyContentEdit({
      sectionId: typeof edit.sectionId === "string" ? edit.sectionId : "",
      key: typeof edit.key === "string" ? edit.key : "",
      value: edit.value,
      library: options.library,
      dir: options.dir,
    });

    return result.ok ? json(result, 200) : json(result, 400);
  };
}

export type SectionLookup = {
  sectionId: string;
  blockType: string;
  version: number;
  props: Record<string, unknown>;
};

/** What the panel needs to draw one section's rows. The DEFINITION is not sent:
 *  the browser already imports the same `blocks.ts`, and sending a second copy
 *  is how the panel and the file start disagreeing about what a field is. */
async function findSection(
  sectionId: string,
  options: LocalContentHandlerOptions,
): Promise<SectionLookup | undefined> {
  if (!sectionId) return undefined;
  const { readdir, readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const dir = join(options.dir ?? "snabbsajt/content", "pages");
  const names = await readdir(dir).catch(() => [] as string[]);
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    let page: {
      sections?: Array<{
        id?: unknown;
        content?: { blockType?: unknown; version?: unknown; props?: unknown };
      }>;
    };
    try {
      page = JSON.parse(await readFile(join(dir, name), "utf8"));
    } catch {
      continue;
    }
    const section = page.sections?.find((candidate) => candidate?.id === sectionId);
    if (!section) continue;
    const blockType = section.content?.blockType;
    if (typeof blockType !== "string") return undefined;
    return {
      sectionId,
      blockType,
      version:
        typeof section.content?.version === "number" ? section.content.version : 1,
      props:
        typeof section.content?.props === "object" && section.content.props !== null
          ? (section.content.props as Record<string, unknown>)
          : {},
    };
  }
  return undefined;
}
