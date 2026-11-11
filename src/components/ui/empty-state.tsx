import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Centered placeholder for lists and views without content. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 px-6 py-16 text-center", className)}>
      <span className="flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon className="size-7" strokeWidth={1.75} />
      </span>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        {description && <p className="text-[15px] text-muted">{description}</p>}
      </div>
      {action && <div className="mt-2 flex items-center gap-3">{action}</div>}
    </div>
  );
}
