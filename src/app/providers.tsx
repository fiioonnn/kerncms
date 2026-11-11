"use client";

import { TooltipProvider } from "@/components/ui/overlay";
import { ToastProvider } from "@/components/ui/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delay={300}>
      <ToastProvider>{children}</ToastProvider>
    </TooltipProvider>
  );
}
