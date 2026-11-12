import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getUser } from "@/server/auth";
import { findClient } from "@/server/oauth";
import { ConsentForm } from "./consent-form";

export const metadata = { title: "Zugriff erlauben" };

function Problem({ text }: { text: string }) {
  return (
    <AuthShell title="Verbindung nicht möglich" description={text}>
      <Link href="/" className="text-[15px] font-medium text-accent hover:underline">
        Zur Übersicht
      </Link>
    </AuthShell>
  );
}

/** OAuth consent: an app such as Claude asks to read the user's sites. */
export default async function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  const params = await searchParams;
  const get = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");

  const user = await getUser();
  if (!user) {
    const query = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string"));
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }

  const client = await findClient(get("client_id"));
  if (!client) return <Problem text="Diese App ist bei kerncms nicht registriert. Bitte starte die Verbindung in der App neu." />;
  const redirectUri = get("redirect_uri");
  if (!client.redirectUris.includes(redirectUri)) return <Problem text="Die Rücksprungadresse der App stimmt nicht." />;
  if (get("response_type") !== "code") return <Problem text="Die App fragt eine nicht unterstützte Anmeldeart an." />;
  if (get("code_challenge_method") !== "S256" || !get("code_challenge")) return <Problem text="Die App nutzt kein sicheres PKCE (S256)." />;

  return (
    <AuthShell title={`${client.name} mit kerncms verbinden`} description={`Angemeldet als ${user.email}`}>
      <ConsentForm
        app={client.name}
        host={new URL(redirectUri).host}
        request={{ clientId: client.id, redirectUri, codeChallenge: get("code_challenge"), state: get("state") }}
      />
    </AuthShell>
  );
}
