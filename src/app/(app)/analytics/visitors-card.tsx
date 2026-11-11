"use client";

import { useState } from "react";
import { VisitorsChart, type DailyPoint } from "@/components/charts/visitors-chart";
import { Card, CardContent, CardHeader } from "@/components/ui/display";
import { SegmentedControl } from "@/components/ui/overlay";

const ranges = [
  { value: "7", label: "7 Tage" },
  { value: "14", label: "14 Tage" },
  { value: "30", label: "30 Tage" },
];

export function VisitorsCard({ data }: { data: DailyPoint[] }) {
  const [range, setRange] = useState("30");
  const days = Number(range);
  const visible = data.slice(-days);

  return (
    <Card className="mt-8">
      <CardHeader
        title="Besucher pro Tag"
        description={`Letzte ${days} Tage, eindeutige Besucher je Tag`}
        action={<SegmentedControl label="Zeitraum" items={ranges} value={range} onValueChange={setRange} />}
      />
      <CardContent className="pt-8">
        <VisitorsChart data={visible} label={`Besucher pro Tag, letzte ${days} Tage`} />
      </CardContent>
    </Card>
  );
}
