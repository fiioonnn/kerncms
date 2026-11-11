"use client";

import { useEffect } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/display";

/** Error boundary for pages inside the app shell; sidebar and topbar stay usable. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest) : undefined;

  return (
    <PageContainer className="flex justify-center py-16">
      <Card className="flex w-full max-w-lg flex-col items-center gap-6 px-8 py-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
          <TriangleAlert className="size-7" strokeWidth={1.75} />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Etwas ist schiefgelaufen</h1>
          <p className="text-[15px] text-muted">
            Diese Seite konnte nicht geladen werden. Deine Inhalte sind sicher, es wurde nichts gespeichert oder gelöscht.
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => retry()}>
            <RotateCw />
            Erneut versuchen
          </Button>
          <Link href="/" className={buttonStyles({ variant: "secondary" })}>
            Zur Übersicht
          </Link>
        </div>
        {digest && (
          <p className="text-sm text-muted">
            Fehler-ID für den Support: <code className="font-mono">{digest}</code>
          </p>
        )}
      </Card>
    </PageContainer>
  );
}
