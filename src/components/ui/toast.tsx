"use client";

import { Toast } from "@base-ui/react/toast";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** One manager for the whole app, so `toast.*` works from any client component. */
const manager = Toast.createToastManager();

type ToastOptions = { description?: string };

export const toast = {
  success: (title: string, options?: ToastOptions) => manager.add({ title, type: "success", ...options }),
  error: (title: string, options?: ToastOptions) => manager.add({ title, type: "error", ...options }),
  info: (title: string, options?: ToastOptions) => manager.add({ title, type: "info", ...options }),
};

const icons = {
  success: { icon: CircleCheck, className: "text-success" },
  error: { icon: CircleAlert, className: "text-danger" },
  info: { icon: Info, className: "text-accent" },
} as const;

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((item) => {
    const { icon: Icon, className } = icons[(item.type as keyof typeof icons) ?? "info"] ?? icons.info;
    const hasDescription = Boolean(item.description);
    return (
      <Toast.Root
        key={item.id}
        toast={item}
        className={cn(
          "flex w-full gap-3 rounded-2xl border border-border bg-surface py-3 pr-3 pl-4 shadow-popover transition-[translate,opacity] duration-200 ease-out select-none data-ending-style:translate-x-6 data-ending-style:opacity-0 data-starting-style:translate-y-4 data-starting-style:opacity-0",
          hasDescription ? "items-start" : "items-center",
        )}
      >
        <Icon className={cn("size-5 shrink-0", hasDescription && "mt-1.5", className)} strokeWidth={2} />
        <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", hasDescription && "py-1")}>
          <Toast.Title className="text-[15px] leading-snug font-semibold" />
          {hasDescription && <Toast.Description className="text-sm leading-snug text-muted" />}
        </div>
        <Toast.Close
          aria-label="Schließen"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-foreground"
        >
          <X className="size-4" />
        </Toast.Close>
      </Toast.Root>
    );
  });
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider toastManager={manager} timeout={4000} limit={4}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="fixed right-6 bottom-6 z-[60] flex w-[380px] max-w-[calc(100vw-3rem)] flex-col-reverse gap-3 outline-none">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
