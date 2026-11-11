import { Button as BaseButton } from "@base-ui/react/button";
import { cn } from "@/lib/utils";

export function Button({ className, ...props }: BaseButton.Props) {
  return (
    <BaseButton
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
