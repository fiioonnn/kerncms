import { Field as BaseField } from "@base-ui/react/field";
import { Input as BaseInput } from "@base-ui/react/input";
import { cn } from "@/lib/utils";

const controlStyles =
  "w-full rounded-xl border border-border-strong bg-surface px-4 text-[15px] text-foreground transition-colors outline-none placeholder:text-muted hover:border-muted/60 focus:border-accent focus:ring-4 focus:ring-accent/15 disabled:opacity-50";

export function Field({
  className,
  ...props
}: Omit<BaseField.Root.Props, "className"> & { className?: string }) {
  return (
    <BaseField.Root
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: Omit<BaseField.Label.Props, "className"> & { className?: string }) {
  return (
    <BaseField.Label
      className={cn("text-[15px] font-medium text-foreground", className)}
      {...props}
    />
  );
}

export function Description({
  className,
  ...props
}: Omit<BaseField.Description.Props, "className"> & { className?: string }) {
  return (
    <BaseField.Description
      className={cn("text-sm text-muted", className)}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: Omit<BaseInput.Props, "className"> & { className?: string }) {
  return <BaseInput className={cn(controlStyles, "h-11", className)} {...props} />;
}

export function Textarea({
  className,
  rows = 4,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      rows={rows}
      className={cn(controlStyles, "resize-y py-3 leading-relaxed", className)}
      {...props}
    />
  );
}
