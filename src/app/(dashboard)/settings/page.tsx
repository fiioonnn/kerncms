"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useProjects } from "@/components/project-context";
import { useIsAdmin, useSession } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { GitHubRepoPicker } from "@/components/github-repo-picker";

const ALL_COLORS = [
  "#ef4444", "#f97316", "#f59e0b",
  "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e", "#fb923c", "#e11d48", "#7c3aed",
  "#2563eb", "#0891b2", "#059669", "#d97706",
];

const NAV_ITEMS = [
  {
    id: "general",
    label: "General",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
  {
    id: "members",
    label: "Members",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: "media",
    label: "Media",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    ),
  },
  {
    id: "permissions",
    label: "Permissions",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      </svg>
    ),
  },
  {
    id: "development",
    label: "Development",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    id: "autofix",
    label: "Auto-fix",
    comingSoon: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
] as const;

type Bucket = {
  id: string;
  name: string;
  provider: "github" | "aws" | "cloudflare";
  config: Record<string, string>;
  isDefault: boolean;
};

function AddBucketDialog({
  open,
  onOpenChange,
  onAdd,
  projectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (bucket: { name: string; provider: "aws" | "cloudflare"; config: Record<string, string> }) => void;
  projectId: string;
}) {
  const [provider, setProvider] = useState<"aws" | "cloudflare">("aws");
  const [displayName, setDisplayName] = useState("");
  const [bucketName, setBucketName] = useState("");
  const [region, setRegion] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");

  function reset() {
    setProvider("aws");
    setDisplayName("");
    setBucketName("");
    setRegion("");
    setAccessKey("");
    setSecretKey("");
    setEndpoint("");
    setPublicUrl("");
    setTestStatus("idle");
  }

  function buildConfig(): Record<string, string> {
    return provider === "aws"
      ? { region: region || "us-east-1", bucket: bucketName.trim(), accessKeyId: accessKey, secretAccessKey: secretKey }
      : { endpoint, bucket: bucketName.trim(), accessKeyId: accessKey, secretAccessKey: secretKey, ...(publicUrl ? { publicUrl } : {}) };
  }

  function handleSubmit() {
    if (!bucketName.trim()) return;
    onAdd({ name: displayName.trim() || bucketName.trim(), provider, config: buildConfig() });
    reset();
    onOpenChange(false);
  }

  async function handleTest() {
    setTestStatus("testing");
    try {
      const res = await fetch(`/api/projects/${projectId}/buckets/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, config: buildConfig() }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestStatus("success");
        toast.success("Connection successful");
      } else {
        setTestStatus("error");
        toast.error("Connection failed", { description: data.error });
      }
    } catch {
      setTestStatus("error");
      toast.error("Connection failed", { description: "Could not reach the server" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Storage Bucket</DialogTitle>
          <DialogDescription>
            Connect an AWS S3 or Cloudflare R2 bucket for media storage.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Provider</Label>
            <div className="flex gap-2">
              <button
                onClick={() => setProvider("aws")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  provider === "aws" ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#569A31">
                  <path d="M20.913 13.147l.12-.895c.947.576 1.258.922 1.354 1.071-.16.031-.562.046-1.474-.176zm-2.174 7.988a.547.547 0 0 0-.005.073c0 .084-.207.405-1.124.768a10.28 10.28 0 0 1-1.438.432c-1.405.325-3.128.504-4.853.504-4.612 0-7.412-1.184-7.412-1.704a.547.547 0 0 0-.005-.073L1.81 5.602c.135.078.28.154.432.227.042.02.086.038.128.057.134.062.272.122.417.18l.179.069c.154.058.314.114.478.168.043.013.084.029.13.043.207.065.423.127.646.187l.176.044c.175.044.353.087.534.127a23.414 23.414 0 0 0 .843.17l.121.023c.252.045.508.085.768.122.071.011.144.02.216.03.2.027.4.053.604.077l.24.027c.245.026.49.05.74.07l.081.009c.275.022.552.04.83.056l.233.012c.21.01.422.018.633.025a33.088 33.088 0 0 0 2.795-.026l.232-.011c.278-.016.555-.034.83-.056l.08-.008c.25-.02.497-.045.742-.072l.238-.026c.205-.024.408-.05.609-.077.07-.01.141-.019.211-.03.261-.037.519-.078.772-.122l.111-.02c.215-.04.427-.082.634-.125l.212-.047c.186-.041.368-.085.546-.13l.166-.042c.225-.06.444-.122.654-.189.04-.012.077-.026.115-.038a10.6 10.6 0 0 0 .493-.173c.058-.021.114-.044.17-.066.15-.06.293-.12.43-.185.038-.017.079-.034.116-.052.153-.073.3-.15.436-.228l-.976 7.245c-2.488-.78-5.805-2.292-7.311-3a1.09 1.09 0 0 0-1.088-1.085c-.6 0-1.088.489-1.088 1.088 0 .6.488 1.089 1.088 1.089.196 0 .378-.056.537-.148 1.72.812 5.144 2.367 7.715 3.15zm-7.42-20.047c5.677 0 9.676 1.759 9.75 2.736l-.014.113c-.01.033-.031.067-.048.101-.015.028-.026.057-.047.087-.024.033-.058.068-.09.102-.028.03-.051.06-.084.09-.038.035-.087.07-.133.105-.04.03-.074.06-.119.091-.053.036-.116.071-.177.107-.05.03-.095.06-.15.09-.068.036-.147.073-.222.11-.059.028-.114.057-.177.085-.084.038-.177.074-.268.111-.068.027-.13.054-.203.082-.097.036-.205.072-.31.107-.075.026-.148.053-.228.079-.111.035-.233.069-.35.103-.085.024-.165.05-.253.073-.124.034-.258.065-.389.098-.093.022-.181.046-.278.068-.139.032-.287.061-.433.091-.098.02-.191.041-.293.06-.155.03-.32.057-.482.084-.1.018-.198.036-.302.052-.166.026-.342.048-.515.072-.11.014-.213.03-.325.044-.181.023-.372.041-.56.06-.11.012-.218.025-.332.036-.188.016-.386.029-.58.043-.122.009-.24.02-.364.028-.207.012-.422.02-.635.028-.12.005-.234.012-.354.016a35.605 35.605 0 0 1-2.069 0c-.12-.004-.234-.011-.352-.016-.214-.008-.43-.016-.637-.028-.122-.008-.238-.02-.36-.027-.195-.015-.394-.028-.584-.044-.11-.01-.215-.024-.324-.035-.19-.02-.384-.038-.568-.06l-.315-.044c-.176-.024-.355-.046-.525-.073-.1-.015-.192-.033-.29-.05-.167-.028-.335-.055-.494-.086-.096-.018-.183-.038-.276-.056-.151-.032-.305-.062-.45-.095-.09-.02-.173-.043-.26-.064-.138-.034-.277-.067-.407-.102-.082-.022-.157-.046-.235-.069a11.75 11.75 0 0 1-.368-.108c-.075-.024-.141-.049-.213-.073-.11-.037-.223-.075-.325-.113-.067-.025-.125-.051-.188-.077-.096-.038-.195-.076-.282-.115-.06-.027-.11-.054-.166-.08-.08-.039-.162-.077-.233-.116-.052-.028-.094-.055-.142-.084-.063-.038-.13-.075-.185-.113-.043-.029-.075-.058-.113-.086-.048-.037-.098-.073-.139-.11-.032-.029-.054-.057-.08-.087-.033-.035-.069-.07-.093-.104-.02-.03-.031-.058-.046-.086-.018-.035-.039-.068-.049-.102l-.015-.113c.076-.977 4.074-2.736 9.748-2.736zm12.182 12.124c-.118-.628-.84-1.291-2.31-2.128l.963-7.16a.531.531 0 0 0 .005-.073C22.16 1.581 16.447 0 11.32 0 6.194 0 .482 1.581.482 3.851a.58.58 0 0 0 .005.072L2.819 21.25c.071 2.002 5.236 2.75 8.5 2.75 1.805 0 3.615-.188 5.098-.531.598-.138 1.133-.3 1.592-.48 1.18-.467 1.789-1.053 1.813-1.739l.945-7.018c.557.131 1.016.197 1.389.197.54 0 .902-.137 1.134-.413a.956.956 0 0 0 .21-.804Z" />
                </svg>
                AWS S3
              </button>
              <button
                onClick={() => setProvider("cloudflare")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  provider === "cloudflare" ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#F38020">
                  <path d="M16.5088 16.8447c.1475-.5068.0908-.9707-.1553-1.3154-.2246-.3164-.6045-.499-1.0615-.5205l-8.6592-.1123a.1559.1559 0 0 1-.1333-.0713c-.0283-.042-.0351-.0986-.021-.1553.0278-.084.1123-.1484.2036-.1562l8.7359-.1123c1.0351-.0489 2.1601-.8868 2.5537-1.9136l.499-1.3013c.0215-.0561.0293-.1128.0147-.168-.5625-2.5463-2.835-4.4453-5.5499-4.4453-2.5039 0-4.6284 1.6177-5.3876 3.8614-.4927-.3658-1.1187-.5625-1.794-.499-1.2026.119-2.1665 1.083-2.2861 2.2856-.0283.31-.0069.6128.0635.894C1.5683 13.171 0 14.7754 0 16.752c0 .1748.0142.3515.0352.5273.0141.083.0844.1475.1689.1475h15.9814c.0909 0 .1758-.0645.2032-.1553l.12-.4268zm2.7568-5.5634c-.0771 0-.1611 0-.2383.0112-.0566 0-.1054.0415-.127.0976l-.3378 1.1744c-.1475.5068-.0918.9707.1543 1.3164.2256.3164.6055.498 1.0625.5195l1.8437.1133c.0557 0 .1055.0263.1329.0703.0283.043.0351.1074.0214.1562-.0283.084-.1132.1485-.204.1553l-1.921.1123c-1.041.0488-2.1582.8867-2.5527 1.914l-.1406.3585c-.0283.0713.0215.1416.0986.1416h6.5977c.0771 0 .1474-.0489.169-.126.1122-.4082.1757-.837.1757-1.2803 0-2.6025-2.125-4.727-4.7344-4.727" />
                </svg>
                Cloudflare R2
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-sm">Display Name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Production Media"
            />
            <p className="text-[11px] text-muted-foreground">Optional label shown in the CMS</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-sm">Bucket</Label>
            <Input
              value={bucketName}
              onChange={(e) => setBucketName(e.target.value)}
              placeholder={provider === "aws" ? "my-s3-bucket" : "my-r2-bucket"}
            />
            <p className="text-[11px] text-muted-foreground">The actual {provider === "aws" ? "S3" : "R2"} bucket name from your {provider === "aws" ? "AWS" : "Cloudflare"} dashboard</p>
          </div>

          {provider === "aws" ? (
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Region</Label>
              <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="us-east-1" />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label className="text-sm">Endpoint URL</Label>
                <div className="flex h-8 items-center rounded-lg border border-input overflow-hidden">
                  <span className="flex h-full items-center bg-muted/50 px-2.5 text-sm text-muted-foreground border-r border-input select-none">https://</span>
                  <input value={endpoint.replace(/^https?:\/\//, "")} onChange={(e) => setEndpoint(`https://${e.target.value.replace(/^https?:\/\//, "")}`)} placeholder="<account_id>.r2.cloudflarestorage.com" className="h-full flex-1 bg-transparent px-2.5 text-sm outline-none" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-sm">Public URL</Label>
                <div className="flex h-8 items-center rounded-lg border border-input overflow-hidden">
                  <span className="flex h-full items-center bg-muted/50 px-2.5 text-sm text-muted-foreground border-r border-input select-none">https://</span>
                  <input value={publicUrl.replace(/^https?:\/\//, "")} onChange={(e) => setPublicUrl(`https://${e.target.value}`)} placeholder="pub-xxx.r2.dev" className="h-full flex-1 bg-transparent px-2.5 text-sm outline-none" />
                </div>
                <p className="text-[11px] text-muted-foreground">The public access URL for your R2 bucket</p>
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <Label className="text-sm">Access Key</Label>
            <Input value={accessKey} onChange={(e) => setAccessKey(e.target.value)} placeholder="AKIA..." type="password" />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-sm">Secret Key</Label>
            <Input value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="••••••••" type="password" />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={!bucketName.trim() || !accessKey || !secretKey || testStatus === "testing"}
          >
            {testStatus === "testing" ? (
              <><svg className="h-3.5 w-3.5 animate-spin mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M4 12a8 8 0 018-8" className="opacity-75" /></svg>Testing...</>
            ) : (
              "Test Connection"
            )}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!bucketName.trim()}>Add Bucket</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GeneralSection({
  current,
  name,
  setName,
  url,
  setUrl,
  updateProject,
  deleteProject,
  setKernInstalled,
}: {
  current: NonNullable<ReturnType<typeof useProjects>["current"]>;
  name: string;
  setName: (v: string) => void;
  url: string;
  setUrl: (v: string) => void;
  updateProject: ReturnType<typeof useProjects>["updateProject"];
  deleteProject: ReturnType<typeof useProjects>["deleteProject"];
  setKernInstalled: ReturnType<typeof useProjects>["setKernInstalled"];
}) {
  const router = useRouter();

  return (
    <>
      <section className="flex flex-col gap-5">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">General</h2>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[140px_1fr] items-center gap-4">
            <Label className="text-sm">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => { if (name.trim() && name !== current.name) updateProject(current.id, { name: name.trim() }); }}
            />
          </div>
          <div className="grid grid-cols-[140px_1fr] items-center gap-4">
            <Label className="text-sm">
              URL <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() => updateProject(current.id, { url: url || undefined })}
              placeholder="https://example.com"
            />
          </div>
          <div className="grid grid-cols-[140px_1fr] items-start gap-4">
            <Label className="text-sm pt-1">Color</Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => updateProject(current.id, { color })}
                  className="h-7 w-7 rounded-md transition-all hover:scale-110"
                  style={{
                    backgroundColor: color,
                    outline: current.color === color ? "2px solid white" : "none",
                    outlineOffset: "2px",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <Separator className="my-8" />

      <RepositorySection
        repo={current.repo ?? ""}
        branch={current.branch ?? ""}
        onSave={(repo, branch) => updateProject(current.id, { repo: repo || undefined, branch: branch || undefined })}
      />

      <Separator className="my-8" />

      <section className="flex flex-col gap-5">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Editor</h2>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label className="text-sm">Content Caching</Label>
              <span className="text-xs text-muted-foreground">
                {(current.editorCaching ?? true)
                  ? "Sections load instantly from cache"
                  : "Sections always fetch from GitHub"}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={current.editorCaching ?? true}
              onClick={() => updateProject(current.id, { editorCaching: !(current.editorCaching ?? true) })}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                (current.editorCaching ?? true) ? "bg-foreground" : "bg-muted"
              }`}
            >
              <span
                className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
                  (current.editorCaching ?? true) ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      <Separator className="my-8" />

      <DangerZoneSection
        projectId={current.id}
        projectName={current.name}
        kernInstalled={current.kernInstalled}
        onDelete={() => {
          deleteProject(current.id);
          router.push("/");
        }}
        onUninstall={() => {
          setKernInstalled(current.id, false);
        }}
      />
    </>
  );
}

function MediaDirPicker({ value, dirs, loading, onChange }: {
  value: string;
  dirs: string[];
  loading: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = dirs.filter((d) =>
    d.toLowerCase().includes(search.toLowerCase())
  );

  const resolvedDir = value
    ? (value.endsWith("/kern/media") ? value : `${value.replace(/\/$/, "")}/kern/media`)
    : "public/kern/media";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm">Media Directory</Label>
      <div ref={containerRef} className="relative">
        {loading ? (
          <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-muted/30 px-3">
            <svg className="h-3.5 w-3.5 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8" className="opacity-75" />
            </svg>
            <span className="text-xs text-muted-foreground">Loading directories...</span>
          </div>
        ) : (
          <>
            <div className={`flex h-8 items-center rounded-md border bg-transparent text-sm transition-colors ${open ? "border-foreground/30" : "border-border"}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="ml-2.5 shrink-0 text-muted-foreground">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <input
                ref={inputRef}
                placeholder="Search directories..."
                value={open ? search : value ? `${value}/` : ""}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => { setOpen(true); setSearch(""); }}
                className="h-full flex-1 bg-transparent px-2 text-xs font-mono text-foreground placeholder:text-muted-foreground outline-none"
              />
              {value && !open && (
                <button
                  type="button"
                  onClick={() => { onChange(""); inputRef.current?.focus(); }}
                  className="mr-2 text-muted-foreground hover:text-foreground"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
            </div>
            {open && (
              <div className="absolute top-[calc(100%+4px)] left-0 z-50 w-full max-h-52 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md">
                {filtered.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No directories found</p>
                ) : (
                  filtered.map((dir) => {
                    const depth = search ? 0 : dir.split("/").length - 1;
                    return (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => {
                          onChange(dir);
                          setOpen(false);
                          setSearch("");
                        }}
                        className={`flex w-full items-center gap-1.5 py-1.5 pr-3 text-xs font-mono transition-colors hover:bg-muted/50 ${
                          value === dir ? "text-foreground bg-muted/30" : "text-muted-foreground"
                        }`}
                        style={{ paddingLeft: `${12 + depth * 16}px` }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                        {search ? `${dir}/` : `${dir.split("/").pop()}/`}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Media will be stored in <code className="rounded bg-muted px-1 py-0.5 text-[10px]">./{resolvedDir}</code>
      </p>
    </div>
  );
}

function BucketDetailDialog({
  bucket,
  projectId,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
  onSetDefault,
}: {
  bucket: Bucket | null;
  projectId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpdate: (id: string, data: { name?: string; config?: Record<string, string> }) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}) {
  const { current } = useProjects();
  const [name, setName] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [region, setRegion] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [mediaDir, setMediaDir] = useState("");
  const [repoDirs, setRepoDirs] = useState<string[]>([]);
  const [dirsLoading, setDirsLoading] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");

  useEffect(() => {
    if (bucket) {
      setName(bucket.name);
      setAccessKey("");
      setSecretKey("");
      setRegion(bucket.config.region ?? "");
      setEndpoint(bucket.config.endpoint ?? "");
      setPublicUrl(bucket.config.publicUrl ?? "");
      setMediaDir(bucket.config.mediaDir ?? "public/kern/media");
      setTestStatus("idle");
    }
  }, [bucket]);

  useEffect(() => {
    if (!open || !bucket || bucket.provider !== "github" || !current?.repo) return;
    const [owner, repo] = current.repo.split("/");
    if (!owner || !repo) return;
    setDirsLoading(true);
    fetch(`/api/github/repos/${owner}/${repo}/dirs?branch=${current.branch ?? "main"}`)
      .then((r) => r.ok ? r.json() : [])
      .then((dirs: string[]) => setRepoDirs(dirs))
      .finally(() => setDirsLoading(false));
  }, [open, bucket, current?.repo, current?.branch]);

  if (!bucket) return null;

  const isGitHub = bucket.provider === "github";
  const providerLabel = bucket.provider === "aws" ? "AWS S3" : bucket.provider === "cloudflare" ? "Cloudflare R2" : "GitHub";

  function handleSave() {
    if (!bucket) return;
    const updates: { name?: string; config?: Record<string, string> } = {};
    if (name.trim()) updates.name = name.trim();

    if (isGitHub) {
      const dir = mediaDir.trim() || "public/kern/media";
      const resolved = dir.endsWith("/kern/media") ? dir : `${dir.replace(/\/$/, "")}/kern/media`;
      updates.config = { ...bucket.config, mediaDir: resolved };
    } else {
      const newConfig = { ...bucket.config };
      if (accessKey) newConfig.accessKeyId = accessKey;
      if (secretKey) newConfig.secretAccessKey = secretKey;
      if (bucket.provider === "aws" && region) newConfig.region = region;
      if (bucket.provider === "cloudflare") {
        if (endpoint) newConfig.endpoint = endpoint;
        if (publicUrl) newConfig.publicUrl = publicUrl;
      }
      updates.config = newConfig;
    }

    onUpdate(bucket.id, updates);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bucket Details</DialogTitle>
          <DialogDescription>
            {providerLabel} bucket configuration.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {isGitHub && (
            <MediaDirPicker
              value={mediaDir}
              dirs={repoDirs}
              loading={dirsLoading}
              onChange={setMediaDir}
            />
          )}

          {!isGitHub && (
            <>
              {bucket.provider === "aws" && (
                <div className="flex flex-col gap-2">
                  <Label className="text-sm">Region</Label>
                  <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder={bucket.config.region ?? "us-east-1"} />
                </div>
              )}
              {bucket.provider === "cloudflare" && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm">Endpoint URL</Label>
                    <div className="flex h-8 items-center rounded-lg border border-input overflow-hidden">
                      <span className="flex h-full items-center bg-muted/50 px-2.5 text-sm text-muted-foreground border-r border-input select-none">https://</span>
                      <input value={endpoint.replace(/^https?:\/\//, "")} onChange={(e) => setEndpoint(`https://${e.target.value.replace(/^https?:\/\//, "")}`)} placeholder={(bucket.config.endpoint ?? "").replace(/^https?:\/\//, "")} className="h-full flex-1 bg-transparent px-2.5 text-sm outline-none" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm">Public URL</Label>
                    <div className="flex h-8 items-center rounded-lg border border-input overflow-hidden">
                      <span className="flex h-full items-center bg-muted/50 px-2.5 text-sm text-muted-foreground border-r border-input select-none">https://</span>
                      <input value={publicUrl.replace(/^https?:\/\//, "")} onChange={(e) => setPublicUrl(`https://${e.target.value}`)} placeholder={(bucket.config.publicUrl ?? "pub-xxx.r2.dev").replace(/^https?:\/\//, "")} className="h-full flex-1 bg-transparent px-2.5 text-sm outline-none" />
                    </div>
                  </div>
                </>
              )}
              <div className="flex flex-col gap-2">
                <Label className="text-sm">Access Key</Label>
                <Input value={accessKey} onChange={(e) => setAccessKey(e.target.value)} placeholder="••••••••" type="password" />
                <p className="text-[11px] text-muted-foreground">Leave empty to keep current key</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-sm">Secret Key</Label>
                <Input value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="••••••••" type="password" />
                <p className="text-[11px] text-muted-foreground">Leave empty to keep current key</p>
              </div>
            </>
          )}

          {!isGitHub && (
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Provider</Label>
              <p className="text-sm text-muted-foreground">{providerLabel}</p>
            </div>
          )}

          {!isGitHub && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setTestStatus("testing");
                  try {
                    const res = await fetch(`/api/projects/${projectId}/buckets/${bucket.id}/test`, { method: "POST" });
                    const data = await res.json();
                    if (data.ok) {
                      setTestStatus("success");
                      toast.success("Connection successful");
                    } else {
                      setTestStatus("error");
                      toast.error("Connection failed", { description: data.error });
                    }
                  } catch {
                    setTestStatus("error");
                    toast.error("Connection failed", { description: "Could not reach the server" });
                  }
                }}
                disabled={testStatus === "testing"}
              >
                {testStatus === "testing" ? (
                  <><svg className="h-3.5 w-3.5 animate-spin mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M4 12a8 8 0 018-8" className="opacity-75" /></svg>Testing...</>
                ) : (
                  "Test Connection"
                )}
              </Button>
              {testStatus === "success" && <span className="text-xs text-emerald-400 font-medium">Connected</span>}
              {testStatus === "error" && <span className="text-xs text-destructive font-medium">Failed</span>}
            </div>
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <div className="flex gap-2 w-full">
            {!bucket.isDefault && (
              <Button variant="outline" className="flex-1" onClick={() => { onSetDefault(bucket.id); onOpenChange(false); }}>
                Set as Default
              </Button>
            )}
            <Button className="flex-1" onClick={handleSave}>
              Save Changes
            </Button>
          </div>
          {!isGitHub && (
            <Button variant="destructive" className="w-full" onClick={() => { onDelete(bucket.id); onOpenChange(false); }}>
              Delete Bucket
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ProjectMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  image?: string | null;
  role: "admin" | "editor" | "viewer";
};

type SystemUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: string;
};

function DangerZoneSection({ projectId, projectName, kernInstalled, onDelete, onUninstall }: { projectId: string; projectName: string; kernInstalled: boolean; onDelete: () => void; onUninstall: () => void }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uninstallOpen, setUninstallOpen] = useState(false);
  const [uninstallAfterDeleteOpen, setUninstallAfterDeleteOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [uninstalling, setUninstalling] = useState(false);

  async function handleUninstall(onDone?: () => void) {
    setUninstalling(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/kern/uninstall`, { method: "POST" });
      if (res.ok) {
        toast.success("kern has been uninstalled from the repository.");
        onUninstall();
        onDone?.();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to uninstall.");
      }
    } catch {
      toast.error("Failed to uninstall.");
    } finally {
      setUninstalling(false);
      setUninstallOpen(false);
      setUninstallAfterDeleteOpen(false);
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-sm font-medium text-destructive uppercase tracking-wider">Danger Zone</h2>

      <div className="flex flex-col gap-3">
        {/* Uninstall kern — only shown when installed */}
        {kernInstalled && (
          <div className="flex items-center justify-between rounded-lg border border-destructive/20 p-4">
            <div>
              <p className="text-sm font-medium">Uninstall kern</p>
              <p className="text-xs text-muted-foreground">
                Remove kern from the connected repository.
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setUninstallOpen(true)}>
              Uninstall
            </Button>
          </div>
        )}

        {/* Delete project */}
        <div className="flex items-center justify-between rounded-lg border border-destructive/20 p-4">
          <div>
            <p className="text-sm font-medium">Delete Project</p>
            <p className="text-xs text-muted-foreground">
              This action cannot be undone. All data will be permanently deleted.
            </p>
          </div>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
        </div>
      </div>

      {/* Uninstall confirmation dialog */}
      <Dialog open={uninstallOpen} onOpenChange={(v) => { if (!uninstalling) setUninstallOpen(v); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Uninstall kern</DialogTitle>
            <DialogDescription>
              This will remove the <code className="rounded bg-muted px-1 py-0.5 text-xs">src/kern/</code> directory and all its contents from your repository.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUninstallOpen(false)} disabled={uninstalling}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleUninstall()} disabled={uninstalling}>
              {uninstalling ? (
                <>
                  <svg className="h-4 w-4 animate-spin mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M4 12a8 8 0 018-8" className="opacity-75" /></svg>
                  Uninstalling...
                </>
              ) : (
                "Uninstall"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={(v) => { setDeleteOpen(v); if (!v) setConfirm(""); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{projectName}</strong> and all its data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="delete-confirm" className="text-sm">
              Type <strong>{projectName}</strong> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={projectName}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={confirm !== projectName}
              onClick={() => {
                setDeleteOpen(false);
                setConfirm("");
                if (kernInstalled) {
                  setUninstallAfterDeleteOpen(true);
                } else {
                  onDelete();
                }
              }}
            >
              Delete Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Follow-up: uninstall kern from repo? */}
      <Dialog open={uninstallAfterDeleteOpen} onOpenChange={(v) => { if (!uninstalling) setUninstallAfterDeleteOpen(v); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Uninstall kern from repository?</DialogTitle>
            <DialogDescription>
              Do you also want to remove kern from the connected repository? This will delete the <code className="rounded bg-muted px-1 py-0.5 text-xs">src/kern/</code> directory.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUninstallAfterDeleteOpen(false);
                onDelete();
              }}
              disabled={uninstalling}
            >
              No, keep it
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleUninstall(onDelete)}
              disabled={uninstalling}
            >
              {uninstalling ? (
                <>
                  <svg className="h-4 w-4 animate-spin mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M4 12a8 8 0 018-8" className="opacity-75" /></svg>
                  Uninstalling...
                </>
              ) : (
                "Yes, uninstall"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

function ProjectMembersSection({ projectId }: { projectId: string }) {
  const { data: session } = useSession();
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [allUsers, setAllUsers] = useState<SystemUser[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "editor" | "viewer">("editor");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [addRole, setAddRole] = useState<"admin" | "editor" | "viewer">("editor");
  const [search, setSearch] = useState("");

  const fetchMembers = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/members`);
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members);
      setPendingInvites(data.invitations ?? []);
    }
  }, [projectId]);

  const fetchUsers = useCallback(async (): Promise<SystemUser[]> => {
    const res = await fetch("/api/users");
    if (res.ok) {
      const users: SystemUser[] = await res.json();
      setAllUsers(users);
      return users;
    }
    return [];
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const memberUserIds = new Set(members.map((m) => m.userId));
  const availableUsers = allUsers.filter((u) => !memberUserIds.has(u.id));
  const filteredUsers = availableUsers.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );


  async function handleAdd(userId: string) {
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: addRole }),
    });
    if (res.ok) {
      await fetchMembers();
      if (availableUsers.length <= 1) setShowAdd(false);
    }
  }

  async function handleChangeRole(memberId: string, role: string) {
    const res = await fetch(`/api/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: role as ProjectMember["role"] } : m)));
    }
  }

  async function handleRemove(memberId: string) {
    const res = await fetch(`/api/members/${memberId}`, { method: "DELETE" });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, email: inviteEmail.trim(), role: inviteRole }),
    });
    setInviteLoading(false);
    if (res.ok) {
      toast.success(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteRole("editor");
      setShowInvite(false);
      fetchMembers();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to send invite");
    }
  }

  async function handleCancelInvite(inviteId: string) {
    const res = await fetch(`/api/invites/${inviteId}`, { method: "DELETE" });
    if (res.ok) {
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success("Invite cancelled");
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Members</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const users = await fetchUsers();
              setSearch("");
              const available = users.filter(
                (u) => !members.some((m) => m.userId === u.id)
              );
              if (available.length === 0) {
                toast.info("All users are already members of this project.");
                return;
              }
              setShowAdd(true);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" x2="19" y1="8" y2="14" />
              <line x1="22" x2="16" y1="11" y2="11" />
            </svg>
            Add
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setInviteEmail(""); setInviteRole("editor"); setShowInvite(true); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            Invite
          </Button>
        </div>
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
            <DialogDescription>Add an existing user to this project.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {filteredUsers.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {availableUsers.length === 0 ? "All users are already members." : "No users found."}
              </p>
            ) : filteredUsers.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-2.5 rounded-md px-2 py-2 cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => handleAdd(u.id)}
              >
                {u.image ? (
                  <img src={u.image} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full" />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[10px] font-medium text-muted-foreground">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>Send an email invitation to join this project.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                placeholder="name@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={inviteRole} onValueChange={(val) => setInviteRole(val as "admin" | "editor" | "viewer")}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button size="sm" onClick={handleInvite} disabled={inviteLoading || !inviteEmail.trim()}>
              {inviteLoading ? "Sending..." : "Send Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-2">
        {members.map((m) => {
          const isSelf = m.userId === session?.user.id;
          return (
          <div key={m.id} className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-3">
              {m.image ? (
                <img src={m.image} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-muted-foreground">
                  {m.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{m.name}</p>
                  {isSelf && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">You</span>}
                </div>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isSelf ? (
                <span className="text-xs text-muted-foreground pr-1">{m.role.charAt(0).toUpperCase() + m.role.slice(1)}</span>
              ) : (<>
              <Select value={m.role} onValueChange={(val) => val && handleChangeRole(m.id, val)}>
                <SelectTrigger size="sm" className="h-7 text-xs">
                  <SelectValue>{m.role.charAt(0).toUpperCase() + m.role.slice(1)}</SelectValue>
                </SelectTrigger>
                <SelectContent side="bottom" alignItemWithTrigger={false}>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleRemove(m.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" x2="6" y1="6" y2="18" />
                  <line x1="6" x2="18" y1="6" y2="18" />
                </svg>
              </Button>
              </>)}
            </div>
          </div>
          );
        })}
      </div>

      {pendingInvites.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pending Invites</h3>
          {pendingInvites.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between rounded-lg border border-dashed border-border p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-xs text-muted-foreground">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">Expires {new Date(inv.expiresAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{inv.role.charAt(0).toUpperCase() + inv.role.slice(1)}</span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleCancelInvite(inv.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" x2="6" y1="6" y2="18" />
                    <line x1="6" x2="18" y1="6" y2="18" />
                  </svg>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RepositorySection({
  repo: initialRepo,
  branch: initialBranch,
  onSave,
}: {
  repo: string;
  branch: string;
  onSave: (repo: string, branch: string) => void;
}) {
  const [repo, setRepo] = useState(initialRepo);
  const [branch, setBranch] = useState(initialBranch);
  const hasChanges = repo !== initialRepo || branch !== initialBranch;

  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Repository</h2>
      <GitHubRepoPicker
        repo={repo}
        branch={branch}
        onRepoChange={setRepo}
        onBranchChange={setBranch}
        layout="stacked"
      />
      {hasChanges && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => onSave(repo, branch)}>
            Save
          </Button>
        </div>
      )}
    </section>
  );
}

function MediaSection({ projectId }: { projectId: string }) {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editBucket, setEditBucket] = useState<Bucket | null>(null);

  const fetchBuckets = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/buckets`);
    if (res.ok) {
      const json = await res.json();
      const data: Array<{ id: string; name: string; provider: string; config: Record<string, string> | string; isDefault: boolean }> = json.buckets ?? json ?? [];
      setBuckets(
        data.map((b) => ({
          id: b.id,
          name: b.name,
          provider: b.provider as Bucket["provider"],
          config: typeof b.config === "string" ? JSON.parse(b.config) : b.config,
          isDefault: b.isDefault,
        }))
      );
    }
  }, [projectId]);

  useEffect(() => { fetchBuckets(); }, [fetchBuckets]);

  async function handleAdd(bucket: { name: string; provider: "aws" | "cloudflare"; config: Record<string, string> }) {
    const res = await fetch(`/api/projects/${projectId}/buckets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: bucket.name, provider: bucket.provider, config: bucket.config }),
    });
    if (res.ok) await fetchBuckets();
  }

  async function handleUpdate(id: string, data: { name?: string; config?: Record<string, string> }) {
    const res = await fetch(`/api/projects/${projectId}/buckets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) await fetchBuckets();
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/projects/${projectId}/buckets/${id}`, { method: "DELETE" });
    if (res.ok) await fetchBuckets();
  }

  async function handleSetDefault(id: string) {
    const res = await fetch(`/api/projects/${projectId}/buckets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    if (res.ok) await fetchBuckets();
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Storage Buckets</h2>
        <Button size="sm" onClick={() => setShowDialog(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          Add Bucket
        </Button>
      </div>

      {buckets.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-10 text-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5V19A9 3 0 0 0 21 19V5" />
            <path d="M3 12A9 3 0 0 0 21 12" />
          </svg>
          <div>
            <p className="text-sm font-medium">No buckets configured</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add an AWS S3 or Cloudflare R2 bucket to store your media files.
            </p>
          </div>
        </div>
      )}

      {buckets.map((bucket) => {
        const providerLabel =
          bucket.provider === "aws" ? "AWS S3" : bucket.provider === "cloudflare" ? "Cloudflare R2" : "GitHub";
        const regionDisplay = bucket.config.region ?? bucket.provider;
        return (
          <button
            key={bucket.id}
            onClick={() => setEditBucket(bucket)}
            className="flex items-center gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/30 w-full"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/50">
              {bucket.provider === "aws" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-[#FF9900]">
                  <path d="M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.032-.863.104-.296.072-.583.16-.863.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.024c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.28-.144.616-.264 1.01-.36a4.84 4.84 0 0 1 1.244-.152c.95 0 1.644.216 2.091.647.44.43.662 1.085.662 1.963v2.586z" />
                </svg>
              )}
              {bucket.provider === "cloudflare" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-[#F38020]">
                  <path d="M16.5088 16.8447c.1475-.5068.0908-.9707-.1553-1.3154-.2246-.3164-.5752-.502-.9834-.5303l-8.6826-.1123c-.0489-.0049-.0978-.0283-.127-.0615-.0293-.0332-.0391-.0762-.0293-.1143.0147-.0537.0635-.0928.1221-.0977l8.7441-.1123c.6699-.0342 1.3955-.5713 1.6494-1.2236l.3223-.8301c.0146-.0391.0195-.083.0146-.1221-.4102-1.9043-2.1084-3.3252-4.1455-3.3252-1.8506 0-3.4277 1.1719-4.0215 2.8125-.3613-.2705-.8154-.4219-1.3096-.3906-.9131.0586-1.6445.7959-1.6934 1.7139-.0146.2608.0342.5117.1221.7383C2.9385 14.3574 1.5 15.8428 1.5 17.6494c0 .1172.0049.2344.0195.3467.0098.0635.0635.1074.127.1074h14.5049c.0586 0 .1123-.0391.127-.0977z" />
                </svg>
              )}
              {bucket.provider === "github" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-foreground">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{bucket.name}</p>
              <p className="text-xs text-muted-foreground">
                {providerLabel} · {regionDisplay}
              </p>
            </div>
            {bucket.isDefault && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Default</span>
            )}
          </button>
        );
      })}

      <AddBucketDialog open={showDialog} onOpenChange={setShowDialog} onAdd={handleAdd} projectId={projectId} />
      <BucketDetailDialog
        bucket={editBucket}
        projectId={projectId}
        open={!!editBucket}
        onOpenChange={(v) => { if (!v) setEditBucket(null); }}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onSetDefault={handleSetDefault}
      />
    </section>
  );
}

function PermissionsSection({ current }: { current: NonNullable<ReturnType<typeof useProjects>["current"]> }) {
  const permissionRows = [
    { action: "View dashboard", admin: true, editor: true, viewer: true },
    { action: "Edit content", admin: true, editor: true, viewer: false },
    { action: "Manage media", admin: true, editor: true, viewer: false },
    { action: "Edit project settings", admin: true, editor: false, viewer: false },
    { action: "Invite users", admin: true, editor: false, viewer: false },
    { action: "Change roles", admin: true, editor: false, viewer: false },
    { action: "Remove users", admin: true, editor: false, viewer: false },
    { action: "Delete project", admin: true, editor: false, viewer: false },
  ];

  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Permissions</h2>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Your role in this project</span>
        <span className="rounded-md border border-border px-2.5 py-1 text-xs font-medium">{current.role.charAt(0).toUpperCase() + current.role.slice(1)}</span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Action</th>
              <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-16">Admin</th>
              <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-16">Editor</th>
              <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-16">Viewer</th>
            </tr>
          </thead>
          <tbody>
            {permissionRows.map((row) => (
              <tr key={row.action} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-muted-foreground">{row.action}</td>
                {(["admin", "editor", "viewer"] as const).map((role) => (
                  <td key={role} className="text-center px-3 py-2">
                    {row[role] ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`inline ${current.role === role ? "text-foreground" : "text-muted-foreground/40"}`}>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline text-muted-foreground/20">
                        <line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" />
                      </svg>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type WebhookLog = {
  id: string;
  repository: string;
  branch: string;
  commitSha: string;
  filesChecked: number;
  filesFixed: number;
  errorsFound: { type: string; path: string; expected?: string; actual?: string }[];
  errorsFixed: { type: string; path: string }[];
  status: "clean" | "fixed" | "failed";
  createdAt: string;
};

type AutofixConfig = {
  fixSyntax: boolean;
  fixMissingFields: boolean;
  fixTypeMismatches: boolean;
  removeUnknownFields: boolean;
};

function FolderPickerDialog({ open, onOpenChange, onSelect }: { open: boolean; onOpenChange: (v: boolean) => void; onSelect: (path: string) => void }) {
  const [currentPath, setCurrentPath] = useState("");
  const [dirs, setDirs] = useState<{ name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [manualPath, setManualPath] = useState("");

  const browse = useCallback(async (path?: string) => {
    setLoading(true);
    const url = path ? `/api/admin/browse-dirs?path=${encodeURIComponent(path)}` : "/api/admin/browse-dirs";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setCurrentPath(data.current);
      setManualPath(data.current);
      setDirs(data.dirs);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (open) browse(); }, [open, browse]);

  function goUp() {
    const parent = currentPath.replace(/\/[^/]+$/, "") || "/";
    browse(parent);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Select Folder</DialogTitle>
          <DialogDescription>Browse to the local repository folder.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-2">
          <Input
            value={manualPath}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setManualPath(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") browse(manualPath); }}
            className="text-sm font-mono"
          />
          <Button variant="outline" className="h-9" onClick={() => browse(manualPath)}>Go</Button>
        </div>

        <div className="rounded-lg border border-border max-h-64 overflow-y-auto">
          <button
            onClick={goUp}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 border-b border-border"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            ..
          </button>
          {loading ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">Loading...</div>
          ) : dirs.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">No subdirectories</div>
          ) : (
            dirs.map((dir) => (
              <button
                key={dir.path}
                onClick={() => browse(dir.path)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 border-b border-border last:border-b-0"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0">
                  <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                </svg>
                {dir.name}
              </button>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSelect(currentPath); onOpenChange(false); }}>
            Select this folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DevelopmentSection({ projectId, localPath, onUpdate }: { projectId: string; localPath: string | null; onUpdate: (path: string | null) => void }) {
  const [showPicker, setShowPicker] = useState(false);
  const active = !!localPath;

  async function handleToggle() {
    if (active) {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localPath: null }),
      });
      if (res.ok) {
        onUpdate(null);
        toast.success("Local development disabled");
      }
    } else {
      setShowPicker(true);
    }
  }

  async function handleSelect(path: string) {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ localPath: path }),
    });
    if (res.ok) {
      onUpdate(path);
      toast.success("Local development enabled");
    } else {
      toast.error("Failed to set local path");
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-medium">Development</h2>
        <p className="text-sm text-muted-foreground">
          Use a local folder instead of the connected GitHub repo.
        </p>
      </div>
      <Separator />

      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Local Development Mode</p>
          <p className="text-xs text-muted-foreground">
            {active ? localPath : "Read and write content from a local folder on the server."}
          </p>
        </div>
        <button
          onClick={handleToggle}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${active ? "bg-foreground" : "bg-muted"}`}
        >
          <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${active ? "translate-x-4" : "translate-x-0"}`} />
        </button>
      </div>

      {active && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 shrink-0 mt-0.5">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
              <div>
                <p className="text-xs text-amber-500/80 mb-1">GitHub repo is bypassed</p>
                <p className="text-sm font-mono text-amber-200/90">{localPath}</p>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setShowPicker(true)} className="text-xs text-amber-500/80 hover:text-amber-400">
              Change
            </Button>
          </div>
        </div>
      )}

      <FolderPickerDialog open={showPicker} onOpenChange={setShowPicker} onSelect={handleSelect} />
    </section>
  );
}

function AutofixSection({ projectId }: { projectId: string }) {
  const [settings, setSettings] = useState<AutofixConfig>({
    fixSyntax: true,
    fixMissingFields: true,
    fixTypeMismatches: true,
    removeUnknownFields: false,
  });
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/autofix`)
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.settings);
        setLogs(data.logs);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  async function saveSettings(updated: AutofixConfig) {
    setSettings(updated);
    setSaving(true);
    await fetch(`/api/projects/${projectId}/autofix`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    setSaving(false);
  }

  function formatTimeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  if (loading) {
    return (
      <section className="flex flex-col gap-5">
        <div><div className="h-5 w-32 rounded bg-muted/50 animate-pulse" /></div>
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded-md bg-muted/30 animate-pulse" />)}
        </div>
      </section>
    );
  }

  const toggleItems: { key: keyof AutofixConfig; label: string; desc: string }[] = [
    { key: "fixSyntax", label: "Fix JSON syntax errors", desc: "Trailing commas, single quotes, unquoted keys" },
    { key: "fixMissingFields", label: "Fix missing fields", desc: "Adds default values for fields defined in types.json" },
    { key: "fixTypeMismatches", label: "Fix type mismatches", desc: "Coerces wrong types to the correct ones" },
    { key: "removeUnknownFields", label: "Remove unknown fields", desc: "Fields not defined in types.json" },
  ];

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-medium mb-0.5">Auto-fix</h2>
        <p className="text-sm text-muted-foreground">
          Automatically validate and fix JSON content files when changes are pushed to GitHub.
        </p>
      </div>

      <div className="rounded-lg border border-border divide-y divide-border">
        {toggleItems.map((item) => (
          <div key={item.key} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
            <button
              onClick={() => saveSettings({ ...settings, [item.key]: !settings[item.key] })}
              disabled={saving}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                settings[item.key] ? "bg-foreground" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform mt-0.5 ${
                  settings[item.key] ? "translate-x-[18px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-medium mb-3">Recent Activity</h3>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No webhook events yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {logs.map((log) => (
              <div key={log.id} className="rounded-md border border-border">
                <button
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
                >
                  {log.status === "clean" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-emerald-500"><path d="M20 6 9 17l-5-5" /></svg>
                  )}
                  {log.status === "fixed" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-amber-500"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
                  )}
                  {log.status === "failed" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-red-500"><circle cx="12" cy="12" r="10" /><line x1="15" x2="9" y1="9" y2="15" /><line x1="9" x2="15" y1="9" y2="15" /></svg>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      {log.status === "clean" && `No errors found (${log.filesChecked} file${log.filesChecked === 1 ? "" : "s"} checked)`}
                      {log.status === "fixed" && `Fixed ${log.errorsFixed.length} error${log.errorsFixed.length === 1 ? "" : "s"} in ${log.filesFixed} file${log.filesFixed === 1 ? "" : "s"}`}
                      {log.status === "failed" && `Could not auto-fix ${log.errorsFound.find((e) => !log.errorsFixed.some((f) => f.path === e.path))?.path?.split("/").pop() ?? "file"}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatTimeAgo(log.createdAt)} · {log.repository}/{log.branch}
                    </p>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 mt-1 text-muted-foreground transition-transform ${expandedLog === log.id ? "rotate-180" : ""}`}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {expandedLog === log.id && log.errorsFound.length > 0 && (
                  <div className="border-t border-border px-3 py-2 bg-muted/10">
                    <div className="flex flex-col gap-1">
                      {log.errorsFound.map((err, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className={`shrink-0 ${log.errorsFixed.some((f) => f.path === err.path && f.type === err.type) ? "text-emerald-500" : "text-red-500"}`}>
                            {log.errorsFixed.some((f) => f.path === err.path && f.type === err.type) ? "fixed" : "error"}
                          </span>
                          <span className="text-muted-foreground font-mono truncate">{err.path}</span>
                          <span className="text-muted-foreground/60">{err.type.replace("_", " ")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const { current, updateProject, deleteProject, setKernInstalled } = useProjects();
  const isSystemAdmin = useIsAdmin();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [section, setSectionState] = useState(searchParams.get("section") ?? "general");
  const setSection = useCallback((id: string) => {
    setSectionState(id);
    router.replace("/settings", { scroll: false });
  }, [router]);

  const [name, setName] = useState(current?.name ?? "");
  const [url, setUrl] = useState(current?.url ?? "");

  useEffect(() => {
    if (!current?.repo) return;
    fetch(`/api/projects/${current.id}/kern/validate`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && data.installed !== current.kernInstalled) {
          setKernInstalled(current.id, data.installed);
        }
      })
      .catch(() => {});
  }, [current?.id, current?.repo]); // eslint-disable-line react-hooks/exhaustive-deps

  const canAccessSettings = isSystemAdmin || current?.role === "admin";

  if (!current) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Select a project to view settings.</p>
      </div>
    );
  }

  if (!canAccessSettings) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">You don't have permission to access project settings.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="flex flex-col gap-1 mb-8">
        <h1 className="text-xl font-semibold tracking-tight font-[family-name:var(--font-averia)]">Project Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage settings for {current.name}.
        </p>
      </div>

      <div className="flex gap-10">
        <aside className="w-44 shrink-0">
          <nav className="sticky top-20 flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => !("comingSoon" in item && item.comingSoon) && setSection(item.id)}
                className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  "comingSoon" in item && item.comingSoon
                    ? "text-muted-foreground/50 cursor-default"
                    : section === item.id
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                {item.icon}
                {item.label}
                {"comingSoon" in item && item.comingSoon && (
                  <span className="text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded-full ml-auto">Soon</span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex-1 min-w-0">
          {section === "general" && (
            <GeneralSection
              current={current}
              name={name}
              setName={setName}
              url={url}
              setUrl={setUrl}
              updateProject={updateProject}
              deleteProject={deleteProject}
              setKernInstalled={setKernInstalled}
            />
          )}
          {section === "members" && <ProjectMembersSection projectId={current.id} />}
          {section === "media" && <MediaSection projectId={current.id} />}
          {section === "permissions" && <PermissionsSection current={current} />}
          {section === "development" && (
            <DevelopmentSection
              projectId={current.id}
              localPath={current.localPath ?? null}
              onUpdate={(path) => updateProject(current.id, { localPath: path })}
            />
          )}
          {section === "autofix" && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="rounded-full bg-muted p-3 mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
              </div>
              <h3 className="text-sm font-medium mb-1">Auto-fix is coming soon</h3>
              <p className="text-xs text-muted-foreground max-w-xs">Automatic JSON validation and fixing for your content files via GitHub webhooks.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
