import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/ui/display";
import { adminSites, adminUsers } from "@/server/admin";
import { requireAdmin } from "@/server/auth";
import { UsersTable } from "./users-table";

export const metadata = { title: "Nutzer · Admin · kerncms" };

export default async function AdminUsersPage() {
  const [me, users, sites] = await Promise.all([requireAdmin(), adminUsers(), adminSites()]);
  return (
    <PageContainer>
      <PageHeader title="Nutzer" description="Alle Konten dieser kerncms-Installation. Neue Personen lädst du über eine Website oder einen Kunden ein." />
      <UsersTable me={me.id} users={users} sites={sites.map((s) => ({ id: s.id, name: s.name, customer: s.customer }))} />
    </PageContainer>
  );
}
