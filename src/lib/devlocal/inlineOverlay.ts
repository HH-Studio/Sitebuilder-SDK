import type { BlockField, BlockLibrary } from "../blocks/defineBlock";
import { fieldRefFromEventTarget } from "../visual-editing/connect";
import { isDevelopmentBuild } from "./devOnly";
import { checkFieldValue, type ImageValue } from "./fields";
import { LOCAL_CONTENT_PATH } from "./route";

export type MountLocalOverlayOptions = {
  library: BlockLibrary;
  enabled?: boolean;
  endpoint?: string;
  document?: Document;
  fetch?: typeof fetch;
};

export type LocalOverlayHandle = {
  readonly active: boolean;
  select(sectionId: string, fieldKey?: string): void;
  destroy(): void;
};

/** Marks the extra fields that make a selected variant field a full button editor. */
export function sajtButton(fields: { label: string; link: string; visible: string }): {
  "data-sajt-button-label": string;
  "data-sajt-button-link": string;
  "data-sajt-button-visible": string;
} {
  return {
    "data-sajt-button-label": fields.label,
    "data-sajt-button-link": fields.link,
    "data-sajt-button-visible": fields.visible,
  };
}

const INERT: LocalOverlayHandle = {
  active: false,
  select() {},
  destroy() {},
};

/** Kept for package compatibility. Inline editing has no stored open state. */
export const OVERLAY_STATE_KEY = "snabbsite.local-overlay.open";

const MAX_LOCAL_IMAGE_BYTES = 1_500_000;
const SAFE_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type SectionState = {
  sectionId: string;
  blockType: string;
  props: Record<string, unknown>;
};

type SaveResult = { ok: true } | { ok: false; reason: string };

