"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/display";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";

export default function LoginPage() {
  const [sent, setSent] = useState(false);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-foreground text-lg font-bold text-white">
            k
          </span>
          <span className="text-2xl font-semibold tracking-tight">kerncms</span>
        </div>

        <Card className="w-full p-8">
          {sent ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-success-soft text-success">
                <MailCheck className="size-7" strokeWidth={1.75} />
              </span>
              <h1 className="text-2xl font-semibold tracking-tight">Schau in dein Postfach</h1>
              <p className="text-[15px] text-muted">Der Anmeldelink ist 15 Minuten gültig.</p>
              <Button variant="ghost" onClick={() => setSent(false)}>
                Andere E-Mail verwenden
              </Button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
                toast.success("Anmeldelink verschickt");
              }}
            >
              <div className="mb-7 flex flex-col gap-1.5">
                <h1 className="text-2xl font-semibold tracking-tight">Anmelden</h1>
                <p className="text-[15px] text-muted">Wir schicken dir einen Anmeldelink per E-Mail.</p>
              </div>
              <div className="flex flex-col gap-6">
                <Field>
                  <Label>E-Mail</Label>
                  <Input type="email" autoComplete="email" required />
                  <Description>Die Adresse, mit der du eingeladen wurdest.</Description>
                </Field>
                <Button type="submit" size="lg" className="w-full">
                  Anmeldelink senden
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
