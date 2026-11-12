"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2, LogOut, Monitor, Plug, Smartphone, Tablet, Trash2 } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Avatar, Badge, Card, CardContent, CardHeader, PageHeader } from "@/components/ui/display";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { Switch } from "@/components/ui/toggles";
import { toast } from "@/components/ui/toast";
import { formatWhen } from "@/lib/admin-format";
import { deleteAccount, disconnectApp, revokeOtherSessions, updatePreferences, updateProfile } from "@/server/actions/auth";

type User = { id: string; name: string; email: string; preferences: Record<string, boolean> };
type Session = { id: string; userAgent: string | null; createdAt: string; current: boolean };

/** Keys match the notification kinds, so senders can check `preferences[kind]`. */
const notificationPrefs = [
  { key: "approval", label: "Freigaben", description: "Jemand bittet um Freigabe, oder deine Anfrage wurde geprüft.", default: true },
  { key: "form", label: "Formular-Nachrichten", description: "Ein Besucher hat ein Formular abgeschickt.", default: true },
  { key: "deploy", label: "Veröffentlichungen", description: "Die Website ist live oder der Build ist fehlgeschlagen.", default: false },
  { key: "team", label: "Team", description: "Jemand ist dem Team beigetreten.", default: false },
];

function describeAgent(ua: string | null) {
  const s = ua ?? "";
  const browser = /edg\//i.test(s)
    ? "Edge"
    : /firefox|fxios/i.test(s)
      ? "Firefox"
      : /chrome|crios/i.test(s)
        ? "Chrome"
        : /safari/i.test(s)
          ? "Safari"
          : "Browser";
  const os = /iphone/i.test(s)
    ? "iPhone"
    : /ipad/i.test(s)
      ? "iPad"
      : /android/i.test(s)
        ? "Android"
        : /mac os/i.test(s)
          ? "Mac"
          : /windows/i.test(s)
            ? "Windows"
            : /linux/i.test(s)
              ? "Linux"
              : "Unbekanntes Gerät";
  const Icon = /ipad|tablet/i.test(s) ? Tablet : /mobi|iphone|android/i.test(s) ? Smartphone : Monitor;
  return { label: `${os} · ${browser}`, Icon };
}

type ConnectedApp = { id: string; app: string; createdAt: string; lastUsedAt: string | null };

