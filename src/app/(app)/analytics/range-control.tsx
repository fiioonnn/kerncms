"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
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
