import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { SaveButton } from "@/components/actions/common";
import { ImageField } from "@/components/media/media-picker";
import { PublishButton } from "@/components/actions/publish";
import { PostPublishCard } from "@/components/posts/post-publish-card";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/display";
import { Description, Field, Input, Label, Textarea } from "@/components/ui/field";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

export default function NewPostPage() {
  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/posts" className={buttonStyles({ variant: "secondary", size: "icon" })} aria-label="Zurück">
            <ArrowLeft />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Neuer Beitrag</h1>
        </div>
        <div className="flex gap-3">
          <SaveButton variant="secondary" label="Als Entwurf speichern" message="Entwurf gespeichert" />
          <PublishButton changes={1} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardContent className="flex flex-col gap-6 py-6">
            <Field>
              <Label>Titel</Label>
              <Input className="h-14 text-xl font-medium" />
            </Field>
            <Field>
              <Label>Teaser</Label>
              <Textarea rows={3} />
              <Description>Erscheint in der Beitragsübersicht und in Suchmaschinen.</Description>
            </Field>
            <RichTextEditor label="Inhalt" />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <PostPublishCard />

          <Card>
            <CardHeader title="Beitragsbild" />
            <CardContent className="pt-4">
              <ImageField label="Bild" aspect="aspect-[4/3]" description="Erscheint in der Übersicht und beim Teilen." />
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
