"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Eye, History, Redo2, Settings2, Trash2, Undo2 } from "lucide-react";
import { PublishButton } from "@/components/actions/publish";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/display";
import { SegmentedControl, Tooltip } from "@/components/ui/overlay";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { VersionHistory } from "@/components/history/version-history";
import { PageSettingsDialog } from "@/components/pages/page-settings-dialog";
import { BlockFields } from "./block-fields";
import { BlockOutline } from "./block-outline";
import { blockMeta, createBlock, initialBlocks, type Block, type BlockType } from "./blocks";
import { AddBlockDialog, Canvas, devices } from "./canvas";
import { EditorLoader } from "./editor-loader";
import { pageLabel, PagePicker } from "./page-picker";


type SidebarTab = "properties" | "blocks";

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function scrollToBlock(id: string) {
  requestAnimationFrame(() =>
    document.querySelector(`[data-block-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
  );
}

/* ---------- Topbar ---------- */

function EditorPageTools({ path }: { path: string }) {
  const title = pageLabel(path);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <>
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
      <PageSettingsDialog key={path} open={settingsOpen} onOpenChange={setSettingsOpen} title={title} path={path} />
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent title={`Verlauf: ${title}`} description="Alle gespeicherten Versionen dieser Seite." size="xl" className="[&>div:nth-child(2)]:p-0">
          <VersionHistory scope={title} className="h-[460px] border-t border-border" />
        </DialogContent>
      </Dialog>
    </>
  );
}

function SaveStatus({ dirty }: { dirty: boolean }) {
  return dirty ? (
    <span className="flex items-center gap-2 text-sm font-medium whitespace-nowrap text-foreground">
      <span className="size-2 rounded-full bg-warning" />
      Ungespeicherte Änderungen
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-sm whitespace-nowrap text-muted">
      <Check className="size-4" strokeWidth={1.75} />
      Gespeichert
    </span>
  );
}

function BackButton({ dirty, onDiscard }: { dirty: boolean; onDiscard: () => void }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Tooltip label="Zurück zum CMS">
        {dirty ? (
          <Button variant="ghost" size="icon" aria-label="Zurück zum CMS" onClick={() => setConfirmOpen(true)}>
            <ArrowLeft strokeWidth={1.75} />
          </Button>
        ) : (
          <Link href="/pages" aria-label="Zurück zum CMS" className={buttonStyles({ variant: "ghost", size: "icon" })}>
            <ArrowLeft strokeWidth={1.75} />
          </Link>
        )}
      </Tooltip>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
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
    </>
  );
}

function EditorTopbar({
  pagePath,
  device,
  dirty,
  onDeviceChange,
  onPageChange,
  onSave,
  onDiscard,
}: {
  pagePath: string;
  device: string;
  dirty: boolean;
  onDeviceChange: (value: string) => void;
  onPageChange: (value: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-4">
      <BackButton dirty={dirty} onDiscard={onDiscard} />
      <span className="h-8 w-px bg-border" />
      <PagePicker current={pagePath} dirty={dirty} onSelect={onPageChange} />
      <Badge tone="warning" dot>
        Entwurf
      </Badge>
      <SaveStatus dirty={dirty} />

      <SegmentedControl
        label="Gerät"
        items={devices.map(({ value, label, icon }) => ({ value, label, icon }))}
        value={device}
        onValueChange={onDeviceChange}
        className="mx-auto"
      />

      <div className="flex items-center gap-2">
        <EditorPageTools path={pagePath} />
        <span className="mx-1 h-8 w-px bg-border" />
        <Tooltip label="Rückgängig (⌘Z)">
          <Button variant="ghost" size="icon" aria-label="Rückgängig" onClick={() => toast.info("Rückgängig gemacht")}>
            <Undo2 strokeWidth={1.75} />
          </Button>
        </Tooltip>
        <Tooltip label="Wiederholen (⇧⌘Z)">
          <Button variant="ghost" size="icon" aria-label="Wiederholen" onClick={() => toast.info("Wiederholt")}>
            <Redo2 strokeWidth={1.75} />
          </Button>
        </Tooltip>
        <span className="mx-1 h-8 w-px bg-border" />
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(`${location.origin}/preview/startseite`);
            toast.success("Vorschau-Link kopiert", { description: "Gültig für 7 Tage, ohne Anmeldung." });
          }}
        >
          <Eye />
          Vorschau
        </Button>
        <Button variant="secondary" onClick={onSave}>
          Speichern
        </Button>
        <PublishButton changes={1} />
      </div>
    </header>
  );
}

/* ---------- Sidebar ---------- */

function EditorSidebar({
  tab,
  onTabChange,
  blocks,
  selected,
  onSelect,
  onChange,
  onDirty,
  onAdd,
  onMove,
  onDuplicate,
  onRemove,
}: {
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  blocks: Block[];
  selected: Block | undefined;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<Block>) => void;
  onDirty: () => void;
  onAdd: (type: BlockType) => void;
  onMove: (id: string, toIndex: number) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
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

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-r border-border bg-surface">
      <Tabs value={tab} onValueChange={(value) => onTabChange(value as SidebarTab)} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="px-4">
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
                  Startseite
                  <ChevronRight className="size-3.5" />
                  Block {blocks.indexOf(selected) + 1} von {blocks.length}
                </span>
                <h2 className="text-xl font-semibold tracking-tight">{blockMeta[selected.type].label}</h2>
              </div>

              <div key={selected.id} className="flex flex-1 flex-col gap-7 overflow-y-auto px-6 py-6">
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
              <p className="px-3 pt-3 text-sm text-muted">Ziehen, um die Reihenfolge zu ändern. Doppelklick öffnet die Eigenschaften.</p>
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
    </aside>
  );
}

/* ---------- Page ---------- */

export default function EditorPage() {
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState<string | undefined>();
  const [loadRun, setLoadRun] = useState(0);
  const [device, setDevice] = useState("desktop");
  const [tab, setTab] = useState<SidebarTab>("properties");
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [selectedId, setSelectedId] = useState<string | null>(initialBlocks[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [pagePath, setPagePath] = useState("/");
  const router = useRouter();
  const duration = loadingText ? 700 : 1200;
  const selected = blocks.find((b) => b.id === selectedId);

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

  const markDirty = () => setDirty(true);

  const updateBlock = (id: string, patch: Partial<Block>) => {
    setBlocks((current) => current.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));
    setDirty(true);
  };

  const addBlock = (type: BlockType) => {
    const block = createBlock(type, newId());
    setBlocks((current) => [...current, block]);
    setSelectedId(block.id);
    setDirty(true);
    scrollToBlock(block.id);
  };

  const moveBlock = (id: string, toIndex: number) => {
    const from = blocks.findIndex((b) => b.id === id);
    const to = from < toIndex ? toIndex - 1 : toIndex;
    if (from < 0 || from === to) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setBlocks(next);
    setDirty(true);
  };

  const duplicateBlock = (id: string) => {
    const index = blocks.findIndex((b) => b.id === id);
    if (index < 0) return;
    const copy = { ...structuredClone(blocks[index]), id: newId() };
    setBlocks([...blocks.slice(0, index + 1), copy, ...blocks.slice(index + 1)]);
    setSelectedId(copy.id);
    setDirty(true);
    toast.success(`Block „${blockMeta[copy.type].label}“ dupliziert`);
    scrollToBlock(copy.id);
  };

  const removeBlock = (id: string) => {
    const index = blocks.findIndex((b) => b.id === id);
    if (index < 0) return;
    const next = blocks.filter((b) => b.id !== id);
    setBlocks(next);
    if (selectedId === id) setSelectedId((next[index] ?? next[index - 1])?.id ?? null);
    setDirty(true);
  };

  const save = () => {
    setDirty(false);
    toast.success("Gespeichert", { description: "Die Änderungen liegen im Entwurf." });
  };

  const discard = () => {
    setBlocks(initialBlocks);
    setSelectedId(initialBlocks[0]?.id ?? null);
    setDirty(false);
  };

  return (
    <div className="flex h-dvh flex-col">
      <EditorLoader
        visible={loading}
        duration={duration}
        {...(loadingText && { title: `${loadingText} wird geladen`, detail: "Einen Moment…" })}
      />
      <Suspense fallback={null}>
        <PageFromUrl onPath={(path) => path !== pagePath && setPagePath(path)} />
      </Suspense>
      <EditorTopbar
        pagePath={pagePath}
        device={device}
        dirty={dirty}
        onDeviceChange={setDevice}
        onSave={save}
        onDiscard={discard}
        onPageChange={(path) => {
          if (dirty) discard();
          setPagePath(path);
          setLoadingText(pageLabel(path));
          setSelectedId(blocks[0]?.id ?? null);
          setLoadRun((n) => n + 1);
          router.replace(path === "/" ? "/editor" : `/editor?page=${encodeURIComponent(path)}`, { scroll: false });
        }}
      />
      <div className="flex min-h-0 flex-1">
        <EditorSidebar
          tab={tab}
          onTabChange={setTab}
          blocks={blocks}
          selected={selected}
          onSelect={setSelectedId}
          onChange={updateBlock}
          onDirty={markDirty}
          onAdd={addBlock}
          onMove={moveBlock}
          onDuplicate={duplicateBlock}
          onRemove={removeBlock}
        />
        <Canvas
          device={device}
          blocks={blocks}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChange={updateBlock}
          onDirty={markDirty}
          onAdd={addBlock}
        />
      </div>
    </div>
  );
}

/** Reads ?page= from the URL (deep links from the page list) and hands it to the editor. */
function PageFromUrl({ onPath }: { onPath: (path: string) => void }) {
  const path = useSearchParams().get("page") ?? "/";
  useEffect(() => onPath(path), [path, onPath]);
  return null;
}
