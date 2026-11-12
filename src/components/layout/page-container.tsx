import { cn } from "@/lib/utils";

/** Standard content width and padding for every page inside the app shell. */
export function PageContainer({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8", className)} {...props} />;
}
