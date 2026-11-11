"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  CircleCheck,
  FileCode,
  FolderGit2,
  GitBranch,
  Loader2,
  Lock,
  Plus,
  Rocket,
  Search,
  Trash2,
} from "lucide-react";
import { CodeBlock } from "@/components/schema/code-block";
import { Button, buttonStyles } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { detectedCollections, detectedGlobals } from "@/lib/example-schema";
import { cn } from "@/lib/utils";

const steps = ["GitHub verbinden", "Repository wählen", "Konfiguration prüfen", "Team einladen"];

type Repo = { name: string; language: string; updated: string; private: boolean; hasConfig: boolean };

const repos: Repo[] = [
  { name: "baeckerei-mueller/website", language: "Astro", updated: "vor 2 Stunden", private: true, hasConfig: true },
  { name: "hotel-seeblick/website", language: "Astro", updated: "gestern", private: true, hasConfig: false },
  { name: "zahnarzt-dr-wolf/praxis-site", language: "Astro", updated: "vor 3 Tagen", private: true, hasConfig: true },
  { name: "agentur/kunden-starter", language: "TypeScript", updated: "vor 1 Woche", private: false, hasConfig: false },
  { name: "weingut-reiter/shop", language: "Astro", updated: "vor 2 Wochen", private: true, hasConfig: false },
  { name: "agentur/intern-tools", language: "TypeScript", updated: "vor 1 Monat", private: true, hasConfig: false },
];

const branches = [
  { label: "main", value: "main" },
  { label: "staging", value: "staging" },
  { label: "develop", value: "develop" },
];

const roles = [
  { label: "Redakteur", value: "editor" },
  { label: "Admin", value: "admin" },
  { label: "Nur lesen", value: "viewer" },
];

const scanSteps = [
  "Repository klonen",
  "Framework erkennen",
  "kern.config.yaml suchen",
  "Content-Ordner einlesen",
];

const generatedConfig = (repo: string) => `# Von kerncms erzeugt für ${repo}
version: 1
framework: astro
contentDir: src/content

collections:
  pages:
    label: Seiten
    path: src/content/pages
    format: md
    fields:
      title: { type: text, required: true }
      description: { type: textarea }
      body: { type: richtext }

  posts:
    label: Beiträge
    path: src/content/blog
    format: md
    fields:
      title: { type: text, required: true }
      date: { type: date }
      body: { type: richtext }

globals:
  site:
    label: Website
    path: src/data/site.json
    fields:
      name: { type: text }
      email: { type: email }
`;

