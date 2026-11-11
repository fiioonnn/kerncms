import Link from "next/link";
import { Plus } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/display";
import { adminCustomerOptions, adminSites } from "@/server/admin";
import { SitesTable } from "./sites-table";

export const metadata = { title: "Websites · Admin · kerncms" };

export default async function AdminSitesPage() {
  const [sites, customers] = await Promise.all([adminSites(), adminCustomerOptions()]);
  return (
    <PageContainer>
      <PageHeader
        title="Websites"
        description="Alle verbundenen Websites, egal welchem Kunden sie gehören."
        actions={
          <Link href="/admin/sites/new" className={buttonStyles()}>
            <Plus />
            Website verbinden
          </Link>
        }
      />
      <SitesTable sites={sites} customers={customers} />
    </PageContainer>
  );
}
