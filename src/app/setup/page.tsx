"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

export default function SetupPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/setup").then((r) => r.json()).then((data) => {
      if (data.complete) router.replace("/");
    });
  }, [router]);

  async function handleConfirm() {
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });

    if (res.ok) {
      window.location.href = "/";
    } else {
      setError(true);
      setPin("");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-foreground"
            >
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <CardTitle className="text-xl">Setup PIN</CardTitle>
          <CardDescription>
            Enter the setup PIN from your .env file to create the first admin account.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <InputOTP
            maxLength={6}
            value={pin}
            onChange={(value) => {
              setPin(value);
              setError(false);
            }}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} className="size-11 text-lg" />
              <InputOTPSlot index={1} className="size-11 text-lg" />
              <InputOTPSlot index={2} className="size-11 text-lg" />
              <InputOTPSlot index={3} className="size-11 text-lg" />
              <InputOTPSlot index={4} className="size-11 text-lg" />
              <InputOTPSlot index={5} className="size-11 text-lg" />
            </InputOTPGroup>
          </InputOTP>
          {error && (
            <p className="text-sm text-destructive">Invalid PIN. Please try again.</p>
          )}
        </CardContent>
        <CardFooter className="border-0 bg-transparent px-4 pb-4">
          <Button className="w-full" disabled={pin.length < 6} onClick={handleConfirm}>
            Confirm
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
