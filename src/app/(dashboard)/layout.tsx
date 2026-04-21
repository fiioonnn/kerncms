import { Topbar } from "@/components/topbar";
import { ProjectProvider } from "@/components/project-context";
import { PageTransition } from "@/components/page-transition";
import { GitHubGate } from "@/components/github-gate";
import { BackgroundValidator } from "@/components/background-validator";
import { RequireName } from "@/components/require-name";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProjectProvider>
      <Topbar />
      <main className="flex-1 flex flex-col overflow-auto">
        <GitHubGate>
          <PageTransition>{children}</PageTransition>
        </GitHubGate>
      </main>
      <BackgroundValidator />
      <RequireName />
    </ProjectProvider>
  );
}
