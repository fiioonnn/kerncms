---
name: kerncms-astro
description: Build or adapt an Astro website so customers can edit it in kerncms (Git-based visual CMS). Use whenever creating a new Astro site for a kerncms customer, converting an existing Astro site to kerncms, adding blocks, collections, globals or forms to such a site, or when a repo contains kern.config.yaml.
---

# Astro sites for kerncms

kerncms edits a website by changing files in its Git repository: page JSON, Markdown entries and
global JSON, all described in `kern.config.yaml`. The customer sees the real site in a live preview
and clicks on text and images to edit them. Your job is to build the site so that this works
everywhere, with no hard-coded customer content left in components.

Read `references/contract.md` before writing code. It is the authoritative contract (field types,
file formats, markers, endpoints). `references/patterns.md` has working code for every piece.

## Workflow

1. **Model the content first.** List every page section and decide for each piece of text or image:
   - part of a page → a **block** field (pages are lists of blocks)
   - repeated items with their own detail page or list (posts, events, team, products) → a **collection**
   - shown on many pages (logo, phone, navigation, footer, opening hours) → a **global**
   - something visitors submit → a **form**
2. **Write `kern.config.yaml`** at the repo root (see contract §1). German labels, they are what the
   customer reads. Give every block a `description` and a lucide `icon`. For blocks that display a
   collection or global (e.g. "latest posts", "opening hours"), set `source: <collection-or-global-key>`
   so the editor links to where that content is edited.
3. **Mirror the config in `src/content.config.ts`** with zod schemas. Keep optional fields optional
   and give defaults, so a half-filled block written by the CMS never breaks the build.
4. **Render pages from content**: one catch-all route `src/pages/[...slug].astro` over the `pages`
   collection, a `Blocks.astro` that maps `block.type` to a component, one component per block.
5. **Add the editor markers** (contract §3) on every block root and every element that shows a field,
   including list items (`tiles.0.title`) and globals in the layout (`data-kern-global="site#phone"`).
6. **Wire the layout**: overlay script only in preview, cookieless analytics only outside preview,
   SEO from the page's `seo` object with fallbacks from a `site` global.
7. **Forms and analytics** post to `PUBLIC_KERN_URL` with the site's public key `PUBLIC_KERN_SITE`.
   Put both in `.env.example` with placeholder values.
8. **Seed real-looking content** for every page, entry and global, so the customer starts from a
   finished site, not empty boxes.
9. **Verify** with the checklist below, then `pnpm build` (or the package manager in use).

## Rules that are easy to get wrong

- **No content in components.** Every visible text, image, link and button label comes from content
  files. Exceptions: legal boilerplate the customer must not change, and empty-state messages.
- **Images**: values are either `/media/x.jpg` (repository) or a full URL (kerncms or S3 storage).
  Render with a plain `<img src={value}>` or allow the storage domains in `image.domains` when using
  `astro:assets`. Always render `alt` from a companion field (`imageAlt`).
- **`inline` fields** contain sanitized HTML (`<span class="mark-…">`, `<br>`): render with `set:html`
  and define every mark class from `marks:` in CSS (also for dark sections).
- **`richtext` fields** and Markdown bodies: render with `set:html` / `<Content />` inside a prose
  wrapper that styles `p h2 h3 ul ol li strong em a blockquote`.
- **Links** are objects (`{ type: "page", path }` or `{ type: "external", url, newTab }`), never plain
  strings. Use a small `href()` helper, add `target="_blank" rel="noopener"` when `newTab` is true.
- **Block ids** are stable per page (`b-` + 5 chars). Use `block.id` for anchors and keys, never the index.
- **Preview command** in the config must accept `{port}` and `{host}`:
  `pnpm exec astro dev --port {port} --host {host} --ignore-lock`.
- **Static output** works best. Anything "upcoming" (events) is computed at build time; the CMS
  rebuilds on every publish.
- **Redirects** live in a JSON file edited in the CMS; `astro.config.mjs` reads it and sets `redirects`.
- Never commit `node_modules`; keep `node_modules/` and `.kern-data/` in `.gitignore`.
- Use the customer's language for all labels in `kern.config.yaml` and in the site.

## Checklist before handing over

- [ ] `kern.config.yaml` parses; every block, collection, global and form has German labels.
- [ ] Every block type in the config has a component and a zod schema; `Blocks.astro` covers all types.
- [ ] Every block root has `data-kern-block` and `data-kern-type`.
- [ ] Every rendered field has `data-kern-field` with the right path (lists: `items.0.title`).
- [ ] Globals in header/footer have `data-kern-global="<key>#<field>"`.
- [ ] Overlay script loads only when `KERN_PREVIEW` is set; analytics only when it is not.
- [ ] Forms post JSON to the kerncms endpoint, include an empty `_gotcha` honeypot, show field errors
      from `{ ok: false, errors }` and a success state.
- [ ] Images work with both `/media/…` paths and full URLs.
- [ ] Mark classes from `marks:` exist in CSS.
- [ ] Seed content exists for all pages, entries and globals; `pnpm build` passes.
- [ ] `.env.example` lists `PUBLIC_KERN_URL` and `PUBLIC_KERN_SITE`; README explains connecting the
      site in kerncms (Admin → Websites → Website verbinden) and where the public key comes from
      (Einstellungen → Einbindung).
