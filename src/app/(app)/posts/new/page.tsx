import Link from "next/link";
import { ArrowLeft, Bold, Heading2, ImagePlus, Italic, Link2, List } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { SaveButton, UploadDialog } from "@/components/actions/common";
import { PublishButton } from "@/components/actions/publish";
import { Button, buttonStyles } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/overlay";
import { Card, CardContent, CardHeader } from "@/components/ui/display";
import { Description, Field, Input, Label, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/toggles";

const categories = [
  { label: "Neuigkeiten", value: "news" },
  { label: "Events", value: "events" },
  { label: "Rezepte", value: "recipes" },
  { label: "Karriere", value: "jobs" },
];

const toolbar = [
  { icon: Heading2, label: "Zwischenüberschrift" },
  { icon: Bold, label: "Fett" },
  { icon: Italic, label: "Kursiv" },
  { icon: Link2, label: "Link" },
  { icon: List, label: "Liste" },
];

export default function NewPostPage() {
  return (
    <PageContainer>
      <div className="mb-10 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Link href="/posts" className={buttonStyles({ variant: "secondary", size: "icon" })} aria-label="Zurück">
            <ArrowLeft />
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Neuer Beitrag</h1>
        </div>
        <div className="flex gap-3">
          <SaveButton variant="secondary" label="Als Entwurf speichern" message="Entwurf gespeichert" />
          <PublishButton changes={1} />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardContent className="flex flex-col gap-7 py-8">
            <Field>
              <Label>Titel</Label>
              <Input className="h-14 text-xl font-medium" />
            </Field>
            <Field>
              <Label>Teaser</Label>
              <Textarea rows={3} />
              <Description>Erscheint in der Beitragsübersicht und in Suchmaschinen.</Description>
            </Field>
            <div className="flex flex-col gap-2">
              <span className="text-[15px] font-medium">Inhalt</span>
              <div className="overflow-hidden rounded-xl border border-border-strong">
                <div className="flex gap-1 border-b border-border bg-subtle/60 p-2">
                  {toolbar.map(({ icon: Icon, label }) => (
                    <Tooltip key={label} label={label}>
                      <Button variant="ghost" size="icon" className="size-10" aria-label={label}>
                        <Icon strokeWidth={1.75} />
                      </Button>
                    </Tooltip>
                  ))}
                </div>
                <div className="min-h-80 bg-surface p-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Veröffentlichung" />
            <CardContent className="flex flex-col gap-6">
              <Select label="Kategorie" items={categories} defaultValue="news" />
              <Field>
                <Label>Slug</Label>
                <Input />
              </Field>
              <Switch label="Auf Startseite zeigen" description="Erscheint im Bereich „Aktuelles“." />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Beitragsbild" />
            <CardContent>
              <UploadDialog
                triggerClassName="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border-strong text-muted transition-colors hover:border-accent hover:text-accent"
                trigger={
                  <>
                    <ImagePlus className="size-8" strokeWidth={1.5} />
                    <span className="text-[15px] font-medium">Bild hochladen</span>
                  </>
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
