"use client";

import { BarList, type BarListItem } from "@/components/charts/bar-list";
import { Card } from "@/components/ui/display";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";

export type BreakdownTab = { key: string; label: string; items: BarListItem[]; valueLabel: string };

/** One card, several rankings: a heading with small tabs on the right and the chosen BarList below. */
export function BreakdownCard({ title, tabs }: { title: string; tabs: BreakdownTab[] }) {
  return (
    <Card>
      <Tabs defaultValue={tabs[0].key}>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-border px-6 pt-4">
          <h2 className="pb-3 text-lg font-semibold tracking-tight">{title}</h2>
          {tabs.length > 1 && (
            <TabsList className="border-b-0">
              {tabs.map((tab) => (
                <Tab key={tab.key} value={tab.key} className="h-11 px-3 text-sm">
                  {tab.label}
                </Tab>
              ))}
            </TabsList>
          )}
        </div>
        {tabs.map((tab) => (
          <TabPanel key={tab.key} value={tab.key} className="px-6 pt-4 pb-6">
            <BarList items={tab.items} valueLabel={tab.valueLabel} />
          </TabPanel>
        ))}
      </Tabs>
    </Card>
  );
}
