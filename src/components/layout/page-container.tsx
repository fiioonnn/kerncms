import { cn } from "@/lib/utils";

/** Standard content width and padding for every page inside the app shell. */
export function PageContainer({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-6xl px-10 py-12", className)} {...props} />;
}
