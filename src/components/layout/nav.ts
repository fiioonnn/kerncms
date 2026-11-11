import {
  BadgeCheck,
  ChartLine,
  FileText,
  Globe,
  History,
  Image,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Library,
  MousePointerClick,
  Newspaper,
  Palette,
  Settings,
  Trash2,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * `badge`: open items (unread, pending); shown as a count in the sidebar.
 * `parent`: for pages that are not in the sidebar, the sidebar entry to highlight.
 */
export type NavItem = { label: string; href: string; icon: LucideIcon; badge?: number; parent?: string };
export type NavGroup = { label?: string; items: NavItem[] };

/** What the sidebar shows. Kept short on purpose: daily work first. */
export const navigation: NavGroup[] = [
  {
    items: [
      { label: "Übersicht", href: "/", icon: LayoutDashboard },
      { label: "Seiten", href: "/pages", icon: FileText },
      { label: "Inhalte", href: "/collections", icon: Library },
      { label: "Medien", href: "/media", icon: Image },
      { label: "Formulare", href: "/forms", icon: Inbox, badge: 3 },
      { label: "Statistiken", href: "/analytics", icon: ChartLine },
    ],
  },
  {
    label: "Website",
    items: [
      { label: "Globals", href: "/globals", icon: Globe },
      { label: "Freigaben", href: "/approvals", icon: BadgeCheck, badge: 2 },
      { label: "Verlauf", href: "/history", icon: History },
    ],
  },
];

/** Reachable via buttons and the user menu; not listed in the sidebar. */
export const secondaryItems: NavItem[] = [
  { label: "Beiträge", href: "/posts", icon: Newspaper, parent: "/collections" },
  { label: "Visueller Editor", href: "/editor", icon: MousePointerClick, parent: "/pages" },
  { label: "Team", href: "/team", icon: Users },
  { label: "Einstellungen", href: "/settings", icon: Settings },
  { label: "Papierkorb", href: "/trash", icon: Trash2 },
  { label: "Styleguide", href: "/styleguide", icon: Palette },
  { label: "Alle Websites", href: "/sites", icon: LayoutGrid },
  { label: "Profil", href: "/profile", icon: UserRound },
];

export const allNavItems = [...navigation.flatMap((group) => group.items), ...secondaryItems];

export function findNavItem(pathname: string) {
  return (
    allNavItems.find((item) => item.href === pathname) ??
    allNavItems
      .filter((item) => item.href !== "/" && pathname.startsWith(item.href))
      .sort((a, b) => b.href.length - a.href.length)[0]
  );
}
