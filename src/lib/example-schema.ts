/*
 * Example kern.config.yaml of the connected repository and what the CMS
 * detected from it. Later this is read from the repo via the GitHub App.
 */

export const kernConfigPath = "kern.config.yaml";

export const kernConfig = `# kerncms Konfiguration für baeckerei-mueller/website
version: 1
framework: astro
contentDir: src/content
media:
  dir: public/images
  maxSize: 20MB

collections:
  pages:
    label: Seiten
    path: src/content/pages
    format: mdx
    fields:
      title: { type: text, required: true }
      slug: { type: slug, from: title }
      description: { type: textarea }
      ogImage: { type: image }
      blocks: { type: blocks }

  posts:
    label: Beiträge
    path: src/content/posts
    format: md
    fields:
      title: { type: text, required: true }
      date: { type: date, required: true }
      teaser: { type: textarea }
      cover: { type: image }
      tags: { type: list, of: text }
      body: { type: richtext }

  products:
    label: Sortiment
    path: src/content/products
    format: json
    fields:
      name: { type: text, required: true }
      price: { type: number }
      category: { type: select, options: [Brot, Brötchen, Kuchen] }
      image: { type: image }

globals:
  navigation:
    label: Navigation
    path: src/data/navigation.json
    fields:
      items: { type: list, of: link }

  opening-hours:
    label: Öffnungszeiten
    path: src/data/opening-hours.json
    fields:
      weekdays: { type: text }
      saturday: { type: text }
      sunday: { type: text }
      holidays: { type: text }

  contact:
    label: Kontakt
    path: src/data/contact.json
    fields:
      phone: { type: text }
      email: { type: email }
      address: { type: textarea }
`;

export type SchemaEntry = { key: string; label: string; path: string; fields: number };

export const detectedCollections: SchemaEntry[] = [
  { key: "pages", label: "Seiten", path: "src/content/pages", fields: 5 },
  { key: "posts", label: "Beiträge", path: "src/content/posts", fields: 6 },
  { key: "products", label: "Sortiment", path: "src/content/products", fields: 4 },
];

export const detectedGlobals: SchemaEntry[] = [
  { key: "navigation", label: "Navigation", path: "src/data/navigation.json", fields: 1 },
  { key: "opening-hours", label: "Öffnungszeiten", path: "src/data/opening-hours.json", fields: 4 },
  { key: "contact", label: "Kontakt", path: "src/data/contact.json", fields: 3 },
];
