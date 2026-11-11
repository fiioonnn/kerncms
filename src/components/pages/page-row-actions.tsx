"use client";

import Link from "next/link";
import { useState } from "react";
import { CopyPlus, History, Link2, MoreHorizontal, Pencil, Settings2, Trash2 } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { PageSettingsDialog } from "./page-settings-dialog";

export function PageRowActions({ title, path }: { title: string; path: string }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <Tooltip label="Einstellungen">
        <button
          type="button"
          aria-label={`Einstellungen für ${title}`}
          onClick={() => setSettingsOpen(true)}
          className={buttonStyles({ variant: "ghost", size: "icon" })}
        >
          <Settings2 />
        </button>
      </Tooltip>
      <Menu>
        <Tooltip label="Weitere Aktionen">
          <MenuTrigger
            aria-label={`Aktionen für ${title}`}
            className={buttonStyles({ variant: "ghost", size: "icon", className: "data-popup-open:bg-subtle" })}
          >
            <MoreHorizontal />
          </MenuTrigger>
        </Tooltip>
        <MenuContent>
          <MenuItem icon={Pencil} render={<Link href="/editor" />}>
            Bearbeiten
          </MenuItem>
          <MenuItem icon={Settings2} onClick={() => setSettingsOpen(true)}>
            Einstellungen und SEO
          </MenuItem>
          <MenuItem icon={History} render={<Link href="/history" />}>
            Verlauf
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={CopyPlus} onClick={() => toast.success(`„${title}“ dupliziert`)}>
            Duplizieren
          </MenuItem>
          <MenuItem
            icon={Link2}
            onClick={() => {
              void navigator.clipboard?.writeText(path);
              toast.success("Pfad kopiert", { description: path });
            }}
          >
            Pfad kopieren
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={Trash2} danger onClick={() => setDeleteOpen(true)}>
            Löschen
          </MenuItem>
        </MenuContent>
      </Menu>

      <PageSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} title={title} path={path} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`„${title}“ löschen?`}
        description="Die Seite verschwindet mit der nächsten Veröffentlichung. Über den Verlauf lässt sie sich wiederherstellen."
        confirmLabel="Löschen"
        danger
        onConfirm={() => toast.success(`„${title}“ gelöscht`)}
      />
    </>
  );
}
