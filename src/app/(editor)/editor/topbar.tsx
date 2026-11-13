"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ArrowLeft, Check, ExternalLink, Loader2, MoreHorizontal, PanelLeft, Redo2, RefreshCw, RotateCcw, Save, Smartphone, Undo2 } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { restartPreview } from "@/server/actions/site";
import { PhonePreviewDialog } from "./phone-preview-dialog";
import { PublishButton } from "@/components/actions/publish";
import { Button, buttonStyles } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { SegmentedControl, Tooltip } from "@/components/ui/overlay";
import type { PageSummary } from "@/lib/kern-types";
import { cn } from "@/lib/utils";
import { PagePicker } from "./page-picker";
import { devices } from "./preview";

const noSubscribe = () => () => {};

function useIsMac() {
  return useSyncExternalStore(
    noSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => true,
  );
}

export type SaveState = "saved" | "dirty" | "saving";

function SaveStatus({ state, className }: { state: SaveState; className?: string }) {
  if (state === "saving") {
    return (
      <span className={cn("flex items-center gap-1.5 text-sm whitespace-nowrap text-muted", className)}>
        <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
        Speichert…
      </span>
    );
  }
  return state === "dirty" ? (
    <span className={cn("flex items-center gap-2 text-sm font-medium whitespace-nowrap text-foreground", className)}>
      <span className="size-2 rounded-full bg-warning" />
      Ungespeichert
    </span>
  ) : (
    <span className={cn("flex items-center gap-1.5 text-sm whitespace-nowrap text-muted", className)}>
      <Check className="size-4" strokeWidth={1.75} />
      Gespeichert
    </span>
  );
}

