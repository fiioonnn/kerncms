import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginFlow } from "@/components/auth/auth-forms";
import { adminEmail, getUser, userCount } from "@/server/auth";

export const metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getUser()) redirect("/");
  const { next } = await searchParams;
  // Without KERN_ADMIN_EMAIL, production has no way to create the first account: plain sign-in form.
  const firstRun = (await userCount()) === 0 && (!!adminEmail() || process.env.NODE_ENV !== "production");
  const mailpitUrl = process.env.NODE_ENV !== "production" ? `http://localhost:${process.env.MAILPIT_UI_PORT ?? 8025}` : undefined;
  return (
    <AuthShell
      title={firstRun ? "Willkommen bei kerncms" : "Anmelden"}
      description={
        firstRun
          ? "Lege das Administrator-Konto an. Danach kannst du dein Team einladen."
          : "Melde dich mit deiner E-Mail-Adresse an. Du bekommst einen Code per Mail."
      }
    >
      <LoginFlow next={typeof next === "string" ? next : undefined} firstRun={firstRun} mailpitUrl={mailpitUrl} />
    </AuthShell>
  );
}
