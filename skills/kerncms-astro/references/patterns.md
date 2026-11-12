# Code patterns for kerncms sites

Taken from a working reference site. Adapt names and styling; keep the structure.

## `kern.config.yaml` (excerpt)

```yaml
version: 1
framework: astro
site: { id: baeckerei-mueller, name: Bäckerei Müller, url: https://baeckerei-mueller.de }
branch: main
preview:
  command: pnpm exec astro dev --port {port} --host {host} --ignore-lock
build:
  command: pnpm exec astro build
media:
  dir: public/media
marks:
  - { id: accent, label: Akzent, class: mark-accent }
  - { id: marker, label: Marker, class: mark-marker }

pages:
  label: Seiten
  path: src/content/pages

blocks:
  hero:
    label: Hero
    description: Große Überschrift mit Bild und Button
    icon: layout-template
    fields:
      headline:    { type: inline, label: Überschrift, required: true }
      text:        { type: textarea, label: Text }
      buttonLabel: { type: text, label: Button-Text }
      buttonLink:  { type: link, label: Button-Ziel }
      image:       { type: image, label: Bild }
      imageAlt:    { type: text, label: Bildbeschreibung }
  features:
    label: Vorteile
    icon: sparkles
    fields:
      heading: { type: text, label: Überschrift }
      items:
        type: list
        label: Punkte
        itemLabel: title
        fields:
          title: { type: text, label: Titel }
          text:  { type: textarea, label: Text }
  events:
    label: Termine
    description: Kommende Veranstaltungen
    icon: calendar-days
    source: events               # editor shows "Termine bearbeiten"
    fields:
      heading: { type: text, label: Überschrift }
      limit:   { type: number, label: Anzahl, default: 3, min: 1, max: 12 }

collections:
  events:
    label: Termine
    singular: Termin
    icon: calendar-days
    path: src/content/events
    format: json
    titleField: title
    listFields: [datum, ort]
    fields:
      title: { type: text, label: Titel, required: true }
      datum: { type: date, label: Datum, required: true }
      ort:   { type: text, label: Ort }
      text:  { type: textarea, label: Beschreibung }

globals:
  site:
    label: Allgemein
    path: src/content/globals/site.json
    fields:
      name:  { type: text, label: Name der Website }
      phone: { type: text, label: Telefon }

forms:
  kontakt:
    label: Kontaktformular
    fields:
      name:    { type: text, label: Name, required: true }
      email:   { type: email, label: E-Mail, required: true }
      message: { type: textarea, label: Nachricht, required: true }
      privacy: { type: boolean, label: Ich bin mit der Verarbeitung meiner Angaben einverstanden., required: true }

redirects: src/content/globals/redirects.json
```

## `src/lib/kern.ts`

```ts
import type { Link } from "../content.config";

export const isPreview = Boolean(process.env.KERN_PREVIEW ?? import.meta.env.KERN_PREVIEW);
export const cmsUrl = (process.env.KERN_CMS_URL ?? import.meta.env.KERN_CMS_URL ?? "").replace(/\/$/, "");

export const kernUrl = (import.meta.env.PUBLIC_KERN_URL ?? "").replace(/\/$/, "");
export const kernSite = import.meta.env.PUBLIC_KERN_SITE ?? "";
export const formEndpoint = (form: string) => `${kernUrl}/api/public/${kernSite}/forms/${form}`;
export const collectEndpoint = () => `${kernUrl}/api/public/${kernSite}/collect`;

export function href(link: Link | undefined | null) {
  if (!link) return undefined;
  return link.type === "page" ? link.path || "/" : link.url || undefined;
}
export const linkTarget = (link: Link | undefined | null) =>
  link?.type === "external" && link.newTab ? { target: "_blank", rel: "noopener" } : {};

/** Attributes every block root carries. */
export const blockRoot = (block: { id: string; type: string }) => ({
  "data-kern-block": block.id,
  "data-kern-type": block.type,
});
/** field("items", 0, "title") → data-kern-field="items.0.title" */
export const field = (...path: (string | number)[]) => ({ "data-kern-field": path.join(".") });
```

## `src/content.config.ts` (excerpt)

```ts
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const optText = z.string().optional();
export const link = z.discriminatedUnion("type", [
  z.object({ type: z.literal("page"), path: z.string() }),
  z.object({ type: z.literal("external"), url: z.string(), newTab: z.boolean().default(false) }),
]);
export type Link = z.infer<typeof link>;

const hero = z.object({
  id: z.string(),
  type: z.literal("hero"),
  headline: z.string(),
  text: optText,
  buttonLabel: optText,
  buttonLink: link.optional(),
  image: optText,
  imageAlt: optText,
});
const features = z.object({
  id: z.string(),
  type: z.literal("features"),
  heading: optText,
  items: z.array(z.object({ title: z.string().default(""), text: optText })).default([]),
});

const block = z.discriminatedUnion("type", [hero, features /* … every block */]);
export type Block = z.infer<typeof block>;
export type BlockOf<T extends Block["type"]> = Extract<Block, { type: T }>;

const pages = defineCollection({
  loader: glob({ base: "./src/content/pages", pattern: "**/*.json" }),
  schema: z.object({
    title: z.string(),
    path: z.string().startsWith("/"),
    seo: z
      .object({ title: z.string().default(""), description: z.string().default(""), image: z.string().default(""), noindex: z.boolean().default(false) })
      .default({ title: "", description: "", image: "", noindex: false }),
    blocks: z.array(block).default([]),
  }),
});

// A global is a single JSON file.
const single = (name: string) => glob({ base: "./src/content/globals", pattern: `${name}.json` });
const site = defineCollection({ loader: single("site"), schema: z.object({ name: z.string(), phone: optText }) });

export const collections = { pages, site /* , events, posts … */ };
```

