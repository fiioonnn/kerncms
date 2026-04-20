"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { NestedDialogOverlay } from "@/components/ui/nested-dialog-overlay";
import { GitHubAppSetupModal } from "@/components/github-app-setup-modal";
import { useSession, signOut, useIsAdmin, useIsSuperAdmin } from "@/lib/auth-client";
import { useProjects } from "@/components/project-context";

type Role = "admin" | "editor" | "viewer";

type Member = {
  id: string;
  userId: string;
  name: string;
  email: string;
  image?: string | null;
  role: Role;
};

type Invitation = {
  id: string;
  email: string;
  role: Role;
};

const NAV_ITEMS: { id: string; label: string; category?: string; icon: React.ReactNode }[] = [
  {
    id: "profile",
    label: "Profile",
    category: "General",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: "account",
    label: "Account",
    category: "General",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="14" x="2" y="5" rx="2" />
        <line x1="2" x2="22" y1="10" y2="10" />
      </svg>
    ),
  },
  {
    id: "preferences",
    label: "Preferences",
    category: "General",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    id: "notifications",
    label: "Notifications",
    category: "General",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
  {
    id: "integrations",
    label: "Integrations",
    category: "Admin",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" />
        <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
      </svg>
    ),
  },
  {
    id: "members",
    label: "Members",
    category: "Admin",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: "ai",
    label: "AI",
    category: "Admin",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
        <path d="M20 3v4" />
        <path d="M22 5h-4" />
      </svg>
    ),
  },
  {
    id: "domains",
    label: "Domains",
    category: "Admin",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
];

