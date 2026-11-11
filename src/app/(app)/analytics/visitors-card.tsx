"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { VisitorsChart, type DailyPoint } from "@/components/charts/visitors-chart";
import { Card, CardContent, CardHeader } from "@/components/ui/display";
import { SegmentedControl } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

const ranges = [
  { value: "7", label: "7 Tage" },
  { value: "30", label: "30 Tage" },
  { value: "90", label: "90 Tage" },
];

/** Range switch that keeps the choice in the URL (?days=30). */
export function RangeControl({ days }: { days: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  return (
    <SegmentedControl
      label="Zeitraum"
      items={ranges}
      value={String(days)}
      className={cn(pending && "opacity-70")}
      onValueChange={(value) => {
        const next = new URLSearchParams(params);
        next.set("days", value);
        startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
      }}
    />
  );
}

export function VisitorsCard({ data, days }: { data: DailyPoint[]; days: number }) {
  return (
    <Card className="mt-6">
      <CardHeader title="Besucher pro Tag" description={`Letzte ${days} Tage, eindeutige Besucher je Tag`} />
      <CardContent className="pt-4">
        <VisitorsChart data={data} label={`Besucher pro Tag, letzte ${days} Tage`} />
      </CardContent>
    </Card>
  );
}
