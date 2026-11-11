"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Inbox, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { OtpInput } from "@/components/ui/otp-input";
import { acceptInvite, requestLoginCode, verifyLoginCode } from "@/server/actions/auth";

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-[15px] text-danger">
      <AlertCircle className="mt-0.5 size-[18px] shrink-0" strokeWidth={1.75} />
      {message}
    </p>
  );
}

const RESEND_SECONDS = 30;

/**
 * Sign-in without passwords: email → six-digit code by mail → signed in.
 * With `firstRun` the form also asks for a name; that person becomes the owner.
 */
export function LoginFlow({ next, firstRun: initialFirstRun, mailpitUrl }: { next?: string; firstRun: boolean; mailpitUrl?: string }) {
  const [firstRun, setFirstRun] = useState(initialFirstRun);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [sending, startSend] = useTransition();
  const [verifying, startVerify] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function send() {
    setError(null);
    startSend(async () => {
      const result = await requestLoginCode({ email, name: firstRun ? name : undefined });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFirstRun(result.data.firstRun);
      setCode("");
      setStep("code");
      setCooldown(RESEND_SECONDS);
    });
  }

  function verify(value: string) {
    setError(null);
    startVerify(async () => {
      const result = await verifyLoginCode({ email, code: value, next });
      if (result && !result.ok) {
        setError(result.error);
        setCode("");
      }
    });
  }

  if (step === "code") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-start gap-4 rounded-2xl border border-border bg-surface p-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Mail className="size-5" strokeWidth={1.75} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-medium">Code an {email} geschickt</span>
            <span className="text-sm text-muted">
              {firstRun ? "Gib ihn ein, um dein Konto anzulegen." : "Falls es ein Konto mit dieser Adresse gibt. Er ist 10 Minuten gültig."}
            </span>
          </div>
        </div>
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) verify(code);
          }}
        >
          <div className="flex flex-col gap-3">
            <span className="text-[15px] font-medium">Anmeldecode</span>
            <OtpInput value={code} onChange={setCode} onComplete={verify} invalid={Boolean(error)} disabled={verifying} />
          </div>
          <FormError message={error} />
          <Button type="submit" size="lg" className="w-full" disabled={code.length !== 6 || verifying}>
            {verifying ? <Loader2 className="animate-spin" /> : <ArrowRight />}
            {verifying ? "Wird geprüft…" : "Anmelden"}
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStep("email");
              setError(null);
            }}
          >
            <ArrowLeft />
            Andere E-Mail
          </Button>
          <Button variant="ghost" size="sm" disabled={cooldown > 0 || sending} onClick={send}>
            {sending && <Loader2 className="animate-spin" />}
            {cooldown > 0 ? `Neuer Code in ${cooldown} s` : "Code erneut senden"}
          </Button>
        </div>
        {mailpitUrl && (
          <a
            href={mailpitUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2.5 rounded-xl border border-dashed border-border-strong px-4 py-3 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Inbox className="size-[18px] shrink-0" strokeWidth={1.75} />
            Lokale Entwicklung: Die Mail liegt in Mailpit.
          </a>
        )}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {firstRun && (
        <Field>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required autoFocus />
        </Field>
      )}
      <Field>
        <Label>E-Mail</Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          autoFocus={!firstRun}
        />
        <Description>Wir schicken dir einen sechsstelligen Code. Ein Passwort brauchst du nicht.</Description>
      </Field>
      <FormError message={error} />
      <Button type="submit" size="lg" className="w-full" disabled={sending}>
        {sending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        {sending ? "Code wird gesendet…" : "Code senden"}
      </Button>
    </form>
  );
}

export function InviteForm({ token, email, signedIn }: { token: string; email: string; signedIn: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(async () => {
          const result = await acceptInvite({ token, name: signedIn ? undefined : String(data.get("name")) });
          if (result && !result.ok) setError(result.error);
        });
      }}
    >
      <FormError message={error} />
      {!signedIn && (
        <>
          <Field>
            <Label>E-Mail</Label>
            <Input value={email} disabled readOnly />
            <Description>Später meldest du dich mit einem Code an diese Adresse an.</Description>
          </Field>
          <Field>
            <Label>Name</Label>
            <Input name="name" autoComplete="name" required autoFocus />
          </Field>
        </>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        {pending ? "Einen Moment…" : signedIn ? "Einladung annehmen" : "Beitreten"}
      </Button>
    </form>
  );
}
