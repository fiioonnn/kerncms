"use client";

import { buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

const repos = [
  { label: "baeckerei-mueller/website", value: "baeckerei-mueller/website" },
  { label: "baeckerei-mueller/website-relaunch", value: "baeckerei-mueller/website-relaunch" },
];

export function RepoChangeButton() {
  return (
    <Dialog>
      <DialogTrigger className={buttonStyles({ variant: "secondary", size: "sm", className: "ml-auto" })}>
        Ändern
      </DialogTrigger>
      <DialogContent
        title="Repository ändern"
        description="Nur Repositories, auf die die kerncms GitHub App Zugriff hat."
        size="sm"
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
            <DialogClose className={buttonStyles()} onClick={() => toast.success("Repository verbunden")}>
              Verbinden
            </DialogClose>
          </>
        }
      >
        <Select label="Repository" items={repos} defaultValue="baeckerei-mueller/website" />
      </DialogContent>
    </Dialog>
  );
}
