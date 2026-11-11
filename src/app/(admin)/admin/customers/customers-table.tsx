"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, Search } from "lucide-react";
import { Badge, Card, Table, Td, Th } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/admin-format";
import { NewCustomerDialog } from "../_components/customer-dialog";
import { CustomerStatusBadge, customerStatusItems, SearchInput, type CustomerStatus } from "../_components/shared";

type Row = {
  id: string;
  name: string;
  contactName: string;
  contactEmail: string;
  status: CustomerStatus;
  createdAt: string;
  users: number;
  sites: { id: string; name: string }[];
};

const statusFilter = [{ value: "all", label: "Alle Status" }, ...customerStatusItems];

export function CustomersTable({ customers }: { customers: Row[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const q = query.trim().toLowerCase();
  const rows = customers.filter(
    (c) =>
      (status === "all" || c.status === status) &&
      (!q ||
        [c.name, c.contactName, c.contactEmail, ...c.sites.map((s) => s.name)].some((v) => v.toLowerCase().includes(q))),
  );

  if (customers.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Building2}
          title="Noch keine Kunden"
          description="Lege den ersten Kunden an und verbinde dann seine Website."
          action={<NewCustomerDialog />}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} label="Kunden durchsuchen" />
        <Select aria-label="Nach Status filtern" items={statusFilter} value={status} onValueChange={setStatus} className="sm:w-48" />
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={Search} title="Kein Kunde gefunden" description="Versuche es mit einem anderen Namen oder Status." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Kunde</Th>
                <Th className="hidden lg:table-cell">Kontakt</Th>
                <Th className="hidden md:table-cell">Websites</Th>
                <Th className="hidden lg:table-cell">Nutzer</Th>
                <Th>Status</Th>
                <Th className="hidden xl:table-cell">Angelegt</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer transition-colors hover:bg-subtle/50"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a")) return;
                    router.push(`/admin/customers/${c.id}`);
                  }}
                >
                  <Td className="py-3">
                    <Link href={`/admin/customers/${c.id}`} className="text-base font-medium outline-none hover:text-accent focus-visible:underline">
                      {c.name}
                    </Link>
                  </Td>
                  <Td className="hidden py-3 lg:table-cell">
                    {c.contactName || c.contactEmail ? (
                      <span className="flex flex-col leading-snug">
                        <span>{c.contactName || c.contactEmail}</span>
                        {c.contactName && c.contactEmail && <span className="text-sm text-muted">{c.contactEmail}</span>}
                      </span>
                    ) : (
                      <span className="text-muted">Keine Angabe</span>
                    )}
                  </Td>
                  <Td className="hidden py-3 md:table-cell">
                    {c.sites.length ? (
                      <span className="flex flex-wrap gap-1.5">
                        {c.sites.map((s) => (
                          <Badge key={s.id}>{s.name}</Badge>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted">Keine</span>
                    )}
                  </Td>
                  <Td className="hidden tabular-nums lg:table-cell">{c.users}</Td>
                  <Td>
                    <CustomerStatusBadge status={c.status} />
                  </Td>
                  <Td className="hidden text-muted xl:table-cell">{formatDate(c.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
