import { cache } from "react";
import { notFound } from "next/navigation";
import { adminCustomer } from "@/server/admin";
import { cloudflareConfigured, cnameTarget, hostnameInfo, type HostnameInfo } from "@/server/custom-domains";
import { CustomerDetail } from "./customer-detail";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shared by metadata and page; malformed ids would make Postgres throw, so they are unknown too. */
const load = cache((id: string) => (uuid.test(id) ? adminCustomer(id) : Promise.resolve(null)));

export async function generateMetadata({ params }: PageProps<"/admin/customers/[id]">) {
  const { id } = await params;
  const data = await load(id);
  return { title: data?.customer.name ?? "Kunde" };
}

export default async function CustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();
  const { customer } = data;
  // Live state from Cloudflare: which DNS records are still missing.
  let info: HostnameInfo | null = null;
  let infoError: string | null = null;
  if (customer.domainHostnameId) {
    try {
      info = await hostnameInfo(customer.domainHostnameId);
    } catch (error) {
      infoError = error instanceof Error ? error.message : String(error);
    }
  }
  return (
    <CustomerDetail
      customer={{
        id: customer.id,
        name: customer.name,
        contactName: customer.contactName,
        contactEmail: customer.contactEmail,
        phone: customer.phone,
        notes: customer.notes,
        status: customer.status,
        createdAt: customer.createdAt,
      }}
      domain={{
        domain: customer.domain,
        status: info?.status ?? customer.domainStatus,
        cloudflare: cloudflareConfigured(),
        target: cnameTarget(),
        txtRecords: info?.txtRecords ?? [],
        errors: infoError ? [infoError] : (info?.errors ?? []),
      }}
      sites={data.sites}
      people={data.people}
    />
  );
}
