import { headers } from "next/headers";
import { Bot, Download, FileText, MessageSquareText, Sparkles, SquareTerminal, type LucideIcon } from "lucide-react";
import { CopyButton } from "@/components/actions/common";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/display";
import { requireAdmin } from "@/server/auth";
import { SKILL_NAME } from "@/server/skill";

export const metadata = { title: "KI-Skill · Admin · kerncms" };

function Section({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="flex items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon className="size-5" strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-[15px] leading-relaxed text-muted">{text}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Command({ value }: { value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-border bg-subtle/60 py-1.5 pr-1.5 pl-4">
      <code className="min-w-0 flex-1 py-1.5 font-mono text-sm leading-relaxed break-all">{value}</code>
      <CopyButton value={value} />
    </div>
  );
}

export default async function SkillPage() {
  await requireAdmin();
  const h = await headers();
  const base = (process.env.KERN_PUBLIC_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`).replace(/\/+$/, "");
  const zipUrl = `${base}/kern-skill/${SKILL_NAME}.zip`;
  const projectInstall = `mkdir -p .claude/skills && curl -fsSL ${zipUrl} -o /tmp/${SKILL_NAME}.zip && unzip -oq /tmp/${SKILL_NAME}.zip -d .claude/skills`;
  const globalInstall = `mkdir -p ~/.claude/skills && curl -fsSL ${zipUrl} -o /tmp/${SKILL_NAME}.zip && unzip -oq /tmp/${SKILL_NAME}.zip -d ~/.claude/skills`;
  const prompt =
    "Baue mit dem Skill kerncms-astro eine Astro-Website für [Kunde, Branche]. Seiten: Startseite, Leistungen, Über uns, Kontakt. Alle Texte und Bilder sollen im CMS bearbeitbar sein, inklusive Kontaktformular.";

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title="KI-Skill für Astro-Websites"
        description="Damit KI-Assistenten Astro-Seiten von Anfang an so bauen, dass sie vollständig in kerncms bearbeitbar sind."
      />

      <div className="flex flex-col gap-6">
        <Section
          icon={Sparkles}
          title="Was der Skill macht"
          text="Er erklärt dem Assistenten den Vertrag zwischen kerncms und Astro und gibt ihm erprobte Code-Muster aus der Beispielseite."
        >
          <ul className="grid gap-3 text-[15px] sm:grid-cols-2">
            {[
              "Inhalte als Blöcke, Sammlungen und Globals modellieren",
              "kern.config.yaml und passende Astro-Schemas schreiben",
              "Markierungen für den visuellen Editor setzen",
              "Formulare, Statistik, Bilder und Weiterleitungen anbinden",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section
          icon={SquareTerminal}
          title="Claude Code"
          text="Im Ordner der neuen Website ausführen. Der Skill liegt dann im Projekt und Claude nutzt ihn automatisch, sobald es um kerncms geht."
        >
          <Command value={projectInstall} />
          <p className="text-sm text-muted">Für alle Projekte auf diesem Rechner:</p>
          <Command value={globalInstall} />
        </Section>

        <Section
          icon={MessageSquareText}
          title="claude.ai"
          text="ZIP herunterladen und unter Einstellungen → Fähigkeiten als Skill hochladen."
        >
          <div>
            <a href={`/kern-skill/${SKILL_NAME}.zip`} className={buttonStyles({ variant: "secondary" })}>
              <Download />
              {SKILL_NAME}.zip herunterladen
            </a>
          </div>
        </Section>

        <Section
          icon={Bot}
          title="Andere Assistenten"
          text="Cursor, Codex und Co. lesen Markdown-Regeln. Lege die Dateien zum Beispiel als AGENTS.md oder Projektregel ab."
        >
          <div className="flex flex-wrap gap-3">
            {[
              { file: "SKILL.md", label: "Anleitung" },
              { file: "references/contract.md", label: "Vertrag" },
              { file: "references/patterns.md", label: "Code-Muster" },
            ].map(({ file, label }) => (
              <a key={file} href={`/kern-skill/${file}`} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "ghost", size: "sm" })}>
                <FileText />
                {label}
              </a>
            ))}
          </div>
        </Section>

        <Section icon={MessageSquareText} title="So fängst du an" text="Ein Beispiel für die erste Nachricht an den Assistenten:">
          <Command value={prompt} />
        </Section>
      </div>
    </PageContainer>
  );
}
