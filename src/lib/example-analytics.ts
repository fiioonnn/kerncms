import type { DailyPoint } from "@/components/charts/visitors-chart";

/* Example data for the UI until real tracking exists. */

export const dailyVisitors: DailyPoint[] = [
  132, 148, 141, 120, 96, 88, 139, 151, 162, 158, 149, 110, 102, 155, 171, 168, 176, 160, 121, 115, 182, 190, 186,
  201, 194, 138, 129, 205, 214, 221,
].map((value, i) => ({
  date: new Date(Date.UTC(2026, 9, 13 + i)).toISOString().slice(0, 10),
  value,
}));

export const analyticsKpis = [
  { label: "Besucher", value: "4.812", delta: "+12 %", up: true },
  { label: "Seitenaufrufe", value: "13.540", delta: "+8 %", up: true },
  { label: "Ø Besuchsdauer", value: "1:48 min", delta: "+6 %", up: true },
  { label: "Absprungrate", value: "41 %", delta: "−3 Pkt.", up: true },
];

export const topPages = [
  { label: "Startseite", hint: "/", value: 5210 },
  { label: "Sortiment", hint: "/sortiment", value: 2980 },
  { label: "Neue Sauerteigbrote ab Mai", hint: "/aktuelles/…", value: 1640 },
  { label: "Kontakt", hint: "/kontakt", value: 1230 },
  { label: "Catering", hint: "/catering", value: 880 },
];
