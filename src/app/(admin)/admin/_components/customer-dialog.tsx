"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button, buttonStyles, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Label, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { createCustomer, type CustomerInput } from "@/server/actions/admin";
import { ErrorNote } from "./shared";

export const emptyCustomer: CustomerInput = { name: "", contactName: "", contactEmail: "", phone: "", notes: "" };

/** Name, contact and notes of a customer. Used for creating and editing. */
export function CustomerFields({
  value,
  onChange,
  disabled,
  stacked,
}: {
  value: CustomerInput;
  onChange: (next: CustomerInput) => void;
  disabled?: boolean;
  /** One column, for narrow cards. */
  stacked?: boolean;
}) {
  const set = (key: keyof CustomerInput) => (e: { target: { value: string } }) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className={cn("grid gap-5", !stacked && "sm:grid-cols-2")}>
      <Field className={cn(!stacked && "sm:col-span-2")}>
        <Label>Name</Label>
        <Input value={value.name} onChange={set("name")} disabled={disabled} required autoComplete="off" />
      </Field>
      <Field>
        <Label>Ansprechperson</Label>
        <Input value={value.contactName} onChange={set("contactName")} disabled={disabled} autoComplete="off" />
      </Field>
      <Field>
        <Label>E-Mail</Label>
        <Input type="email" value={value.contactEmail} onChange={set("contactEmail")} disabled={disabled} autoComplete="off" />
      </Field>
      <Field>
        <Label>Telefon</Label>
        <Input type="tel" value={value.phone} onChange={set("phone")} disabled={disabled} autoComplete="off" />
      </Field>
      <Field className={cn(!stacked && "sm:col-span-2")}>
        <Label>Notizen</Label>
        <Textarea value={value.notes} onChange={set("notes")} disabled={disabled} rows={3} />
      </Field>
    </div>
  );
}

/**
 * "Neuer Kunde" dialog. Without `onCreated` it opens the new customer's page afterwards;
 * with it, the caller decides (e.g. selects the customer in a form).
 */
export function NewCustomerDialog({
  onCreated,
  label = "Neuer Kunde",
  variant = "primary",
  size = "md",
}: {
  onCreated?: (customer: { id: string; name: string; contactEmail: string }) => void;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<CustomerInput>(emptyCustomer);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createCustomer(value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`${value.name.trim()} angelegt`);
      setOpen(false);
      setValue(emptyCustomer);
      if (onCreated) onCreated({ id: result.data.id, name: value.name.trim(), contactEmail: value.contactEmail.trim().toLowerCase() });
      else router.push(`/admin/customers/${result.data.id}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </Button>
      <DialogContent
        title="Neuer Kunde"
        description="Ein Kunde bündelt eine oder mehrere Websites und die Personen, die sie pflegen."
        size="lg"
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })} disabled={pending}>
              Abbrechen
            </DialogClose>
            <Button onClick={submit} disabled={pending || !value.name.trim()}>
              {pending && <Loader2 className="animate-spin" />}
              Kunde anlegen
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation(); // the dialog may be rendered inside another form (React events bubble through portals)
            submit();
          }}
        >
          <CustomerFields value={value} onChange={setValue} disabled={pending} />
          {error && <ErrorNote>{error}</ErrorNote>}
          <button type="submit" hidden />
        </form>
      </DialogContent>
    </Dialog>
  );
}
