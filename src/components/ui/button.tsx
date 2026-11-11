import { Button as BaseButton } from "@base-ui/react/button";
import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-accent text-accent-foreground hover:bg-accent-hover shadow-card",
  secondary:
    "border border-border-strong bg-surface text-foreground hover:bg-subtle",
  ghost: "text-foreground hover:bg-subtle",
  danger: "bg-danger text-white hover:bg-danger/90 shadow-card",
} as const;

const sizes = {
  sm: "h-9 gap-2 rounded-lg px-3.5 text-sm",
  md: "h-11 gap-2.5 rounded-xl px-5 text-[15px]",
  lg: "h-12 gap-3 rounded-xl px-6 text-base",
  icon: "size-11 rounded-xl",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

/** Class names for anything that should look like a button (e.g. a Link). */
export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors select-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: Omit<BaseButton.Props, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return (
    <BaseButton
      className={buttonStyles({ variant, size, className })}
      {...props}
    />
  );
}
