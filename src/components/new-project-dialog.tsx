"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjects } from "@/components/project-context";
import { GitHubRepoPicker } from "@/components/github-repo-picker";

const ALL_COLORS = [
  "#ef4444", "#f97316", "#f59e0b",
  "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e", "#fb923c", "#e11d48", "#7c3aed",
  "#2563eb", "#0891b2", "#059669", "#d97706",
];

function pickRandom(count: number) {
  const shuffled = [...ALL_COLORS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

const COLOR_COUNT = 10;

export function NewProjectDialog({
  trigger,
}: {
  trigger: React.ReactNode;
}) {
  const { addProject } = useProjects();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [colors, setColors] = useState(() => pickRandom(COLOR_COUNT));
  const [selected, setSelected] = useState<string | null>(null);
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");

  const reset = useCallback(() => {
    setName("");
    setUrl("");
    const newColors = pickRandom(COLOR_COUNT);
    setColors(newColors);
    setSelected(null);
    setRepo("");
    setBranch("");
  }, []);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger
        className="cursor-pointer"
        nativeButton={true}
        render={trigger as React.ReactElement}
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>
            Set up a new project to organize your content.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              placeholder="My Website"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-url">
              URL{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="project-url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <GitHubRepoPicker
            repo={repo}
            branch={branch}
            onRepoChange={setRepo}
            onBranchChange={setBranch}
          />
          <div className="flex flex-col gap-2">
            <Label>Color</Label>
            <div className="flex items-center gap-1.5">
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelected(color)}
                  className="h-8 flex-1 rounded-md transition-all hover:scale-110"
                  style={{
                    backgroundColor: color,
                    outline: selected === color ? "2px solid white" : "none",
                    outlineOffset: "2px",
                  }}
                />
              ))}
              <button
                type="button"
                onClick={() => {
                  const newColors = pickRandom(COLOR_COUNT);
                  setColors(newColors);
                  setSelected(null);
                }}
                className="flex h-8 flex-1 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
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
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <DialogFooter className="items-center">
          <Button variant="outline" size="lg" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="lg"
            disabled={!name.trim() || !repo || !branch}
            onClick={() => {
              addProject({
                name: name.trim(),
                color: selected ?? colors[0],
                url: url || undefined,
                repo: repo || undefined,
                branch: branch || undefined,
              });
              setOpen(false);
              reset();
            }}
          >
            Create Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
