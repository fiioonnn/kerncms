import { KernProvider } from "@/components/kern/kern-provider";
import { loadKernClientData } from "@/server/kern-context";

export default async function EditorLayout({ children }: LayoutProps<"/">) {
  return <KernProvider value={await loadKernClientData()}>{children}</KernProvider>;
}
