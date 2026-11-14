"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { FilePlus2, Loader2 } from "lucide-react";
import { emptyValues } from "@/components/kern/field-renderer";
import { useCan, useKern } from "@/components/kern/kern-provider";
import { MediaPickerDialog } from "@/components/media/media-picker";
import { Button, buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import type { BlockData, BlockDef, FieldType, PageData, PageSeo, PageSummary } from "@/lib/kern-types";
import type { SeoTarget } from "@/lib/seo";
import { RESTART_FILES } from "@/lib/preview-files";
import { discardPage, loadPage, savePage, writePageDraft } from "@/server/actions/content";
import { AssistantPanel, useAssistantChat, type AssistantContext } from "./assistant-panel";
import { NewPageDialog } from "./page-picker";
import { blockSummary, changedLeaves, fieldLabel, fieldTypesFor, getAt, newBlockId, samePath, setAt, typeAt } from "./paths";
import { PreviewFrame, PreviewLoader, usePreview } from "./preview";
import { useSeo } from "./seo-panel";
import { GlobalDialog } from "./global-dialog";
import { EditorSidebar, SidebarDrawer, type SidebarTab } from "./sidebar";
import { EditorTopbar, type SaveState } from "./topbar";
import { editorTitle } from "./title";

/** Edit state of the open page: as last saved (committed), the working copy and its undo/redo stacks. */
type Doc = {
  name: string;
  saved: PageData;
  data: PageData;
  past: PageData[];
  future: PageData[];
  /** The file already had uncommitted edits when it was opened. */
  serverUnsaved: boolean;
  /** URL path the preview shows: the path last written to disk. */
  framePath: string;
};

type Guard = { kind: "page"; name: string } | { kind: "leave" };

const HISTORY_LIMIT = 100;
/** Changes to the same field within this window become one undo step (typing). */
const COALESCE_MS = 500;
/** Draft writes are debounced; each write makes Astro reload the preview. */
const WRITE_DELAY = 600;
/** Field types the overlay can update in place while typing in the panel. */
const PATCHABLE = new Set<FieldType>(["text", "textarea", "inline", "richtext", "image"]);
/** Fields edited with uncontrolled editors, which must remount to show a value changed elsewhere. */
const UNCONTROLLED = new Set<FieldType>(["inline", "richtext"]);

function freshDoc(name: string, page: PageData, status: PageSummary["status"] | undefined): Doc {
  return { name, saved: page, data: page, past: [], future: [], serverUnsaved: status === "unsaved", framePath: page.path };
}

/** Matches a media query; renders as matching on the server (desktop first). */
function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => true,
  );
}

function isTextTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest("input, textarea, select") !== null;
}

/** Cleans a value typed in the preview: plain text fields are a single line. */
function normalizeFrameValue(type: FieldType | null, value: unknown) {
  if (typeof value !== "string") return value;
  if (type === "text") return value.replace(/\s*\n\s*/g, " ").trim();
  if (type === "textarea") return value.replace(/\n+$/, "");
  if (type === "inline") return value.replace(/(<br\s*\/?>)+$/i, "").trim();
  return value;
}

export function Editor({
  pages,
  name,
  page,
  requested,
}: {
  pages: PageSummary[];
  name: string | null;
  page: PageData | null;
  requested: string | null;
}) {
  if (!name || !page) return <NoPages />;
  return <PageEditor pages={pages} name={name} page={page} requested={requested} />;
}

function NoPages() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const canEdit = useCan("editor");
  return (
    <div className="flex h-dvh items-center justify-center">
      <EmptyState
        icon={FilePlus2}
        title="Noch keine Seiten"
        description="Diese Website hat noch keine Seiten im CMS. Lege die erste an, um sie im visuellen Editor zu bearbeiten."
        action={
          <>
            <Link href="/pages" className={buttonStyles({ variant: "secondary" })}>
              Zurück
            </Link>
            {canEdit && <Button onClick={() => setOpen(true)}>Neue Seite</Button>}
          </>
        }
      />
      <NewPageDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={(created) => router.replace(`/editor?page=${encodeURIComponent(created)}`)}
      />
    </div>
  );
}

