"use client";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NestedDialogOverlay } from "@/components/ui/nested-dialog-overlay";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// ─── types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

type AppStatus = {
  configured: boolean;
  app_id?: string;
  app_name?: string;
  app_slug?: string;
  installed_on?: string;
  installation_id?: string;
};

// ─── step indicator ───────────────────────────────────────────────────────────

function StepIndicator({
  step,
  label,
  state,
}: {
  step: number;
  label: string;
  state: "active" | "done" | "pending";
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
          state === "done"
            ? "border-emerald-500 bg-emerald-500/10 text-emerald-500"
            : state === "active"
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-transparent text-muted-foreground"
        }`}
      >
        {state === "done" ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          step
        )}
      </div>
      <span
        className={`text-xs font-medium ${
          state === "active"
            ? "text-foreground"
            : state === "done"
            ? "text-emerald-500"
            : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function StepDivider() {
  return <div className="h-px w-8 bg-border" />;
}

// ─── main component ───────────────────────────────────────────────────────────

export function GitHubAppSetupModal({
  open,
  onOpenChange,
  initialStep = 1,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStep?: 1 | 2 | 3;
  onComplete: () => void;
}) {
  const [step, setStep] = useState<Step>(initialStep);
  const [appName, setAppName] = useState("Kern CMS");
  const [target, setTarget] = useState<"user" | "org">("user");
  const [orgName, setOrgName] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep(initialStep);
      setWaiting(false);
      setError("");
      setAppStatus(null);
      localStorage.removeItem("kern-github-setup-step");
    } else {
      stopPolling();
    }
  }, [open, initialStep]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, []);

  function stopPolling() {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(advanceTo: Step) {
    stopPolling();
    pollRef.current = setInterval(() => {
      const flag = localStorage.getItem("kern-github-setup-step");
      const expectedFlag = advanceTo === 2 ? "created" : "done";
      if (flag === expectedFlag || flag === "done") {
        stopPolling();
        setWaiting(false);
        localStorage.removeItem("kern-github-setup-step");
        setStep(advanceTo);
        fetchAppStatus();
      }
    }, 2000);
  }

  async function fetchAppStatus() {
    try {
      const res = await fetch("/api/github-app/status");
      if (res.ok) {
        const data: AppStatus = await res.json();
        setAppStatus(data);
      }
    } catch {
      // non-fatal — display is best-effort
    }
  }

  // Step 1 → open setup URL and start polling
  function handleCreateOnGitHub() {
    setError("");
    const params = new URLSearchParams({ name: appName, target });
    if (target === "org" && orgName.trim()) {
      params.set("org", orgName.trim());
    }
    window.open(`/api/github-app/setup?${params.toString()}`, "_blank");
    setWaiting(true);
    startPolling(2);
  }

  // Step 2 → fetch install URL and open it
  async function handleInstallOnGitHub() {
    setError("");
    try {
      const res = await fetch("/api/github-app/install-url");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Could not get install URL.");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      window.open(url, "_blank");
      setWaiting(true);
      startPolling(3);
    } catch {
      setError("Network error — please try again.");
    }
  }

  function handleClose() {
    stopPolling();
    setWaiting(false);
    onOpenChange(false);
  }

  function handleDone() {
    stopPolling();
    onOpenChange(false);
    onComplete();
  }

  const stepState = (s: Step): "active" | "done" | "pending" => {
    if (step > s) return "done";
    if (step === s) return "active";
    return "pending";
  };

  // ─── body content ────────────────────────────────────────────────────────────

  function renderBody() {
    // Step 1
    if (step === 1) {
      if (waiting) {
        return (
          <div className="flex flex-col items-center gap-4 py-6">
            <svg className="h-6 w-6 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" className="opacity-25" />
              <path d="M12 2a10 10 0 0 1 10 10" className="opacity-75" />
            </svg>
            <div className="text-center">
              <p className="text-sm font-medium">Waiting for GitHub…</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Complete the app creation on GitHub, then come back here.
              </p>
            </div>
          </div>
        );
      }

      return (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="app-name">App name</Label>
            <Input
              id="app-name"
              value={appName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setAppName(e.target.value)
              }
              placeholder="Kern CMS"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Install on</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTarget("user")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  target === "user"
                    ? "border-foreground bg-foreground/5 text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                }`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                My account
              </button>
              <button
                type="button"
                onClick={() => setTarget("org")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  target === "org"
                    ? "border-foreground bg-foreground/5 text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                }`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Organization
              </button>
            </div>
          </div>

          {target === "org" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="org-name">Organization name</Label>
              <Input
                id="org-name"
                value={orgName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setOrgName(e.target.value)
                }
                placeholder="my-org"
              />
            </div>
          )}

          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium text-foreground">
              Permissions requested
            </p>
            <ul className="flex flex-col gap-1">
              {[
                { name: "Contents", level: "Read & Write" },
                { name: "Metadata", level: "Read only" },
                { name: "Pull requests", level: "Read & Write" },
              ].map(({ name, level }) => (
                <li key={name} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{name}</span>
                  <span className="text-xs text-foreground">{level}</span>
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </div>
      );
    }

    // Step 2
    if (step === 2) {
      if (waiting) {
        return (
          <div className="flex flex-col items-center gap-4 py-6">
            <svg className="h-6 w-6 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" className="opacity-25" />
              <path d="M12 2a10 10 0 0 1 10 10" className="opacity-75" />
            </svg>
            <div className="text-center">
              <p className="text-sm font-medium">Waiting for installation…</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Complete the installation on GitHub, then come back here.
              </p>
            </div>
          </div>
        );
      }

      return (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-emerald-500"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                GitHub App created successfully
              </p>
            </div>
            {appStatus?.app_name && (
              <p className="mt-1 text-xs text-emerald-600/70 dark:text-emerald-400/70">
                App: <span className="font-medium">{appStatus.app_name}</span>
                {appStatus.app_id && (
                  <span className="ml-2 opacity-60">ID: {appStatus.app_id}</span>
                )}
              </p>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            Now install the app on a GitHub account or organisation so it can
            access repositories.
          </p>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </div>
      );
    }

    // Step 3
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-emerald-500"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              GitHub App installed successfully
            </p>
          </div>
        </div>

        {appStatus && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium">App details</p>
            <ul className="flex flex-col gap-1">
              {appStatus.app_name && (
                <li className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Name</span>
                  <span className="text-xs font-medium">{appStatus.app_name}</span>
                </li>
              )}
              {appStatus.app_id && (
                <li className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">App ID</span>
                  <span className="font-mono text-xs">{appStatus.app_id}</span>
                </li>
              )}
              {appStatus.installed_on && (
                <li className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Installed on
                  </span>
                  <span className="text-xs font-medium">
                    {appStatus.installed_on}
                  </span>
                </li>
              )}
              {appStatus.installation_id && (
                <li className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Installation ID
                  </span>
                  <span className="font-mono text-xs">
                    {appStatus.installation_id}
                  </span>
                </li>
              )}
            </ul>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Your GitHub App is set up. You can now connect repositories to
          projects.
        </p>
      </div>
    );
  }

  // ─── footer ───────────────────────────────────────────────────────────────────

  function renderFooter() {
    if (step === 1) {
      return (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateOnGitHub}
            disabled={waiting || !appName.trim() || (target === "org" && !orgName.trim())}
          >
            {waiting ? (
              "Waiting…"
            ) : (
              <>
                Create on GitHub
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="ml-1"
                >
                  <path d="M15 3h6v6" />
                  <path d="M10 14 21 3" />
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                </svg>
              </>
            )}
          </Button>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleInstallOnGitHub} disabled={waiting}>
            {waiting ? (
              "Waiting…"
            ) : (
              <>
                Install on GitHub
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="ml-1"
                >
                  <path d="M15 3h6v6" />
                  <path d="M10 14 21 3" />
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                </svg>
              </>
            )}
          </Button>
        </div>
      );
    }

    // step 3
    return (
      <div className="flex justify-end">
        <Button onClick={handleDone}>Done</Button>
      </div>
    );
  }

  // ─── render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <NestedDialogOverlay
        open={open}
        onClose={handleClose}
        zIndex={55}
      />
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent hideOverlay showCloseButton={false} className="sm:max-w-md !z-[56]">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-base font-medium">
              GitHub App Setup
            </h3>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" x2="6" y1="6" y2="18" />
                  <line x1="6" x2="18" y1="6" y2="18" />
                </svg>
            </button>
          </div>

          {/* Stepper */}
          <div className="flex items-center justify-between py-1">
            <StepIndicator step={1} label="Create" state={stepState(1)} />
            <StepDivider />
            <StepIndicator step={2} label="Install" state={stepState(2)} />
            <StepDivider />
            <StepIndicator step={3} label="Done" state={stepState(3)} />
          </div>

          {/* Body */}
          <div className="py-1">{renderBody()}</div>

          {/* Footer */}
          <div className="-mx-4 -mb-4 rounded-b-xl border-t border-border bg-muted/50 px-4 py-3">
            {renderFooter()}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