export function EditorTopbar({
  pages,
  name,
  title,
  path,
  device,
  saveState,
  canEdit,
  canUndo,
  canRedo,
  previewHref,
  phoneHref,
  phoneAnywhere,
  onUndo,
  onRedo,
  onOpenPanel,
  onDeviceChange,
  onPageSelect,
  onPageCreated,
  onSave,
  onDiscard,
  onLeave,
}: {
  pages: PageSummary[];
  name: string;
  title: string;
  path: string;
  device: string;
  saveState: SaveState;
  canEdit: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** The page in the preview server, for "Vorschau in neuem Tab". */
  previewHref: string | null;
  /** Preview address reachable from other devices in the network. */
  phoneHref: string | null;
  phoneAnywhere: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenPanel: () => void;
  onDeviceChange: (value: string) => void;
  onPageSelect: (name: string) => void;
  onPageCreated: (name: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  /** Back to the page list (asks first when there are unsaved changes). */
  onLeave: () => void;
}) {
  const isMac = useIsMac();
  const mod = isMac ? "⌘" : "Strg+";
  const [phoneOpen, setPhoneOpen] = useState(false);
  const redoKey = isMac ? "⇧⌘Z" : "Strg+Y";
  const dirty = saveState !== "saved";

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:gap-3 sm:px-4 xl:gap-4">
      <Tooltip label="Zurück zu den Seiten">
        {dirty ? (
          <Button variant="ghost" size="icon" aria-label="Zurück zu den Seiten" onClick={onLeave} className="max-sm:hidden">
            <ArrowLeft strokeWidth={1.75} />
          </Button>
        ) : (
          <Link href="/pages" aria-label="Zurück zu den Seiten" className={buttonStyles({ variant: "ghost", size: "icon", className: "max-sm:hidden" })}>
            <ArrowLeft strokeWidth={1.75} />
          </Link>
        )}
      </Tooltip>
      <span className="h-8 w-px shrink-0 bg-border max-sm:hidden" />
      <Tooltip label="Eigenschaften und Blöcke">
        <Button variant="ghost" size="icon" aria-label="Eigenschaften und Blöcke" onClick={onOpenPanel} className="lg:hidden">
          <PanelLeft strokeWidth={1.75} />
        </Button>
      </Tooltip>
      <PagePicker
        pages={pages}
        current={name}
        title={title}
        path={path}
        onSelect={onPageSelect}
        onCreated={onPageCreated}
        canCreate={canEdit}
      />
      {!canEdit && (
        <Badge tone="neutral" className="max-lg:hidden">
          Nur lesen
        </Badge>
      )}
      {canEdit && <SaveStatus state={saveState} className="max-lg:hidden" />}

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
          {previewHref && (
            <Tooltip label="Vorschau in neuem Tab">
              <a
                href={previewHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Vorschau in neuem Tab"
                className={buttonStyles({ variant: "ghost", size: "icon" })}
              >
                <ExternalLink strokeWidth={1.75} />
              </a>
            </Tooltip>
          )}
          {canEdit && (
            <>
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
            </>
          )}
        </div>

        {/* Narrower screens: the same tools in a menu. Discard lives here on all sizes. */}
        <Menu>
          <MenuTrigger
            aria-label={dirty ? "Weitere Aktionen, ungespeicherte Änderungen" : "Weitere Aktionen"}
            className={buttonStyles({ variant: "ghost", size: "icon", className: "relative" })}
          >
            <MoreHorizontal strokeWidth={1.75} />
            {dirty && <span className="absolute top-2 right-2 size-2 rounded-full bg-warning ring-2 ring-surface lg:hidden" />}
          </MenuTrigger>
          <MenuContent className="w-64">
            {canEdit && <SaveStatus state={saveState} className="h-10 px-3 lg:hidden" />}
            {canEdit && (
              <div className="xl:hidden">
                <MenuItem icon={Undo2} disabled={!canUndo} onClick={onUndo} className="data-disabled:opacity-50">
                  Rückgängig
                  <span className="ml-auto text-sm text-muted">{mod}Z</span>
                </MenuItem>
                <MenuItem icon={Redo2} disabled={!canRedo} onClick={onRedo} className="data-disabled:opacity-50">
                  Wiederholen
                  <span className="ml-auto text-sm text-muted">{redoKey}</span>
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={Save} disabled={saveState !== "dirty"} onClick={onSave} className="data-disabled:opacity-50">
                  Speichern
                  <span className="ml-auto text-sm text-muted">{mod}S</span>
                </MenuItem>
              </div>
            )}
            {canEdit && (
              <MenuItem icon={RotateCcw} disabled={saveState !== "dirty"} onClick={onDiscard} className="data-disabled:opacity-50">
                Verwerfen
              </MenuItem>
            )}
            {previewHref && (
              <MenuItem icon={ExternalLink} onClick={() => window.open(previewHref, "_blank", "noopener")}>
                Vorschau in neuem Tab
              </MenuItem>
            )}
            {previewHref && (
              <MenuItem icon={Smartphone} onClick={() => setPhoneOpen(true)}>
                Auf dem Handy ansehen
              </MenuItem>
            )}
            {canEdit && (
              <MenuItem
                icon={RefreshCw}
                onClick={() =>
                  void restartPreview().then((result) =>
                    result.ok ? toast.success("Vorschau wird neu gestartet") : toast.error("Neustart fehlgeschlagen", { description: result.error }),
                  )
                }
              >
                Vorschau neu starten
              </MenuItem>
            )}
            <div className="sm:hidden">
              <MenuSeparator />
              <MenuItem icon={ArrowLeft} onClick={onLeave}>
                Zurück zu den Seiten
              </MenuItem>
            </div>
          </MenuContent>
        </Menu>

        {/* One primary action that follows the state: save first, then publish. */}
        {canEdit &&
          (saveState === "saving" ? (
            <Button disabled className="min-w-36 max-sm:min-w-0 max-sm:px-3 max-sm:text-sm">
              <Loader2 className="animate-spin" />
              Speichert…
            </Button>
          ) : dirty ? (
            <Tooltip label={`Speichern (${mod}S)`}>
              <Button onClick={onSave} className="min-w-36 max-sm:min-w-0 max-sm:px-3 max-sm:text-sm">
                <Save />
                Speichern
              </Button>
            </Tooltip>
          ) : (
            <PublishButton showDone className="min-w-36 max-sm:min-w-0 max-sm:px-3 max-sm:text-sm" />
          ))}
      </div>
      <PhonePreviewDialog open={phoneOpen} onOpenChange={setPhoneOpen} href={phoneHref} anywhere={phoneAnywhere} pageTitle={title} />
    </header>
  );
}
