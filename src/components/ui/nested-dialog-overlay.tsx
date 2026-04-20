"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export function NestedDialogOverlay({
  open,
  onClose,
  zIndex = 55,
}: {
  open: boolean;
  onClose: () => void;
  zIndex?: number;
}) {
  useEffect(() => {
    if (!open) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
      style={{ zIndex }}
      onClick={onClose}
    />,
    document.body
  );
}