## `src/pages/[...slug].astro`

```astro
---
import { getCollection, type CollectionEntry } from "astro:content";
import Base from "../layouts/Base.astro";
import Blocks from "../components/Blocks.astro";

export async function getStaticPaths() {
  const pages = await getCollection("pages");
  return pages.map((page) => ({
    params: { slug: page.data.path === "/" ? undefined : page.data.path.replace(/^\/|\/$/g, "") },
    props: { page },
  }));
}
const { page } = Astro.props as { page: CollectionEntry<"pages"> };
const { title, seo, blocks } = page.data;
---
<Base title={seo.title || title} description={seo.description} image={seo.image} noindex={seo.noindex}>
  <Blocks blocks={blocks} />
</Base>
```

## `src/components/Blocks.astro`

```astro
---
import type { Block } from "../content.config";
import Hero from "./blocks/Hero.astro";
import Features from "./blocks/Features.astro";

const { blocks } = Astro.props as { blocks: Block[] };
const components = { hero: Hero, features: Features } satisfies Record<Block["type"], unknown>;
---
{blocks.map((block) => {
  const Component = components[block.type] as (props: { block: Block }) => unknown;
  return <Component block={block} />;
})}
```

## A block component with markers

```astro
---
import type { BlockOf } from "../../content.config";
import { blockRoot, field, href, linkTarget } from "../../lib/kern";
const { block } = Astro.props as { block: BlockOf<"hero"> };
---
<section {...blockRoot(block)} class="hero">
  <h1 {...field("headline")} set:html={block.headline} />
  {block.text && <p {...field("text")}>{block.text}</p>}
  {block.buttonLabel && block.buttonLink && (
    <a {...field("buttonLabel")} href={href(block.buttonLink)} {...linkTarget(block.buttonLink)}>{block.buttonLabel}</a>
  )}
  {block.image && <img {...field("image")} src={block.image} alt={block.imageAlt ?? ""} />}
</section>
```

Lists: `block.items.map((item, i) => <h3 {...field("items", i, "title")}>{item.title}</h3>)`.
Globals in the layout: `<a data-kern-global="site#phone" href={`tel:${site.phone}`}>{site.phone}</a>`.

## Layout head

```astro
{isPreview && <script is:inline src={`${cmsUrl}/kern-overlay.js`}></script>}
{!isPreview && (
  <script is:inline define:vars={{ collectUrl: collectEndpoint() }}>
    if (navigator.doNotTrack !== "1" && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(collectUrl, JSON.stringify({ path: location.pathname, referrer: document.referrer, width: innerWidth }));
      } catch (e) {}
    }
  </script>
)}
```

## Form

```astro
<form data-form-id="kontakt" action={formEndpoint("kontakt")} method="post" novalidate>
  <label for="name">Name</label>
  <input id="name" name="name" required />
  <span data-error-for="name" class="hidden"></span>
  <!-- … one input per field in kern.config.yaml forms.kontakt … -->
  <div aria-hidden="true" style="position:absolute;left:-9999px">
    <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" />
  </div>
  <button type="submit" data-submit>Senden</button>
  <p data-status role="status"></p>
</form>
<script>
  for (const form of document.querySelectorAll<HTMLFormElement>("form[data-form-id]")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data: Record<string, string | boolean> = {};
      for (const el of Array.from(form.elements) as HTMLInputElement[]) {
        if (el.name) data[el.name] = el.type === "checkbox" ? el.checked : el.value.trim();
      }
      const res = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) { /* show success */ return; }
      for (const [name, message] of Object.entries(json?.errors ?? {})) {
        const el = form.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
        if (el) { el.textContent = String(message); el.classList.remove("hidden"); }
      }
    });
  }
</script>
```

## Redirects in `astro.config.mjs`

```js
import { readFileSync } from "node:fs";
const list = JSON.parse(readFileSync(new URL("./src/content/globals/redirects.json", import.meta.url), "utf8"));
const redirects = Object.fromEntries(list.map((r) => [r.from, { status: r.status ?? 301, destination: r.to }]));
export default defineConfig({ site: "https://example.com", output: "static", redirects });
```

## Mark classes

```css
.mark-accent { color: var(--color-accent); }
.mark-marker {
  background: linear-gradient(transparent 60%, color-mix(in oklab, var(--color-accent) 30%, transparent) 60%);
  box-decoration-break: clone;
}
```
