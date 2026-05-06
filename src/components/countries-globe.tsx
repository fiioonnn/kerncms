"use client";

import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export type CountryPoint = {
  country: string;
  lat: number;
  lng: number;
  visitors: number;
};

export function CountriesPanel({ countries }: { countries: CountryPoint[] }) {
  const total = countries.reduce((s, c) => s + c.visitors, 0);
  const list = countries.slice(0, 5).map((c, i) => ({
    key: c.country,
    label: countryName(c.country),
    visitors: c.visitors,
    chartKey: `s${i}`,
    share: total > 0 ? Math.round((c.visitors / total) * 100) : 0,
    color: `var(--chart-${(i % 5) + 1})`,
  }));

  const chartConfig: ChartConfig = Object.fromEntries(
    list.map((r) => [r.chartKey, { label: r.label, color: r.color }]),
  );

  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Countries
      </span>
      {list.length === 0 ? (
        <div className="flex flex-1 items-center justify-center min-h-[144px] text-xs text-muted-foreground">
          No data yet
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <ChartContainer config={chartConfig} className="aspect-square h-32">
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          {chartConfig[name as string]?.label ?? name}
                        </span>
                        <span className="font-medium tabular-nums">{value}%</span>
                      </div>
                    )}
                  />
                }
              />
              <Pie
                data={list}
                dataKey="share"
                nameKey="chartKey"
                innerRadius={36}
                outerRadius={56}
                strokeWidth={2}
                paddingAngle={2}
                isAnimationActive
                animationDuration={800}
                animationEasing="ease-out"
              >
                {list.map((s) => (
                  <Cell key={s.chartKey} fill={s.color} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="flex w-full flex-col gap-1.5">
            {list.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: row.color }} />
                  <span className="truncate">{row.label}</span>
                </div>
                <span className="font-medium tabular-nums">{row.share}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", DE: "Germany", FR: "France", GB: "United Kingdom",
  IT: "Italy", ES: "Spain", NL: "Netherlands", AT: "Austria", CH: "Switzerland",
  BE: "Belgium", SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland",
  PL: "Poland", CZ: "Czechia", PT: "Portugal", IE: "Ireland", GR: "Greece",
  RO: "Romania", HU: "Hungary", CA: "Canada", MX: "Mexico", BR: "Brazil",
  AR: "Argentina", CL: "Chile", JP: "Japan", CN: "China", KR: "South Korea",
  IN: "India", AU: "Australia", NZ: "New Zealand", ZA: "South Africa",
  EG: "Egypt", TR: "Turkey", RU: "Russia", UA: "Ukraine", IL: "Israel",
  SA: "Saudi Arabia", AE: "United Arab Emirates", SG: "Singapore",
  HK: "Hong Kong", TW: "Taiwan", TH: "Thailand", VN: "Vietnam",
  ID: "Indonesia", PH: "Philippines", MY: "Malaysia",
};

function countryName(code: string): string {
  if (!code) return "Unknown";
  return COUNTRY_NAMES[code] ?? code;
}
