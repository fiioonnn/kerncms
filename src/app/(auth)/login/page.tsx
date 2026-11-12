import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginFlow } from "@/components/auth/auth-forms";
import { getUser, userCount } from "@/server/auth";

export const metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getUser()) redirect("/");
  const { next } = await searchParams;
  const firstRun = (await userCount()) === 0;
  const mailpitUrl = process.env.NODE_ENV !== "production" ? `http://localhost:${process.env.MAILPIT_UI_PORT ?? 8025}` : undefined;
  return (
    <AuthShell
      title={firstRun ? "Willkommen bei kerncms" : "Anmelden"}
      description={
        firstRun
          ? "Lege das erste Konto an. Du wirst Inhaber und kannst danach dein Team einladen."
          : "Melde dich mit deiner E-Mail-Adresse an. Du bekommst einen Code per Mail."
      }
    >
      <LoginFlow next={typeof next === "string" ? next : undefined} firstRun={firstRun} mailpitUrl={mailpitUrl} />
    </AuthShell>
  );
}
