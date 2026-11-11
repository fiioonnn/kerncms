import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* Building blocks for the settings page: sections made of label/control rows. */

export function SettingsSection({
  title,
  description,
  action,
  tone,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-surface shadow-card",
        tone === "danger" ? "border-danger/30" : "border-border",
      )}
    >
      <header
        className={cn(
          "flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b px-6 py-5",
          tone === "danger" ? "border-danger/20 bg-danger-soft/40" : "border-border",
        )}
      >
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <h2 className={cn("text-lg font-semibold tracking-tight", tone === "danger" && "text-danger")}>{title}</h2>
          {description && <p className="text-[15px] text-muted">{description}</p>}
        </div>
        {action}
      </header>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

/**
 * One setting: label and explanation on the left, the control on the right.
 * `stacked` puts wide controls (tables, code) below the label.
 */
export function SettingsRow({
  label,
  description,
  icon: Icon,
  htmlFor,
  stacked,
  compact,
  children,
}: {
  label: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  htmlFor?: string;
  stacked?: boolean;
  /** Small control (a button): text takes the width, the control sits at the end. */
  compact?: boolean;
  children: React.ReactNode;
}) {
  const LabelTag = htmlFor ? "label" : "span";
  return (
    <div
      className={cn(
        "flex flex-col gap-4 px-6 py-5",
        compact && "md:flex-row md:items-center md:justify-between md:gap-10",
        !stacked && !compact && "md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-center md:gap-10",
      )}
    >
      <div className="flex min-w-0 items-start gap-4">
        {Icon && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
            <Icon className="size-5" strokeWidth={1.75} />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <LabelTag {...(htmlFor ? { htmlFor } : {})} className="text-[15px] font-medium">
            {label}
          </LabelTag>
          {description && <span className="text-sm leading-relaxed text-muted">{description}</span>}
        </div>
      </div>
      <div className={compact ? "shrink-0" : "min-w-0"}>{children}</div>
    </div>
  );
}
