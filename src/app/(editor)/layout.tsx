import { KernProvider } from "@/components/kern/kern-provider";
import { loadKernClientData } from "@/server/kern-context";
import { siteTitle } from "@/server/titles";

export const generateMetadata = siteTitle;

export default async function EditorLayout({ children }: LayoutProps<"/">) {
  return <KernProvider value={await loadKernClientData()}>{children}</KernProvider>;
}
