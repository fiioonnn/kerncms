import { PageContainer } from "@/components/layout/page-container";
import { Card } from "@/components/ui/display";
import { Skeleton } from "@/components/ui/skeleton";

/** Shown inside the app shell while a page loads. */
export default function AppLoading() {
  return (
    <PageContainer>
      <span className="sr-only" role="status">
        Wird geladen…
      </span>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-11 w-36 rounded-xl" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="flex flex-col gap-3 p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-20" />
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <div className="h-11 border-b border-border bg-subtle/60" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex h-14 items-center gap-6 border-b border-border px-6 last:border-0">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/6" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </Card>
    </PageContainer>
  );
}
