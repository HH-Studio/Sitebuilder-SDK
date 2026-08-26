// The node half of local editing, on its own entry point: `@snabbsajt/site-kit/
// local-content`. Kept out of the package's main export because it imports
// `node:fs`, and the main export is loaded in browsers.
export { createLocalContentHandler } from "./handler";
export type { LocalContentHandlerOptions, SectionLookup } from "./handler";
export { applyContentEdit, DEFAULT_CONTENT_DIR } from "./writeContent";
export type {
  ApplyContentEditOptions,
  ApplyContentEditResult,
  ContentEdit,
} from "./writeContent";
export { LOCAL_CONTENT_PATH } from "./route";
