"use client";

import { useState } from "react";
import { CalendarClock, Plus, Settings2, Trash2 } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { DatePicker, formatDate, timeOptions } from "@/components/ui/date-picker";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/display";
import { Field, Input, Label } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { toast } from "@/components/ui/toast";
import { Switch } from "@/components/ui/toggles";

type Category = { id: string; label: string };

const initialCategories: Category[] = [
  { id: "news", label: "Neuigkeiten" },
  { id: "events", label: "Events" },
  { id: "recipes", label: "Rezepte" },
  { id: "jobs", label: "Karriere" },
];

/** Tags already used in other posts; offered as suggestions. */
const existingTags = ["Sauerteig", "Brot", "Wochenmarkt", "Saisonal", "Vegan", "Ausbildung", "Catering", "Rezept", "Feiertage"];

const statusItems = [
  { label: "Entwurf", value: "draft" },
  { label: "Geplant", value: "scheduled" },
  { label: "Veröffentlicht", value: "live" },
];

function CategoryManager({
  categories,
  onChange,
}: {
  categories: Category[];
  onChange: (next: Category[]) => void;
}) {
  const [name, setName] = useState("");

  function add() {
    const label = name.trim();
    if (!label) return;
    if (categories.some((c) => c.label.toLowerCase() === label.toLowerCase())) {
      toast.error("Diese Kategorie gibt es schon");
      return;
    }
    onChange([...categories, { id: `${label.toLowerCase().replace(/\s+/g, "-")}-${categories.length}`, label }]);
    setName("");
  }

  return (
    <Dialog>
      <Tooltip label="Kategorien verwalten">
        <DialogTrigger className={buttonStyles({ variant: "ghost", size: "sm", className: "-mr-2 h-8 px-2.5 text-muted hover:text-foreground [&_svg]:size-4" })}>
          <Settings2 strokeWidth={1.75} />
          Verwalten
        </DialogTrigger>
      </Tooltip>
      <DialogContent
        title="Kategorien verwalten"
        description="Kategorien gelten für alle Beiträge. Namen kannst du direkt ändern."
        footer={
          <DialogClose className={buttonStyles()} onClick={() => toast.success("Kategorien gespeichert")}>
            Fertig
          </DialogClose>
        }
      >
        <div className="flex flex-col gap-2">
          {categories.map((category) => (
            <div key={category.id} className="flex items-center gap-2">
              <Input
                aria-label={`Name der Kategorie ${category.label}`}
                value={category.label}
                onChange={(e) =>
                  onChange(categories.map((c) => (c.id === category.id ? { ...c, label: e.target.value } : c)))
                }
              />
              <Tooltip label="Kategorie löschen">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${category.label} löschen`}
                  disabled={categories.length <= 1}
                  className="text-muted hover:bg-danger-soft hover:text-danger"
                  onClick={() => {
                    onChange(categories.filter((c) => c.id !== category.id));
                    toast.success(`„${category.label}“ gelöscht`, {
                      description: "Beiträge dieser Kategorie sind jetzt ohne Kategorie.",
                    });
                  }}
                >
                  <Trash2 strokeWidth={1.75} />
                </Button>
              </Tooltip>
            </div>
          ))}
        </div>
        <form
          className="mt-5 flex items-end gap-2 border-t border-border pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Field className="flex-1">
            <Label>Neue Kategorie</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" disabled={!name.trim()}>
            <Plus />
            Hinzufügen
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PostPublishCard() {
  const [status, setStatus] = useState("draft");
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState("09:00");
  const [categories, setCategories] = useState(initialCategories);
  const [category, setCategory] = useState("news");

  const categoryExists = categories.some((c) => c.id === category);

  return (
    <Card>
      <CardHeader title="Veröffentlichung" />
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Select
            label="Status"
            items={statusItems}
            defaultValue={status}
            onValueChange={(value) => {
              setStatus(value);
              if (value === "scheduled" && !date) {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                setDate(tomorrow);
              }
            }}
          />
          {status === "scheduled" && (
            <div className="flex flex-col gap-4 rounded-xl bg-subtle/60 p-4">
              <DatePicker label="Datum" value={date} onValueChange={setDate} />
              <Select label="Uhrzeit" items={timeOptions} defaultValue={time} onValueChange={setTime} />
              {date && (
                <p className="flex items-start gap-2 text-sm text-muted">
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.75} />
                  Geht am {formatDate(date)} um {time} Uhr automatisch online.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-medium">Kategorie</span>
            <CategoryManager
              categories={categories}
              onChange={(next) => {
                setCategories(next);
                if (!next.some((c) => c.id === category) && next[0]) setCategory(next[0].id);
              }}
            />
          </div>
          <Select
            key={categories.map((c) => `${c.id}:${c.label}`).join("|")}
            items={categories.map((c) => ({ label: c.label, value: c.id }))}
            defaultValue={categoryExists ? category : categories[0]?.id}
            onValueChange={setCategory}
          />
        </div>

        <TagInput
          label="Schlagwörter"
          defaultValue={["Brot"]}
          suggestions={existingTags}
          description="Mit Enter oder Komma hinzufügen."
        />

        <Field>
          <Label>Slug</Label>
          <Input />
        </Field>
        <Switch label="Auf Startseite zeigen" description="Erscheint im Bereich „Aktuelles“." />
      </CardContent>
    </Card>
  );
}
