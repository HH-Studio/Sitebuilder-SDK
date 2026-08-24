/** The prefix captured markup and CSS use to point at one of our assets. */
export const ASSET_PLACEHOLDER = "__sajt-asset:";

/** Asset row ids stored inside captured CSS and native media attributes. */
export function capturedAssetPlaceholderIds(value: string): string[] {
  return Array.from(
    value.matchAll(new RegExp(`${ASSET_PLACEHOLDER}([A-Za-z0-9_-]+)`, "g")),
    (match) => match[1]!,
  );
}
