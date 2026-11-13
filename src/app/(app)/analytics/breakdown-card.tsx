"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { BarList, type BarListItem } from "@/components/charts/bar-list";
import { Card } from "@/components/ui/display";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";

export type BreakdownTab = { key: string; label: string; items: BarListItem[]; valueLabel: string };

const VISIBLE = 5;

/** Top entries first; the rest behind "Alle anzeigen" so the card stays short. */
function ShortList({ tab }: { tab: BreakdownTab }) {
  const [open, setOpen] = useState(false);
  const more = tab.items.length - VISIBLE;
  return (
    <div className="flex flex-col gap-2">
      <BarList items={open ? tab.items : tab.items.slice(0, VISIBLE)} valueLabel={tab.valueLabel} />
      {more > 0 && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex h-9 items-center gap-1.5 self-start rounded-lg px-2 text-sm font-medium text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronDown className={open ? "size-4 rotate-180" : "size-4"} />
          {open ? "Weniger anzeigen" : `Alle anzeigen (${more} weitere)`}
        </button>
      )}
    </div>
  );
}

/** One question per card ("Woher kommen die Besucher?"), optional small tabs for other views of it. */
export function BreakdownCard({ title, tabs }: { title: string; tabs: BreakdownTab[] }) {
  const shown = tabs.filter((tab, i) => i === 0 || tab.items.length > 0);
  return (
    <Card>
      <Tabs defaultValue={shown[0].key}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 pt-3">
          <h2 className="py-2 text-base font-semibold">{title}</h2>
          {shown.length > 1 && (
            <TabsList className="border-b-0">
              {shown.map((tab) => (
                <Tab key={tab.key} value={tab.key} className="h-10 px-2.5 text-sm">
                  {tab.label}
                </Tab>
              ))}
            </TabsList>
          )}
        </div>
        {shown.map((tab) => (
          <TabPanel key={tab.key} value={tab.key} className="px-5 pt-1 pb-4">
            <ShortList tab={tab} />
          </TabPanel>
        ))}
      </Tabs>
    </Card>
  );
}
