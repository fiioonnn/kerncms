"use client";

import { useEffect } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageError } from "@/components/layout/page-error";

/** Error boundary for pages inside the app shell; sidebar and topbar stay usable. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest) : undefined;

  return (
    <PageContainer className="flex justify-center py-16">
      <PageError onRetry={() => retry()} digest={digest} />
    </PageContainer>
  );
}
