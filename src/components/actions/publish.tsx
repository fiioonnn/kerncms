"use client";

import { buttonStyles, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

/** "Veröffentlichen" with a confirmation step and a success toast. UI only. */
export function PublishButton({
  label = "Veröffentlichen",
  changes = 3,
  variant = "primary",
  size = "md",
  className,
}: {
  label?: string;
  changes?: number;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return (
    <ConfirmDialog
      trigger={label}
      triggerClassName={buttonStyles({ variant, size, className })}
      title={`${changes} Änderungen veröffentlichen?`}
      description="Die Änderungen werden in das Repository übernommen und die Website wird neu gebaut. Das dauert meist unter einer Minute."
      confirmLabel="Jetzt veröffentlichen"
      onConfirm={() =>
        toast.success("Veröffentlicht", { description: "Die Website wird gerade neu gebaut." })
      }
    />
  );
}

export function DiscardButton({ className }: { className?: string }) {
  return (
    <ConfirmDialog
      trigger="Verwerfen"
      triggerClassName={buttonStyles({ variant: "secondary", className })}
      title="Alle Änderungen verwerfen?"
      description="Der Entwurf wird auf den veröffentlichten Stand zurückgesetzt. Das lässt sich nicht rückgängig machen."
      confirmLabel="Verwerfen"
      danger
      onConfirm={() => toast.info("Änderungen verworfen")}
    />
  );
}
