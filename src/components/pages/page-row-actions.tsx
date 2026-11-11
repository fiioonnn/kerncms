"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CopyPlus, ExternalLink, History, Link2, MoreHorizontal, Pencil, Settings2, Trash2 } from "lucide-react";
import { useCan, useKern } from "@/components/kern/kern-provider";
import { buttonStyles } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import type { PageSeo } from "@/lib/kern-types";
import { deletePage, duplicatePage } from "@/server/actions/content";
import { PageSettingsDialog } from "./page-settings-dialog";

export type PageRowData = { name: string; title: string; path: string; file: string; seo: PageSeo };

export function liveUrlFor(liveUrl: string | null, path: string) {
  if (!liveUrl) return null;
  return liveUrl.replace(/\/+$/, "") + (path === "/" ? "/" : path);
}

export function PageRowActions({ page }: { page: PageRowData }) {
  const { site } = useKern();
  const canEdit = useCan("editor");
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const editorHref = `/editor?page=${encodeURIComponent(page.name)}`;
  const liveUrl = liveUrlFor(site.liveUrl, page.path);
  const isHome = page.path === "/";

  function duplicate() {
    startTransition(async () => {
      const result = await duplicatePage(page.name);
      if (!result.ok) return void toast.error("Duplizieren fehlgeschlagen", { description: result.error });
      toast.success(`„${page.title}“ dupliziert`, { description: "Die Kopie liegt im Entwurf." });
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deletePage(page.name);
      if (!result.ok) return void toast.error("Löschen fehlgeschlagen", { description: result.error });
      toast.success(`„${page.title}“ gelöscht`, { description: "Du findest die Seite 30 Tage lang im Papierkorb." });
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1">
      {canEdit && (
        <Link href={editorHref} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          Bearbeiten
        </Link>
      )}
      {canEdit && (
        <Tooltip label="Einstellungen">
          <button
            type="button"
            aria-label={`Einstellungen für ${page.title}`}
            onClick={() => setSettingsOpen(true)}
            className={buttonStyles({ variant: "ghost", size: "icon" })}
          >
            <Settings2 />
          </button>
        </Tooltip>
      )}
      <Menu>
        <Tooltip label="Weitere Aktionen">
          <MenuTrigger
            aria-label={`Aktionen für ${page.title}`}
            disabled={pending}
            className={buttonStyles({ variant: "ghost", size: "icon", className: "data-popup-open:bg-subtle" })}
          >
            <MoreHorizontal />
          </MenuTrigger>
        </Tooltip>
        <MenuContent>
          {canEdit && (
            <>
              <MenuItem icon={Pencil} render={<Link href={editorHref} />}>
                Bearbeiten
              </MenuItem>
              <MenuItem icon={Settings2} onClick={() => setSettingsOpen(true)}>
                Einstellungen und SEO
              </MenuItem>
            </>
          )}
          <MenuItem icon={History} render={<Link href={`/history?file=${encodeURIComponent(page.file)}`} />}>
            Verlauf
          </MenuItem>
          <MenuSeparator />
          {canEdit && (
            <MenuItem icon={CopyPlus} onClick={duplicate}>
              Duplizieren
            </MenuItem>
          )}
          <MenuItem
            icon={Link2}
            onClick={() => {
              void navigator.clipboard?.writeText(page.path);
              toast.success("Pfad kopiert", { description: page.path });
            }}
          >
            Pfad kopieren
          </MenuItem>
          {liveUrl && (
            <MenuItem icon={ExternalLink} render={<a href={liveUrl} target="_blank" rel="noreferrer" />}>
              Live ansehen
            </MenuItem>
          )}
          {canEdit && !isHome && (
            <>
              <MenuSeparator />
              <MenuItem icon={Trash2} danger onClick={() => setDeleteOpen(true)}>
                Löschen
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>

      {canEdit && <PageSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} page={page} />}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`„${page.title}“ löschen?`}
        description="Die Seite wandert in den Papierkorb und verschwindet mit der nächsten Veröffentlichung von der Website. 30 Tage lang lässt sie sich wiederherstellen."
        confirmLabel="Löschen"
        danger
        onConfirm={remove}
      />
    </div>
  );
}
