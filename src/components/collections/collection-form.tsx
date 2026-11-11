"use client";

import { FileText } from "lucide-react";
import { ImageField } from "@/components/media/media-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { Card, CardContent, CardHeader } from "@/components/ui/display";
import { Description, Field, Input, Label, Textarea } from "@/components/ui/field";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/toggles";
import { collectionFolder, getCollection, type CollectionField } from "@/lib/collections";

function FieldControl({ field }: { field: CollectionField }) {
  const label = field.required ? `${field.label} *` : field.label;
  switch (field.type) {
    case "text":
    case "number":
      return (
        <Field>
          <Label>{label}</Label>
          {field.type === "number" ? (
            <Input type="number" inputMode="numeric" min={0} className={field.suffix ? "max-w-48" : undefined} />
          ) : (
            <Input required={field.required} />
          )}
          {field.description && <Description>{field.description}</Description>}
        </Field>
      );
    case "textarea":
      return (
        <Field>
          <Label>{label}</Label>
          <Textarea rows={5} />
          {field.description && <Description>{field.description}</Description>}
        </Field>
      );
    case "select":
      return (
        <div className="flex flex-col gap-2">
          <Select label={label} items={field.options ?? []} defaultValue={field.options?.[0]?.value} />
          {field.description && <p className="text-sm text-muted">{field.description}</p>}
        </div>
      );
    case "date":
      return (
        <div className="flex flex-col gap-2">
          <DatePicker label={label} />
          {field.description && <p className="text-sm text-muted">{field.description}</p>}
        </div>
      );
    case "richtext":
      return <RichTextEditor label={label} />;
    case "boolean":
      return <Switch label={field.label} description={field.description} />;
    case "image":
      return <ImageField label={label} description={field.description} aspect="aspect-[4/3]" />;
  }
}

/** Form generated from the collection's field schema. */
export function CollectionForm({ slug }: { slug: string }) {
  const collection = getCollection(slug);
  if (!collection) return null;

  const mainFields = collection.fields.filter((field) => field.type !== "boolean" && field.type !== "image");
  const imageFields = collection.fields.filter((field) => field.type === "image");
  const optionFields = collection.fields.filter((field) => field.type === "boolean");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardContent className="flex flex-col gap-6 py-6">
          {mainFields.map((field) => (
            <FieldControl key={field.name} field={field} />
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        {imageFields.length > 0 && (
          <Card>
            <CardHeader title={imageFields.length > 1 ? "Bilder" : imageFields[0].label} />
            <CardContent className="flex flex-col gap-6 pt-4">
              {imageFields.map((field) => (
                <FieldControl key={field.name} field={field} />
              ))}
            </CardContent>
          </Card>
        )}
        {optionFields.length > 0 && (
          <Card>
            <CardHeader title="Optionen" />
            <CardContent className="flex flex-col gap-6">
              {optionFields.map((field) => (
                <FieldControl key={field.name} field={field} />
              ))}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="flex items-start gap-3 py-4 text-sm text-muted">
            <FileText className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            <span>
              Wird als {collection.format === "md" ? "Markdown" : "JSON"}-Datei in{" "}
              <span className="font-mono text-foreground">{collectionFolder(collection)}</span> gespeichert.
            </span>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
