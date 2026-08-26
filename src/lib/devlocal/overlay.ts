// ---------------------------------------------------------------------------
// The local overlay: a small edit panel drawn in the corner of the agency's own
// app while it runs on their machine.
//
// Plan: the app's docs/plans/verifying/P3-2026-08-25-local-overlay-without-the-
// dashboard.md. Same editing as opening our editor and framing their site, and
// none of the apparatus: no login, no dashboard, no certificate, no network.
// A developer runs `next dev`, clicks a heading, types, and the JSON file on
// disk changes.
//
// Framework-free, exactly like `connectVisualEditing` next door. It touches
// `window`, `document` and `fetch`, so it works in Next.js, Astro, SvelteKit or
// a hand-rolled SPA, and a React wrapper is a five-line `useEffect` in the
// agency's own repository. Shipping a component instead would have put React in
// a package that has managed without it.
//
// Three properties this file has to keep:
//
//  1. **It never draws outside a development build.** `mountLocalOverlay`
//     returns an inert handle and touches no DOM. The panel and the route that
//     writes are separately guarded, so neither one leaking is enough.
//  2. **It never renders markup from content.** Every node is `createElement`
//     plus `textContent`. There is no `innerHTML` in this file, so a heading a
//     client typed can never become an element.
//  3. **It reads the SAME declaration as the dock.** The rows come from
//     `overlayRows`, driven by `defineBlock`. A new field kind appears in both
//     places or in neither.
// ---------------------------------------------------------------------------

import type { BlockLibrary } from "../blocks/defineBlock";
import { fieldRefFromEventTarget } from "../visual-editing/connect";
import { isDevelopmentBuild } from "./devOnly";
import { LOCAL_CONTENT_PATH } from "./route";
import { checkFieldValue, overlayRows, type OverlayRow } from "./fields";

export type MountLocalOverlayOptions = {
  /** The library the repository declares. The same import `snabbsajt/blocks.ts`
   *  already exports, so the panel and the push cannot describe different
   *  fields. */
  library: BlockLibrary;
  /** Defaults to the dev-build check. Passed in tests, and there is no reason
   *  for an app to set it: forcing it on is how an edit button reaches a
   *  visitor. */
  enabled?: boolean;
  /** Defaults to `/__snabbsite/content`, where `createLocalContentHandler`
   *  expects to be mounted. */
  endpoint?: string;
  /** Injected in tests. Default the real ones. */
  document?: OverlayDocument;
  storage?: OverlayStorage;
  fetch?: typeof fetch;
};

export type LocalOverlayHandle = {
  /** False in a production build, in which case nothing was drawn. */
  readonly active: boolean;
  /** Open the panel on one section without waiting for a click. */
  select(sectionId: string): void;
  /** Remove every node and listener this created. */
  destroy(): void;
};

const INERT: LocalOverlayHandle = {
  active: false,
  select() {},
  destroy() {},
};

/** The slice of `document` this file uses. Narrow on purpose: it is the list a
 *  test has to fake, and every entry added to it is a test that gets harder to
 *  read than the code it covers. */
export type OverlayElement = {
  textContent: string;
  style: Record<string, string>;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  setAttribute(name: string, value: string): void;
  appendChild(child: OverlayElement): void;
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
  remove(): void;
};

export type OverlayDocument = {
  body: OverlayElement;
  createElement(tag: string): OverlayElement;
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
};

export type OverlayStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** Where the open/closed state is remembered. The panel sits on top of somebody
 *  else's design, so it starts collapsed and stays however the developer left
 *  it — a strip that reopens on every reload is a strip they turn off. */
export const OVERLAY_STATE_KEY = "snabbsite.local-overlay.open";

type SectionState = {
  sectionId: string;
  blockType: string;
  props: Record<string, unknown>;
};

