"use client";

import Link from "next/link";
import { useState } from "react";
import { Search, SearchX } from "lucide-react";
import { RowActions } from "@/components/actions/common";
import { Button } from "@/components/ui/button";
import { Badge, Card, Table, Td, Th } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { formatEntryValue, getCollection } from "@/lib/collections";

export function EntriesTable({ slug }: { slug: string }) {
  const [query, setQuery] = useState("");
  const collection = getCollection(slug);
  if (!collection) return null;

  const fieldsByName = new Map(collection.fields.map((field) => [field.name, field]));
  const columns = collection.listFields.map((name) => fieldsByName.get(name)).filter((field) => field !== undefined);
  const titleField = fieldsByName.get(collection.titleField);
  const normalized = query.trim().toLowerCase();
  const rows = collection.entries.filter(
    (entry) =>
      !normalized ||
      Object.entries(entry.values).some(([name, value]) =>
        formatEntryValue(fieldsByName.get(name), value).toLowerCase().includes(normalized),
      ),
  );
  const editHref = `/collections/${collection.slug}/new`;

  return (
    <div className="flex flex-col gap-5">
      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted"
          strokeWidth={1.75}
        />
        <Input
          aria-label={`${collection.name} durchsuchen`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-11"
        />
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="Keine Treffer"
            description={`Kein Eintrag passt zu „${query.trim()}“.`}
            action={
              <Button variant="secondary" onClick={() => setQuery("")}>
                Suche zurücksetzen
              </Button>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{titleField?.label ?? "Titel"}</Th>
                {columns.map((field) => (
                  <Th key={field.name}>{field.label}</Th>
                ))}
                <Th>Status</Th>
                <Th>Zuletzt geändert</Th>
                <Th className="w-0" aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => {
                const title = String(entry.values[collection.titleField] ?? entry.id);
                return (
                  <tr key={entry.id} className="transition-colors hover:bg-subtle/50">
                    <Td>
                      <Link href={editHref} className="text-base font-medium hover:text-accent">
                        {title}
                      </Link>
                    </Td>
                    {columns.map((field) => (
                      <Td key={field.name} className="text-muted">
                        {formatEntryValue(field, entry.values[field.name])}
                      </Td>
                    ))}
                    <Td>
                      {entry.status === "draft" ? (
                        <Badge tone="warning" dot>
                          Entwurf
                        </Badge>
                      ) : (
                        <Badge tone="success" dot>
                          Live
                        </Badge>
                      )}
                    </Td>
                    <Td className="text-muted">{entry.updated}</Td>
                    <Td>
                      <RowActions
                        name={title}
                        editHref={editHref}
                        path={`src/content/${collection.slug}/${entry.id}.${collection.format}`}
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
