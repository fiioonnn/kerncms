import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/ui/display";
import { adminCustomers, adminGithub } from "@/server/admin";
import { ConnectSite } from "./connect-site";

export const metadata = { title: "Website verbinden · Admin · kerncms" };

export default async function NewSitePage({ searchParams }: PageProps<"/admin/sites/new">) {
  const [{ customer, tab }, github, customers] = await Promise.all([searchParams, adminGithub(), adminCustomers()]);
  const options = customers
    .filter((c) => c.status !== "archived" || c.id === customer)
    .map((c) => ({ value: c.id, label: c.name, email: c.contactEmail }));
  const preselected = typeof customer === "string" && options.some((c) => c.value === customer) ? customer : null;

  return (
    <PageContainer>
      <Link href="/admin/sites" className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-medium text-muted hover:text-foreground">
        <ArrowLeft className="size-4" />
        Alle Websites
      </Link>
      <PageHeader
        title="Website verbinden"
        description="kerncms bearbeitet die Inhalte direkt im Git-Repository der Astro-Website. Das Repository braucht eine Datei kern.config.yaml."
      />
      <ConnectSite
        githubConfigured={Boolean(github.app)}
        githubError={github.error}
        installations={github.installations.map((i) => ({ id: i.id, account: i.account, type: i.type }))}
        installUrl={github.app ? `https://github.com/apps/${github.app.slug}/installations/new` : null}
        localAllowed={github.localAllowed}
        customers={options}
        initialCustomer={preselected}
        initialTab={tab === "local" && github.localAllowed ? "local" : "github"}
      />
    </PageContainer>
  );
}