function PageEditor({ pages, name, page, requested }: { pages: PageSummary[]; name: string; page: PageData; requested: string | null }) {
  const router = useRouter();
  const { config, site } = useKern();
  const canEdit = useCan("editor");
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isMd = useMediaQuery("(min-width: 768px)");
  const { preview, startError, restart } = usePreview();
  const [switching, startSwitch] = useTransition();

  const [doc, setDoc] = useState(() => freshDoc(name, page, pages.find((p) => p.name === name)?.status));
  const [selectedId, setSelectedId] = useState<string | null>(page.blocks[0]?.id ?? null);
  /** Field clicked in the preview; the sidebar then shows just that (null: all fields). */
  const [focus, setFocus] = useState<{ blockId: string; path: string } | null>(null);
  const focusPath = focus && focus.blockId === selectedId ? focus.path : null;
  const [tab, setTab] = useState<SidebarTab>("properties");
  const [device, setDevice] = useState("desktop");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [fieldRevs, setFieldRevs] = useState<Record<string, number>>({});
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameTyping, setFrameTyping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [writing, setWriting] = useState(false);
  const [guard, setGuard] = useState<Guard | null>(null);
  const [guardBusy, setGuardBusy] = useState(false);
  const [switchTitle, setSwitchTitle] = useState<string | null>(null);
  const [imagePick, setImagePick] = useState<{ blockId: string; field: string } | null>(null);
  const [globalHint, setGlobalHint] = useState<string | null>(null);
  const kern = useKern();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const seo = useSeo(name, canEdit);

  // Another page was opened (router.replace → new props): start over with its content.
  if (doc.name !== name) {
    setDoc(freshDoc(name, page, pages.find((p) => p.name === name)?.status));
    setSelectedId(page.blocks[0]?.id ?? null);
    setRevision((n) => n + 1);
    setFrameLoaded(false);
    setFrameTyping(false);
    setSwitchTitle(null);
  }

  const frameRef = useRef<HTMLIFrameElement>(null);
  /** Latest doc for event handlers and async work (kept in sync after each render, and set directly by apply()). */
  const docRef = useRef(doc);
  const selectedRef = useRef(selectedId);
  const lastEdit = useRef<{ key: string; name: string; at: number } | null>(null);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const writePending = useRef(false);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const frameTypingRef = useRef(false);
  const savingRef = useRef(false);
  const scrollOnReady = useRef(false);
  const seoName = useRef(name);
  const seoRefresh = useRef(seo.refresh);
  const lastWriteError = useRef<string | null>(null);

  useLayoutEffect(() => {
    docRef.current = doc;
    selectedRef.current = selectedId;
    seoName.current = name;
    seoRefresh.current = seo.refresh;
  });

  const blockDefs = config.blocks;
  const defs = useMemo(() => new Map(blockDefs.map((d) => [d.type, d])), [blockDefs]);
  const fieldTypes = useMemo(() => fieldTypesFor(blockDefs), [blockDefs]);
  const blockLabels = useMemo(() => Object.fromEntries(blockDefs.map((d) => [d.type, d.label])), [blockDefs]);

  const data = doc.data;
  const blocks = data.blocks;
  const selected = blocks.find((b) => b.id === selectedId);
  const dirty = doc.data !== doc.saved || doc.serverUnsaved || frameTyping;
  const saveState: SaveState = saving ? "saving" : dirty ? "dirty" : "saved";
  const previewOrigin = preview?.url ? new URL(preview.url).origin : null;
  const frameSrc = preview?.status === "ready" && preview.url ? preview.url + doc.framePath : null;

  /* ----- Talking to the preview ----- */

  const post = (message: Record<string, unknown>) => {
    const win = frameRef.current?.contentWindow;
    if (!win || !previewOrigin) return;
    win.postMessage({ source: "kern-editor", ...message }, previewOrigin);
  };

  /** Updates the preview's DOM in place for leaf values that changed (before the draft write reloads it). */
  const patchFrame = (before: BlockData, after: BlockData) => {
    const leaves = changedLeaves(before, after);
    if (!leaves) return;
    for (const path of leaves) {
      const type = typeAt(fieldTypes[after.type], path);
      if (!type || !PATCHABLE.has(type)) continue;
      const value = getAt(after, path);
      post({ type: "patch", blockId: after.id, field: path, value: typeof value === "string" ? value : "", html: type === "inline" || type === "richtext" });
    }
  };

  /* ----- Writing the draft ----- */

  const flushWrite = (): Promise<void> => {
    clearTimeout(writeTimer.current);
    writeTimer.current = undefined;
    if (!writePending.current || !canEdit) return writeQueue.current;
    writePending.current = false;
    const { name: target, data: snapshot } = docRef.current;
    setWriting(true);
    writeQueue.current = writeQueue.current.then(async () => {
      const result = await writePageDraft(target, snapshot);
      setWriting(writePending.current);
      if (!result.ok) {
        // Same error again (e.g. while typing an invalid path): don't stack toasts.
        if (lastWriteError.current !== result.error) toast.error("Entwurf konnte nicht geschrieben werden", { description: result.error });
        lastWriteError.current = result.error;
        return;
      }
      lastWriteError.current = null;
      if (target === seoName.current) seoRefresh.current();
      const current = docRef.current;
      if (current.name === target && current.framePath !== snapshot.path) apply({ ...current, framePath: snapshot.path });
      const summary = pages.find((p) => p.name === target);
      if (summary && (summary.title !== snapshot.title || summary.path !== snapshot.path || summary.status === "live")) router.refresh();
    });
    return writeQueue.current;
  };

  const scheduleWrite = () => {
    if (!canEdit) return;
    writePending.current = true;
    setWriting(true);
    clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      // Typing inside the preview: a reload would interrupt it. The overlay's commit schedules the write.
      if (frameTypingRef.current) return;
      void flushWrite();
    }, WRITE_DELAY);
  };

  // Flush on unmount (e.g. client navigation away from the editor).
  const flushWriteOnUnmount = useEffectEvent(() => void flushWrite());
  useEffect(() => () => flushWriteOnUnmount(), []);

  // Warn before closing the tab while a draft write is pending or a save runs.
  useEffect(() => {
    if (!writing && !saving) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [writing, saving]);

  /* ----- History ----- */

  function apply(next: Doc) {
    docRef.current = next;
    setDoc(next);
  }

  /**
   * Applies a change to the page as one undo step. Calls with the same
   * `coalesce` key in quick succession (typing in a field) are merged.
   */
  const change = (update: (data: PageData) => PageData, options: { coalesce?: string; write?: boolean } = {}) => {
    if (!canEdit) return;
    const current = docRef.current;
    const next = update(current.data);
    if (next === current.data) return;
    const now = Date.now();
    const last = lastEdit.current;
    const merge = Boolean(options.coalesce && last && last.key === options.coalesce && last.name === current.name && now - last.at < COALESCE_MS);
    lastEdit.current = options.coalesce ? { key: options.coalesce, name: current.name, at: now } : null;
    apply({
      ...current,
      data: next,
      past: merge ? current.past : [...current.past, current.data].slice(-HISTORY_LIMIT),
      future: [],
    });
    if (options.write !== false) scheduleWrite();
  };

  const travel = (direction: "undo" | "redo") => {
    const current = docRef.current;
    const target = direction === "undo" ? current.past.at(-1) : current.future[0];
    if (!target) return;
    lastEdit.current = null;
    apply(
      direction === "undo"
        ? { ...current, data: target, past: current.past.slice(0, -1), future: [current.data, ...current.future] }
        : { ...current, data: target, past: [...current.past, current.data], future: current.future.slice(1) },
    );
    setRevision((n) => n + 1);
    scheduleWrite();
  };
  const undo = () => travel("undo");
  const redo = () => travel("redo");

  /* ----- Block changes ----- */

  const updateBlock = (blockId: string, path: string, value: unknown, options: { write?: boolean; patch?: boolean } = {}) => {
    const before = docRef.current.data.blocks.find((b) => b.id === blockId);
    if (!before) return;
    if (Object.is(getAt(before, path), value)) return;
    const after = setAt(before, path, value);
    change((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === blockId ? after : b)) }), {
      coalesce: `${blockId}:${path}`,
      write: options.write,
    });
    if (options.patch !== false) patchFrame(before, after);
  };

  const selectBlock = (id: string | null, scroll = true) => {
    setSelectedId(id);
    setFocus(null);
    if (id) post({ type: "select", blockId: id, scroll });
  };

  const addBlock = (def: BlockDef) => {
    const taken = new Set(docRef.current.data.blocks.map((b) => b.id));
    let id = newBlockId();
    while (taken.has(id)) id = newBlockId();
    const block: BlockData = { ...emptyValues(def.fields), id, type: def.type };
    const after = selectedRef.current;
    change((d) => {
      const index = d.blocks.findIndex((b) => b.id === after);
      const at = index < 0 ? d.blocks.length : index + 1;
      return { ...d, blocks: [...d.blocks.slice(0, at), block, ...d.blocks.slice(at)] };
    });
    setSelectedId(id);
    setTab("properties");
    scrollOnReady.current = true;
    toast.success(`Block „${def.label}“ hinzugefügt`);
  };

  const moveBlock = (id: string, toIndex: number) => {
    change((d) => {
      const from = d.blocks.findIndex((b) => b.id === id);
      const to = from < toIndex ? toIndex - 1 : toIndex;
      if (from < 0 || from === to) return d;
      const next = [...d.blocks];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...d, blocks: next };
    });
    scrollOnReady.current = true;
  };

  const duplicateBlock = (id: string) => {
    const source = docRef.current.data.blocks.find((b) => b.id === id);
    if (!source) return;
    const taken = new Set(docRef.current.data.blocks.map((b) => b.id));
    let copyId = newBlockId();
    while (taken.has(copyId)) copyId = newBlockId();
    const copy = { ...structuredClone(source), id: copyId };
    change((d) => {
      const at = d.blocks.findIndex((b) => b.id === id);
      return { ...d, blocks: [...d.blocks.slice(0, at + 1), copy, ...d.blocks.slice(at + 1)] };
    });
    setSelectedId(copyId);
    scrollOnReady.current = true;
    toast.success(`Block „${defs.get(copy.type)?.label ?? copy.type}“ dupliziert`);
  };

  const removeBlock = (id: string) => {
    const list = docRef.current.data.blocks;
    const index = list.findIndex((b) => b.id === id);
    if (index < 0) return;
    const rest = list.filter((b) => b.id !== id);
    change((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }));
    if (selectedRef.current === id) setSelectedId((rest[index] ?? rest[index - 1])?.id ?? null);
  };

  const updatePageField = (field: "title" | "path", value: string) => {
    change((d) => ({ ...d, [field]: value }), { coalesce: `page:${field}` });
  };

  const updateSeo = (field: keyof PageSeo, value: unknown) => {
    change((d) => ({ ...d, seo: { ...d.seo, [field]: value } }), { coalesce: `seo:${field}` });
  };

  /* ----- Save, discard, switch ----- */

  const save = async () => {
    if (savingRef.current || !canEdit) return false;
    const before = docRef.current;
    if (before.data === before.saved && !before.serverUnsaved && !frameTypingRef.current) return true;
    savingRef.current = true;
    setSaving(true);
    clearTimeout(writeTimer.current);
    writePending.current = false;
    await writeQueue.current;
    const { name: target, data: snapshot } = docRef.current;
    const result = await savePage(target, snapshot);
    savingRef.current = false;
    setSaving(false);
    setWriting(writePending.current);
    if (!result.ok) {
      toast.error("Speichern fehlgeschlagen", { description: result.error });
      return false;
    }
    const current = docRef.current;
    if (current.name === target) apply({ ...current, saved: snapshot, serverUnsaved: false, framePath: snapshot.path });
    router.refresh();
    return true;
  };

  const discardChanges = async () => {
    if (!canEdit) return false;
    clearTimeout(writeTimer.current);
    writePending.current = false;
    await writeQueue.current;
    const target = docRef.current.name;
    const result = await discardPage(target);
    setWriting(false);
    if (!result.ok) {
      toast.error("Verwerfen fehlgeschlagen", { description: result.error });
      return false;
    }
    lastEdit.current = null;
    frameTypingRef.current = false;
    setFrameTyping(false);
    if (!result.data) {
      // A page that only existed as an unsaved draft is gone now.
      router.replace("/editor");
      return true;
    }
    apply(freshDoc(target, result.data, "live"));
    setSelectedId(result.data.blocks.find((b) => b.id === selectedRef.current)?.id ?? result.data.blocks[0]?.id ?? null);
    setRevision((n) => n + 1);
    toast.success("Änderungen verworfen");
    router.refresh();
    return true;
  };

  /** After the assistant ran: take over what it changed in this page and reload everything else. */
  const afterAssistant = async (files: string[]) => {
    router.refresh();
    // The dev server does not always reload the page by itself; give it a moment to rebuild, then reload.
    if (files.length > 0 && !files.some((f) => RESTART_FILES.test(f))) {
      setTimeout(() => {
        const frame = frameRef.current;
        const url = frame?.src;
        if (frame && url) frame.src = url;
      }, 800);
    }
    const target = docRef.current.name;
    if (!files.includes(`${config.pages.path}/${target}.json`)) return;
    const result = await loadPage(target);
    if (!result.ok) return;
    if (!result.data) {
      router.replace("/editor");
      return;
    }
    if (docRef.current.name !== target) return;
    lastEdit.current = null;
    apply(freshDoc(target, result.data.page, result.data.unsaved ? "unsaved" : "draft"));
    setSelectedId(result.data.page.blocks.find((b) => b.id === selectedRef.current)?.id ?? result.data.page.blocks[0]?.id ?? null);
    setRevision((n) => n + 1);
  };

  const assistant = useAssistantChat({
    page: { name, title: data.title, path: data.path },
    beforeSend: () => flushWrite(),
    onDone: (files) => void afterAssistant(files),
  });

  const assistantContext: AssistantContext = {
    page: { name, title: data.title },
    blocks: blocks.map((b) => ({ id: b.id, label: defs.get(b.type)?.label ?? b.type, summary: blockSummary(b, defs.get(b.type)) })),
    selected: selected ? { id: selected.id, label: defs.get(selected.type)?.label ?? selected.type } : null,
    field: selected && focusPath ? { blockId: selected.id, path: focusPath, label: fieldLabel(defs.get(selected.type), focusPath) } : null,
    globals: config.globals.map((g) => ({ key: g.key, label: g.label })),
  };

  const openPage = async (target: string) => {
    await flushWrite();
    setSwitchTitle(pages.find((p) => p.name === target)?.title ?? null);
    startSwitch(() => router.replace(`/editor?page=${encodeURIComponent(target)}`, { scroll: false }));
  };

  const requestPage = (target: string) => {
    if (target === docRef.current.name) return;
    if (dirty) setGuard({ kind: "page", name: target });
    else void openPage(target);
  };

  const leave = async () => {
    await flushWrite();
    router.push("/pages");
  };

  const resolveGuard = async (action: "save" | "discard") => {
    if (!guard) return;
    setGuardBusy(true);
    const ok = action === "save" ? await save() : await discardChanges();
    setGuardBusy(false);
    if (!ok) return;
    const pending = guard;
    setGuard(null);
    if (pending.kind === "page") void openPage(pending.name);
    else void leave();
  };

  // Deep links by URL path (?page=/ueber-uns): switch the address to the file name so refreshes keep the page.
  useEffect(() => {
    if (requested && requested !== name) router.replace(`/editor?page=${encodeURIComponent(name)}`, { scroll: false });
  }, [requested, name, router]);

  /* ----- Keyboard ----- */

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "s") {
      event.preventDefault();
      void save();
      return;
    }
    if (key !== "z" && key !== "y") return;
    if (event.defaultPrevented || isTextTarget(event.target)) return;
    event.preventDefault();
    if (key === "y" || event.shiftKey) redo();
    else undo();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  /* ----- Messages from the preview ----- */

  const onFrameMessage = useEffectEvent((event: MessageEvent) => {
    if (!previewOrigin || event.origin !== previewOrigin) return;
    if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
    const msg = event.data as { source?: string; type?: string; [key: string]: unknown };
    if (!msg || msg.source !== "kern-preview") return;
    const blockId = typeof msg.blockId === "string" ? msg.blockId : null;
    const field = typeof msg.field === "string" ? msg.field : null;
    const block = blockId ? docRef.current.data.blocks.find((b) => b.id === blockId) : undefined;
    const type = block && field ? typeAt(fieldTypes[block.type], field) : null;

    switch (msg.type) {
      case "ready": {
        setFrameLoaded(true);
        post({ type: "schema", fieldTypes, blockLabels });
        if (selectedRef.current) post({ type: "select", blockId: selectedRef.current, scroll: scrollOnReady.current });
        scrollOnReady.current = false;
        break;
      }
      case "select": {
        if (!blockId) {
          setSelectedId(null);
          break;
        }
        setSelectedId(blockId);
        setFocus(field ? { blockId, path: field } : null);
        setTab("properties");
        // Small screens: the properties live in the slide-over, so selecting a block opens it.
        if (!isDesktop && blockId !== selectedRef.current) setDrawerOpen(true);
        break;
      }
      case "edit": {
        if (!block || !field) break;
        frameTypingRef.current = true;
        setFrameTyping(true);
        updateBlock(block.id, field, normalizeFrameValue(type, msg.value), { write: false, patch: false });
        break;
      }
      case "commit": {
        const wasTyping = frameTypingRef.current;
        frameTypingRef.current = false;
        setFrameTyping(false);
        if (!block || !field) break;
        updateBlock(block.id, field, normalizeFrameValue(type, msg.value), { patch: false });
        if (wasTyping) scheduleWrite();
        if (type && UNCONTROLLED.has(type)) {
          const key = `${block.id}:${field.split(".")[0]}`;
          setFieldRevs((revs) => ({ ...revs, [key]: (revs[key] ?? 0) + 1 }));
        }
        break;
      }
      case "pickImage": {
        if (!block || !field || !canEdit) break;
        setSelectedId(block.id);
        setImagePick({ blockId: block.id, field });
        break;
      }
      case "navigate": {
        const path = typeof msg.path === "string" ? msg.path : "";
        const target = pages.find((p) => samePath(p.path, path));
        if (target) requestPage(target.name);
        else toast.info("Keine Seite im CMS", { description: `${path} wird nicht über kerncms bearbeitet.` });
        break;
      }
      case "global": {
        if (typeof msg.ref === "string") setGlobalHint(msg.ref);
        break;
      }
      case "shortcut": {
        const key = String(msg.key).toLowerCase();
        if (key === "s") void save();
        else if (key === "y" || (key === "z" && msg.shift)) redo();
        else if (key === "z") undo();
        break;
      }
    }
  });
  useEffect(() => {
    const listener = (event: MessageEvent) => onFrameMessage(event);
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);


  // Live window title: follows title edits and marks unsaved changes (the server sets it on load).
  useEffect(() => {
    document.title = `${editorTitle(data.title, dirty)} · ${site.name} · kerncms`;
  }, [data.title, dirty, site.name]);

  /* ----- Render ----- */

  const pickBlock = imagePick ? blocks.find((b) => b.id === imagePick.blockId) : undefined;
  const pickValue = pickBlock && imagePick ? getAt(pickBlock, imagePick.field) : undefined;
  const pageList = pages.map((p) => (p.name === name ? { ...p, title: data.title, path: data.path, status: dirty ? "unsaved" : p.status } : p)) as PageSummary[];

  const showSeoTarget = (target: SeoTarget) => {
    if (target.kind === "block") {
      selectBlock(target.blockId);
      setTab("properties");
    } else if (target.kind === "seo") {
      setTab("page");
    }
  };

  const sidebarProps = {
    tab,
    onTabChange: setTab,
    page: data,
    pageName: name,
    seo,
    onSeoTarget: showSeoTarget,
    defs,
    blockDefs,
    marks: config.marks,
    selected,
    revision,
    fieldRevs,
    canEdit,
    onSelect: (id: string) => selectBlock(id),
    onOpen: (id: string) => {
      selectBlock(id);
      setTab("properties");
    },
    onFieldChange: (blockId: string, fieldName: string, value: unknown) => updateBlock(blockId, fieldName, value),
    onPageChange: updatePageField,
    onSeoChange: updateSeo,
    onAdd: addBlock,
    onMove: moveBlock,
    onDuplicate: duplicateBlock,
    onRemove: removeBlock,
    onOpenGlobal: (key: string) => setGlobalHint(key),
    focusPath,
    onFocusPathChange: (path: string | null) => {
      setFocus(path && selectedRef.current ? { blockId: selectedRef.current, path } : null);
      if (selectedRef.current) post({ type: "select", blockId: selectedRef.current, field: path, scroll: false });
    },
  };

  return (
    <div className="flex h-dvh flex-col">
      <PreviewLoader
        preview={preview}
        startError={startError}
        visible={!frameLoaded || switching}
        title={switching ? `${switchTitle ?? "Seite"} wird geladen` : undefined}
        onRestart={() => {
          setFrameLoaded(false);
          void restart();
        }}
        canRestart={canEdit}
      />
      <EditorTopbar
        pages={pageList}
        name={name}
        title={data.title}
        path={data.path}
        device={device}
        saveState={saveState}
        canEdit={canEdit}
        canUndo={doc.past.length > 0}
        canRedo={doc.future.length > 0}
        previewHref={frameSrc}
        phoneHref={preview?.status === "ready" && preview.phoneUrl ? preview.phoneUrl + doc.framePath : null}
        phoneAnywhere={preview?.phoneAnywhere ?? false}
        onUndo={undo}
        onRedo={redo}
        onOpenPanel={() => setDrawerOpen(true)}
        onDeviceChange={setDevice}
        onPageSelect={requestPage}
        onPageCreated={(created) => {
          router.refresh();
          requestPage(created);
        }}
        onSave={() => void save()}
        onDiscard={() => void discardChanges()}
        onLeave={() => (dirty ? setGuard({ kind: "leave" }) : void leave())}
        assistant={kern.assistant ? { open: assistantOpen, busy: assistant.busy, onToggle: () => setAssistantOpen((v) => !v) } : null}
      />
      <div className="relative flex min-h-0 flex-1">
        {isDesktop ? (
          <EditorSidebar {...sidebarProps} />
        ) : (
          <SidebarDrawer open={drawerOpen} onOpenChange={setDrawerOpen}>
            <EditorSidebar {...sidebarProps} drawer />
          </SidebarDrawer>
        )}
        <PreviewFrame
          src={frameSrc}
          device={device}
          fluid={!isMd}
          frameRef={frameRef}
          onLoad={() => {
            setFrameLoaded(true);
            seo.refresh();
            // Also sent on "ready"; this one reaches the overlay even if it guessed the editor's origin wrong.
            post({ type: "schema", fieldTypes, blockLabels });
            if (selectedId) post({ type: "select", blockId: selectedId, scroll: false });
          }}
        >
        </PreviewFrame>
        {kern.assistant && <AssistantPanel chat={assistant} context={assistantContext} open={assistantOpen} onOpenChange={setAssistantOpen} docked={isDesktop} />}
      </div>

      <MediaPickerDialog
        open={imagePick !== null}
        onOpenChange={(open) => !open && setImagePick(null)}
        current={typeof pickValue === "string" && pickValue ? pickValue : undefined}
        onSelect={(value) => {
          if (imagePick) updateBlock(imagePick.blockId, imagePick.field, value);
          setImagePick(null);
        }}
      />

      <GlobalDialog target={globalHint} onClose={() => setGlobalHint(null)} canEdit={canEdit} />

      <Dialog open={guard !== null} onOpenChange={(open) => !open && !guardBusy && setGuard(null)}>
        <DialogContent
          title="Änderungen speichern?"
          description={
            guard?.kind === "page"
              ? `„${data.title}“ hat ungespeicherte Änderungen. Speichere sie, bevor du zu „${pages.find((p) => p.name === guard.name)?.title ?? guard.name}“ wechselst, oder verwirf sie.`
              : `„${data.title}“ hat ungespeicherte Änderungen. Speichere sie, bevor du den Editor verlässt, oder verwirf sie.`
          }
          footer={
            <>
              <Button
                variant="ghost"
                className="mr-auto -ml-2 text-danger hover:bg-danger-soft hover:text-danger"
                disabled={guardBusy}
                onClick={() => void resolveGuard("discard")}
              >
                Verwerfen
              </Button>
              <DialogClose className={buttonStyles({ variant: "secondary" })} disabled={guardBusy}>
                Weiter bearbeiten
              </DialogClose>
              <Button disabled={guardBusy} onClick={() => void resolveGuard("save")}>
                {guardBusy && <Loader2 className="animate-spin" />}
                Speichern
              </Button>
            </>
          }
        />
      </Dialog>
    </div>
  );
}
