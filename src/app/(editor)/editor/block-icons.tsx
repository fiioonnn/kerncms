import { createElement } from "react";
import {
  Box,
  CalendarDays,
  ChartNoAxesColumn,
  CircleHelp,
  Clock,
  Images,
  LayoutGrid,
  LayoutTemplate,
  Mail,
  MapPin,
  Megaphone,
  Newspaper,
  PanelsLeftBottom,
  Quote,
  ShoppingBasket,
  Sparkles,
  Text,
  Users,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

/** lucide names used in kern.config.yaml → components. Unknown names fall back to a box. */
const icons: Record<string, LucideIcon> = {
  "layout-template": LayoutTemplate,
  text: Text,
  "panels-left-bottom": PanelsLeftBottom,
  images: Images,
  quote: Quote,
  "layout-grid": LayoutGrid,
  sparkles: Sparkles,
  "chart-no-axes-column": ChartNoAxesColumn,
  "circle-help": CircleHelp,
  "shopping-basket": ShoppingBasket,
  megaphone: Megaphone,
  clock: Clock,
  users: Users,
  newspaper: Newspaper,
  "calendar-days": CalendarDays,
  mail: Mail,
  "map-pin": MapPin,
};

export function blockIcon(name: string | undefined): LucideIcon {
  return (name && icons[name]) || Box;
}

/** Renders the lucide icon for a name from kern.config.yaml. */
export function BlockIcon({ name, ...props }: { name: string | undefined } & LucideProps) {
  return createElement(blockIcon(name), props);
}
