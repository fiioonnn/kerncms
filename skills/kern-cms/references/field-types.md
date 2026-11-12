# kern field types

Declared per field in `src/kern/types.json` under `content.<page>.<section>` or `globals.<name>`.

| Type in types.json | JSON value | Render it as | Editor shows |
|---|---|---|---|
| `"text"` | `"See our menu"` | `{s.label}` | single-line input |
| `"textarea"` | `"Line one.\nLine two."` | `{s.body}` with `white-space: pre-line`, or split into `<p>`s | multi-line input |
| `"richtext"` | `"<p>We started in a <strong>tiny</strong> kitchen.</p>"` | `<div set:html={s.body} />` (React: `dangerouslySetInnerHTML`) | rich text editor |
| `"number"` | `4.5` | `{s.price}` or `{s.price.toFixed(2)}` | number input |
| `"boolean"` | `true` | conditionally render: `{s.show_badge && <span>…</span>}` | switch |
| `"image"` | `"/kern/media/loaf.jpg"` | `<img src={s.image} alt={s.image_alt}>` | image picker |
| `"date"` | `"2026-04-15"` | `{formatDate(s.date, 'long')}` | date picker |
| `{ "type": "date", "format": "…" }` | `"2026-04-15"` | as above | date picker |
| `{ "type": "select", "options": ["Open", "Closed"] }` | `"Open"` | `{s.status}` | dropdown |
| `["text"]` (list) | `["Wifi", "Parking"]` | `{s.tags.map((t) => <li>{t}</li>)}` | list of inputs |
| `[{ "title": "text", "body": "textarea" }]` (repeater) | `[{ "title": "…", "body": "…" }]` | `{s.items.map((item) => <Card item={item} />)}` | collapsible items |

## Conventions

- Alt text gets its own `text` field next to the image (`image` + `image_alt`).
- Links are `text` fields holding a path or URL (`cta_href: "/menu"`), rendered into `href`.
- A repeater's `types.json` entry is an array with one object describing each item.
- Globals use the same types: `{ "globals": { "contact": { "email": "text", "phone": "text" } } }`.
- Add new fields to both the JSON file (with a sensible default) and `types.json`.

## Complete example

```json
// src/kern/types.json
{
  "content": {
    "home": {
      "hero": {
        "title": "text",
        "subtitle": "textarea",
        "image": "image",
        "image_alt": "text",
        "status": { "type": "select", "options": ["Open now", "Closed today"] }
      },
      "features": {
        "heading": "text",
        "items": [{ "title": "text", "body": "textarea", "link": "text" }]
      }
    },
    "about": { "intro": { "title": "text", "body": "richtext" } }
  },
  "globals": {
    "navigation": { "brand": "text", "links": [{ "label": "text", "href": "text" }] }
  }
}
```

```json
// src/kern/content/home/features.json
{
  "$schema": "kern",
  "heading": "Why people love us",
  "items": [
    { "title": "Local flour", "body": "Milled twenty miles from the shop.", "link": "/about" },
    { "title": "Slow dough", "body": "Every loaf rests for 48 hours.", "link": "/menu#slow" }
  ]
}
```
