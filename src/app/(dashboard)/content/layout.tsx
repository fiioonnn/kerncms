import { Suspense } from "react";

export default function ContentLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
