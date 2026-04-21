import { createAvatar } from "@dicebear/core";
import * as collection from "@dicebear/collection";

export type StyleId =
  | "notionistsNeutral"
  | "adventurerNeutral"
  | "avataaarsNeutral"
  | "bigEarsNeutral"
  | "botttsNeutral"
  | "funEmoji"
  | "loreleiNeutral"
  | "croodlesNeutral"
  | "pixelArtNeutral";

export const STYLES: { id: StyleId; label: string }[] = [
  { id: "notionistsNeutral", label: "Notionists" },
  { id: "adventurerNeutral", label: "Adventurer" },
  { id: "avataaarsNeutral", label: "Avataaars" },
  { id: "bigEarsNeutral", label: "Big Ears" },
  { id: "botttsNeutral", label: "Bottts" },
  { id: "funEmoji", label: "Fun Emoji" },
  { id: "loreleiNeutral", label: "Lorelei" },
  { id: "croodlesNeutral", label: "Croodles" },
  { id: "pixelArtNeutral", label: "Pixel Art" },
];

type PartDef = { key: string; label: string; variants: string[]; optional?: boolean };

const v = (count: number) =>
  Array.from({ length: count }, (_, i) => `variant${String(i + 1).padStart(2, "0")}`);

export const STYLE_PARTS: Record<StyleId, PartDef[]> = {
  notionistsNeutral: [
    { key: "brows", label: "Brows", variants: v(13) },
    { key: "eyes", label: "Eyes", variants: v(5) },
    { key: "nose", label: "Nose", variants: v(20) },
    { key: "lips", label: "Lips", variants: v(30) },
    { key: "glasses", label: "Glasses", variants: v(11), optional: true },
  ],
  adventurerNeutral: [
    { key: "eyebrows", label: "Brows", variants: v(15) },
    { key: "eyes", label: "Eyes", variants: v(26) },
    { key: "mouth", label: "Mouth", variants: v(30) },
    { key: "glasses", label: "Glasses", variants: v(5), optional: true },
  ],
  avataaarsNeutral: [
    { key: "eyebrows", label: "Brows", variants: v(13) },
    { key: "eyes", label: "Eyes", variants: v(12) },
    { key: "mouth", label: "Mouth", variants: v(12) },
    { key: "nose", label: "Nose", variants: v(1) },
  ],
  bigEarsNeutral: [
    { key: "eyes", label: "Eyes", variants: v(32) },
    { key: "mouth", label: "Mouth", variants: v(38) },
    { key: "nose", label: "Nose", variants: v(12) },
    { key: "cheek", label: "Cheeks", variants: v(6), optional: true },
  ],
  botttsNeutral: [
    { key: "eyes", label: "Eyes", variants: v(14) },
    { key: "mouth", label: "Mouth", variants: v(9) },
  ],
  funEmoji: [
    { key: "eyes", label: "Eyes", variants: v(15) },
    { key: "mouth", label: "Mouth", variants: v(15) },
  ],
  loreleiNeutral: [
    { key: "eyebrows", label: "Brows", variants: v(13) },
    { key: "eyes", label: "Eyes", variants: v(24) },
    { key: "nose", label: "Nose", variants: v(6) },
    { key: "mouth", label: "Mouth", variants: v(27) },
    { key: "glasses", label: "Glasses", variants: v(5), optional: true },
    { key: "freckles", label: "Freckles", variants: v(1), optional: true },
  ],
  croodlesNeutral: [
    { key: "eyes", label: "Eyes", variants: v(16) },
    { key: "nose", label: "Nose", variants: v(9) },
    { key: "mouth", label: "Mouth", variants: v(18) },
  ],
  pixelArtNeutral: [
    { key: "eyes", label: "Eyes", variants: v(12) },
    { key: "mouth", label: "Mouth", variants: v(23) },
    { key: "glasses", label: "Glasses", variants: v(14), optional: true },
  ],
};

export type AvatarConfig = {
  style: StyleId;
  parts: Record<string, string>;
};

const PREFIX = "dicebear:";
const LEGACY_PREFIX = "dicebear:notionistsNeutral:";

export function isDiceBearConfig(value: string | null | undefined): boolean {
  return !!value?.startsWith(PREFIX);
}

export function parseDiceBearConfig(value: string): AvatarConfig | null {
  if (value.startsWith(LEGACY_PREFIX)) {
    try {
      const parts = JSON.parse(value.slice(LEGACY_PREFIX.length));
      return { style: "notionistsNeutral", parts };
    } catch {
      return null;
    }
  }
  if (!value.startsWith(PREFIX)) return null;
  const rest = value.slice(PREFIX.length);
  const colonIdx = rest.indexOf(":");
  if (colonIdx === -1) return null;
  const style = rest.slice(0, colonIdx) as StyleId;
  if (!STYLES.some((s) => s.id === style)) return null;
  try {
    return { style, parts: JSON.parse(rest.slice(colonIdx + 1)) };
  } catch {
    return null;
  }
}

export function serializeDiceBearConfig(config: AvatarConfig): string {
  return PREFIX + config.style + ":" + JSON.stringify(config.parts);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getStyleModule(styleId: StyleId): any {
  return collection[styleId];
}

export function renderDiceBearAvatar(config: AvatarConfig, size = 128): string {
  const style = getStyleModule(config.style);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opts: any = { seed: "", size, backgroundColor: ["ffffff"] };
  const defs = STYLE_PARTS[config.style];
  for (const def of defs) {
    const val = config.parts[def.key];
    if (def.optional) {
      if (!val || val === "none") {
        opts[def.key] = [];
        opts[def.key.replace(/s$/, "") + "Probability"] = 0;
        if (def.key === "glasses") opts.glassesProbability = 0;
        if (def.key === "cheek") opts.cheekProbability = 0;
        if (def.key === "freckles") opts.frecklesProbability = 0;
      } else {
        opts[def.key] = [val];
        if (def.key === "glasses") opts.glassesProbability = 100;
        if (def.key === "cheek") opts.cheekProbability = 100;
        if (def.key === "freckles") opts.frecklesProbability = 100;
      }
    } else if (val) {
      opts[def.key] = [val];
    }
  }
  return createAvatar(style, opts).toDataUri();
}

export function seedAvatar(styleId: StyleId, seed: string, size = 128): string {
  const style = getStyleModule(styleId);
  return createAvatar(style, { seed, size }).toDataUri();
}

export function resolveAvatarSrc(value: string | null | undefined, size = 128): string | null {
  if (!value) return null;
  const config = parseDiceBearConfig(value);
  if (config) return renderDiceBearAvatar(config, size);
  return value;
}

export function randomConfig(styleId: StyleId): AvatarConfig {
  const defs = STYLE_PARTS[styleId];
  const parts: Record<string, string> = {};
  for (const def of defs) {
    if (def.optional) {
      parts[def.key] = Math.random() < 0.2
        ? def.variants[Math.floor(Math.random() * def.variants.length)]
        : "none";
    } else {
      parts[def.key] = def.variants[Math.floor(Math.random() * def.variants.length)];
    }
  }
  return { style: styleId, parts };
}
