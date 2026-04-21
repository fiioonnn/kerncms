"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { signIn } from "@/lib/auth-client";
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  InputOTP, InputOTPGroup, InputOTPSlot,
} from "@/components/ui/input-otp";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

export default function AuthPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const otpRef = useRef<HTMLInputElement>(null);
  const inviteToken = params.get("invite");
  const isSetup = params.get("setup") === "1";
  const returnDomain = params.get("returnDomain");
  const authError = params.get("error");

  useEffect(() => {
    if (inviteToken) {
      document.cookie = `invite_token=${inviteToken};path=/;max-age=3600;samesite=lax`;
    }
  }, [inviteToken]);

  useEffect(() => {
    if (returnDomain) {
      document.cookie = `return_domain=${returnDomain};path=/;max-age=3600;samesite=lax`;
    }
  }, [returnDomain]);

  useEffect(() => {
    const mainDomain = process.env.NEXT_PUBLIC_APP_URL;
    if (!mainDomain) return;

    try {
      const mainHost = new URL(mainDomain).host;
      const currentHost = window.location.host;
      if (currentHost !== mainHost) {
        const url = new URL("/auth", mainDomain);
        url.searchParams.set("returnDomain", currentHost);
        if (inviteToken) url.searchParams.set("invite", inviteToken);
        if (isSetup) url.searchParams.set("setup", "1");
        window.location.href = url.toString();
      }
    } catch {
      // invalid URL, stay on current domain
    }
  }, [inviteToken, isSetup]);

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading("email");
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), type: "sign-in" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to send code");
        setLoading(null);
        return;
      }
    } catch {
      toast.error("Failed to send code");
      setLoading(null);
      return;
    }
    setLoading(null);
    setOtpSent(true);
  }

  async function handleVerifyOTP(code: string) {
    if (code.length !== 6) return;
    setLoading("otp");
    const { error } = await signIn.emailOtp({
      email: email.trim(),
      otp: code,
    });
    setLoading(null);
    if (error) {
      toast.error(error.message ?? "Invalid code");
      setOtp("");
      return;
    }
    router.push("/api/auth/callback-handler");
  }

  async function handleSocialLogin(provider: "google" | "github") {
    setLoading(provider);
    await signIn.social({
      provider,
      callbackURL: "/api/auth/callback-handler",
    });
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4">
      <div className="mb-8">
        <img src="/logo.png" alt="kerncms" className="h-8" />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {isSetup ? "Create Admin Account" : "Sign in"}
          </CardTitle>
          <CardDescription>
            {inviteToken
              ? "Sign in to accept your invitation"
              : isSetup
                ? "Sign in to create the first admin account"
                : "Sign in to continue"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {authError === "not_invited" && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive text-center">
              You need an invitation to sign in. Please contact an administrator.
            </div>
          )}

          {!otpSent ? (
            <form onSubmit={handleSendOTP} className="flex flex-col gap-3">
              <Input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading !== null}
                autoFocus
                className="h-10"
              />
              <Button
                type="submit"
                className="w-full h-10"
                disabled={loading !== null || !email.trim()}
              >
                {loading === "email" ? "Sending..." : "Continue with Email"}
              </Button>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground text-center">
                Enter the code sent to <span className="font-medium text-foreground">{email}</span>
              </p>
              <InputOTP
                ref={otpRef}
                maxLength={6}
                value={otp}
                onChange={(val) => {
                  setOtp(val);
                  if (val.length === 6) handleVerifyOTP(val);
                }}
                disabled={loading === "otp"}
                autoFocus
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                containerClassName="justify-center"
              >
                <InputOTPGroup className="w-full">
                  <InputOTPSlot index={0} className="h-12 flex-1 text-lg" />
                  <InputOTPSlot index={1} className="h-12 flex-1 text-lg" />
                  <InputOTPSlot index={2} className="h-12 flex-1 text-lg" />
                  <InputOTPSlot index={3} className="h-12 flex-1 text-lg" />
                  <InputOTPSlot index={4} className="h-12 flex-1 text-lg" />
                  <InputOTPSlot index={5} className="h-12 flex-1 text-lg" />
                </InputOTPGroup>
              </InputOTP>
              {loading === "otp" && (
                <p className="text-sm text-muted-foreground text-center">Verifying...</p>
              )}
              <div className="flex justify-center gap-1">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => { setOtpSent(false); setOtp(""); }}
                  disabled={loading !== null}
                >
                  Change email
                </Button>
                <span className="text-muted-foreground/50 text-xs leading-8">·</span>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => { setOtp(""); handleSendOTP({ preventDefault: () => {} } as React.FormEvent); }}
                  disabled={loading !== null}
                >
                  Resend code
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="w-full justify-center gap-3 h-10"
              onClick={() => handleSocialLogin("google")}
              disabled={loading !== null}
            >
              <GoogleIcon />
              {loading === "google" ? "Redirecting..." : "Continue with Google"}
            </Button>
            <Button
              variant="outline"
              className="w-full justify-center gap-3 h-10"
              onClick={() => handleSocialLogin("github")}
              disabled={loading !== null}
            >
              <GithubIcon />
              {loading === "github" ? "Redirecting..." : "Continue with GitHub"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
