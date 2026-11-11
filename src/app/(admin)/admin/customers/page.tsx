import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/ui/display";
import { adminCustomers } from "@/server/admin";
import { NewCustomerDialog } from "../_components/customer-dialog";
import { CustomersTable } from "./customers-table";

export const metadata = { title: "Kunden · Admin · kerncms" };

export default async function CustomersPage() {
  const customers = await adminCustomers();
  return (
    <PageContainer>
      <PageHeader title="Kunden" description="Die Kunden der Agentur, ihre Websites und wer dort Zugriff hat." actions={<NewCustomerDialog />} />
      <CustomersTable
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          contactName: c.contactName,
          contactEmail: c.contactEmail,
          status: c.status,
          createdAt: c.createdAt,
          users: c.users,
          sites: c.sites.map((s) => ({ id: s.id, name: s.name })),
        }))}
      />
    </PageContainer>
  );
}
