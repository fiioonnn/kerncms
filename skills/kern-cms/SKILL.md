---
name: kern-cms
description: Connect a website to kern CMS (Astro first, React/Next.js too) so its content is editable — create kern content JSON and types.json, render every value from kern instead of hardcoding it, and wire images, links, repeaters and globals. Use when the user mentions kern, kern CMS, kerncms, src/kern, getSection/getGlobal, making site text or images editable in the CMS, or moving hardcoded site text into a CMS.
---

# kern CMS

kern is a Git-based headless CMS. Content lives as JSON files in the site's own repository; the site reads them at build time; editors change them in the kern dashboard, which commits back to the repo and the site redeploys.

Editors only ever see the kern fields — anything hardcoded in a template can't be changed from the CMS. So the job is almost always: put the content in kern files, then render it from them. The dashboard's preview shows the deployed site next to the editor, so changes appear there after publishing and redeploying.

## File layout

All paths are relative to the site's source dir (usually `src/`):

```
src/kern/
  content/<page>/<section>.json   # one file per page section
  globals/<name>.json             # shared content: navigation, footer, contact, seo
  types.json                      # field types for every section and global
  helpers.ts                      # getSection, getGlobal, getRepeater … (installed by kern)
public/kern/media/                # uploaded media
```

- `<page>` is the URL segment: `about` → `/about`. Name the homepage `home` (or `default`) — the preview opens it at `/`.
- Section and field keys: lowercase `snake_case`, stable — renaming a key breaks the site. Keys become the labels editors see (`cta_href` → "CTA link", `image_alt` → "Image alt text"), so pick descriptive ones.
- Every content file starts with `"$schema": "kern"`.

```json
// src/kern/content/home/hero.json
{
  "$schema": "kern",
  "title": "Fresh bread every morning",
  "subtitle": "Baked in small batches.\nOpen daily from 7am.",
  "cta_label": "See our menu",
  "cta_href": "/menu",
  "image": "/kern/media/loaf.jpg",
  "image_alt": "A golden sourdough loaf"
}
```

`types.json` declares the field type of each value (see [references/field-types.md](references/field-types.md) for every type):

```json
{
  "content": {
    "home": {
      "hero": { "title": "text", "subtitle": "textarea", "cta_label": "text", "cta_href": "text", "image": "image", "image_alt": "text" }
    }
  },
  "globals": {
    "navigation": { "brand": "text", "links": [{ "label": "text", "href": "text" }] }
  }
}
```

Keep `types.json` in sync with the JSON files: every key in a content file needs a type, or the dashboard shows a warning.

## Rendering content (Astro)

Read data in the frontmatter, render it with plain expressions:

```astro
---
import { getSection, getGlobal } from '../kern/helpers'
const hero = getSection('home', 'hero')
const nav = getGlobal('navigation')
---
<section class="hero">
  <h1>{hero.title}</h1>
  <p class="subtitle">{hero.subtitle}</p>
  <a class="btn" href={hero.cta_href}>{hero.cta_label}</a>
  <img src={hero.image} alt={hero.image_alt} />
</section>
<footer>© 2026 {nav.brand}</footer>
```

Other ways to read content:

| Pattern | Example |
|---|---|
| Helpers | `getSection('home','hero')`, `getGlobal('navigation')`, `getPageSections('home')`, `getAllGlobals()` |
| JSON import | `import hero from '../kern/content/home/hero.json'` |
| Repeaters | `{hero.items.map((item) => <h3>{item.title}</h3>)}`, `getRepeater(hero.items, { limit: 3, sort: 'date' })` |
| Components | `<Card item={item} />` + `const { item } = Astro.props` |
| Rich text | `<div set:html={intro.body} />` |
| Backgrounds | ``style={`background-image:url(${hero.banner})`}`` |

### Guidelines

1. **Everything an editor might change comes from kern** — headings, body text, button labels, link targets, images and their alt text, list items. Leave only structural markup in the template.
2. **Presentation stays in CSS.** Keep the stored text natural (`"Why people love us"`) and style it (`text-transform: uppercase`, `line-clamp`), so editors see what they typed.
3. **`textarea` line breaks:** render with `white-space: pre-line`, or split paragraphs: `{s.body.split('\n\n').map((p) => <p>{p}</p>)}`.
4. **Images:** pass the field straight to `src` (Astro's `<Image>` too). Always pair an image with an `_alt` text field.
5. **Links:** URL fields go into `href`; the link text is its own field.
6. **Repeaters** for any list of similar things (features, testimonials, team, FAQ) — not numbered fields like `feature_1_title`, `feature_2_title`.
7. **Server-render content.** `helpers.ts` reads files with `fs` at build time; never fetch kern JSON in the browser.

## React / Next.js

Same guidelines:

```tsx
import { getSection } from '@/kern/helpers'

export default function Hero() {
  const hero = getSection('home', 'hero')
  return (
    <section className="hero">
      <h1>{hero.title}</h1>
      <a className="btn" href={hero.cta_href}>{hero.cta_label}</a>
      <div className="prose" dangerouslySetInnerHTML={{ __html: hero.body }} />
    </section>
  )
}
```

`helpers.ts` reads files with `fs`, so call it in server components / at build time, never in client components (`'use client'`).

## Workflow: make a page editable

1. Find the page's template and the components it uses. List every user-facing string, image, and link that should be editable.
2. Group them into sections (hero, features, cta, …) and shared globals (navigation, footer, contact). Reuse existing kern files if `src/kern/` already exists — read `types.json` first.
3. Write `src/kern/content/<page>/<section>.json` with the current values (copy text exactly; keep line breaks as `\n` in `textarea` fields), and add matching entries to `types.json`.
4. Replace hardcoded values in the templates with kern values following the guidelines above. Keep markup and classes unchanged, so the page looks identical.
5. Verify: the site builds; the page renders exactly as before; no editable text is left hardcoded (search the template); every key in the JSON has a type in `types.json`.
6. Tell the user to commit and deploy. The kern dashboard then shows the new sections, and its preview shows the result.

## Common mistakes

- Hardcoding text "because it never changes" — it then can't be edited at all.
- Storing presentation in content: upper-case text, manual line wraps, HTML in `text` fields — use CSS or a `richtext` field.
- Numbered fields instead of a repeater (`item_1`, `item_2`, …) — editors can't add or reorder them.
- Putting a page's content in globals or vice versa — globals are for things shared across pages.
- Renaming keys in JSON without updating every template and `types.json`.
- Fetching kern JSON in the browser — use build-time reads.
