import { Inbox } from "lucide-react";
import { redirect } from "next/navigation";
import { logout } from "@/server/actions/auth";
import { requireUser } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/display";

export const metadata = { title: "Noch keine Website" };

/** Signed in, but no site yet. Admins connect sites in /admin; everyone else waits for an invite. */
export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.isAdmin) redirect("/admin/sites/new");
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-6 px-6 py-20 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Inbox className="size-7" strokeWidth={1.75} />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Hallo {user.name.split(" ")[0]}, noch ist hier nichts</h1>
        <p className="text-base text-muted">
          Dein Konto ist noch keiner Website zugeordnet. Sobald dich jemand einlädt, bekommst du eine E-Mail an {user.email}.
        </p>
      </div>
      <Card className="w-full p-5 text-left text-[15px] text-muted">
        Du hast eine Einladung bekommen? Öffne den Link aus der E-Mail, dann erscheint die Website hier.
      </Card>
      <form action={logout}>
        <Button type="submit" variant="ghost">
          Abmelden
        </Button>
      </form>
    </div>
  );
}
