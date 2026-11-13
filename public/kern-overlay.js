/*
 * kerncms overlay. Loaded only inside the editor preview (KERN_PREVIEW=1).
 * Finds data-kern-block / data-kern-field markers, highlights them, lets editors
 * click to select a block or field (edited in the editor's sidebar), and talks to the
 * editor via postMessage.
 *
 * To the editor (source "kern-preview"): ready, select, edit, commit, pickImage, navigate, global, shortcut.
 * From the editor (source "kern-editor"): schema, select, patch.
 */
(() => {
  if (window.__kernOverlay || window.parent === window) return;
  window.__kernOverlay = true;

  const ACCENT = "#2f5bea";
  /** Types the editor can show in its panel; anything else (lists, list items) is a container. */
  const LEAF = new Set(["text", "email", "textarea", "inline", "richtext", "number", "boolean", "select", "date", "image", "link", "tags"]);
  /** Edited right here in the page (only while INLINE_EDITING is on). */
  const INLINE = new Set(["text", "textarea", "inline"]);
  /**
   * Inline editing (typing straight into the page) is switched off: clicks only select,
   * and fields are edited in the sidebar. The code below is kept so it can come back.
   */
  const INLINE_EDITING = false;

  let fieldTypes = {}; // "hero" -> { "headline": "inline", "tiles": "list", "tiles.*.title": "text" }
  let blockLabels = {};
  let selectedId = null;
  let editing = null; // { el, blockId, field, kind, before }

  /* The editor's origin: from the referrer (the page embedding us), else where this script came from. */
  let parentOrigin = "*";
  try {
    if (document.referrer) parentOrigin = new URL(document.referrer).origin;
    else if (document.currentScript && document.currentScript.src) parentOrigin = new URL(document.currentScript.src).origin;
  } catch {}

  function send(type, data) {
    window.parent.postMessage({ source: "kern-preview", type, ...data }, parentOrigin);
  }

  /* ---------- Styles ---------- */
  const style = document.createElement("style");
  style.textContent = `
    [data-kern-block] { position: relative; }
    .kern-hover-block { outline: 2px dashed ${ACCENT}66 !important; outline-offset: -2px; }
    .kern-selected-block { outline: 2px solid ${ACCENT} !important; outline-offset: -2px; }
    .kern-hover-field { outline: 2px solid ${ACCENT}aa !important; outline-offset: 3px; border-radius: 3px; cursor: pointer; }
    /* .kern-hover-field.kern-kind-inline { cursor: text; }  (inline editing) */
    .kern-selected-field { outline: 2px solid ${ACCENT} !important; outline-offset: 3px; border-radius: 3px; box-shadow: 0 0 0 6px ${ACCENT}22; }
    .kern-hover-global { outline: 2px dashed #9b9b9b !important; outline-offset: 3px; border-radius: 3px; cursor: help; }
    [data-kern-field][contenteditable] { outline: 2px solid ${ACCENT} !important; outline-offset: 3px; border-radius: 3px; cursor: text; caret-color: ${ACCENT}; }
    #kern-chip { position: fixed; z-index: 2147483647; pointer-events: none; font: 600 12px/1 system-ui, sans-serif; color: #fff;
      background: ${ACCENT}; padding: 5px 8px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,.15); display: none; white-space: nowrap; }
    #kern-chip.kern-chip-global { background: #555; }
    /* Dev tools of the site's dev server (Astro's toolbar) would cover the page while editing. */
    astro-dev-toolbar { display: none !important; }
  `;
  (document.head || document.documentElement).appendChild(style);
  const chip = document.createElement("div");
  chip.id = "kern-chip";
  document.documentElement.appendChild(chip);

  /* ---------- Helpers ---------- */
  const closest = (el, selector) => (el && el.closest ? el.closest(selector) : null);
  const blockOf = (el) => closest(el, "[data-kern-block]");

  function typeOf(blockEl, fieldPath) {
    if (!blockEl || !fieldPath) return null;
    const types = fieldTypes[blockEl.getAttribute("data-kern-type")] || {};
    return types[fieldPath.replace(/\.\d+(?=\.|$)/g, ".*")] || null;
  }

  /** "tiles.0" is an item of the list "tiles". */
  function isListItem(blockEl, path) {
    const m = /^(.*)\.\d+$/.exec(path);
    return Boolean(m) && typeOf(blockEl, m[1]) === "list";
  }

  /**
   * The innermost field marker under `target` that the editor can edit. A list item
   * (`tiles.0`) counts too, so clicking anywhere on a tile selects that tile; list
   * wrappers (`tiles`) are skipped.
   */
  function fieldOf(target, blockEl) {
    let el = closest(target, "[data-kern-field]");
    while (el && blockEl && blockEl.contains(el)) {
      const path = el.getAttribute("data-kern-field");
      const kind = typeOf(blockEl, path);
      if (kind && LEAF.has(kind)) return { el, path, kind };
      if (isListItem(blockEl, path)) return { el, path, kind: "item" };
      el = closest(el.parentElement, "[data-kern-field]");
    }
    return null;
  }

  function placeChip(el, text, global) {
    const rect = el.getBoundingClientRect();
    chip.textContent = text;
    chip.className = global ? "kern-chip-global" : "";
    chip.style.display = "block";
    chip.style.left = Math.max(4, rect.left) + "px";
    chip.style.top = Math.max(4, rect.top - 26) + "px";
  }

  function clearHover() {
    document
      .querySelectorAll(".kern-hover-block,.kern-hover-field,.kern-hover-global")
      .forEach((n) => n.classList.remove("kern-hover-block", "kern-hover-field", "kern-hover-global", "kern-kind-inline"));
    chip.style.display = "none";
  }

  const blockById = (id) => (id ? document.querySelector(`[data-kern-block="${CSS.escape(id)}"]`) : null);

  let pendingScroll = null;

  let selectedField = null;

  /** Outlines the selected field (e.g. the button whose text is open in the sidebar). */
  function markField(blockEl, path) {
    document.querySelectorAll(".kern-selected-field").forEach((n) => n.classList.remove("kern-selected-field"));
    selectedField = path || null;
    if (!blockEl || !selectedField) return;
    const el = blockEl.querySelector(`[data-kern-field="${CSS.escape(selectedField)}"]`);
    if (el) el.classList.add("kern-selected-field");
  }

  function markSelected(id, scroll, field) {
    document.querySelectorAll(".kern-selected-block").forEach((n) => n.classList.remove("kern-selected-block"));
    selectedId = id || null;
    const el = blockById(selectedId);
    if (!el) {
      // The block may not be rendered yet (just added): scroll once it shows up.
      pendingScroll = scroll ? selectedId : null;
      return;
    }
    pendingScroll = null;
    el.classList.add("kern-selected-block");
    markField(el, field);
    if (scroll) {
      const rect = el.getBoundingClientRect();
      if (rect.top < 0 || rect.top > innerHeight * 0.6) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // Astro may swap parts of the DOM without a full reload: keep the selection outline.
  new MutationObserver(() => {
    if (pendingScroll && blockById(pendingScroll)) {
      markSelected(pendingScroll, true);
      return;
    }
    if (!selectedId) return;
    const el = blockById(selectedId);
    if (el && !el.classList.contains("kern-selected-block")) el.classList.add("kern-selected-block");
    if (el && selectedField && !el.querySelector(".kern-selected-field")) markField(el, selectedField);
  }).observe(document.documentElement, { childList: true, subtree: true });

  /* ---------- Hover ---------- */
  document.addEventListener("mouseover", (e) => {
    if (editing) return;
    clearHover();
    const block = blockOf(e.target);
    if (block) {
      block.classList.add("kern-hover-block");
      const field = fieldOf(e.target, block);
      if (field) {
        field.el.classList.add("kern-hover-field");
        if (INLINE_EDITING && INLINE.has(field.kind)) field.el.classList.add("kern-kind-inline");
      }
      placeChip(block, blockLabels[block.getAttribute("data-kern-type")] || block.getAttribute("data-kern-type"));
      return;
    }
    const global = closest(e.target, "[data-kern-global]");
    if (global) {
      global.classList.add("kern-hover-global");
      placeChip(global, "Globaler Inhalt", true);
    }
  });
  document.addEventListener("mouseleave", clearHover);
  addEventListener("scroll", () => (chip.style.display = "none"), { passive: true });

  /* ---------- Inline editing ---------- */
  function readValue(el, kind) {
    return kind === "inline" ? el.innerHTML : el.innerText;
  }

  function stopEditing() {
    if (!editing) return;
    const { el, blockId, field, kind } = editing;
    editing = null;
    el.removeAttribute("contenteditable");
    el.removeAttribute("spellcheck");
    send("commit", { blockId, field, value: readValue(el, kind) });
  }

  function startEditing(el, blockEl, field, kind) {
    if (editing && editing.el === el) return;
    stopEditing();
    editing = { el, blockId: blockEl.getAttribute("data-kern-block"), field, kind };
    el.setAttribute("contenteditable", kind === "inline" ? "true" : "plaintext-only");
    el.setAttribute("spellcheck", "true");
    el.focus();
    clearHover();
  }

  document.addEventListener(
    "input",
    (e) => {
      if (!editing || !editing.el.contains(e.target)) return;
      const { el, blockId, field, kind } = editing;
      send("edit", { blockId, field, value: readValue(el, kind) });
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = (e.key || "").toLowerCase();
      if (mod && !e.altKey && key === "s") {
        // Save: commit what is being typed first, then let the editor save.
        e.preventDefault();
        if (editing) editing.el.blur();
        send("shortcut", { key: "s", shift: e.shiftKey });
        return;
      }
      if (!editing) {
        if (mod && !e.altKey && (key === "z" || key === "y")) {
          e.preventDefault();
          send("shortcut", { key, shift: e.shiftKey });
        }
        return;
      }
      // While typing, ⌘Z is the browser's own text undo.
      if (e.key === "Escape" || (e.key === "Enter" && editing.kind === "text") || (e.key === "Enter" && editing.kind === "inline" && !e.shiftKey)) {
        e.preventDefault();
        editing.el.blur();
        return;
      }
      // A space inside <summary> or <button> would toggle/click it instead of typing.
      if (e.key === " " && closest(editing.el, "summary, button")) {
        e.preventDefault();
        document.execCommand("insertText", false, " ");
      }
    },
    true,
  );

  document.addEventListener("focusout", (e) => {
    if (editing && e.target === editing.el) stopEditing();
  });

  // Paste plain text only, so no foreign markup ends up in the content.
  document.addEventListener("paste", (e) => {
    if (!editing) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, editing.kind === "text" ? text.replace(/\s*\n\s*/g, " ") : text);
  });

  /* ---------- Clicks ---------- */
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target;
      const link = closest(target, "a[href]");
      // Clicks inside the text being edited place the caret; links there must not navigate.
      if (editing && editing.el.contains(target)) {
        if (link) e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      const block = blockOf(target);
      if (!block) {
        stopEditing();
        // Global content (logo, navigation, footer) wins over the link it sits in.
        const global = closest(target, "[data-kern-global]");
        if (global) {
          send("global", { ref: global.getAttribute("data-kern-global") });
          return;
        }
        if (link) {
          const url = new URL(link.href, location.href);
          if (url.origin === location.origin && url.pathname !== location.pathname) send("navigate", { path: url.pathname });
        }
        return;
      }

      const blockId = block.getAttribute("data-kern-block");
      const field = fieldOf(target, block);
      // Commit the previous text before announcing the new selection.
      if (editing && (!field || editing.el !== field.el)) stopEditing();
      markSelected(blockId, false, field ? field.path : null);
      send("select", { blockId, field: field ? field.path : null });

      /* Inline editing, switched off (see INLINE_EDITING):
      if (field && INLINE.has(field.kind)) {
        startEditing(field.el, block, field.path, field.kind);
        return;
      }
      stopEditing();
      if (field && field.kind === "image") send("pickImage", { blockId, field: field.path });
      */
      if (INLINE_EDITING && field && INLINE.has(field.kind)) {
        startEditing(field.el, block, field.path, field.kind);
        return;
      }
      stopEditing();
    },
    true,
  );

  // Forms in the preview must not submit; summaries must not toggle while selecting.
  document.addEventListener("submit", (e) => e.preventDefault(), true);

  /**
   * Live text for a textarea field. Sites often render it as one <p> per blank-line paragraph (with
   * pre-line inside), so rebuild those paragraphs from the first one to keep their styling. Otherwise
   * write the text and make sure line breaks stay visible. The next page reload renders it for real.
   */
  function patchMultiline(el, value) {
    const template = el.firstElementChild;
    const paragraphs = Array.from(el.children);
    if (template && paragraphs.every((child) => child.tagName === "P")) {
      const parts = value.split(/\n\s*\n/).filter((part) => part.trim());
      el.replaceChildren(
        ...(parts.length ? parts : [""]).map((part) => {
          const p = template.cloneNode(false);
          p.textContent = part;
          if (/^(normal|nowrap)$/.test(getComputedStyle(template).whiteSpace)) p.style.whiteSpace = "pre-line";
          return p;
        }),
      );
      return;
    }
    el.textContent = value;
    if (/^(normal|nowrap)$/.test(getComputedStyle(el).whiteSpace)) el.style.whiteSpace = "pre-line";
  }

  /* ---------- Messages from the editor ---------- */
  addEventListener("message", (e) => {
    if (e.source !== window.parent) return;
    const msg = e.data;
    if (!msg || msg.source !== "kern-editor") return;
    if (parentOrigin === "*" || parentOrigin !== e.origin) parentOrigin = e.origin;

    if (msg.type === "schema") {
      fieldTypes = msg.fieldTypes || {};
      blockLabels = msg.blockLabels || {};
    } else if (msg.type === "select" || msg.type === "scrollTo") {
      markSelected(msg.blockId, msg.scroll !== false, typeof msg.field === "string" ? msg.field : null);
    } else if (msg.type === "patch") {
      const block = blockById(msg.blockId);
      if (!block) return;
      const el = block.querySelector(`[data-kern-field="${CSS.escape(msg.field)}"]`);
      if (!el || (editing && editing.el === el)) return;
      const value = typeof msg.value === "string" ? msg.value : "";
      if (el.tagName === "IMG") {
        if (value) el.src = value;
        el.removeAttribute("srcset");
      } else if (msg.html) el.innerHTML = value;
      else if (typeOf(block, msg.field) === "textarea") patchMultiline(el, value);
      else el.textContent = value;
    }
  });

  /* ---------- Keep the scroll position across reloads (each draft write reloads the page) ---------- */
  const SCROLL_KEY = "kern-scroll:" + location.pathname;
  addEventListener("pagehide", () => {
    try {
      sessionStorage.setItem(SCROLL_KEY, String(scrollY));
    } catch {}
  });
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    const y = Number(sessionStorage.getItem(SCROLL_KEY));
    // Only on reloads; opening a page fresh starts at the top.
    if (y && nav && nav.type === "reload") {
      history.scrollRestoration = "manual";
      // Keep the page invisible until it is back at the old position, so it never flashes at the top.
      const hide = document.createElement("style");
      hide.textContent = "html{visibility:hidden!important;scroll-behavior:auto!important}";
      document.head.appendChild(hide);
      let shown = false;
      const show = () => {
        if (shown) return;
        shown = true;
        scrollTo(0, y);
        hide.remove();
      };
      const restore = () => {
        scrollTo(0, y);
        // Wait one frame so the browser lays out at the restored position before showing it.
        requestAnimationFrame(show);
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", restore, { once: true });
      else restore();
      // Never keep the page hidden for long, even if something blocks.
      setTimeout(show, 1200);
      // Images above may still change the layout; correct silently while the user hasn't scrolled.
      let userScrolled = false;
      addEventListener("wheel", () => (userScrolled = true), { once: true, passive: true });
      addEventListener("touchmove", () => (userScrolled = true), { once: true, passive: true });
      addEventListener("load", () => !userScrolled && scrollTo(0, y), { once: true });
    }
  } catch {}

  send("ready", { path: location.pathname, title: document.title });
})();
