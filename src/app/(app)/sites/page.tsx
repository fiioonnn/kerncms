"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Check, ExternalLink, Loader2, Plus, Search } from "lucide-react";
import { useKern } from "@/components/kern/kern-provider";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { Badge, Card, PageHeader } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { roleLabels } from "@/lib/kern-types";
import { cn } from "@/lib/utils";
import { switchSite } from "@/server/actions/site";

function hostOf(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export default function SitesPage() {
  const kern = useKern();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [switching, setSwitching] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const q = query.trim().toLowerCase();
  const filtered = kern.sites.filter((s) => s.name.toLowerCase().includes(q) || (s.liveUrl ?? "").toLowerCase().includes(q));

  function open(id: string, name: string) {
    if (id === kern.site.id) {
      router.push("/");
      return;
    }
    setSwitching(id);
    startTransition(async () => {
      const result = await switchSite(id);
      if (!result.ok) {
        setSwitching(null);
        toast.error("Wechseln fehlgeschlagen", { description: result.error });
        return;
      }
      toast.info(`Gewechselt zu ${name}`);
      router.push("/");
      router.refresh();
    });
  }

  return (
    <PageContainer>
      <PageHeader
        title="Websites"
        description="Alle Websites, auf die du mit kerncms Zugriff hast."
        actions={
          kern.user.isAdmin && (
            <Link href="/admin/sites/new" className={buttonStyles()}>
              <Plus />
              Website verbinden
            </Link>
          )
        }
      />

      {kern.sites.length > 6 && (
        <div className="relative mb-6 max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" strokeWidth={1.75} />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Websites durchsuchen" placeholder="Websites durchsuchen" className="pl-11" />
        </div>
      )}

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={Search} title="Keine Website gefunden" description="Versuche es mit einem anderen Namen oder einer Adresse." />
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((site) => {
            const current = site.id === kern.site.id;
            const host = hostOf(site.liveUrl);
            return (
              <Card key={site.id} className={cn("flex flex-col transition-colors hover:border-border-strong", current && "border-accent/50")}>
                <button
                  type="button"
                  onClick={() => open(site.id, site.name)}
                  disabled={switching !== null}
                  className="group flex flex-1 flex-col gap-5 rounded-2xl p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-base font-semibold text-accent">
                      {switching === site.id ? <Loader2 className="size-5 animate-spin" /> : initials(site.name)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-base font-semibold group-hover:text-accent">{site.name}</span>
                      <span className="truncate text-sm text-muted">{host ?? "Keine Live-Adresse"}</span>
                    </span>
                    {current && (
                      <Badge tone="accent">
                        <Check className="size-3.5" />
                        Aktiv
                      </Badge>
                    )}
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-3 text-sm text-muted">
                    <span>Deine Rolle: {roleLabels[site.role]}</span>
                    <span className="flex items-center gap-1 font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
                      {current ? "Öffnen" : "Wechseln"}
                      <ArrowRight className="size-4" />
                    </span>
                  </div>
                </button>
                {site.liveUrl && (
                  <div className="border-t border-border px-5 py-3">
                    <a href={site.liveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
                      <ExternalLink className="size-4" />
                      Live-Website öffnen
                    </a>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
