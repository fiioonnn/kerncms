import {
  ChartLine,
  FileText,
  Globe,
  History,
  Image,
  LayoutDashboard,
  MousePointerClick,
  Newspaper,
  Palette,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

export const navigation: NavGroup[] = [
  {
    label: "Inhalte",
    items: [
      { label: "Übersicht", href: "/", icon: LayoutDashboard },
      { label: "Seiten", href: "/pages", icon: FileText },
      { label: "Beiträge", href: "/posts", icon: Newspaper },
      { label: "Globals", href: "/globals", icon: Globe },
      { label: "Medien", href: "/media", icon: Image },
    ],
  },
  {
    label: "Website",
    items: [
      { label: "Visueller Editor", href: "/editor", icon: MousePointerClick },
      { label: "Statistiken", href: "/analytics", icon: ChartLine },
      { label: "Verlauf", href: "/history", icon: History },
    ],
  },
  {
    label: "Verwaltung",
    items: [
      { label: "Team", href: "/team", icon: Users },
      { label: "Einstellungen", href: "/settings", icon: Settings },
      { label: "Styleguide", href: "/styleguide", icon: Palette },
    ],
  },
];

export function findNavItem(pathname: string) {
  const items = navigation.flatMap((group) => group.items);
  return (
    items.find((item) => item.href === pathname) ??
    items
      .filter((item) => item.href !== "/" && pathname.startsWith(item.href))
      .sort((a, b) => b.href.length - a.href.length)[0]
  );
}