export function mountLocalOverlay(
  options: MountLocalOverlayOptions,
): LocalOverlayHandle {
  const enabled = options.enabled ?? isDevelopmentBuild();
  if (!enabled) return INERT;

  const doc =
    options.document ??
    (typeof document !== "undefined"
      ? (document as unknown as OverlayDocument)
      : undefined);
  if (!doc) return INERT;

  const storage =
    options.storage ??
    (typeof localStorage !== "undefined" ? localStorage : undefined);
  const request = options.fetch ?? (typeof fetch !== "undefined" ? fetch : undefined);
  const endpoint = options.endpoint ?? LOCAL_CONTENT_PATH;

  let open = storage?.getItem(OVERLAY_STATE_KEY) === "1";
  let section: SectionState | undefined;

  const host = doc.createElement("div");
  host.setAttribute("data-snabbsite-overlay", "");
  Object.assign(host.style, {
    position: "fixed",
    insetInlineEnd: "16px",
    insetBlockEnd: "16px",
    zIndex: "2147483000",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "8px",
  });

  const panel = doc.createElement("div");
  Object.assign(panel.style, {
    display: open ? "block" : "none",
    width: "280px",
    maxHeight: "60vh",
    overflowY: "auto",
    padding: "12px",
    borderRadius: "12px",
    background: "#ffffff",
    color: "#111111",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
  });

  const toggle = doc.createElement("button");
  toggle.setAttribute("type", "button");
  toggle.textContent = "Redigera";
  Object.assign(toggle.style, {
    padding: "8px 14px",
    borderRadius: "999px",
    border: "none",
    background: "#111111",
    color: "#ffffff",
    cursor: "pointer",
  });

  const onToggle = (): void => {
    open = !open;
    storage?.setItem(OVERLAY_STATE_KEY, open ? "1" : "0");
    panel.style.display = open ? "block" : "none";
  };
  toggle.addEventListener("click", onToggle);

  host.appendChild(panel);
  host.appendChild(toggle);
  doc.body.appendChild(host);

  const clear = (element: OverlayElement): void => {
    element.textContent = "";
  };

  const line = (text: string, weight = "400"): OverlayElement => {
    const element = doc.createElement("div");
    element.textContent = text;
    Object.assign(element.style, { fontWeight: weight, margin: "0 0 6px" });
    return element;
  };

  const drawEmpty = (message: string): void => {
    clear(panel);
    panel.appendChild(line(message));
  };

  const save = async (key: string, value: unknown, status: OverlayElement) => {
    if (!section || !request) return;
    const field = options.library[section.blockType]?.fields.find(
      (candidate) => candidate.key === key,
    );
    // Checked here as well as on the server, so a locked field or an
    // over-long line says so under the input instead of after a round trip.
    const local = field ? checkFieldValue(field, value) : undefined;
    if (local && !local.ok) {
      status.textContent = local.reason;
      return;
    }
    status.textContent = "Sparar…";
    try {
      const response = await request(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sectionId: section.sectionId, key, value }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        reason?: string;
      };
      if (!response.ok) {
        status.textContent = payload.reason ?? "Kunde inte spara.";
        return;
      }
      section.props = { ...section.props, [key]: value };
      status.textContent = "Sparat";
    } catch {
      // The dev server restarting mid-keystroke is the common case, and it is
      // not an error worth a red box: the next keystroke retries.
      status.textContent = "Ingen kontakt med dev-servern.";
    }
  };

  const drawRow = (row: OverlayRow): OverlayElement => {
    const wrap = doc.createElement("div");
    Object.assign(wrap.style, { margin: "0 0 12px" });
    wrap.appendChild(line(row.locked ? `${row.label} (låst)` : row.label, "600"));

    const status = doc.createElement("div");
    Object.assign(status.style, { color: "#666666", margin: "4px 0 0" });
    status.textContent = "";

    const commit = (value: unknown): void => {
      void save(row.field.key, value, status);
    };

    const input = (tag: string, initial: string): OverlayElement => {
      const element = doc.createElement(tag);
      element.value = initial;
      element.disabled = row.locked;
      Object.assign(element.style, {
        width: "100%",
        boxSizing: "border-box",
        padding: "6px 8px",
        borderRadius: "8px",
        border: "1px solid #cccccc",
      });
      return element;
    };

    switch (row.control) {
      case "toggle": {
        const box = doc.createElement("input");
        box.setAttribute("type", "checkbox");
        box.checked = row.value === true;
        box.disabled = row.locked;
        box.addEventListener("change", () => commit(box.checked === true));
        wrap.appendChild(box);
        break;
      }
      case "choice": {
        const select = doc.createElement("select");
        select.disabled = row.locked;
        for (const option of row.options) {
          const item = doc.createElement("option");
          item.setAttribute("value", option);
          item.textContent = option;
          select.appendChild(item);
        }
        select.value = typeof row.value === "string" ? row.value : "";
        select.addEventListener("change", () => commit(select.value ?? ""));
        wrap.appendChild(select);
        break;
      }
      case "link": {
        const current = (row.value ?? { href: "" }) as {
          href?: string;
          label?: string;
        };
        const href = input("input", current.href ?? "");
        const label = input("input", current.label ?? "");
        href.setAttribute("placeholder", "https://…");
        label.setAttribute("placeholder", "Text på knappen");
        const send = () =>
          commit({ href: href.value ?? "", label: label.value ?? "" });
        href.addEventListener("change", send);
        label.addEventListener("change", send);
        wrap.appendChild(href);
        wrap.appendChild(label);
        break;
      }
      case "image": {
        const current = (row.value ?? { assetId: "" }) as {
          assetId?: string;
          alt?: string;
        };
        const asset = input("input", current.assetId ?? "");
        const alt = input("input", current.alt ?? "");
        asset.setAttribute("placeholder", "assetId");
        alt.setAttribute("placeholder", "Alt-text");
        const send = () =>
          commit({ assetId: asset.value ?? "", alt: alt.value ?? "" });
        asset.addEventListener("change", send);
        alt.addEventListener("change", send);
        wrap.appendChild(asset);
        wrap.appendChild(alt);
        break;
      }
      case "multiline": {
        const area = input("textarea", typeof row.value === "string" ? row.value : "");
        area.setAttribute("rows", "4");
        area.addEventListener("change", () => commit(area.value ?? ""));
        wrap.appendChild(area);
        break;
      }
      default: {
        const box = input("input", typeof row.value === "string" ? row.value : "");
        box.addEventListener("change", () => commit(box.value ?? ""));
        wrap.appendChild(box);
        break;
      }
    }

    wrap.appendChild(status);
    return wrap;
  };

  const draw = (): void => {
    if (!section) {
      drawEmpty("Klicka på en text på sidan för att redigera den.");
      return;
    }
    const definition = options.library[section.blockType];
    if (!definition) {
      drawEmpty(`Blocket "${section.blockType}" finns inte i det här repot.`);
      return;
    }
    clear(panel);
    panel.appendChild(line(definition.label, "600"));
    for (const row of overlayRows(definition, section.props)) {
      panel.appendChild(drawRow(row));
    }
  };

  const load = async (sectionId: string): Promise<void> => {
    if (!request) return;
    try {
      const response = await request(
        `${endpoint}?sectionId=${encodeURIComponent(sectionId)}`,
      );
      if (!response.ok) {
        section = undefined;
        drawEmpty("Den här sektionen finns inte i dina innehållsfiler.");
        return;
      }
      const payload = (await response.json()) as {
        blockType?: string;
        props?: Record<string, unknown>;
      };
      section = {
        sectionId,
        blockType: payload.blockType ?? "",
        props: payload.props ?? {},
      };
      draw();
    } catch {
      drawEmpty("Ingen kontakt med dev-servern.");
    }
  };

  const select = (sectionId: string): void => {
    if (!open) onToggle();
    void load(sectionId);
  };

  // One delegated listener rather than a handler per marked element: the agency
  // re-renders their own tree whenever they like, and per-element listeners
  // would go stale on the first client-side navigation.
  const onClick = (event: unknown): void => {
    const target = (event as { target?: unknown })?.target;
    const ref = fieldRefFromEventTarget(target);
    if (!ref) return;
    select(ref.sectionId);
  };
  doc.addEventListener("click", onClick);

  draw();

  return {
    active: true,
    select,
    destroy() {
      doc.removeEventListener("click", onClick);
      toggle.removeEventListener("click", onToggle);
      host.remove();
    },
  };
}
