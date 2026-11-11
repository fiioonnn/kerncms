"use client";

import { Loader2 } from "lucide-react";
import { buttonStyles, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { startDeploy, useDeploy } from "@/lib/deploy-store";

/** "Veröffentlichen" with a confirmation step; starts the (simulated) build. */
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
  const deploy = useDeploy();

  if (deploy.status === "running") {
    return (
      <button type="button" disabled className={buttonStyles({ variant, size, className: `${className ?? ""} disabled:opacity-70` })}>
        <Loader2 className="animate-spin" />
        Wird veröffentlicht…
      </button>
    );
  }

  return (
    <ConfirmDialog
      trigger={label}
      triggerClassName={buttonStyles({ variant, size, className })}
      title={`${changes} ${changes === 1 ? "Änderung" : "Änderungen"} veröffentlichen?`}
      description="Die Änderungen werden in das Repository übernommen und die Website wird neu gebaut. Das dauert meist unter einer Minute."
      confirmLabel="Jetzt veröffentlichen"
      onConfirm={() => startDeploy(changes)}
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
