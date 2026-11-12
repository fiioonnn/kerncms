import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth";
import { AdminMobileBar, AdminSidebar } from "./_components/admin-nav";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · kerncms" } };

/** Platform admin area: its own shell, independent of the current site. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireAdmin();
  const me = { name: user.name, email: user.email };
  return (
    <div className="flex min-h-dvh bg-background">
      <AdminSidebar me={me} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminMobileBar me={me} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
