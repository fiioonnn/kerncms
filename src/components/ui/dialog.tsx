"use client";

import { useRef } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const backdrop =
  "fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0";
const popup =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-4rem)] w-full max-w-[calc(100vw-2rem)] -translate-1/2 flex-col rounded-2xl border border-border bg-surface shadow-popover outline-none transition-[scale,opacity] duration-150 data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";

/** First text field / select in the dialog body; dialogs without one fall back to Base UI's default. */
const firstFieldSelector = [
  "input:not([type=hidden]):not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable=true]",
  "[role=combobox]:not([data-disabled])",
].join(",");

/* ---------- Dialog ---------- */

export const Dialog = BaseDialog.Root;
export const DialogClose = BaseDialog.Close;

export function DialogTrigger({
  className,
  ...props
}: Omit<BaseDialog.Trigger.Props, "className"> & { className?: string }) {
  return <BaseDialog.Trigger className={className} {...props} />;
}

export function DialogContent({
  title,
  description,
  children,
  footer,
  size = "md",
  initialFocus,
  className,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Override where focus goes on open. By default: the first field in the body, else the first button. */
  initialFocus?: BaseDialog.Popup.Props["initialFocus"];
  className?: string;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className={backdrop} />
      <BaseDialog.Popup
        initialFocus={
          initialFocus ??
          ((openType) =>
            openType === "touch" ? true : (bodyRef.current?.querySelector<HTMLElement>(firstFieldSelector) ?? true))
        }
        className={cn(
          popup,
          size === "sm" && "sm:max-w-md",
          size === "md" && "sm:max-w-lg",
          size === "lg" && "sm:max-w-2xl",
          size === "xl" && "sm:max-w-4xl",
          className,
        )}
      >
        <div className={cn("flex items-start justify-between gap-6 px-6 pt-5", !children && "pb-5")}>
          <div className="flex flex-col gap-1">
            <BaseDialog.Title className="text-xl font-semibold tracking-tight">{title}</BaseDialog.Title>
            {description && (
              <BaseDialog.Description className="text-[15px] text-muted">{description}</BaseDialog.Description>
            )}
          </div>
          <BaseDialog.Close
            aria-label="Schließen"
            className={buttonStyles({ variant: "ghost", size: "icon", className: "-mt-1 -mr-3 size-10" })}
          >
            <X strokeWidth={1.75} aria-hidden />
          </BaseDialog.Close>
        </div>
        {children && (
          <div ref={bodyRef} className="overflow-y-auto px-6 py-5">
            {children}
          </div>
        )}
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-6 py-4">{footer}</div>
        )}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

/* ---------- Confirm (alert dialog) ---------- */

export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  triggerClassName,
  title,
  description,
  confirmLabel,
  cancelLabel = "Abbrechen",
  danger,
  onConfirm,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  triggerClassName?: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialog.Trigger className={triggerClassName}>{trigger}</AlertDialog.Trigger>}
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={backdrop} />
        <AlertDialog.Popup className={cn(popup, "gap-5 p-6 sm:max-w-md")}>
          <div className="flex flex-col gap-2">
            <AlertDialog.Title className="text-xl font-semibold tracking-tight">{title}</AlertDialog.Title>
            <AlertDialog.Description className="text-[15px] text-muted">{description}</AlertDialog.Description>
          </div>
          <div className="flex justify-end gap-3">
            <AlertDialog.Close className={buttonStyles({ variant: "secondary" })}>{cancelLabel}</AlertDialog.Close>
            <AlertDialog.Close
              className={buttonStyles({ variant: danger ? "danger" : "primary" })}
              onClick={onConfirm}
            >
              {confirmLabel}
            </AlertDialog.Close>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