function ProfileSection() {
  const { data: session } = useSession();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-medium">Profile</h3>
        <p className="text-sm text-muted-foreground">Manage your personal information.</p>
      </div>
      <Separator />
      <div className="flex items-center gap-4">
        {session?.user.image ? (
          <img src={session.user.image} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-full" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-xl font-medium text-muted-foreground">
            {session?.user.name?.charAt(0).toUpperCase() ?? "?"}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{session?.user.name ?? "Loading..."}</p>
          <p className="text-xs text-muted-foreground">{session?.user.email ?? ""}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="display-name">Display Name</Label>
        <Input id="display-name" defaultValue={session?.user.name ?? ""} readOnly className="text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" defaultValue={session?.user.email ?? ""} readOnly className="text-muted-foreground" />
      </div>
    </div>
  );
}

function AccountSection() {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: session } = useSession();
  const globalRole = (session?.user as { role?: string } | undefined)?.role ?? "member";

  async function handleDeleteAccount() {
    const res = await fetch("/api/account", { method: "DELETE" });
    if (res.ok) {
      await signOut({ fetchOptions: { onSuccess: () => router.push("/auth") } });
    } else {
      const data = await res.json();
      alert(data.error ?? "Failed to delete account");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-medium">Account</h3>
        <p className="text-sm text-muted-foreground">Manage your account settings.</p>
      </div>
      <Separator />
      <div className="flex flex-col gap-4">
        <Label>System Role</Label>
        <div className="flex items-center gap-2">
          <Badge variant={globalRole === "superadmin" || globalRole === "admin" ? "default" : "secondary"}>
            {globalRole === "superadmin" ? "Super Admin" : globalRole === "admin" ? "Admin" : "Member"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {globalRole === "superadmin" ? "Full system access" : globalRole === "admin" ? "Full system access" : "Standard access"}
          </span>
        </div>
      </div>
      <Separator />
      <div>
        {!confirmDelete ? (
          <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
            Delete Account
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-destructive">This action is permanent and cannot be undone.</p>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={handleDeleteAccount}>
                Confirm Delete
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PreferencesSection() {
  const [advancedView, setAdvancedView] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((d) => { setAdvancedView(d.advancedView ?? false); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function toggle(field: string, value: boolean, setter: (v: boolean) => void) {
    setter(value);
    window.dispatchEvent(new CustomEvent("preferences-change", { detail: { [field]: value } }));
    await fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-medium">Preferences</h3>
        <p className="text-sm text-muted-foreground">Customize your experience.</p>
      </div>
      <Separator />
      {loading ? (
        <div className="h-12 w-full rounded bg-muted/50 animate-pulse" />
      ) : (
        <div className="flex flex-col gap-5">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => toggle("advancedView", !advancedView, setAdvancedView)}
          >
            <div className="flex flex-col gap-0.5 pr-8">
              <Label className="cursor-pointer">Advanced view</Label>
              <p className="text-xs text-muted-foreground">Show additional controls for developers and power users.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={advancedView}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${advancedView ? "bg-foreground" : "bg-muted"}`}
            >
              <span className={`pointer-events-none block h-3.5 w-3.5 rounded-full bg-background transition-transform ${advancedView ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationsSection() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-medium">Notifications</h3>
        <p className="text-sm text-muted-foreground">Configure how you receive notifications.</p>
      </div>
      <Separator />
      <p className="text-sm text-muted-foreground">No notification settings available yet.</p>
    </div>
  );
}

function ResendConfigDialog({
  open,
  onOpenChange,
  initialData,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialData: { masked_key: string | null; has_key: boolean; from_domain: string } | null;
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [fromDomain, setFromDomain] = useState("resend.dev");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [loadingDomains, setLoadingDomains] = useState(false);

  useEffect(() => {
    if (!open) return;
    setApiKey(initialData?.masked_key ?? "");
    setFromDomain(initialData?.from_domain ?? "resend.dev");
    setTestResult(null);
    setDomains([]);
    if (initialData?.has_key) {
      fetchDomains();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchDomains(key?: string) {
    setLoadingDomains(true);
    try {
      const res = await fetch("/api/settings/resend/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: key }),
      });
      if (res.ok) {
        const data = await res.json();
        setDomains(data.domains ?? []);
        setTestResult({ ok: true });
        if (data.domains?.length && !data.domains.includes(fromDomain)) {
          setFromDomain(data.domains[0]);
        }
      } else {
        const data = await res.json();
        setTestResult({ ok: false, error: data.error ?? "Test failed" });
      }
    } catch {
      setTestResult({ ok: false, error: "Connection failed" });
    } finally {
      setLoadingDomains(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const keyToTest = apiKey.includes("\u2022") ? undefined : apiKey;
    await fetchDomains(keyToTest);
    setTesting(false);
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/settings/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, from_domain: fromDomain }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Resend configuration saved.");
      onOpenChange(false);
      onSaved();
    } else {
      toast.error("Failed to save.");
    }
  }

  async function handleRemove() {
    setSaving(true);
    const res = await fetch("/api/settings/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: "", from_domain: "resend.dev" }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Resend configuration removed.");
      onOpenChange(false);
      onSaved();
    }
  }

  return (
    <>
      <NestedDialogOverlay open={open} onClose={() => onOpenChange(false)} zIndex={55} />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent hideOverlay className="sm:max-w-sm !z-[56]">
          <div className="flex flex-col gap-2">
            <h3 className="font-heading text-base font-medium">Configure Resend</h3>
            <p className="text-sm text-muted-foreground">Set up email delivery for invitations and notifications.</p>
          </div>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label>API Key</Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setApiKey(e.target.value); setTestResult(null); }}
                  placeholder="re_..."
                  className="flex-1 font-medium text-xs"
                />
                <Button variant="outline" disabled={!apiKey || testing} onClick={handleTest}>
                  {testing ? (
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M4 12a8 8 0 018-8" className="opacity-75" /></svg>
                  ) : testResult?.ok ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M20 6 9 17l-5-5" /></svg>
                  ) : "Test"}
                </Button>
              </div>
              {testResult && !testResult.ok && (
                <p className="text-xs text-destructive">{testResult.error}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label>From Domain</Label>
              {loadingDomains ? (
                <div className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm text-muted-foreground">
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M4 12a8 8 0 018-8" className="opacity-75" /></svg>
                  Loading domains...
                </div>
              ) : domains.length > 0 ? (
                <Select value={fromDomain} onValueChange={(v) => { if (v) setFromDomain(v); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select domain" />
                  </SelectTrigger>
                  <SelectContent side="bottom" alignItemWithTrigger={false}>
                    {domains.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={fromDomain}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFromDomain(e.target.value)}
                  placeholder="resend.dev"
                  className="text-sm"
                />
              )}
              <p className="text-xs text-muted-foreground">
                Emails will be sent from noreply@{fromDomain || "resend.dev"}
                {domains.length === 0 && testResult?.ok && <span className="block mt-0.5 text-amber-500">No verified domains found. Verify a domain at resend.com/domains.</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              {initialData?.has_key && (
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleRemove} disabled={saving}>
                  Remove
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={!apiKey || saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ResendCard() {
  const [status, setStatus] = useState<{
    configured: boolean;
    source: string | null;
    masked_key: string | null;
    has_key: boolean;
    from_domain: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/resend");
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  return (
    <>
      <div
        className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50"
        onClick={() => { if (!loading) setDetailOpen(true); }}
      >
        <svg width="18" height="18" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 28C0 12.536 12.536 0 28 0s28 12.536 28 28-12.536 28-28 28S0 43.464 0 28Z" fill="currentColor" fillOpacity="0.1"/>
          <path d="M18 16h14.56c2.4 0 4.36.64 5.88 1.92 1.52 1.24 2.28 2.96 2.28 5.16 0 2.16-.76 3.92-2.28 5.28-1.56 1.32-3.52 1.98-5.88 1.98H22.8V40H18V16Zm4.8 10.68h9.24c.96 0 1.74-.28 2.34-.84.6-.56.9-1.28.9-2.16 0-.92-.3-1.64-.9-2.16-.6-.56-1.38-.84-2.34-.84H22.8v5.98Z" fill="currentColor"/>
          <path d="M31.08 30.34 41.28 40H35.4l-9.6-9.66h5.28Z" fill="currentColor"/>
        </svg>
        <div>
          <p className="text-sm font-medium">Resend</p>
          {loading ? (
            <div className="h-3 w-20 rounded bg-muted/50 animate-pulse mt-1" />
          ) : status?.configured ? (
            <p className="text-xs text-emerald-500">Configured{status.source === "env" ? " (env)" : ""}</p>
          ) : (
            <p className="text-xs text-red-400">Not configured</p>
          )}
        </div>
      </div>

      <NestedDialogOverlay open={detailOpen} onClose={() => setDetailOpen(false)} zIndex={55} />
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent hideOverlay className="sm:max-w-sm !z-[56]">
          <div className="flex items-center gap-3">
            <svg width="18" height="18" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 28C0 12.536 12.536 0 28 0s28 12.536 28 28-12.536 28-28 28S0 43.464 0 28Z" fill="currentColor" fillOpacity="0.1"/>
              <path d="M18 16h14.56c2.4 0 4.36.64 5.88 1.92 1.52 1.24 2.28 2.96 2.28 5.16 0 2.16-.76 3.92-2.28 5.28-1.56 1.32-3.52 1.98-5.88 1.98H22.8V40H18V16Zm4.8 10.68h9.24c.96 0 1.74-.28 2.34-.84.6-.56.9-1.28.9-2.16 0-.92-.3-1.64-.9-2.16-.6-.56-1.38-.84-2.34-.84H22.8v5.98Z" fill="currentColor"/>
              <path d="M31.08 30.34 41.28 40H35.4l-9.6-9.66h5.28Z" fill="currentColor"/>
            </svg>
            <div>
              <p className="text-base font-medium">Resend</p>
              {status?.configured ? (
                <p className="text-xs text-emerald-500">Configured{status.source === "env" ? " (env)" : ""}</p>
              ) : (
                <p className="text-xs text-red-400">Not configured</p>
              )}
            </div>
          </div>

          {status?.configured && status.source !== "env" && (
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">API Key</span><span>{status.masked_key ?? "\u2014"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">From Domain</span><span>{status.from_domain}</span></div>
            </div>
          )}

          {status?.configured && status.source === "env" && (
            <p className="text-sm text-muted-foreground">
              Configured via environment variables. You can override with UI-managed credentials.
            </p>
          )}

          {!status?.configured && (
            <p className="text-sm text-muted-foreground">
              Set up email delivery for invitations and notifications.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
            <Button onClick={() => { setDetailOpen(false); setDialogOpen(true); }}>
              {status?.configured ? "Edit" : "Configure"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ResendConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialData={status}
        onSaved={loadStatus}
      />
    </>
  );
}

function IntegrationsSection() {
  const [status, setStatus] = useState<{
    configured: boolean;
    source?: string;
    app_id?: string;
    app_name?: string;
    app_slug?: string;
    installed_on?: string;
    installation_id?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialStep, setModalInitialStep] = useState<1 | 2 | 3>(1);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/github-app/status");
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  function openSetup(step: 1 | 2 | 3 = 1) {
    setModalInitialStep(step);
    setModalOpen(true);
  }



  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-medium">Integrations</h3>
        <p className="text-sm text-muted-foreground">Manage third-party integrations and connected accounts.</p>
      </div>
      <Separator />

      <div
        className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50"
        onClick={() => { if (!loading) setDetailOpen(true); }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
        </svg>
        <div>
          <p className="text-sm font-medium">GitHub</p>
          {loading ? (
            <div className="h-3 w-20 rounded bg-muted/50 animate-pulse mt-1" />
          ) : status?.configured ? (
            <p className="text-xs text-emerald-500">Connected</p>
          ) : (
            <p className="text-xs text-red-400">Not configured</p>
          )}
        </div>
      </div>

      <NestedDialogOverlay open={detailOpen} onClose={() => setDetailOpen(false)} zIndex={55} />
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent hideOverlay className="sm:max-w-sm !z-[56]">
          <div className="flex items-center gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <div>
              <p className="text-base font-medium">GitHub</p>
              {status?.configured ? (
                <p className="text-xs text-emerald-500">Connected</p>
              ) : (
                <p className="text-xs text-red-400">Not configured</p>
              )}
            </div>
          </div>

          {status?.configured && status.source === "db" && (
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">App</span><span>{status.app_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">App ID</span><span>{status.app_id}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Installed</span><span>{status.installed_on ?? "\u2014"}</span></div>
            </div>
          )}

          {status?.configured && status.source === "env" && (
            <p className="text-sm text-muted-foreground">
              Configured via environment variables. Use the setup flow to manage credentials in the UI instead.
            </p>
          )}

          {!status?.configured && (
            <p className="text-sm text-muted-foreground">
              Connect a GitHub App to manage content repositories.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
            {status?.configured && status.source === "db" && (
              <>
                <Button variant="outline" onClick={() => { setDetailOpen(false); openSetup(1); }}>Reconfigure</Button>
                <Button onClick={() => { setDetailOpen(false); openSetup(2); }}>Reinstall</Button>
              </>
            )}
            {status?.configured && status.source === "env" && (
              <Button onClick={() => { setDetailOpen(false); openSetup(1); }}>Migrate to UI setup</Button>
            )}
            {!status?.configured && (
              <Button onClick={() => { setDetailOpen(false); openSetup(1); }}>Setup GitHub App</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ResendCard />

      <GitHubAppSetupModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialStep={modalInitialStep}
        onComplete={loadStatus}
      />
    </div>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  onInvite,
  existingEmails,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (email: string, role: Role) => Promise<void>;
  existingEmails: string[];
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    const trimmed = email.trim();
    if (!trimmed || existingEmails.includes(trimmed)) return;
    setSending(true);
    await onInvite(trimmed, role);
    setSending(false);
    setEmail("");
    setRole("editor");
    onOpenChange(false);
  }

  return (
    <>
    <NestedDialogOverlay open={open} onClose={() => onOpenChange(false)} zIndex={55} />
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setEmail(""); setRole("editor"); } }}>
      <DialogContent hideOverlay className="sm:max-w-sm !z-[56]">
        <div className="flex flex-col gap-2">
          <h3 className="font-heading text-base font-medium">Invite Member</h3>
          <p className="text-sm text-muted-foreground">Send an invitation to join your team.</p>
        </div>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              placeholder="colleague@company.com"
              type="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") handleSubmit(); }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(val) => setRole(val as Role)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="bottom" alignItemWithTrigger={false}>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!email.trim() || sending}>
            {sending ? "Sending..." : "Send Invite"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

type SystemUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: "superadmin" | "admin" | "member";
};

function SystemInviteDialog({
  open,
  onOpenChange,
  existingEmails,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingEmails: string[];
}) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (existingEmails.includes(trimmed)) {
      toast.error("This user is already a member.");
      onOpenChange(false);
      return;
    }
    setEmail("");
    onOpenChange(false);
    const res = await fetch("/api/invites/system", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmed }),
    });
    if (res.ok) {
      toast.success(`Invite sent to ${trimmed}`);
    } else {
      const text = await res.text();
      let msg = "Failed to send invite";
      try { msg = JSON.parse(text).error ?? msg; } catch { /* empty body */ }
      toast.error(msg);
    }
  }

  return (
    <>
    <NestedDialogOverlay open={open} onClose={() => onOpenChange(false)} zIndex={55} />
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setEmail(""); }}>
      <DialogContent hideOverlay className="sm:max-w-sm !z-[56]">
        <div className="flex flex-col gap-2">
          <h3 className="font-heading text-base font-medium">Invite Member</h3>
          <p className="text-sm text-muted-foreground">Send an invitation to join this CMS.</p>
        </div>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="system-invite-email">Email</Label>
            <Input
              id="system-invite-email"
              placeholder="colleague@company.com"
              type="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") handleSubmit(); }}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!email.trim() || sending}>
            {sending ? "Sending..." : "Send Invite"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

type MemberDetail = SystemUser & {
  createdAt?: string;
  projects: { projectId: string; projectName: string; projectColor: string; role: string; joinedAt: string }[];
};

function roleBadgeLabel(role: string) {
  if (role === "superadmin") return "Super Admin";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function MemberDetailDialog({
  open,
  onOpenChange,
  userId,
  currentUserRole,
  isSelf,
  onRoleChanged,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | null;
  currentUserRole: string;
  isSelf: boolean;
  onRoleChanged: (userId: string, newRole: "admin" | "member") => void;
  onDeleted: (userId: string) => void;
}) {
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    setConfirmDelete(false);
    fetch(`/api/users/${userId}`).then((r) => r.json()).then(setDetail).finally(() => setLoading(false));
  }, [open, userId]);

  const canEdit = !isSelf
    && detail?.role !== "superadmin"
    && (currentUserRole === "superadmin" || detail?.role === "member");

  async function handleChangeRole(role: "admin" | "member") {
    if (!detail) return;
    const res = await fetch(`/api/users/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setDetail({ ...detail, role });
      onRoleChanged(detail.id, role);
      toast.success(`Role changed to ${roleBadgeLabel(role)}`);
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Failed to change role");
    }
  }

  async function handleDelete() {
    if (!detail) return;
    const res = await fetch(`/api/users/${detail.id}`, { method: "DELETE" });
    if (res.ok) {
      onDeleted(detail.id);
      onOpenChange(false);
      toast.success(`${detail.name} removed`);
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Failed to remove user");
    }
  }

  return (
    <>
      <NestedDialogOverlay open={open} onClose={() => onOpenChange(false)} zIndex={55} />
      <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setConfirmDelete(false); }}>
        <DialogContent hideOverlay className="sm:max-w-sm !z-[56]">
          {loading || !detail ? (
            <div className="flex items-center justify-center py-8">
              <svg className="h-5 w-5 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M4 12a8 8 0 018-8" className="opacity-75" /></svg>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                {detail.image ? (
                  <img src={detail.image} alt="" referrerPolicy="no-referrer" className="h-12 w-12 rounded-full" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-base font-medium text-muted-foreground">
                    {detail.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{detail.name}</p>
                    {isSelf && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">You</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{detail.email}</p>
                </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-2">
                <Label>System Role</Label>
                {canEdit ? (
                  <Select value={detail.role} onValueChange={(val) => handleChangeRole(val as "admin" | "member")}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{roleBadgeLabel(detail.role)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent side="bottom" alignItemWithTrigger={false}>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant={detail.role === "superadmin" || detail.role === "admin" ? "default" : "secondary"} className="w-fit">
                    {roleBadgeLabel(detail.role)}
                  </Badge>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label>Projects</Label>
                {detail.projects.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No project memberships.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {detail.projects.map((p) => (
                      <div key={p.projectId} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.projectColor }} />
                          <span className="text-sm">{p.projectName}</span>
                        </div>
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{roleBadgeLabel(p.role)}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {detail.createdAt && (
                <p className="text-[11px] text-muted-foreground">
                  Joined {new Date(detail.createdAt).toLocaleDateString()}
                </p>
              )}

              {canEdit && (
                <>
                  <Separator />
                  {!confirmDelete ? (
                    <Button variant="destructive" size="sm" className="w-fit" onClick={() => setConfirmDelete(true)}>
                      Remove User
                    </Button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-destructive">This will remove the user and all their project memberships.</p>
                      <div className="flex gap-2">
                        <Button variant="destructive" size="sm" onClick={handleDelete}>Confirm</Button>
                        <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MembersSection() {
  const { data: session } = useSession();
  const isSuperAdmin = useIsSuperAdmin();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [search, setSearch] = useState("");
  const [resendReady, setResendReady] = useState<boolean | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    fetch("/api/settings/resend").then((r) => r.json()).then((d) => setResendReady(d.configured)).catch(() => setResendReady(false));
  }, []);

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const myRole = (session?.user as { role?: string } | undefined)?.role ?? "member";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium">Members</h3>
          <p className="text-sm text-muted-foreground">Manage users with access to this CMS.</p>
        </div>
        <Button size="sm" onClick={() => setShowInvite(true)} disabled={resendReady === false} title={resendReady === false ? "Set up Resend in Integrations to send invites" : undefined}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" x2="19" y1="8" y2="14" />
            <line x1="22" x2="16" y1="11" y2="11" />
          </svg>
          Invite
        </Button>
      </div>
      <Separator />

      <Input
        placeholder="Search members..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-sm"
      />

      <SystemInviteDialog
        open={showInvite}
        onOpenChange={setShowInvite}
        existingEmails={users.map((u) => u.email)}
      />

      <MemberDetailDialog
        open={!!selectedUserId}
        onOpenChange={(v) => { if (!v) setSelectedUserId(null); }}
        userId={selectedUserId}
        currentUserRole={myRole}
        isSelf={selectedUserId === session?.user.id}
        onRoleChanged={(uid, role) => setUsers((prev) => prev.map((u) => u.id === uid ? { ...u, role } : u))}
        onDeleted={(uid) => setUsers((prev) => prev.filter((u) => u.id !== uid))}
      />

      <div className="flex flex-col gap-1">
        {filtered.length === 0 && users.length > 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No members found.</p>
        ) : filtered.map((u) => {
          const isSelf = u.id === session?.user.id;
          return (
            <button
              key={u.id}
              onClick={() => setSelectedUserId(u.id)}
              className="flex items-center justify-between rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center gap-3">
                {u.image ? (
                  <img src={u.image} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-muted-foreground">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{u.name}</p>
                    {isSelf && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">You</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
              </div>
              <Badge variant={u.role === "superadmin" || u.role === "admin" ? "default" : "secondary"}>
                {roleBadgeLabel(u.role)}
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}


const PROVIDER_INFO: Record<string, { label: string; icon: React.ReactNode }> = {
  anthropic: {
    label: "Anthropic",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm1.21 5.124-2.18 5.63h4.36l-2.18-5.63z" /></svg>,
  },
  openai: {
    label: "OpenAI",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" /></svg>,
  },
};

function AddProviderDialog({ open, onOpenChange, slot, onSave, editData }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slot: "primary" | "fallback";
  onSave: (provider: string, apiKey: string, model: string) => void;
  editData?: { provider: string; model: string; maskedKey: string } | null;
}) {
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [testing, setTesting] = useState(false);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modelOpen) return;
    function handleClick(e: MouseEvent) {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [modelOpen]);

  useEffect(() => {
    if (!open) return;
    if (editData) {
      setProvider(editData.provider);
      setApiKey(editData.maskedKey);
      setModel(editData.model);
      setModels([]);
      setLoadingModels(true);
      fetch(`/api/settings/ai/models?slot=${slot}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.models?.length) {
            setModels(data.models);
            if (!data.models.some((m: { id: string }) => m.id === editData.model)) {
              setModel(data.models[0].id);
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoadingModels(false));
    } else {
      setProvider("anthropic");
      setApiKey("");
      setModel("");
      setModels([]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setModels([]);
    setModel("");
    if (editData && provider !== editData.provider) setApiKey("");
  }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!apiKey || apiKey.length < 10 || apiKey.includes("\u2022")) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoadingModels(true);
      try {
        const res = await fetch("/api/settings/ai/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, api_key: apiKey }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (data.models?.length) {
          setModels(data.models);
          if (!data.models.some((m: { id: string }) => m.id === model)) {
            setModel(data.models[0].id);
          }
        }
      } catch {
        // keep current models on error
      } finally {
        setLoadingModels(false);
      }
    }, 500);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [apiKey, provider]);

  async function handleTest() {
    if (!apiKey) return;
    setTesting(true);
    try {
      const res = await fetch("/api/settings/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, api_key: apiKey, slot }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("API key is valid");
      } else {
        toast.error(data.error ?? "Test failed");
      }
    } catch {
      toast.error("Connection failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <NestedDialogOverlay open={open} onClose={() => onOpenChange(false)} zIndex={55} />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent hideOverlay className="sm:max-w-sm !z-[56]">
          <div className="flex flex-col gap-2">
            <h3 className="font-heading text-base font-medium">
              {slot === "primary"
                ? (editData ? "Edit Primary Provider" : "Add Primary Provider")
                : (editData ? "Edit Fallback Provider" : "Add Fallback Provider")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {slot === "primary"
                ? "Configure your main AI provider for content operations."
                : "Optional fallback when the primary provider fails."}
            </p>
          </div>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => { if (v) setProvider(v); }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select provider">{provider === "anthropic" ? "Anthropic" : "OpenAI"}</SelectValue>
                </SelectTrigger>
                <SelectContent side="bottom" alignItemWithTrigger={false}>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>API Key</Label>
              <div className="flex gap-2">
                <Input
                  type={apiKey.includes("••") ? "text" : "password"}
                  value={apiKey}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
                  placeholder={provider === "anthropic" ? "sk-ant-api03-..." : "sk-proj-..."}
                  className="flex-1 font-medium text-xs"
                />
                <Button variant="outline" disabled={!apiKey || testing} onClick={handleTest}>
                  {testing ? (
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M4 12a8 8 0 018-8" className="opacity-75" /></svg>
                  ) : "Test"}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Model</Label>
              {loadingModels ? (
                <div className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm text-muted-foreground">
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M4 12a8 8 0 018-8" className="opacity-75" /></svg>
                  Loading models...
                </div>
              ) : (
                <div ref={modelRef} className="relative">
                  <button
                    type="button"
                    disabled={models.length === 0}
                    onClick={() => setModelOpen(!modelOpen)}
                    className={`flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${modelOpen ? "border-foreground/30" : "border-input"}`}
                  >
                    <span className={model ? "text-foreground" : "text-muted-foreground"}>
                      {models.length === 0 ? "Enter API key first..." : models.find((m) => m.id === model)?.name ?? "Select model..."}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {modelOpen && (
                    <div className="absolute top-[calc(100%+4px)] left-0 z-50 w-full rounded-md border border-border bg-popover shadow-md overflow-hidden">
                      <Command>
                        <CommandInput placeholder="Search models..." />
                        <CommandList className="max-h-40">
                          <CommandEmpty>No models found.</CommandEmpty>
                          <CommandGroup>
                            {models.map((m) => (
                              <CommandItem
                                key={m.id}
                                value={m.name}
                                data-checked={model === m.id || undefined}
                                onSelect={() => { setModel(m.id); setModelOpen(false); }}
                              >
                                {m.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!apiKey || !model} onClick={() => { onSave(provider, apiKey, model); onOpenChange(false); }}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AISection() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<{
    provider_1: string; masked_key_1: string | null; has_key_1: boolean; primary_model: string;
    provider_2: string | null; masked_key_2: string | null; has_key_2: boolean; fallback_model: string | null;
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSlot, setAddSlot] = useState<"primary" | "fallback">("primary");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/settings/ai");
    if (res.ok) setSettings(await res.json());
  }, []);

  useEffect(() => { refresh().finally(() => setLoading(false)); }, [refresh]);

  async function handleSaveProvider(slot: "primary" | "fallback", provider: string, apiKey: string, model: string) {
    const current = settings;
    const body = slot === "primary"
      ? { provider_1: provider, api_key_1: apiKey, primary_model: model, provider_2: current?.provider_2, fallback_model: current?.fallback_model }
      : { provider_1: current?.provider_1 ?? "anthropic", primary_model: current?.primary_model ?? "claude-sonnet-4-5", provider_2: provider, api_key_2: apiKey, fallback_model: model };
    const res = await fetch("/api/settings/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) { toast.success("Provider saved."); await refresh(); }
    else toast.error("Failed to save.");
  }

  async function handleRemove(slot: "primary" | "fallback") {
    const current = settings;
    const body = slot === "primary"
      ? { provider_1: "anthropic", api_key_1: "", primary_model: "claude-sonnet-4-5", provider_2: current?.provider_2, fallback_model: current?.fallback_model }
      : { provider_1: current?.provider_1 ?? "anthropic", primary_model: current?.primary_model ?? "claude-sonnet-4-5", provider_2: null, api_key_2: "", fallback_model: null };
    const res = await fetch("/api/settings/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) { toast.success("Provider removed."); await refresh(); }
    else toast.error("Failed to remove.");
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const hasPrimary = settings?.has_key_1;
  const hasFallback = settings?.has_key_2;
  const primaryInfo = hasPrimary ? PROVIDER_INFO[settings!.provider_1] : null;
  const fallbackInfo = hasFallback && settings?.provider_2 ? PROVIDER_INFO[settings.provider_2] : null;
  const primaryModelLabel = hasPrimary ? settings!.primary_model : null;
  const fallbackModelLabel = hasFallback && settings?.fallback_model ? settings.fallback_model : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium">AI</h3>
          <p className="text-sm text-muted-foreground">Configure AI providers for content operations.</p>
        </div>
        {(!hasPrimary || !hasFallback) && (
          <Button variant="default" size="sm" onClick={() => { setAddSlot(!hasPrimary ? "primary" : "fallback"); setAddOpen(true); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" /></svg>
            Add
          </Button>
        )}
      </div>
      <Separator />

      {/* Primary provider card */}
      {hasPrimary && primaryInfo ? (
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div className="flex items-center gap-3">
            <div className="text-foreground">{primaryInfo.icon}</div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{primaryInfo.label}</p>
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">Primary</span>
              </div>
              <p className="text-xs text-muted-foreground">{primaryModelLabel} &middot; {settings!.masked_key_1}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="xs" onClick={() => { setAddSlot("primary"); setAddOpen(true); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /></svg>
            </Button>
            <Button variant="ghost" size="xs" className="text-muted-foreground hover:text-destructive" onClick={() => handleRemove("primary")}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setAddSlot("primary"); setAddOpen(true); }}
          className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /></svg>
          <span className="text-xs font-medium">Add primary AI provider</span>
        </button>
      )}

      {/* Fallback provider card */}
      {hasPrimary && (
        hasFallback && fallbackInfo ? (
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-3">
              <div className="text-foreground">{fallbackInfo.icon}</div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{fallbackInfo.label}</p>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Fallback</span>
                </div>
                <p className="text-xs text-muted-foreground">{fallbackModelLabel} &middot; {settings!.masked_key_2}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="xs" onClick={() => { setAddSlot("fallback"); setAddOpen(true); }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /></svg>
              </Button>
              <Button variant="ghost" size="xs" className="text-muted-foreground hover:text-destructive" onClick={() => handleRemove("fallback")}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setAddSlot("fallback"); setAddOpen(true); }}
            className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" /></svg>
            <span className="text-xs font-medium">Add fallback provider (optional)</span>
          </button>
        )
      )}

      {(hasPrimary || hasFallback) && (
        <p className="text-xs text-muted-foreground">Primary is used for all AI operations. Fallback activates when primary fails or hits rate limits.</p>
      )}

      <AddProviderDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        slot={addSlot}
        editData={
          addSlot === "primary" && hasPrimary
            ? { provider: settings!.provider_1, model: settings!.primary_model, maskedKey: settings!.masked_key_1! }
            : addSlot === "fallback" && hasFallback
              ? { provider: settings!.provider_2!, model: settings!.fallback_model!, maskedKey: settings!.masked_key_2! }
              : null
        }
        onSave={(provider, apiKey, model) => handleSaveProvider(addSlot, provider, apiKey, model)}
      />
    </div>
  );
}

type CustomDomain = {
  id: string;
  domain: string;
  enabled: boolean;
  createdAt: string;
};

function DomainsSection() {
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomDomain | null>(null);

  const fetchDomains = useCallback(async () => {
    const res = await fetch("/api/admin/domains");
    if (res.ok) {
      const data = await res.json();
      setDomains(data.domains);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchDomains(); }, [fetchDomains]);

  async function handleAdd() {
    if (!newDomain.trim()) return;
    setAdding(true);
    const res = await fetch("/api/admin/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: newDomain.trim() }),
    });
    if (res.ok) {
      toast.success("Domain added. Restart the server for OAuth to recognize it.");
      setNewDomain("");
      setShowAdd(false);
      await fetchDomains();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to add domain");
    }
    setAdding(false);
  }

  async function handleToggle(domain: CustomDomain) {
    const res = await fetch(`/api/admin/domains/${domain.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !domain.enabled }),
    });
    if (res.ok) {
      setDomains((prev) =>
        prev.map((d) => (d.id === domain.id ? { ...d, enabled: !d.enabled } : d))
      );
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/admin/domains/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Domain removed");
      setDomains((prev) => prev.filter((d) => d.id !== deleteTarget.id));
    } else {
      toast.error("Failed to remove domain");
    }
    setDeleteTarget(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium">Custom Domains</h3>
          <p className="text-sm text-muted-foreground">Allow access via custom domains.</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          Add Domain
        </Button>
      </div>
      <Separator />

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : domains.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-10 text-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <div>
            <p className="text-sm font-medium">No custom domains</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add a domain to let customers access the CMS via their own URL.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {domains.map((domain) => (
            <div key={domain.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <div className={`h-2 w-2 rounded-full ${domain.enabled ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                <div>
                  <p className="text-sm font-medium font-medium">{domain.domain}</p>
                  <p className="text-xs text-muted-foreground">{domain.enabled ? "Active" : "Disabled"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggle(domain)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${domain.enabled ? "bg-foreground" : "bg-muted"}`}
                >
                  <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${domain.enabled ? "translate-x-4" : "translate-x-0"}`} />
                </button>
                <Button variant="ghost" size="xs" onClick={() => setDeleteTarget(domain)} className="text-muted-foreground hover:text-destructive">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <h3 className="text-sm font-medium mb-2">Setup Instructions</h3>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
          <li>Add the custom domain above.</li>
          <li>Point the domain to this server via a CNAME or A record.</li>
          <li>Ensure TLS/SSL is configured (e.g. via Caddy, Cloudflare, or a reverse proxy).</li>
          <li>Restart the kerncms server so OAuth recognizes the new domain.</li>
        </ol>
      </div>

      <NestedDialogOverlay open={showAdd} onClose={() => setShowAdd(false)} zIndex={55} />
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent hideOverlay className="sm:max-w-sm !z-[56]">
          <div className="flex flex-col gap-2">
            <h3 className="font-heading text-base font-medium">Add Custom Domain</h3>
            <p className="text-sm text-muted-foreground">Enter the domain customers will use to access the CMS.</p>
          </div>
          <div className="flex flex-col gap-2 py-2">
            <Label>Domain</Label>
            <Input value={newDomain} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewDomain(e.target.value)} placeholder="cms.yourdomain.com" onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") handleAdd(); }} />
            <p className="text-[11px] text-muted-foreground">Without protocol (no https://). Example: cms.example.com</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={adding || !newDomain.trim()}>{adding ? "Adding..." : "Add Domain"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <NestedDialogOverlay open={!!deleteTarget} onClose={() => setDeleteTarget(null)} zIndex={55} />
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent hideOverlay className="sm:max-w-sm !z-[56]">
          <div className="flex flex-col gap-2">
            <h3 className="font-heading text-base font-medium">Remove Domain</h3>
            <p className="text-sm text-muted-foreground">Remove <strong className="font-medium">{deleteTarget?.domain}</strong>? Users on this domain will no longer be able to access the CMS.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Remove</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const SECTIONS: Record<string, () => React.ReactNode> = {
  profile: ProfileSection,
  account: AccountSection,
  preferences: PreferencesSection,
  notifications: NotificationsSection,
  integrations: IntegrationsSection,
  members: MembersSection,
  ai: AISection,
  domains: DomainsSection,
};

const ADMIN_ONLY_SECTIONS = new Set(["members"]);
const SUPERADMIN_ONLY_SECTIONS = new Set(["integrations", "ai", "domains"]);

const PROJECT_SECTIONS = new Set<string>([]);

export function ProfileDialog() {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("profile");
  const { data: session } = useSession();
  const isSystemAdmin = useIsAdmin();
  const isSuperAdmin = useIsSuperAdmin();
  const { current } = useProjects();
  const router = useRouter();

  useEffect(() => {
    function handleOpen(e: Event) {
      const section = (e as CustomEvent).detail?.section ?? "profile";
      setActiveSection(section);
      setOpen(true);
    }
    window.addEventListener("open-profile-dialog", handleOpen);
    return () => window.removeEventListener("open-profile-dialog", handleOpen);
  }, []);

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (SUPERADMIN_ONLY_SECTIONS.has(item.id) && !isSuperAdmin) return false;
    if (ADMIN_ONLY_SECTIONS.has(item.id) && !isSystemAdmin) return false;
    if (PROJECT_SECTIONS.has(item.id) && !current) return false;
    return true;
  });
  const SectionComponent = SECTIONS[activeSection];

  async function handleSignOut() {
    await signOut({ fetchOptions: { onSuccess: () => router.push("/auth") } });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) window.dispatchEvent(new Event("profile-dialog-closed")); }}>
      <DialogTrigger
        className="cursor-pointer"
        nativeButton={false}
        render={
          session?.user.image ? (
            <img src={session.user.image} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full hover:opacity-80 transition-opacity" />
          ) : (
            <div className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-medium text-muted-foreground hover:bg-white/15 transition-colors">
              {session?.user.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
          )
        }
      />
      <DialogContent showCloseButton={false} className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        <div className="flex h-[480px]">
          <aside className="flex w-48 shrink-0 flex-col border-r border-border bg-background p-2">
            <nav className="flex flex-col gap-0.5 pt-2">
              {visibleNav.map((item, i) => {
                const prevCategory = i > 0 ? visibleNav[i - 1].category : undefined;
                const showHeader = item.category && item.category !== prevCategory;
                return (
                  <div key={item.id}>
                    {showHeader && (
                      <p className="px-2 pt-3 pb-1 text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">{item.category}</p>
                    )}
                    <button
                      onClick={() => setActiveSection(item.id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                        activeSection === item.id
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  </div>
                );
              })}
            </nav>
            <div className="mt-auto p-2">
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" x2="9" y1="12" y2="12" />
                </svg>
                Sign Out
              </button>
            </div>
          </aside>
          <main className="flex-1 overflow-y-auto p-6">
            {SectionComponent && <SectionComponent />}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