/** Apps such as Claude that were allowed to read kerncms through the connector (OAuth). */
function ConnectedApps({ apps: initial }: { apps: ConnectedApp[] }) {
  const [apps, setApps] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <Card>
      <CardHeader title="Verbundene Apps" description="Apps wie Claude, denen du über den kerncms-Connector Lesezugriff gegeben hast." />
      <CardContent className="pt-3">
        {apps.length === 0 ? (
          <p className="text-[15px] text-muted">Keine Apps verbunden.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {apps.map((a) => (
              <li key={a.id} className="flex items-center gap-4 py-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
                  <Plug className="size-5" strokeWidth={1.75} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-medium">{a.app}</span>
                  <span suppressHydrationWarning className="truncate text-sm text-muted">
                    Verbunden {formatWhen(a.createdAt)}
                    {a.lastUsedAt && ` · zuletzt genutzt ${formatWhen(a.lastUsedAt)}`}
                  </span>
                </span>
                <ConfirmDialog
                  trigger="Trennen"
                  triggerClassName={buttonStyles({ variant: "secondary", size: "sm" })}
                  title={`${a.app} trennen?`}
                  description="Die App verliert sofort den Zugriff. Du kannst sie später neu verbinden."
                  confirmLabel="Trennen"
                  danger
                  onConfirm={() =>
                    startTransition(async () => {
                      const result = await disconnectApp(a.id);
                      if (!result.ok) toast.error("Trennen fehlgeschlagen", { description: result.error });
                      else setApps((list) => list.filter((x) => x.id !== a.id));
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {pending && <span className="sr-only">Wird getrennt…</span>}
      </CardContent>
    </Card>
  );
}

export function ProfileView({ user, sessions: initialSessions, apps }: { user: User; sessions: Session[]; apps: ConnectedApp[] }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [saved, setSaved] = useState({ name: user.name, email: user.email });
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState(user.preferences);
  const [sessions, setSessions] = useState(initialSessions);
  const [pending, startTransition] = useTransition();
  const dirty = name !== saved.name || email !== saved.email;

  function saveProfile() {
    setError(null);
    startTransition(async () => {
      const result = await updateProfile({ name, email });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved({ name: name.trim(), email: email.trim().toLowerCase() });
      toast.success("Profil gespeichert");
    });
  }

  function setPref(key: string, value: boolean) {
    const before = prefs;
    setPrefs((p) => ({ ...p, [key]: value }));
    startTransition(async () => {
      const result = await updatePreferences({ [key]: value });
      if (!result.ok) {
        setPrefs(before);
        toast.error("Nicht gespeichert", { description: result.error });
      }
    });
  }

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Profil" description="Deine persönlichen Angaben, Benachrichtigungen und Anmeldungen." />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Persönliche Angaben" description="So sehen dich andere im Team." />
          <CardContent>
            <form
              className="flex flex-col gap-6"
              onSubmit={(e) => {
                e.preventDefault();
                saveProfile();
              }}
            >
              <div className="flex items-center gap-5">
                <Avatar name={name || "?"} className="size-20 text-2xl" />
                <span className="text-sm text-muted">Das Kürzel entsteht aus deinem Namen.</span>
              </div>
              <Field>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </Field>
              <Field>
                <Label>E-Mail</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                <Description>An diese Adresse schicken wir deinen Anmeldecode und Benachrichtigungen.</Description>
              </Field>
              {error && (
                <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-[15px] text-danger">
                  {error}
                </p>
              )}
              <div className="flex justify-end border-t border-border pt-6">
                <Button type="submit" disabled={!dirty || pending}>
                  {pending && <Loader2 className="animate-spin" />}
                  Speichern
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Anmeldung" />
          <CardContent>
            <div className="flex items-center gap-4 rounded-xl border border-border bg-subtle/50 px-5 py-4">
              <KeyRound className="size-6 shrink-0 text-muted" strokeWidth={1.75} />
              <span className="text-[15px]">
                Du meldest dich ohne Passwort an: Wir schicken dir bei jeder Anmeldung einen einmaligen Code an{" "}
                <span className="font-medium">{saved.email}</span>.
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Benachrichtigungen" description="Per E-Mail, für alle Websites, auf die du Zugriff hast." />
          <CardContent className="flex flex-col gap-7">
            {notificationPrefs.map((n) => (
              <Switch
                key={n.key}
                label={n.label}
                description={n.description}
                checked={prefs[n.key] ?? n.default}
                onCheckedChange={(checked) => setPref(n.key, checked)}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Aktive Sitzungen"
            description="Browser, in denen du gerade angemeldet bist."
            action={
              sessions.length > 1 && (
                <ConfirmDialog
                  trigger={
                    <>
                      <LogOut />
                      Andere Geräte abmelden
                    </>
                  }
                  triggerClassName={buttonStyles({ variant: "secondary", size: "sm" })}
                  title="Alle anderen Geräte abmelden?"
                  description="Du bleibst nur in diesem Browser angemeldet. Überall sonst ist eine neue Anmeldung nötig."
                  confirmLabel="Abmelden"
                  danger
                  onConfirm={() =>
                    startTransition(async () => {
                      const result = await revokeOtherSessions();
                      if (!result.ok) toast.error("Abmelden fehlgeschlagen", { description: result.error });
                      else {
                        setSessions((list) => list.filter((s) => s.current));
                        toast.success(result.data === 1 ? "1 Gerät abgemeldet" : `${result.data} Geräte abgemeldet`);
                      }
                    })
                  }
                />
              )
            }
          />
          <CardContent className="pt-3">
            <ul className="flex flex-col divide-y divide-border">
              {sessions.map((s) => {
                const { label, Icon } = describeAgent(s.userAgent);
                return (
                  <li key={s.id} className="flex items-center gap-4 py-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
                      <Icon className="size-5" strokeWidth={1.75} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2 text-[15px] font-medium">
                        {label}
                        {s.current && <Badge tone="success">Dieses Gerät</Badge>}
                      </span>
                      <span suppressHydrationWarning className="truncate text-sm text-muted">Angemeldet {formatWhen(s.createdAt)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <ConnectedApps apps={apps} />

        <Card className="border-danger/30">
          <CardHeader title="Konto löschen" description="Dein Zugang zu allen Websites wird entfernt. Deine Änderungen bleiben im Verlauf erhalten." />
          <CardContent className="flex justify-end">
            <DeleteAccountDialog email={saved.email} />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

function DeleteAccountDialog({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) {
          setValue("");
          setError(null);
        }
      }}
    >
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Trash2 />
        Konto löschen
      </Button>
      <DialogContent
        title="Konto endgültig löschen?"
        description="Das lässt sich nicht rückgängig machen. Deine Änderungen bleiben im Verlauf der Websites sichtbar."
        size="sm"
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })} disabled={pending}>
              Abbrechen
            </DialogClose>
            <Button
              variant="danger"
              disabled={value.trim().toLowerCase() !== email.toLowerCase() || pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteAccount({ confirmEmail: value });
                  if (result && !result.ok) setError(result.error);
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              Konto löschen
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field>
            <Label>Zur Bestätigung deine E-Mail-Adresse eingeben</Label>
            <Input value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
            <Description>{email}</Description>
          </Field>
          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-[15px] text-danger">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
