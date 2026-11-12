"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, CircleCheck, FileSearch, FolderGit2, GitBranch, Loader2, Lock, PartyPopper, Search } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";
import { formatWhen } from "@/lib/admin-format";
import { cn } from "@/lib/utils";
import {
  connectGithubRepository,
  connectLocalRepository,
  githubBranches,
  githubRepos,
  inspectGithubRepo,
  inspectLocalRepo,
} from "@/server/actions/admin";
import { NewCustomerDialog } from "../../_components/customer-dialog";
import { GithubIcon, GithubLucide } from "../../_components/github-icon";
import { InviteButton } from "../../_components/invite-dialog";
import { ErrorNote, OpenSiteButton } from "../../_components/shared";

type Installation = { id: string; account: string; type: string };
type CustomerOption = { value: string; label: string; email: string };
type Repo = Extract<Awaited<ReturnType<typeof githubRepos>>, { ok: true }>["data"][number];
type Summary = Extract<Awaited<ReturnType<typeof inspectGithubRepo>>, { ok: true }>["data"];
type Connected = { id: string; name: string; customerId: string | null };

const NONE = "__none";

export function ConnectSite({
  githubConfigured,
  githubError,
  installations,
  installUrl,
  localAllowed,
  customers: initialCustomers,
  initialCustomer,
  initialTab,
}: {
  githubConfigured: boolean;
  githubError: string | null;
  installations: Installation[];
  installUrl: string | null;
  localAllowed: boolean;
  customers: CustomerOption[];
  initialCustomer: string | null;
  initialTab: "github" | "local";
}) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [connected, setConnected] = useState<Connected | null>(null);

  if (connected) {
    const customer = customers.find((c) => c.value === connected.customerId);
    return <ConnectedCard site={connected} contactEmail={customer?.email ?? ""} onAgain={() => setConnected(null)} />;
  }

  const shared = {
    customers,
    initialCustomer,
    onCustomerCreated: (c: CustomerOption) => setCustomers((list) => [...list, c].sort((a, b) => a.label.localeCompare(b.label, "de"))),
    onConnected: setConnected,
  };

  const github = githubConfigured ? (
    <GithubFlow installations={installations} installUrl={installUrl} error={githubError} {...shared} />
  ) : (
    <GithubMissing />
  );

  if (!localAllowed) return github;

  return (
    <Tabs defaultValue={initialTab}>
      <TabsList>
        <Tab value="github">
          <GithubIcon className="size-[18px]" />
          GitHub
        </Tab>
        <Tab value="local">
          <FolderGit2 className="size-[18px]" strokeWidth={1.75} />
          Lokaler Ordner
          <Badge tone="warning" className="h-6 px-2 text-xs">
            Nur Entwicklung
          </Badge>
        </Tab>
      </TabsList>
      <TabPanel value="github" className="pt-6">
        {github}
      </TabPanel>
      <TabPanel value="local" className="pt-6">
        <LocalFlow {...shared} />
      </TabPanel>
    </Tabs>
  );
}

type Shared = {
  customers: CustomerOption[];
  initialCustomer: string | null;
  onCustomerCreated: (customer: CustomerOption) => void;
  onConnected: (site: Connected) => void;
};

/* ---------- GitHub ---------- */

function GithubMissing() {
  return (
    <Card>
      <EmptyState
        icon={GithubLucide}
        title="Zuerst GitHub verbinden"
        description="Websites kommen aus GitHub. Dafür braucht kerncms eine eigene GitHub-App, die du einmalig in zwei Minuten einrichtest."
        action={
          <Link href="/admin/github" className={buttonStyles()}>
            <GithubIcon />
            GitHub einrichten
          </Link>
        }
      />
    </Card>
  );
}

