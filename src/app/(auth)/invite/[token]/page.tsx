import { and, eq, gt } from "drizzle-orm";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { InviteForm } from "@/components/auth/auth-forms";
import { buttonStyles } from "@/components/ui/button";
import { db } from "@/db";
import { invites, sites, users } from "@/db/schema";
import { roleLabels } from "@/lib/kern-types";
import { getUser, hashToken } from "@/server/auth";

export const metadata = { title: "Einladung · kerncms" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [row] = await db
    .select({ invite: invites, site: sites.name, inviter: users.name })
    .from(invites)
    .innerJoin(sites, eq(sites.id, invites.siteId))
    .leftJoin(users, eq(users.id, invites.invitedBy))
    .where(and(eq(invites.id, hashToken(token)), gt(invites.expiresAt, new Date())))
    .limit(1);

  if (!row) {
    return (
      <AuthShell title="Einladung ungültig" description="Diese Einladung ist abgelaufen oder wurde zurückgezogen. Bitte lass dir einen neuen Link schicken.">
        <Link href="/login" className={buttonStyles({ variant: "secondary", className: "w-full" })}>
          Zur Anmeldung
        </Link>
      </AuthShell>
    );
  }

  const user = await getUser();
  const wrongAccount = user && user.email !== row.invite.email;
  return (
    <AuthShell
      title={`Einladung zu ${row.site}`}
      description={`${row.inviter ?? "Jemand"} lädt dich als ${roleLabels[row.invite.role]} ein.`}
    >
      {wrongAccount ? (
        <p className="text-[15px] text-muted">
          Die Einladung gilt für {row.invite.email}, du bist aber als {user.email} angemeldet. Melde dich ab und öffne den Link erneut.
        </p>
      ) : (
        <InviteForm token={token} email={row.invite.email} signedIn={Boolean(user)} />
      )}
    </AuthShell>
  );
}
