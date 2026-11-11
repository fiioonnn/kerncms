import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SaveButton } from "@/components/actions/common";
import { CollectionForm } from "@/components/collections/collection-form";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { collections, getCollection } from "@/lib/collections";


export function generateStaticParams() {
  return collections.map((collection) => ({ slug: collection.slug }));
}

export default async function NewEntryPage({ params }: PageProps<"/collections/[slug]/new">) {
  const { slug } = await params;
  const collection = getCollection(slug);
  if (!collection) notFound();

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href={`/collections/${collection.slug}`}
            className={buttonStyles({ variant: "secondary", size: "icon" })}
            aria-label={`Zurück zu ${collection.name}`}
          >
            <ArrowLeft />
          </Link>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-muted">{collection.name}</span>
            <h1 className="text-2xl font-semibold tracking-tight">Neuer Eintrag</h1>
          </div>
        </div>
        <div className="flex gap-3">
          <SaveButton variant="secondary" label="Als Entwurf speichern" message="Entwurf gespeichert" />
          <SaveButton
            label="Speichern"
            message={`${collection.singular} gespeichert`}
            description="Die Änderung liegt im Entwurf und geht mit der nächsten Veröffentlichung live."
          />
        </div>
      </div>

      <CollectionForm slug={collection.slug} />
    </PageContainer>
  );
}