function GithubFlow({
  installations,
  installUrl,
  error: appError,
  customers,
  initialCustomer,
  onCustomerCreated,
  onConnected,
}: Shared & { installations: Installation[]; installUrl: string | null; error: string | null }) {
  const [installationId, setInstallationId] = useState<string | null>(installations.length === 1 ? installations[0].id : null);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [reposError, setReposError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [repo, setRepo] = useState<Repo | null>(null);
  const [branches, setBranches] = useState<string[] | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState(initialCustomer ?? NONE);
  const [checking, startCheck] = useTransition();
  const [connecting, startConnect] = useTransition();
  const request = useRef(0);

  /** Loads the repositories of an installation; only the latest request may update the list. */
  function loadRepos(id: string) {
    const ticket = ++request.current;
    return githubRepos(id).then((result) => {
      if (ticket !== request.current) return;
      if (result.ok) setRepos(result.data);
      else setReposError(result.error);
    });
  }

  // The only installation is preselected, so load its repositories right away.
  const onlyInstallation = installations.length === 1 ? installations[0].id : null;
  useEffect(() => {
    if (!onlyInstallation) return;
    const ticket = ++request.current;
    void githubRepos(onlyInstallation).then((result) => {
      if (ticket !== request.current) return;
      if (result.ok) setRepos(result.data);
      else setReposError(result.error);
    });
  }, [onlyInstallation]);

  function chooseInstallation(id: string) {
    setInstallationId(id);
    setRepos(null);
    setReposError(null);
    setRepo(null);
    setBranches(null);
    setBranch(null);
    setSummary(null);
    setError(null);
    void loadRepos(id);
  }

  async function chooseRepo(next: Repo) {
    if (!installationId) return;
    setRepo(next);
    setBranch(next.defaultBranch);
    setBranches(null);
    setSummary(null);
    setError(null);
    const ticket = ++request.current;
    const result = await githubBranches(installationId, next.fullName);
    if (ticket !== request.current) return;
    if (result.ok) setBranches(result.data.includes(next.defaultBranch) ? result.data : [next.defaultBranch, ...result.data]);
    else {
      setBranches([next.defaultBranch]);
      setError(result.error);
    }
  }

  function check() {
    if (!installationId || !repo || !branch) return;
    setError(null);
    setSummary(null);
    startCheck(async () => {
      const result = await inspectGithubRepo(installationId, repo.fullName, branch);
      if (result.ok) setSummary(result.data);
      else setError(result.error);
    });
  }

  function connect() {
    if (!installationId || !repo || !branch) return;
    setError(null);
    const customer = customerId === NONE ? null : customerId;
    startConnect(async () => {
      const result = await connectGithubRepository({ installationId, repo: repo.fullName, branch, customerId: customer });
      if (result.ok) onConnected({ ...result.data, customerId: customer });
      else setError(result.error);
    });
  }

  if (installations.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={GithubLucide}
          title={appError ? "GitHub antwortet nicht" : "Die GitHub-App ist noch nirgends installiert"}
          description={
            appError ??
            "Installiere die App auf dem GitHub-Konto oder der Organisation, in der die Repositories liegen. Danach erscheinen sie hier."
          }
          action={
            <>
              {installUrl && (
                <a href={installUrl} className={buttonStyles()}>
                  <GithubIcon />
                  App installieren
                </a>
              )}
              <Link href="/admin/github" className={buttonStyles({ variant: "secondary" })}>
                GitHub-Einstellungen
              </Link>
            </>
          }
        />
      </Card>
    );
  }

  const q = query.trim().toLowerCase();
  const visible = repos?.filter((r) => !q || r.fullName.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q)) ?? [];
  const busy = checking || connecting;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card>
        <CardHeader title="Repository wählen" description="Aus den Konten, auf denen die kerncms-App installiert ist." />
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Konto"
              items={installations.map((i) => ({ value: i.id, label: `${i.account}${i.type === "Organization" ? " (Organisation)" : ""}` }))}
              value={installationId}
              onValueChange={chooseInstallation}
              disabled={busy}
            />
            <Field>
              <Label>Suchen</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" strokeWidth={1.75} />
                <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} disabled={!repos?.length} className="pl-11" />
              </div>
            </Field>
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            {!installationId ? (
              <p className="px-5 py-10 text-center text-[15px] text-muted">Wähle zuerst ein Konto.</p>
            ) : reposError ? (
              <ErrorNote className="m-4">{reposError}</ErrorNote>
            ) : repos === null ? (
              <div className="flex flex-col" role="status" aria-label="Repositories werden geladen">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex h-16 items-center gap-4 border-b border-border px-5 last:border-0">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="ml-auto h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : visible.length === 0 ? (
              <p className="px-5 py-10 text-center text-[15px] text-muted">
                {repos.length === 0 ? "Die App hat auf diesem Konto noch keinen Zugriff auf ein Repository." : "Kein Repository gefunden."}
              </p>
            ) : (
              <div role="radiogroup" aria-label="Repository" className="max-h-[28rem] overflow-y-auto">
                {visible.map((r) => {
                  const selected = repo?.fullName === r.fullName;
                  return (
                    <button
                      key={r.fullName}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={r.connected || busy}
                      onClick={() => void chooseRepo(r)}
                      className={cn(
                        "flex w-full items-center gap-4 border-b border-border px-5 py-3.5 text-left transition-colors outline-none last:border-0 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
                        selected ? "bg-accent-soft" : "hover:bg-subtle/60",
                        r.connected && "cursor-not-allowed opacity-60 hover:bg-transparent",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                          selected ? "border-accent" : "border-border-strong",
                        )}
                      >
                        {selected && <span className="size-2.5 rounded-full bg-accent" />}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col leading-snug">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-base font-medium">{r.fullName}</span>
                          {r.private && (
                            <Badge className="h-6 px-2 text-xs">
                              <Lock className="size-3" />
                              Privat
                            </Badge>
                          )}
                        </span>
                        {r.description && <span className="truncate text-sm text-muted">{r.description}</span>}
                      </span>
                      <span suppressHydrationWarning className="hidden shrink-0 text-right text-sm text-muted sm:block">
                        {r.connected ? <Badge tone="accent">Schon verbunden</Badge> : r.updatedAt ? `Push ${formatWhen(r.updatedAt)}` : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {installUrl && (
            <p className="text-sm text-muted">
              Repository fehlt?{" "}
              <a href={installUrl} className="font-medium text-accent hover:underline">
                Zugriff der App auf GitHub erweitern
              </a>
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="xl:sticky xl:top-8">
        <CardHeader title="Prüfen und verbinden" description={repo ? repo.fullName : "Wähle links ein Repository."} />
        <CardContent className="flex flex-col gap-5">
          <Select
            label="Branch"
            items={(branches ?? (branch ? [branch] : [])).map((b) => ({ value: b, label: b }))}
            value={branch}
            onValueChange={(b) => {
              setBranch(b);
              setSummary(null);
              setError(null);
            }}
            disabled={!repo || branches === null || busy}
          />
          <Button variant="secondary" onClick={check} disabled={!repo || !branch || busy} className="self-start">
            {checking ? <Loader2 className="animate-spin" /> : <FileSearch />}
            Prüfen
          </Button>

          {summary && <SummaryList summary={summary} />}
          {error && <ErrorNote>{error}</ErrorNote>}

          {summary && (
            <ConnectFooter
              customers={customers}
              customerId={customerId}
              onCustomerChange={setCustomerId}
              onCustomerCreated={onCustomerCreated}
              connecting={connecting}
              onConnect={connect}
              steps={["Repository wird von GitHub geklont…", "Entwurfs-Branch kern/draft wird angelegt…", "Konfiguration wird geladen…", "Dauert bei großen Repositories etwas länger…"]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Local folder ---------- */

function LocalFlow({ customers, initialCustomer, onCustomerCreated, onConnected }: Shared) {
  const [folder, setFolder] = useState("");
  const [summary, setSummary] = useState<(Summary & { repoPath: string; branch: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState(initialCustomer ?? NONE);
  const [checking, startCheck] = useTransition();
  const [connecting, startConnect] = useTransition();

  function check() {
    setError(null);
    setSummary(null);
    startCheck(async () => {
      const result = await inspectLocalRepo(folder);
      if (result.ok) setSummary(result.data);
      else setError(result.error);
    });
  }

  function connect() {
    if (!summary) return;
    setError(null);
    const customer = customerId === NONE ? null : customerId;
    startConnect(async () => {
      const result = await connectLocalRepository({ folder: summary.repoPath, customerId: customer });
      if (result.ok) onConnected({ ...result.data, customerId: customer });
      else setError(result.error);
    });
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card>
        <CardHeader title="Ordner auf diesem Rechner" description="Für die Entwicklung: kerncms arbeitet direkt in einem lokalen Git-Repository." />
        <CardContent>
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              check();
            }}
          >
            <Field>
              <Label>Ordner des Repositorys</Label>
              <Input
                value={folder}
                onChange={(e) => {
                  setFolder(e.target.value);
                  setSummary(null);
                }}
                required
                spellCheck={false}
                autoComplete="off"
                className="font-mono"
                disabled={checking || connecting}
              />
              <Description>Absoluter Pfad, ~ für den Benutzerordner ist erlaubt. kerncms legt daneben einen Arbeitsordner an.</Description>
            </Field>
            <Button type="submit" variant="secondary" className="self-start" disabled={checking || connecting || !folder.trim()}>
              {checking ? <Loader2 className="animate-spin" /> : <FileSearch />}
              Prüfen
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="xl:sticky xl:top-8">
        <CardHeader title="Prüfen und verbinden" description={summary ? summary.repoPath : "Gib links einen Ordner an und prüfe ihn."} />
        <CardContent className="flex flex-col gap-5">
          {summary && (
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <GitBranch className="size-4" />
              Live-Branch {summary.branch}
            </p>
          )}
          {summary && <SummaryList summary={summary} />}
          {error && <ErrorNote>{error}</ErrorNote>}
          {summary && (
            <ConnectFooter
              customers={customers}
              customerId={customerId}
              onCustomerChange={setCustomerId}
              onCustomerCreated={onCustomerCreated}
              connecting={connecting}
              onConnect={connect}
              steps={["Arbeitsordner wird angelegt…", "Konfiguration wird geladen…"]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Shared pieces ---------- */

function SummaryList({ summary }: { summary: Summary }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-3 pb-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
          <CircleCheck className="size-5" strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-base font-semibold">{summary.name}</span>
          <span className="truncate text-sm text-muted">{summary.url || "Keine Live-Adresse in der Konfiguration"}</span>
        </div>
      </div>
      <Row label="Seiten" items={[summary.pages]} mono />
      <Row label="Blöcke" items={summary.blocks} />
      <Row label="Inhalte" items={summary.collections} />
      <Row label="Globals" items={summary.globals} />
      <Row label="Formulare" items={summary.forms} />
    </div>
  );
}

function Row({ label, items, mono }: { label: string; items: string[]; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border py-3 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-24 shrink-0 pt-0.5 text-[15px] text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.length ? (
          items.map((item) => (
            <Badge key={item} className={cn(mono && "font-mono text-xs")}>
              {item}
            </Badge>
          ))
        ) : (
          <span className="pt-0.5 text-[15px] text-muted">Keine</span>
        )}
      </div>
    </div>
  );
}

function ConnectFooter({
  customers,
  customerId,
  onCustomerChange,
  onCustomerCreated,
  connecting,
  onConnect,
  steps,
}: {
  customers: CustomerOption[];
  customerId: string;
  onCustomerChange: (id: string) => void;
  onCustomerCreated: (customer: CustomerOption) => void;
  connecting: boolean;
  onConnect: () => void;
  steps: string[];
}) {
  return (
    <div className="flex flex-col gap-5 border-t border-border pt-5">
      <div className="flex items-end gap-2">
        <Select
          label="Kunde"
          items={[{ value: NONE, label: "Kein Kunde" }, ...customers]}
          value={customerId}
          onValueChange={onCustomerChange}
          disabled={connecting}
          className="min-w-0 flex-1"
        />
        <NewCustomerDialog
          label="Neu"
          variant="secondary"
          onCreated={(c) => {
            onCustomerCreated({ value: c.id, label: c.name, email: c.contactEmail });
            onCustomerChange(c.id);
          }}
        />
      </div>
      <Button size="lg" onClick={onConnect} disabled={connecting}>
        {connecting ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        {connecting ? "Wird verbunden…" : "Verbinden"}
      </Button>
      {connecting ? (
        <Progress steps={steps} />
      ) : (
        <p className="text-sm text-muted">kerncms legt einen Entwurfs-Branch kern/draft an. Live geht erst, was jemand veröffentlicht.</p>
      )}
    </div>
  );
}

/** Rotating progress text while a long server action runs. */
function Progress({ steps }: { steps: string[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => Math.min(i + 1, steps.length - 1)), 4000);
    return () => clearInterval(timer);
  }, [steps.length]);
  return (
    <p role="status" className="flex items-center gap-2 text-[15px] text-muted">
      <Loader2 className="size-4 animate-spin" />
      {steps[index]}
    </p>
  );
}

function ConnectedCard({ site, contactEmail, onAgain }: { site: Connected; contactEmail: string; onAgain: () => void }) {
  return (
    <Card className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-8 py-12 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
        <PartyPopper className="size-7" strokeWidth={1.75} />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">{site.name} ist verbunden</h2>
        <p className="text-[15px] text-muted">Lade jetzt den Kunden ein oder öffne die Website direkt im CMS.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <InviteButton label="Kunden einladen" variant="primary" sites={[{ id: site.id, name: site.name }]} defaultSiteId={site.id} defaultEmail={contactEmail} defaultRole="owner" />
        <OpenSiteButton siteId={site.id} size="md" />
      </div>
      <div className="flex gap-4 text-[15px]">
        <button type="button" onClick={onAgain} className="font-medium text-accent hover:underline">
          Weitere Website verbinden
        </button>
        <Link href="/admin/sites" className="font-medium text-accent hover:underline">
          Alle Websites
        </Link>
      </div>
    </Card>
  );
}
