import { cn } from "@/lib/utils";

/** Standard content width and padding for every page inside the app shell. */
export function PageContainer({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-7xl px-8 py-8", className)} {...props} />;
}
