"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Eye,
  History,
  MoreHorizontal,
  PanelLeft,
  Redo2,
  Save,
  Settings2,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { PublishButton } from "@/components/actions/publish";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/display";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { SegmentedControl, Tooltip } from "@/components/ui/overlay";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { VersionHistory } from "@/components/history/version-history";
import { PageSettingsDialog } from "@/components/pages/page-settings-dialog";
import { cn } from "@/lib/utils";
import { BlockFields } from "./block-fields";
import { BlockOutline } from "./block-outline";
import { blockMeta, createBlock, examplePageBlocks, type Block, type BlockType } from "./blocks";
import { AddBlockDialog, Canvas, devices } from "./canvas";
import { EditorLoader } from "./editor-loader";
import { pageLabel, PagePicker } from "./page-picker";

type SidebarTab = "properties" | "blocks";

/** Edit state of one page: the blocks as saved, the working copy and its undo/redo stacks. */
type PageDoc = { saved: Block[]; blocks: Block[]; past: Block[][]; future: Block[][] };

const HISTORY_LIMIT = 100;
/** Changes to the same field within this window become one undo step (typing). */
const COALESCE_MS = 500;

function freshDoc(path: string): PageDoc {
  const blocks = examplePageBlocks(path);
  return { saved: blocks, blocks, past: [], future: [] };
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function scrollToBlock(id: string) {
  requestAnimationFrame(() =>
    document.querySelector(`[data-block-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
  );
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

const noSubscribe = () => () => {};

function useIsMac() {
  return useSyncExternalStore(
    noSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => true,
  );
}

function isTextTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest("input, textarea, select") !== null;
}

/* ---------- Topbar ---------- */

function SaveStatus({ dirty, className }: { dirty: boolean; className?: string }) {
  return dirty ? (
    <span className={cn("flex items-center gap-2 text-sm font-medium whitespace-nowrap text-foreground", className)}>
      <span className="size-2 rounded-full bg-warning" />
      <span className="2xl:hidden">Ungespeichert</span>
      <span className="hidden 2xl:inline">Ungespeicherte Änderungen</span>
    </span>
  ) : (
    <span className={cn("flex items-center gap-1.5 text-sm whitespace-nowrap text-muted", className)}>
      <Check className="size-4" strokeWidth={1.75} />
      Gespeichert
    </span>
  );
}

function EditorTopbar({
  pagePath,
  device,
  dirty,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenPanel,
  onDeviceChange,
  onPageChange,
  onSave,
  onDiscard,
}: {
  pagePath: string;
  device: string;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenPanel: () => void;
  onDeviceChange: (value: string) => void;
  onPageChange: (value: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const router = useRouter();
  const isMac = useIsMac();
  const mod = isMac ? "⌘" : "Strg+";
  const redoKey = isMac ? "⇧⌘Z" : "Strg+Y";
  const title = pageLabel(pagePath);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const leave = () => (dirty ? setLeaveOpen(true) : router.push("/pages"));
  const copyPreview = () => {
    void navigator.clipboard?.writeText(`${location.origin}/preview/startseite`);
    toast.success("Vorschau-Link kopiert", { description: "Gültig für 7 Tage, ohne Anmeldung." });
  };

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:gap-3 sm:px-4 xl:gap-4">
      <Tooltip label="Zurück zum CMS">
        {dirty ? (
          <Button variant="ghost" size="icon" aria-label="Zurück zum CMS" onClick={leave} className="max-sm:hidden">
            <ArrowLeft strokeWidth={1.75} />
          </Button>
        ) : (
          <Link
            href="/pages"
            aria-label="Zurück zum CMS"
            className={buttonStyles({ variant: "ghost", size: "icon", className: "max-sm:hidden" })}
          >
            <ArrowLeft strokeWidth={1.75} />
          </Link>
        )}
      </Tooltip>
      <span className="h-8 w-px shrink-0 bg-border max-sm:hidden" />
      <Tooltip label="Eigenschaften und Blöcke">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Eigenschaften und Blöcke"
          onClick={onOpenPanel}
          className="lg:hidden"
        >
          <PanelLeft strokeWidth={1.75} />
        </Button>
      </Tooltip>
      <PagePicker current={pagePath} dirty={dirty} onSelect={onPageChange} />
      <Badge tone="warning" dot className="hidden 2xl:inline-flex">
        Entwurf
      </Badge>
      <SaveStatus dirty={dirty} className="max-lg:hidden" />

      <SegmentedControl
        label="Gerät"
        items={devices.map(({ value, label, icon }) => ({ value, label, icon }))}
        value={device}
        onValueChange={onDeviceChange}
        className="mx-auto max-md:hidden"
      />
      <span className="flex-1 md:hidden" />

      <div className="flex items-center gap-2">
        {/* Wide screens: every tool in the bar. */}
        <div className="flex items-center gap-2 max-xl:hidden">
          <Tooltip label="Seiteneinstellungen und SEO">
            <Button variant="ghost" size="icon" aria-label="Seiteneinstellungen" onClick={() => setSettingsOpen(true)}>
              <Settings2 strokeWidth={1.75} />
            </Button>
          </Tooltip>
          <Tooltip label="Verlauf dieser Seite">
            <Button variant="ghost" size="icon" aria-label="Verlauf" onClick={() => setHistoryOpen(true)}>
              <History strokeWidth={1.75} />
            </Button>
          </Tooltip>
          <span className="mx-1 h-8 w-px bg-border" />
          <Tooltip label={`Rückgängig (${mod}Z)`}>
            <Button variant="ghost" size="icon" aria-label="Rückgängig" disabled={!canUndo} onClick={onUndo}>
              <Undo2 strokeWidth={1.75} />
            </Button>
          </Tooltip>
          <Tooltip label={`Wiederholen (${redoKey})`}>
            <Button variant="ghost" size="icon" aria-label="Wiederholen" disabled={!canRedo} onClick={onRedo}>
              <Redo2 strokeWidth={1.75} />
            </Button>
          </Tooltip>
          <span className="mx-1 h-8 w-px bg-border" />
          <Button variant="secondary" onClick={copyPreview}>
            <Eye />
            Vorschau
          </Button>
          <Button variant="secondary" onClick={onSave}>
            Speichern
          </Button>
        </div>

        {/* Narrower screens: the same tools in a menu. */}
        <Menu>
          <MenuTrigger
            aria-label={dirty ? "Weitere Aktionen, ungespeicherte Änderungen" : "Weitere Aktionen"}
            className={buttonStyles({ variant: "ghost", size: "icon", className: "relative xl:hidden" })}
          >
            <MoreHorizontal strokeWidth={1.75} />
            {dirty && <span className="absolute top-2 right-2 size-2 rounded-full bg-warning ring-2 ring-surface lg:hidden" />}
          </MenuTrigger>
          <MenuContent className="w-64">
            <SaveStatus dirty={dirty} className="h-10 px-3 lg:hidden" />
            <MenuItem icon={Undo2} disabled={!canUndo} onClick={onUndo} className="data-disabled:opacity-50">
              Rückgängig
              <span className="ml-auto text-sm text-muted">{mod}Z</span>
            </MenuItem>
            <MenuItem icon={Redo2} disabled={!canRedo} onClick={onRedo} className="data-disabled:opacity-50">
              Wiederholen
              <span className="ml-auto text-sm text-muted">{redoKey}</span>
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={Save} onClick={onSave}>
              Speichern
            </MenuItem>
            <MenuItem icon={Eye} onClick={copyPreview}>
              Vorschau-Link kopieren
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={Settings2} onClick={() => setSettingsOpen(true)}>
              Seiteneinstellungen
            </MenuItem>
            <MenuItem icon={History} onClick={() => setHistoryOpen(true)}>
              Verlauf dieser Seite
            </MenuItem>
            <div className="sm:hidden">
              <MenuSeparator />
              <MenuItem icon={ArrowLeft} onClick={leave}>
                Zurück zum CMS
              </MenuItem>
            </div>
          </MenuContent>
        </Menu>

        <PublishButton changes={1} className="max-sm:px-3 max-sm:text-sm" />
      </div>

      <PageSettingsDialog key={pagePath} open={settingsOpen} onOpenChange={setSettingsOpen} title={title} path={pagePath} />
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent title={`Verlauf: ${title}`} description="Alle gespeicherten Versionen dieser Seite." size="xl" className="[&>div:nth-child(2)]:p-0">
          <VersionHistory scope={title} className="h-[460px] border-t border-border" />
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="Ungespeicherte Änderungen verwerfen?"
        description="Du hast Änderungen an dieser Seite, die noch nicht gespeichert sind. Wenn du den Editor verlässt, gehen sie verloren."
        cancelLabel="Weiter bearbeiten"
        confirmLabel="Verwerfen"
        danger
        onConfirm={() => {
          onDiscard();
          router.push("/pages");
        }}
      />
    </header>
  );
}

/* ---------- Sidebar ---------- */

function EditorSidebar({
  pageTitle,
  tab,
  onTabChange,
  blocks,
  selected,
  revision,
  onSelect,
  onChange,
  onDirty,
  onAdd,
  onMove,
  onDuplicate,
  onRemove,
  drawer = false,
}: {
  pageTitle: string;
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  blocks: Block[];
  selected: Block | undefined;
  /** Bumped on undo/redo so the fields remount with the restored values. */
  revision: number;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<Block>) => void;
  onDirty: () => void;
  onAdd: (type: BlockType) => void;
  onMove: (id: string, toIndex: number) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  /** Rendered inside the slide-over panel on small screens. */
  drawer?: boolean;
}) {
  // The target is kept after closing so the dialog text stays put during its exit animation.
  const [removeOpen, setRemoveOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<Block | null>(null);
  const pendingLabel = pendingRemove ? blockMeta[pendingRemove.type].label : "";
  const askRemove = (block: Block | undefined) => {
    if (!block) return;
    setPendingRemove(block);
    setRemoveOpen(true);
  };

  const Root = drawer ? "div" : "aside";

  return (
    <Root
      className={cn(
        "flex flex-col bg-surface",
        drawer ? "min-h-0 flex-1" : "w-[400px] shrink-0 border-r border-border",
      )}
    >
      <Tabs value={tab} onValueChange={(value) => onTabChange(value as SidebarTab)} className="flex min-h-0 flex-1 flex-col">
        <TabsList className={cn("px-4", drawer && "pr-16")}>
          <Tab value="properties">Eigenschaften</Tab>
          <Tab value="blocks">
            Blöcke
            <span className="rounded-full bg-subtle px-2 text-xs leading-5 font-semibold text-muted">{blocks.length}</span>
          </Tab>
        </TabsList>

        <TabPanel value="properties" className="flex min-h-0 flex-1 flex-col pt-0">
          {selected ? (
            <>
              <div className="flex flex-col gap-1 border-b border-border px-6 py-5">
                <span className="flex items-center gap-1.5 text-sm text-muted">
                  {pageTitle}
                  <ChevronRight className="size-3.5" />
                  Block {blocks.indexOf(selected) + 1} von {blocks.length}
                </span>
                <h2 className="text-xl font-semibold tracking-tight">{blockMeta[selected.type].label}</h2>
              </div>

              <div key={`${selected.id}-${revision}`} className="flex flex-1 flex-col gap-7 overflow-y-auto px-6 py-6">
                <BlockFields
                  block={selected}
                  onChange={(patch) => onChange(selected.id, patch)}
                  onDirty={onDirty}
                />
              </div>

              <div className="border-t border-border p-4">
                <Button
                  variant="ghost"
                  className="w-full text-danger hover:bg-danger-soft"
                  onClick={() => askRemove(selected)}
                >
                  <Trash2 />
                  Block entfernen
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 px-8 text-center">
              <span className="text-base font-medium">Kein Block ausgewählt</span>
              <span className="text-[15px] text-muted">Wähle einen Block in der Vorschau oder füge einen neuen hinzu.</span>
            </div>
          )}
        </TabPanel>

        <TabPanel value="blocks" className="flex min-h-0 flex-1 flex-col pt-0">
          <div className="flex-1 overflow-y-auto p-3">
            <BlockOutline
              blocks={blocks}
              selectedId={selected?.id ?? null}
              onSelect={(id) => {
                onSelect(id);
                scrollToBlock(id);
              }}
              onOpen={(id) => {
                onSelect(id);
                onTabChange("properties");
                scrollToBlock(id);
              }}
              onMove={onMove}
              onDuplicate={onDuplicate}
              onRemove={(id) => askRemove(blocks.find((b) => b.id === id))}
            />
            {blocks.length > 1 && (
              <p className="px-3 pt-3 text-sm text-muted">
                Ziehen oder Alt+Pfeiltasten, um die Reihenfolge zu ändern. Doppelklick öffnet die Eigenschaften.
              </p>
            )}
          </div>
          <div className="border-t border-border p-4">
            <AddBlockDialog onAdd={onAdd} className="w-full" />
          </div>
        </TabPanel>
      </Tabs>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={`Block „${pendingLabel}“ entfernen?`}
        description="Der Block verschwindet aus dem Entwurf. Gespeichert wird erst mit „Speichern“."
        confirmLabel="Entfernen"
        danger
        onConfirm={() => {
          if (!pendingRemove) return;
          onRemove(pendingRemove.id);
          toast.success(`Block „${pendingLabel}“ entfernt`);
        }}
      />
    </Root>
  );
}

/** Slide-over for the sidebar below 1024 px, styled like the app's mobile navigation. */
function SidebarDrawer({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-foreground/30 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <BaseDialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-[min(26rem,calc(100vw-2rem))] flex-col bg-surface shadow-popover outline-none transition-transform duration-200 ease-out data-ending-style:-translate-x-full data-starting-style:-translate-x-full">
          <BaseDialog.Title className="sr-only">Eigenschaften und Blöcke</BaseDialog.Title>
          <BaseDialog.Close
            aria-label="Schließen"
            className={buttonStyles({ variant: "ghost", size: "icon", className: "absolute top-1.5 right-2 z-10 size-10" })}
          >
            <X strokeWidth={1.75} />
          </BaseDialog.Close>
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/* ---------- Page ---------- */

export default function EditorPage() {
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState<string | undefined>();
  const [loadRun, setLoadRun] = useState(0);
  const [device, setDevice] = useState("desktop");
  const [tab, setTab] = useState<SidebarTab>("properties");
  const [pagePath, setPagePath] = useState("/");
  const [docs, setDocs] = useState<Record<string, PageDoc>>({});
  const [selectedId, setSelectedId] = useState<string | null>(() => examplePageBlocks("/")[0]?.id ?? null);
  /** Inline text is being typed but not committed yet (the canvas commits on blur). */
  const [typing, setTyping] = useState(false);
  const [revision, setRevision] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const lastEdit = useRef<{ key: string; path: string; at: number } | null>(null);
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isMd = useMediaQuery("(min-width: 768px)");

  const doc = docs[pagePath] ?? freshDoc(pagePath);
  const blocks = doc.blocks;
  const dirty = doc.blocks !== doc.saved || typing;
  const selected = blocks.find((b) => b.id === selectedId);
  const duration = loadingText ? 700 : 1200;

  // Simulates the site preview starting up; later this waits for the iframe.
  // Next.js keeps visited routes alive in a hidden <Activity>, so the cleanup
  // (which also runs when the route is hidden) puts the loader back: it then
  // shows again every time the editor is opened, not only on the first visit.
  useLayoutEffect(() => {
    const timer = setTimeout(() => setLoading(false), duration);
    return () => {
      clearTimeout(timer);
      setLoading(true);
    };
  }, [loadRun, duration]);

  // When the editor is left, the next visit should show the default loader text.
  useLayoutEffect(() => () => setLoadingText(undefined), []);

  // Warn before closing or reloading the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* ----- History ----- */

  /**
   * Applies a change to the current page's blocks as one undo step. Calls with
   * the same `coalesceKey` in quick succession (typing in a field) are merged.
   */
  const commit = (update: (blocks: Block[]) => Block[], coalesceKey?: string) => {
    const now = Date.now();
    const last = lastEdit.current;
    const merge = Boolean(coalesceKey && last && last.key === coalesceKey && last.path === pagePath && now - last.at < COALESCE_MS);
    lastEdit.current = coalesceKey ? { key: coalesceKey, path: pagePath, at: now } : null;
    setTyping(false);
    setDocs((all) => {
      const current = all[pagePath] ?? freshDoc(pagePath);
      const next = update(current.blocks);
      if (next === current.blocks) return all;
      const past = merge ? current.past : [...current.past, current.blocks].slice(-HISTORY_LIMIT);
      return { ...all, [pagePath]: { ...current, blocks: next, past, future: [] } };
    });
  };

  const travel = (direction: "undo" | "redo") => {
    const from = direction === "undo" ? doc.past : doc.future;
    if (from.length === 0) return;
    lastEdit.current = null;
    setTyping(false);
    setRevision((n) => n + 1);
    setDocs((all) => {
      const current = all[pagePath] ?? freshDoc(pagePath);
      if (direction === "undo") {
        const target = current.past.at(-1);
        if (!target) return all;
        return {
          ...all,
          [pagePath]: { ...current, blocks: target, past: current.past.slice(0, -1), future: [current.blocks, ...current.future] },
        };
      }
      const target = current.future[0];
      if (!target) return all;
      return {
        ...all,
        [pagePath]: { ...current, blocks: target, past: [...current.past, current.blocks], future: current.future.slice(1) },
      };
    });
  };
  const undo = () => travel("undo");
  const redo = () => travel("redo");

  // ⌘Z / ⇧⌘Z (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y elsewhere), unless a text field has focus:
  // there the browser's own text undo applies.
  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.defaultPrevented) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    if (isTextTarget(event.target)) return;
    event.preventDefault();
    if (key === "y" || event.shiftKey) redo();
    else undo();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onShortcut(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  /* ----- Block actions ----- */

  const markTyping = () => setTyping(true);

  const updateBlock = (id: string, patch: Partial<Block>) => {
    commit(
      (current) => current.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)),
      `${id}:${Object.keys(patch).sort().join(",")}`,
    );
  };

  const addBlock = (type: BlockType) => {
    const block = createBlock(type, newId());
    commit((current) => [...current, block]);
    setSelectedId(block.id);
    scrollToBlock(block.id);
  };

  const moveBlock = (id: string, toIndex: number) => {
    commit((current) => {
      const from = current.findIndex((b) => b.id === id);
      const to = from < toIndex ? toIndex - 1 : toIndex;
      if (from < 0 || from === to) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const duplicateBlock = (id: string) => {
    const index = blocks.findIndex((b) => b.id === id);
    if (index < 0) return;
    const copy = { ...structuredClone(blocks[index]), id: newId() };
    commit((current) => {
      const at = current.findIndex((b) => b.id === id);
      return [...current.slice(0, at + 1), copy, ...current.slice(at + 1)];
    });
    setSelectedId(copy.id);
    toast.success(`Block „${blockMeta[copy.type].label}“ dupliziert`);
    scrollToBlock(copy.id);
  };

  const removeBlock = (id: string) => {
    const index = blocks.findIndex((b) => b.id === id);
    if (index < 0) return;
    const next = blocks.filter((b) => b.id !== id);
    commit((current) => current.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId((next[index] ?? next[index - 1])?.id ?? null);
  };

  /* ----- Page actions ----- */

  const save = () => {
    setTyping(false);
    setDocs((all) => {
      const current = all[pagePath] ?? freshDoc(pagePath);
      return { ...all, [pagePath]: { ...current, saved: current.blocks } };
    });
    toast.success("Gespeichert", { description: "Die Änderungen liegen im Entwurf." });
  };

  /** Drops unsaved changes of the current page: back to its last saved state, history cleared. */
  const discard = () => {
    lastEdit.current = null;
    setTyping(false);
    setRevision((n) => n + 1);
    setDocs((all) => {
      const current = all[pagePath] ?? freshDoc(pagePath);
      return { ...all, [pagePath]: { saved: current.saved, blocks: current.saved, past: [], future: [] } };
    });
    setSelectedId(doc.saved[0]?.id ?? null);
  };

  const openPage = (path: string) => {
    lastEdit.current = null;
    setTyping(false);
    setPagePath(path);
    setSelectedId((docs[path] ?? freshDoc(path)).blocks[0]?.id ?? null);
  };

  const selectFromCanvas = (id: string) => {
    // Small screens: the properties live in the slide-over, so selecting a block opens it.
    if (!isDesktop && id !== selectedId) {
      setTab("properties");
      setDrawerOpen(true);
    }
    setSelectedId(id);
  };

  const sidebarProps = {
    pageTitle: pageLabel(pagePath),
    tab,
    onTabChange: setTab,
    blocks,
    selected,
    revision,
    onSelect: setSelectedId,
    onChange: updateBlock,
    onDirty: markTyping,
    onAdd: addBlock,
    onMove: moveBlock,
    onDuplicate: duplicateBlock,
    onRemove: removeBlock,
  };

  return (
    <div className="flex h-dvh flex-col">
      <EditorLoader
        visible={loading}
        duration={duration}
        {...(loadingText && { title: `${loadingText} wird geladen`, detail: "Einen Moment…" })}
      />
      <Suspense fallback={null}>
        <PageFromUrl onPath={(path) => path !== pagePath && openPage(path)} />
      </Suspense>
      <EditorTopbar
        pagePath={pagePath}
        device={device}
        dirty={dirty}
        canUndo={doc.past.length > 0}
        canRedo={doc.future.length > 0}
        onUndo={undo}
        onRedo={redo}
        onOpenPanel={() => setDrawerOpen(true)}
        onDeviceChange={setDevice}
        onSave={save}
        onDiscard={discard}
        onPageChange={(path) => {
          // The picker has already asked whether unsaved changes may be dropped.
          if (dirty) discard();
          openPage(path);
          setLoadingText(pageLabel(path));
          setLoadRun((n) => n + 1);
          router.replace(path === "/" ? "/editor" : `/editor?page=${encodeURIComponent(path)}`, { scroll: false });
        }}
      />
      <div className="flex min-h-0 flex-1">
        {isDesktop ? (
          <EditorSidebar {...sidebarProps} />
        ) : (
          <SidebarDrawer open={drawerOpen} onOpenChange={setDrawerOpen}>
            <EditorSidebar {...sidebarProps} drawer />
          </SidebarDrawer>
        )}
        <Canvas
          device={device}
          fluid={!isMd}
          blocks={blocks}
          selectedId={selectedId}
          onSelect={selectFromCanvas}
          onChange={updateBlock}
          onDirty={markTyping}
          onAdd={addBlock}
        />
      </div>
    </div>
  );
}

/** Reads ?page= from the URL (deep links from the page list) and hands it to the editor. */
function PageFromUrl({ onPath }: { onPath: (path: string) => void }) {
  const path = useSearchParams().get("page") ?? "/";
  const report = useEffectEvent(onPath);
  useEffect(() => report(path), [path]);
  return null;
}
