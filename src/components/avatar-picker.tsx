"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NestedDialogOverlay } from "@/components/ui/nested-dialog-overlay";
import {
  type AvatarConfig,
  type StyleId,
  STYLES,
  STYLE_PARTS,
  parseDiceBearConfig,
  serializeDiceBearConfig,
  renderDiceBearAvatar,
  seedAvatar,
  randomConfig,
} from "@/lib/avatar";

function generateSeeds(count: number): string[] {
  return Array.from({ length: count }, () => Math.random().toString(36).substring(2, 10));
}

interface AvatarPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string | null) => void;
  currentImage?: string | null;
  oauthImage?: string | null;
  userName?: string;
}

export function AvatarPicker({ open, onOpenChange, onSelect, currentImage, oauthImage, userName }: AvatarPickerProps) {
  const [tab, setTab] = useState<"gallery" | "editor">("gallery");
  const [styleId, setStyleId] = useState<StyleId>("notionistsNeutral");
  const [seeds, setSeeds] = useState(() => generateSeeds(24));
  const [selectedSeed, setSelectedSeed] = useState<string | null>(null);
  const [useDefault, setUseDefault] = useState(false);
  const [config, setConfig] = useState<AvatarConfig>(() => randomConfig("notionistsNeutral"));
  const [activePart, setActivePart] = useState(0);
  const [styleDropdownOpen, setStyleDropdownOpen] = useState(false);

  useEffect(() => {
    if (open && currentImage) {
      const parsed = parseDiceBearConfig(currentImage);
      if (parsed) {
        setConfig(parsed);
        setStyleId(parsed.style);
        setTab("editor");
        setActivePart(0);
      }
    }
  }, [open, currentImage]);

  const parts = STYLE_PARTS[styleId];

  const galleryAvatars = useMemo(() => seeds.map((seed) => ({
    seed,
    uri: seedAvatar(styleId, seed),
  })), [seeds, styleId]);

  const editorPreview = useMemo(() => renderDiceBearAvatar(config, 256), [config]);

  const partPreviews = useMemo(() => {
    const part = parts[activePart];
    if (!part) return [];
    const allVariants = part.optional ? ["none", ...part.variants] : part.variants;
    return allVariants.map((variant) => ({
      variant,
      uri: renderDiceBearAvatar({ ...config, parts: { ...config.parts, [part.key]: variant } }, 64),
    }));
  }, [config, activePart, parts]);

  function handleStyleChange(newStyle: StyleId) {
    setStyleId(newStyle);
    setStyleDropdownOpen(false);
    if (tab === "gallery") {
      setSeeds(generateSeeds(24));
      setSelectedSeed(null);
    } else {
      setConfig(randomConfig(newStyle));
      setActivePart(0);
    }
  }

  function handleShuffle() {
    setSeeds(generateSeeds(24));
    setSelectedSeed(null);
    setUseDefault(false);
  }

  function handleSave() {
    if (useDefault) {
      onSelect(oauthImage ?? null);
    } else if (tab === "gallery" && selectedSeed) {
      onSelect(seedAvatar(styleId, selectedSeed));
    } else if (tab === "editor") {
      onSelect(serializeDiceBearConfig(config));
    }
    onOpenChange(false);
  }

  function handleGallerySelect(seed: string) {
    setSelectedSeed(seed);
    setUseDefault(false);
  }

  function handleDefaultSelect() {
    setUseDefault(true);
    setSelectedSeed(null);
  }

  const canSave = tab === "editor" || useDefault || (tab === "gallery" && selectedSeed);
  const initials = userName?.charAt(0).toUpperCase() ?? "?";
  const currentStyleLabel = STYLES.find((s) => s.id === styleId)?.label ?? styleId;

  return (
    <>
      <NestedDialogOverlay open={open} onClose={() => onOpenChange(false)} zIndex={55} />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md !p-0 overflow-hidden" style={{ zIndex: 56 }}>
          <div className="px-5 pt-5 pb-0">
            <DialogHeader>
              <DialogTitle className="text-base">Choose Avatar</DialogTitle>
            </DialogHeader>
          </div>

          <div className="px-5 flex items-center gap-2">
            <div className="flex gap-0.5 rounded-md bg-muted/50 p-0.5 flex-1">
              <button
                type="button"
                onClick={() => setTab("gallery")}
                className={`flex-1 rounded px-3 py-1 text-xs font-medium transition-colors ${
                  tab === "gallery" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Gallery
              </button>
              <button
                type="button"
                onClick={() => { setTab("editor"); setUseDefault(false); setSelectedSeed(null); }}
                className={`flex-1 rounded px-3 py-1 text-xs font-medium transition-colors ${
                  tab === "editor" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Editor
              </button>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setStyleDropdownOpen(!styleDropdownOpen)}
                className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
              >
                {currentStyleLabel}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {styleDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 z-10 w-40 rounded-md border border-border bg-popover p-1 shadow-md">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleStyleChange(s.id)}
                      className={`w-full rounded px-2.5 py-1.5 text-left text-xs transition-colors ${
                        styleId === s.id
                          ? "bg-muted text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="px-5 h-[320px]">
            {tab === "gallery" ? (
              <div className="grid grid-cols-7 gap-1.5">
                <button
                  type="button"
                  onClick={handleDefaultSelect}
                  className={`rounded-lg overflow-hidden border-2 transition-all aspect-square flex items-center justify-center ${
                    useDefault
                      ? "border-foreground"
                      : "border-transparent hover:border-muted-foreground/30"
                  }`}
                >
                  {oauthImage ? (
                    <img src={oauthImage} alt="" className="w-full h-full rounded-md" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full rounded-md bg-white/10 flex items-center justify-center text-sm font-medium text-muted-foreground">
                      {initials}
                    </div>
                  )}
                </button>
                {galleryAvatars.map(({ seed, uri }) => (
                  <button
                    key={seed}
                    type="button"
                    onClick={() => handleGallerySelect(seed)}
                    className={`rounded-lg overflow-hidden border-2 transition-all aspect-square ${
                      selectedSeed === seed && !useDefault
                        ? "border-foreground"
                        : "border-transparent hover:border-muted-foreground/30"
                    }`}
                  >
                    <img src={uri} alt="" className="w-full h-full" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleShuffle}
                  className="rounded-lg border-2 border-transparent hover:border-muted-foreground/30 transition-all aspect-square flex items-center justify-center bg-muted/50"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 16h5v5" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="flex gap-5 h-full">
                <div className="flex flex-col items-center gap-3 shrink-0">
                  <div className="rounded-xl overflow-hidden border border-input w-28 h-28 bg-white">
                    <img src={editorPreview} alt="" className="w-full h-full" />
                  </div>
                  <div className="flex flex-col gap-0.5 w-28">
                    {parts.map((part, idx) => (
                      <button
                        key={part.key}
                        type="button"
                        onClick={() => setActivePart(idx)}
                        className={`px-2 py-1 rounded text-xs font-medium text-left transition-colors ${
                          activePart === idx
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {part.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 grid grid-cols-4 gap-x-1.5 gap-y-2 content-start overflow-y-auto pr-1">
                  {partPreviews.map(({ variant, uri }) => (
                    <button
                      key={variant}
                      type="button"
                      onClick={() => {
                        const part = parts[activePart];
                        setConfig((prev) => ({ ...prev, parts: { ...prev.parts, [part.key]: variant } }));
                      }}
                      className={`rounded-lg border-2 transition-all aspect-square p-0.5 ${
                        config.parts[parts[activePart]?.key] === variant
                          ? "border-foreground"
                          : "border-transparent hover:border-muted-foreground/30"
                      }`}
                    >
                      <img src={uri} alt="" className="w-full h-full rounded-md" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end px-5 py-3 border-t border-border">
            <Button size="sm" onClick={handleSave} disabled={!canSave}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
