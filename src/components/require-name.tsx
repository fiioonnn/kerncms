"use client";

import { useState } from "react";
import { useSession, authClient } from "@/lib/auth-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function RequireName() {
  const { data: session } = useSession();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const needsName = session?.user && !session.user.name?.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await authClient.updateUser({ name: name.trim() });
    setSaving(false);
    if (error) {
      toast.error("Failed to save name");
      return;
    }
  }

  if (!needsName) return null;

  return (
    <Dialog open>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Set your display name</DialogTitle>
          <DialogDescription>
            Please enter your name to continue. This will be visible to other team members.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="h-10"
          />
          <Button type="submit" disabled={!name.trim() || saving} className="h-10">
            {saving ? "Saving..." : "Continue"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