export function mountLocalOverlay(
  options: MountLocalOverlayOptions,
): LocalOverlayHandle {
  const enabled = isDevelopmentBuild() && options.enabled !== false;
  if (!enabled) return INERT;

  const doc = options.document ?? (typeof document !== "undefined" ? document : undefined);
  const request = options.fetch ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!doc || !request) return INERT;

  const endpoint = options.endpoint ?? LOCAL_CONTENT_PATH;
  let toolbar: HTMLDivElement | undefined;
  let status: HTMLDivElement | undefined;
  let activeTextEdit: HTMLElement | undefined;
  let cancelActiveTextEdit: (() => void) | undefined;
  let loadSequence = 0;
  let saveQueue: Promise<void> = Promise.resolve();

  const removeToolbar = (): void => {
    toolbar?.remove();
    toolbar = undefined;
  };

  const showStatus = (target: Element, text: string, failed = false): void => {
    status?.remove();
    const badge = doc.createElement("div");
    badge.setAttribute("data-snabbsite-status", "");
    badge.setAttribute("role", "status");
    badge.setAttribute("aria-live", failed ? "assertive" : "polite");
    badge.textContent = text;
    const rect = target.getBoundingClientRect();
    Object.assign(badge.style, {
      position: "fixed",
      insetInlineStart: `${Math.max(8, rect.left)}px`,
      insetBlockStart: `${Math.max(8, rect.bottom + 6)}px`,
      zIndex: "2147483000",
      padding: "5px 8px",
      borderRadius: "999px",
      background: failed ? "#8f1d1d" : "#18221c",
      color: "#ffffff",
      font: "600 12px/1.2 system-ui, sans-serif",
      boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
      pointerEvents: "none",
    });
    doc.body.appendChild(badge);
    status = badge;
    if (!failed) globalThis.setTimeout(() => badge.remove(), 900);
  };

  const load = async (sectionId: string): Promise<SectionState | undefined> => {
    const sequence = ++loadSequence;
    try {
      const response = await request(
        `${endpoint}?sectionId=${encodeURIComponent(sectionId)}`,
      );
      if (!response.ok || sequence !== loadSequence) return undefined;
      const payload = (await response.json()) as {
        blockType?: string;
        props?: Record<string, unknown>;
      };
      return {
        sectionId,
        blockType: payload.blockType ?? "",
        props: payload.props ?? {},
      };
    } catch {
      return undefined;
    }
  };

  const save = async (
    section: SectionState,
    field: BlockField,
    value: unknown,
  ): Promise<SaveResult> => {
    const checked = checkFieldValue(field, value);
    if (!checked.ok) return { ok: false, reason: checked.reason };

    const result = saveQueue.then(async (): Promise<SaveResult> => {
      try {
        const response = await request(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sectionId: section.sectionId,
            key: field.key,
            value: checked.value,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          reason?: string;
        };
        if (!response.ok) {
          return { ok: false, reason: payload.reason ?? "Could not save." };
        }
        section.props = { ...section.props, [field.key]: checked.value };
        return { ok: true };
      } catch {
        return { ok: false, reason: "No answer from the dev server." };
      }
    });
    saveQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const beginTextEdit = (
    target: HTMLElement,
    section: SectionState,
    field: BlockField,
  ): void => {
    if (activeTextEdit === target) return;
    activeTextEdit?.blur();
    activeTextEdit = target;
    removeToolbar();
    const before = target.innerText;
    let cancelled = false;
    target.setAttribute("contenteditable", "plaintext-only");
    target.setAttribute("role", "textbox");
    target.setAttribute("aria-label", field.label?.trim() || field.key);
    target.style.outline = "2px solid #1677ff";
    target.style.outlineOffset = "5px";
    target.focus();

    const cleanUp = (): void => {
      target.removeEventListener("blur", onBlur);
      target.removeEventListener("keydown", onKeyDown);
      target.removeAttribute("contenteditable");
      target.removeAttribute("role");
      target.removeAttribute("aria-label");
      target.style.outline = "";
      target.style.outlineOffset = "";
      if (activeTextEdit === target) activeTextEdit = undefined;
      if (cancelActiveTextEdit === cancel) cancelActiveTextEdit = undefined;
    };
    const cancel = (): void => {
      cancelled = true;
      cleanUp();
      target.innerText = before;
    };
    cancelActiveTextEdit = cancel;

    const finish = async (): Promise<void> => {
      cleanUp();
      if (cancelled) {
        target.innerText = before;
        return;
      }
      const next = target.innerText;
      if (next === before) return;
      showStatus(target, "Saving");
      const result = await save(section, field, next);
      if (!result.ok) {
        target.innerText = before;
        showStatus(target, result.reason, true);
      } else {
        showStatus(target, "Saved");
      }
    };

    const onBlur = (): void => {
      void finish();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelled = true;
        target.blur();
      }
    };
    target.addEventListener("blur", onBlur);
    target.addEventListener("keydown", onKeyDown);
  };

  const positionToolbar = (target: Element, node: HTMLDivElement): void => {
    const rect = target.getBoundingClientRect();
    Object.assign(node.style, {
      position: "fixed",
      insetInlineStart: `${doc.documentElement.clientWidth < 600 ? 8 : Math.max(8, Math.min(rect.left, doc.documentElement.clientWidth - 220))}px`,
      insetBlockStart: `${Math.max(8, rect.bottom + 8)}px`,
      zIndex: "2147483000",
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "6px",
      padding: "6px",
      border: "1px solid rgba(0,0,0,0.16)",
      borderRadius: "10px",
      background: "#ffffff",
      color: "#111111",
      boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
      font: "600 12px/1.2 system-ui, sans-serif",
      maxWidth: "calc(100vw - 16px)",
      boxSizing: "border-box",
    });
  };

  const showChoice = (
    target: Element,
    section: SectionState,
    field: BlockField,
  ): void => {
    removeToolbar();
    const node = doc.createElement("div");
    node.setAttribute("data-snabbsite-toolbar", "");
    positionToolbar(target, node);
    const label = doc.createElement("span");
    label.textContent = field.label?.trim() || "Variant";
    const select = doc.createElement("select");
    Object.assign(select.style, {
      padding: "6px 8px",
      border: "1px solid #cccccc",
      borderRadius: "7px",
      background: "#ffffff",
    });
    for (const option of field.options ?? []) {
      const item = doc.createElement("option");
      item.value = option;
      item.textContent = option;
      select.appendChild(item);
    }
    select.value = typeof section.props[field.key] === "string"
      ? String(section.props[field.key])
      : "";
    select.addEventListener("change", async () => {
      const previous = String(section.props[field.key] ?? "");
      showStatus(target, "Saving");
      const result = await save(section, field, select.value);
      if (!result.ok) {
        select.value = previous;
        showStatus(target, result.reason, true);
      } else {
        showStatus(target, "Saved");
      }
    });
    node.append(label, select);

    const labelKey = target.getAttribute("data-sajt-button-label");
    const linkKey = target.getAttribute("data-sajt-button-link");
    const visibleKey = target.getAttribute("data-sajt-button-visible");
    const definition = options.library[section.blockType];
    const labelField = definition?.fields.find((item) => item.key === labelKey);
    const linkField = definition?.fields.find((item) => item.key === linkKey);
    const visibleField = definition?.fields.find((item) => item.key === visibleKey);
    if (
      labelField?.kind === "text" &&
      linkField?.kind === "link" &&
      visibleField?.kind === "boolean"
    ) {
      const buttonText = doc.createElement("input");
      buttonText.type = "text";
      buttonText.setAttribute("aria-label", "Button text");
      buttonText.value = String(section.props[labelField.key] ?? "");
      Object.assign(buttonText.style, {
        width: "130px",
        padding: "6px 8px",
        border: "1px solid #cccccc",
        borderRadius: "7px",
      });
      buttonText.addEventListener("change", async () => {
        const previous = String(section.props[labelField.key] ?? "");
        const result = await save(section, labelField, buttonText.value);
        if (!result.ok) {
          buttonText.value = previous;
          showStatus(target, result.reason, true);
        } else {
          showStatus(target, "Saved");
        }
      });
      const link = doc.createElement("input");
      link.type = "text";
      link.setAttribute("aria-label", "Button link");
      link.placeholder = "/contact";
      const currentLink = section.props[linkField.key] as { href?: unknown } | undefined;
      link.value = typeof currentLink?.href === "string" ? currentLink.href : "";
      Object.assign(link.style, {
        width: "150px",
        padding: "6px 8px",
        border: "1px solid #cccccc",
        borderRadius: "7px",
      });
      link.addEventListener("change", async () => {
        const previous = typeof currentLink?.href === "string" ? currentLink.href : "";
        const result = await save(section, linkField, { href: link.value });
        if (!result.ok) {
          link.value = previous;
          showStatus(target, result.reason, true);
        } else {
          if (target instanceof HTMLAnchorElement) target.href = link.value;
          showStatus(target, "Saved");
        }
      });

      const toggle = doc.createElement("button");
      toggle.type = "button";
      let visible = section.props[visibleField.key] !== false;
      toggle.textContent = visible ? "Remove" : "Add";
      Object.assign(toggle.style, {
        padding: "7px 9px",
        border: "1px solid #cccccc",
        borderRadius: "7px",
        background: "#ffffff",
        color: visible ? "#8f1d1d" : "#18221c",
        cursor: "pointer",
      });
      toggle.addEventListener("click", async () => {
        const previous = visible;
        const next = !previous;
        visible = next;
        toggle.textContent = visible ? "Remove" : "Add";
        toggle.style.color = visible ? "#8f1d1d" : "#18221c";
        const result = await save(section, visibleField, next);
        if (!result.ok) {
          if (visible === next) {
            visible = previous;
            toggle.textContent = visible ? "Remove" : "Add";
            toggle.style.color = visible ? "#8f1d1d" : "#18221c";
          }
          showStatus(target, result.reason, true);
        } else {
          showStatus(target, next ? "Button added" : "Button removed");
        }
      });
      node.append(buttonText, link, toggle);
    }
    doc.body.appendChild(node);
    toolbar = node;
    select.focus();
  };

  const showImagePicker = (
    target: HTMLImageElement,
    section: SectionState,
    field: BlockField,
  ): void => {
    removeToolbar();
    const node = doc.createElement("div");
    node.setAttribute("data-snabbsite-toolbar", "");
    positionToolbar(target, node);
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = "Replace image";
    Object.assign(button.style, {
      padding: "7px 10px",
      border: "0",
      borderRadius: "7px",
      background: "#18221c",
      color: "#ffffff",
      cursor: "pointer",
    });
    const input = doc.createElement("input");
    input.type = "file";
    input.accept = "image/avif,image/gif,image/jpeg,image/png,image/webp";
    input.hidden = true;
    button.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!SAFE_IMAGE_TYPES.has(file.type)) {
        showStatus(target, "Use PNG, JPG, WebP, GIF or AVIF", true);
        return;
      }
      if (file.size > MAX_LOCAL_IMAGE_BYTES) {
        showStatus(target, "Image must be under 1.5 MB", true);
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", async () => {
        if (typeof reader.result !== "string") return;
        const before = target.src;
        const current = section.props[field.key] as ImageValue | undefined;
        target.src = reader.result;
        showStatus(target, "Saving");
        const result = await save(section, field, {
          assetId: reader.result,
          ...(current?.alt ? { alt: current.alt } : {}),
        });
        if (!result.ok) {
          target.src = before;
          showStatus(target, result.reason, true);
        } else {
          showStatus(target, "Saved");
        }
      });
      reader.readAsDataURL(file);
    });
    node.append(button, input);
    doc.body.appendChild(node);
    toolbar = node;
  };

  const activate = async (target: HTMLElement, sectionId: string, fieldKey: string) => {
    const section = await load(sectionId);
    const definition = section ? options.library[section.blockType] : undefined;
    const field = definition?.fields.find((candidate) => candidate.key === fieldKey);
    if (!section || !field || field.locked) return;
    if (field.kind === "text" || field.kind === "richtext") {
      beginTextEdit(target, section, field);
    } else if (field.kind === "select" || field.kind === "icon") {
      showChoice(target, section, field);
    } else if (field.kind === "image" && target instanceof HTMLImageElement) {
      showImagePicker(target, section, field);
    }
  };

  const onClick = (event: MouseEvent): void => {
    const rawTarget = event.target;
    if (!(rawTarget instanceof Element)) return;
    if (rawTarget.closest("[data-snabbsite-toolbar]")) return;
    if (
      rawTarget.closest(
        "[data-sajt-section][data-sajt-field][contenteditable]",
      )
    ) {
      return;
    }
    const ref = fieldRefFromEventTarget(rawTarget);
    if (!ref) {
      removeToolbar();
      return;
    }
    const marked = rawTarget.closest<HTMLElement>(
      "[data-sajt-section][data-sajt-field]",
    );
    if (!marked) return;
    event.preventDefault();
    event.stopPropagation();
    void activate(marked, ref.sectionId, ref.path);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && toolbar) {
      event.preventDefault();
      removeToolbar();
    }
  };

  doc.addEventListener("click", onClick);
  doc.addEventListener("keydown", onKeyDown);

  return {
    active: true,
    select(sectionId, fieldKey) {
      if (!fieldKey) return;
      const target = doc.querySelector<HTMLElement>(
        `[data-sajt-section="${CSS.escape(sectionId)}"][data-sajt-field="${CSS.escape(fieldKey)}"]`,
      );
      if (target) void activate(target, sectionId, fieldKey);
    },
    destroy() {
      doc.removeEventListener("click", onClick);
      doc.removeEventListener("keydown", onKeyDown);
      cancelActiveTextEdit?.();
      removeToolbar();
      status?.remove();
    },
  };
}
