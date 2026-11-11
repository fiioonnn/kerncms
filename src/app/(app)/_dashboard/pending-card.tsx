"use client";

import Link from "next/link";
import { DiscardButton, PendingList, PublishButton } from "@/components/actions/publish";
import { pendingFiles, useStatus } from "@/components/history/use-status";
import { Card, CardContent, CardHeader } from "@/components/ui/display";
import { Skeleton } from "@/components/ui/skeleton";

/** Dashboard card: files waiting to go live, with the publish flow. */
export function PendingCard({ initialCount }: { initialCount: number }) {
  const status = useStatus();
  const files = pendingFiles(status);
  const count = status ? files.length : initialCount;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Offene Änderungen"
        description={count === 0 ? "Alles ist veröffentlicht" : count === 1 ? "1 Datei noch nicht live" : `${count} Dateien noch nicht live`}
        action={
          <Link href="/history" className="text-sm font-medium text-accent hover:underline">
            Verlauf
          </Link>
        }
      />
      <CardContent className="flex flex-1 flex-col gap-4">
        {status === null ? <Skeleton className="h-24 w-full rounded-xl" /> : <PendingList files={files} max={5} />}
        {count > 0 && (
          <div className="mt-auto flex gap-3 pt-2">
            <PublishButton className="flex-1" />
            <DiscardButton />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
