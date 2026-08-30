// Browser-safe entry point for the development-only local editor.
// Keep Node imports out. The write handler lives in the separate local-content entry.
export { mountLocalOverlay, OVERLAY_STATE_KEY, sajtButton } from "./inlineOverlay";
export type {
  LocalOverlayHandle,
  MountLocalOverlayOptions,
} from "./inlineOverlay";
export { sajtField } from "../visual-editing/connect";
export { blockLibrary, defineBlock } from "../blocks/defineBlock";
export type {
  BlockDefinition,
  BlockField,
  BlockLibrary,
} from "../blocks/defineBlock";
