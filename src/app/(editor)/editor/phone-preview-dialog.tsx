"use client";

import { useEffect, useState } from "react";
import { Link2, Smartphone, Wifi } from "lucide-react";
import QRCode from "qrcode";
import { CopyButton } from "@/components/actions/common";
import { buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";

/** QR code that opens the current preview page on a phone (public preview address, or same network). */
export function PhonePreviewDialog({
  open,
  onOpenChange,
  href,
  anywhere,
  pageTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** LAN address of the preview incl. path, or null when it isn't reachable from other devices. */
  href: string | null;
  /** The address works from any network (public preview domain), not only the same Wi-Fi. */
  anywhere: boolean;
  pageTitle: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !href) return;
    let cancelled = false;
    QRCode.toString(href, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#18181b", light: "#ffffff" } })
      .then((markup) => !cancelled && setSvg(markup))
      .catch(() => !cancelled && setSvg(null));
    return () => {
      cancelled = true;
    };
  }, [open, href]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Auf dem Handy ansehen"
        description={href ? `Scanne den Code mit der Kamera, um „${pageTitle}“ im Entwurf zu öffnen.` : undefined}
        size="sm"
        footer={<DialogClose className={buttonStyles({ variant: "secondary" })}>Schließen</DialogClose>}
      >
        {href ? (
          <div className="flex flex-col items-center gap-5">
            <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
              {svg ? (
                // The SVG comes from the qrcode library, not from user input.
                <div className="size-56 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
              ) : (
                <div className="size-56 animate-pulse rounded-lg bg-subtle" />
              )}
            </div>
            <div className="flex w-full items-center gap-2 rounded-xl border border-border bg-subtle/60 py-1.5 pr-1.5 pl-4">
              <span className="min-w-0 flex-1 truncate font-mono text-sm">{href}</span>
              <CopyButton value={href} />
            </div>
            {anywhere ? (
              <p className="flex items-start gap-2.5 text-sm text-muted">
                <Link2 className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                Funktioniert in jedem Netz, solange die Vorschau hier läuft. Zeigt den aktuellen Entwurf, auch ungespeicherte
                Änderungen. Teile den Link nur mit Leuten, die den Entwurf sehen dürfen.
              </p>
            ) : (
              <p className="flex items-start gap-2.5 text-sm text-muted">
                <Wifi className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                Das Handy muss im selben WLAN sein wie dieser Rechner. Es zeigt den aktuellen Entwurf, auch ungespeicherte Änderungen.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-subtle text-muted">
              <Smartphone className="size-6" strokeWidth={1.75} />
            </span>
            <p className="text-[15px] text-muted">
              Die Vorschau ist von anderen Geräten aus nicht erreichbar. Entweder hat dieser Rechner keine Netzwerkadresse, oder die
              Vorschau wurde vor dem Update gestartet. Starte sie über „Vorschau neu starten“ neu.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