type Invite = { id: number; email: string; role: string };

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  // Step 1
  const [installing, setInstalling] = useState(false);
  const [connected, setConnected] = useState(false);

  // Step 2
  const [query, setQuery] = useState("");
  const [repoName, setRepoName] = useState<string>();
  const repo = repos.find((r) => r.name === repoName);

  // Step 3
  const [scan, setScan] = useState<{ repo?: string; progress: number }>({ progress: 0 });
  const [configCreated, setConfigCreated] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const scanDone = scan.repo === repoName && scan.progress >= 100;

  // Step 4
  const [invites, setInvites] = useState<Invite[]>([{ id: 1, email: "", role: "editor" }]);

  useEffect(() => () => clearInterval(timer.current), []);

  function installApp() {
    setInstalling(true);
    setTimeout(() => {
      setInstalling(false);
      setConnected(true);
      toast.success("GitHub App installiert", { description: "kerncms hat jetzt Zugriff auf die freigegebenen Repositories." });
    }, 1400);
  }

  function startScan() {
    if (scan.repo === repoName && scan.progress > 0) return;
    clearInterval(timer.current);
    setConfigCreated(false);
    setScan({ repo: repoName, progress: 0 });
    timer.current = setInterval(() => {
      setScan((s) => {
        const progress = Math.min(100, s.progress + 6);
        if (progress >= 100) clearInterval(timer.current);
        return { ...s, progress };
      });
    }, 120);
  }

  const canContinue = [connected, Boolean(repo), scanDone && (repo?.hasConfig || configCreated), true][step];

  function next() {
    if (step === 1) startScan();
    if (step === steps.length - 1) {
      const count = invites.filter((i) => i.email.trim()).length;
      if (count) toast.success(count === 1 ? "Einladung verschickt" : `${count} Einladungen verschickt`);
      setDone(true);
      return;
    }
    setStep((s) => s + 1);
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-5 px-6 py-20 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-success-soft text-success">
          <Rocket className="size-8" strokeWidth={1.75} />
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Website ist verbunden</h1>
        <p className="text-[15px] text-muted">
          <span className="font-mono text-foreground">{repoName}</span> ist jetzt im CMS. Inhalte, Medien und Globals
          lassen sich ab sofort bearbeiten, jede Änderung landet als Commit im Repository.
        </p>
        <Link href="/" className={buttonStyles({ size: "lg", className: "mt-2" })}>
          Zum CMS
          <ArrowRight />
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 pt-6 pb-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Website verbinden</h1>
        <p className="text-[15px] text-muted">In vier Schritten vom GitHub-Repository zur bearbeitbaren Website.</p>
      </div>

      <Stepper current={step} />

      <Card className="p-8">
        {step === 0 && (
          <div className="flex flex-col gap-6">
            <StepTitle
              title="GitHub verbinden"
              description="kerncms liest und schreibt Inhalte direkt im Repository deiner Website. Dafür wird die kerncms GitHub App in deiner Organisation installiert."
            />
            <ul className="flex flex-col gap-3">
              {[
                "Zugriff nur auf die Repositories, die du freigibst",
                "Jede Änderung wird als Commit mit Autor gespeichert",
                "Jederzeit in den GitHub-Einstellungen widerrufbar",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-[15px]">
                  <Check className="size-5 shrink-0 text-success" strokeWidth={1.75} />
                  {item}
                </li>
              ))}
            </ul>
            {connected ? (
              <div className="flex items-center gap-4 rounded-xl border border-border bg-success-soft/50 px-5 py-4">
                <CircleCheck className="size-6 shrink-0 text-success" strokeWidth={1.75} />
                <span className="flex flex-col">
                  <span className="text-[15px] font-medium">GitHub App installiert</span>
                  <span className="text-sm text-muted">Organisation „agentur“ · 6 Repositories freigegeben</span>
                </span>
              </div>
            ) : (
              <Button size="lg" className="self-start" onClick={installApp} disabled={installing}>
                {installing ? <Loader2 className="animate-spin" /> : <GitBranch strokeWidth={1.75} />}
                {installing ? "Warte auf GitHub …" : "GitHub App installieren"}
              </Button>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-6">
            <StepTitle title="Repository wählen" description="Das Repository mit dem Code der Website." />
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" strokeWidth={1.75} />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Repositories durchsuchen"
                placeholder="Repositories durchsuchen"
                className="pl-11"
              />
            </div>
            <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-1.5">
              {repos
                .filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
                .map((r) => {
                  const selected = r.name === repoName;
                  return (
                    <li key={r.name}>
                      <button
                        type="button"
                        onClick={() => setRepoName(r.name)}
                        className={cn(
                          "flex w-full items-center gap-4 rounded-lg px-3 py-3 text-left transition-colors",
                          selected ? "bg-accent-soft" : "hover:bg-subtle",
                        )}
                      >
                        <FolderGit2 className={cn("size-5 shrink-0", selected ? "text-accent" : "text-muted")} strokeWidth={1.75} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className={cn("truncate font-mono text-[15px] font-medium", selected && "text-accent")}>
                            {r.name}
                          </span>
                          <span className="flex items-center gap-2 text-sm text-muted">
                            <span className="flex items-center gap-1.5">
                              <span
                                className={cn("size-2 rounded-full", r.language === "Astro" ? "bg-warning" : "bg-accent")}
                              />
                              {r.language}
                            </span>
                            · aktualisiert {r.updated}
                            {r.private && (
                              <>
                                · <Lock className="size-3.5" strokeWidth={1.75} /> privat
                              </>
                            )}
                          </span>
                        </span>
                        {selected && <Check className="size-5 shrink-0 text-accent" strokeWidth={1.75} />}
                      </button>
                    </li>
                  );
                })}
            </ul>
            {repo && <Select key={repo.name} label="Branch" items={branches} defaultValue="main" />}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            <StepTitle
              title="Konfiguration prüfen"
              description={`kerncms liest ${repoName} ein und sucht nach der kern.config.yaml.`}
            />
            {!scanDone ? (
              <div className="flex flex-col gap-4">
                <div className="h-2 overflow-hidden rounded-full bg-subtle">
                  <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${scan.progress}%` }} />
                </div>
                <ul className="flex flex-col gap-2.5">
                  {scanSteps.map((label, i) => {
                    const stepDone = scan.progress >= ((i + 1) / scanSteps.length) * 100;
                    const active = !stepDone && scan.progress >= (i / scanSteps.length) * 100;
                    return (
                      <li key={label} className={cn("flex items-center gap-3 text-[15px]", !stepDone && !active && "text-muted")}>
                        {stepDone ? (
                          <CircleCheck className="size-5 text-success" strokeWidth={1.75} />
                        ) : active ? (
                          <Loader2 className="size-5 animate-spin text-accent" strokeWidth={1.75} />
                        ) : (
                          <span className="flex size-5 items-center justify-center">
                            <span className="size-2 rounded-full bg-border-strong" />
                          </span>
                        )}
                        {label}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                  <CheckRow ok title="Astro erkannt" detail="astro 5.2 · Content Collections aktiv" />
                  {repo?.hasConfig || configCreated ? (
                    <CheckRow
                      ok
                      title={configCreated ? "kern.config.yaml erstellt" : "kern.config.yaml gefunden"}
                      detail={configCreated ? "Wird beim ersten Speichern ins Repository committet" : "Im Stammverzeichnis, Version 1, gültig"}
                    />
                  ) : (
                    <CheckRow
                      title="kern.config.yaml nicht gefunden"
                      detail="Ohne Konfiguration weiß kerncms nicht, welche Inhalte bearbeitbar sind."
                      action={
                        <Button size="sm" onClick={() => setConfigCreated(true)}>
                          <FileCode />
                          Konfiguration erstellen
                        </Button>
                      }
                    />
                  )}
                </ul>

                {configCreated && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-muted">
                      Aus den gefundenen Content-Ordnern erzeugt. Du kannst die Datei später im Repository anpassen.
                    </p>
                    <CodeBlock code={generatedConfig(repoName ?? "")} filename="kern.config.yaml" />
                  </div>
                )}

                {(repo?.hasConfig || configCreated) && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Detected
                      title="Collections"
                      items={
                        configCreated
                          ? [
                              { label: "Seiten", path: "src/content/pages" },
                              { label: "Beiträge", path: "src/content/blog" },
                            ]
                          : detectedCollections
                      }
                    />
                    <Detected
                      title="Globals"
                      items={configCreated ? [{ label: "Website", path: "src/data/site.json" }] : detectedGlobals}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-6">
            <StepTitle
              title="Team einladen"
              description="Wer soll die Website bearbeiten? Das geht auch später unter Team."
            />
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-[1fr_180px_44px] gap-3 text-[15px] font-medium">
                <span>E-Mail</span>
                <span>Rolle</span>
              </div>
              {invites.map((invite) => (
                <div key={invite.id} className="grid grid-cols-[1fr_180px_44px] items-center gap-3">
                  <Input
                    type="email"
                    aria-label="E-Mail"
                    value={invite.email}
                    onChange={(e) =>
                      setInvites((list) => list.map((i) => (i.id === invite.id ? { ...i, email: e.target.value } : i)))
                    }
                  />
                  <Select
                    items={roles}
                    defaultValue={invite.role}
                    onValueChange={(role) => setInvites((list) => list.map((i) => (i.id === invite.id ? { ...i, role } : i)))}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Zeile entfernen"
                    disabled={invites.length === 1}
                    onClick={() => setInvites((list) => list.filter((i) => i.id !== invite.id))}
                  >
                    <Trash2 strokeWidth={1.75} />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setInvites((list) => [...list, { id: Date.now(), email: "", role: "editor" }])}
              >
                <Plus />
                Weitere Person
              </Button>
            </div>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={step === 0} className={cn(step === 0 && "invisible")}>
          <ArrowLeft />
          Zurück
        </Button>
        <div className="flex items-center gap-3">
          {step === steps.length - 1 && (
            <Button variant="ghost" onClick={() => setDone(true)}>
              Überspringen
            </Button>
          )}
          <Button onClick={next} disabled={!canContinue}>
            {step === steps.length - 1 ? "Fertigstellen" : "Weiter"}
            <ArrowRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-3">
      {steps.map((label, i) => {
        const complete = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-3">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                complete && "bg-accent text-accent-foreground",
                active && "bg-accent-soft text-accent ring-2 ring-accent",
                !complete && !active && "bg-subtle text-muted",
              )}
            >
              {complete ? <Check className="size-4" strokeWidth={2.5} /> : i + 1}
            </span>
            <span className={cn("hidden text-sm font-medium md:block", !active && !complete && "text-muted")}>{label}</span>
            {i < steps.length - 1 && <span className={cn("h-px min-w-4 flex-1", complete ? "bg-accent" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
}

function StepTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-[15px] text-muted">{description}</p>
    </div>
  );
}

function CheckRow({
  ok,
  title,
  detail,
  action,
}: {
  ok?: boolean;
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-4 px-5 py-4">
      {ok ? (
        <CircleCheck className="size-6 shrink-0 text-success" strokeWidth={1.75} />
      ) : (
        <CircleAlert className="size-6 shrink-0 text-warning" strokeWidth={1.75} />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-medium">{title}</span>
        <span className="text-sm text-muted">{detail}</span>
      </span>
      {action}
    </li>
  );
}

function Detected({ title, items }: { title: string; items: { label: string; path: string }[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium">{title}</span>
        <Badge>{items.length}</Badge>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.path} className="flex flex-col">
            <span className="text-[15px]">{item.label}</span>
            <span className="truncate font-mono text-sm text-muted">{item.path}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
