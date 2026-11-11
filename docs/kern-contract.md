# kerncms ↔ Astro: der Vertrag

Dieses Dokument beschreibt, was eine Astro-Website mitbringen muss, damit kerncms sie bearbeiten kann.
CMS und Website halten sich beide daran. Git ist die einzige Quelle der Wahrheit.

## 1. `kern.config.yaml` (Repo-Wurzel)

```yaml
version: 1
framework: astro
site:
  id: baeckerei-mueller          # stabiler Schlüssel, auch für Formulare und Statistik
  name: Bäckerei Müller
  url: https://baeckerei-mueller.de
branch: main                      # Live-Branch
preview:
  command: pnpm exec astro dev --port {port} --host {host} --ignore-lock   # {host}: 0.0.0.0 (Handy-Vorschau) oder 127.0.0.1
build:
  command: pnpm exec astro build
media:
  dir: public/media               # Uploads landen hier, URL = /media/<datei>
marks:                            # erlaubte Hervorhebungen in Feldern vom Typ "inline"
  - { id: accent, label: Akzent, class: mark-accent }
  - { id: marker, label: Marker, class: mark-marker }
  - { id: wavy,   label: Wellenlinie, class: mark-wavy }

pages:
  label: Seiten
  path: src/content/pages         # eine JSON-Datei pro Seite
  
blocks:                           # Bausteine, aus denen Seiten bestehen
  hero:
    label: Hero
    description: Große Überschrift mit Text und Button
    icon: layout-template         # lucide-Name
    fields:
      headline: { type: inline, label: Überschrift, required: true }
      text:     { type: textarea, label: Text }
      ...

collections:
  posts:
    label: Beiträge
    singular: Beitrag
    path: src/content/posts
    format: md                    # md: Frontmatter + Body; json: eine Datei pro Eintrag
    titleField: title
    listFields: [date, category]
    fields:
      title: { type: text, label: Titel, required: true }
      body:  { type: richtext, label: Inhalt }   # bei format md: der Markdown-Body (HTML erlaubt)
      ...

globals:
  site:
    label: Allgemein
    description: …
    path: src/content/globals/site.json
    fields: { … }

forms:
  kontakt:
    label: Kontaktformular
    fields:
      name:    { type: text, label: Name, required: true }
      email:   { type: email, label: E-Mail, required: true }
      message: { type: textarea, label: Nachricht, required: true }

redirects: src/content/globals/redirects.json
```

Felder sind immer ein Objekt `name → Definition`. Die Reihenfolge im YAML ist die Reihenfolge im Formular.

### Feldtypen

| type       | gespeichert als                     | Optionen |
|------------|-------------------------------------|----------|
| `text`     | string                              | `placeholder` nicht verwenden |
| `textarea` | string (Zeilenumbrüche `\n`)        | |
| `inline`   | string, HTML-Subset: nur `<span class="mark-…">`, `<br>` | nutzt `marks` |
| `richtext` | string, HTML (`p h2 h3 ul ol li strong em a blockquote`) | |
| `number`   | number                              | `suffix`, `min`, `max` |
| `boolean`  | boolean                             | |
| `select`   | string                              | `options: [{ label, value }]` |
| `date`     | string `YYYY-MM-DD`                 | |
| `image`    | string, Pfad relativ zur Website: `/media/x.jpg` | |
| `link`     | `{ "type": "page", "path": "/kontakt" }` oder `{ "type": "external", "url": "https://…", "newTab": true }` | |
| `tags`     | string[]                            | |
| `list`     | Array von Objekten                  | `fields: {…}`, `itemLabel: <feldname>` |
| `blocks`   | nur in Seiten (siehe unten)         | |

Jedes Feld kann `label`, `description`, `required` und `default` haben.

## 2. Seiten

`src/content/pages/<name>.json`. Der Dateiname ist frei; die URL steht in `path`.

```json
{
  "title": "Über uns",
  "path": "/ueber-uns",
  "seo": { "title": "", "description": "", "image": "", "noindex": false },
  "blocks": [
    { "id": "b-8f2k1", "type": "hero", "headline": "Drei <span class=\"mark-marker\">Generationen</span>", "text": "…" }
  ]
}
```

- `id` ist pro Seite eindeutig und stabil (das CMS vergibt `b-` + 5 Zeichen).
- Die Startseite hat `"path": "/"` und heißt `index.json`.
- Astro rendert alle Seiten über `src/pages/[...slug].astro` aus der Collection `pages`.

## 3. Markierungen für den visuellen Editor

Jede Block-Komponente setzt auf ihr Wurzelelement:

```html
<section data-kern-block="{block.id}" data-kern-type="{block.type}">
```

Jedes Element, das ein Feld direkt anzeigt, bekommt den Feldpfad relativ zum Block:

```html
<h1 data-kern-field="headline">…</h1>
<p data-kern-field="tiles.0.title">…</p>
<img data-kern-field="image" src="…">
```

Globals, die im Layout erscheinen, verwenden `data-kern-global="site#phone"` (Datei-Schlüssel # Feldpfad).

Die Markierungen sind immer im HTML (sie stören nicht). Das Overlay-Skript lädt nur in der Vorschau:

```astro
{import.meta.env.KERN_PREVIEW && <script is:inline src={`${import.meta.env.KERN_CMS_URL}/kern-overlay.js`}></script>}
```

Damit die Vorschau auch auf dem Handy (gleiches WLAN, per QR-Code) funktioniert, lauscht der Vorschau-Server auf allen Netzwerk-Schnittstellen.
Mit `KERN_PREVIEW_LAN=0` bleibt er auf `127.0.0.1`.

Das CMS startet den Vorschau-Server mit den Umgebungsvariablen `KERN_PREVIEW=1` und `KERN_CMS_URL`. In `astro.config.mjs` daher
`vite: { define: … }` nicht nötig; Astro liest Variablen ohne `PUBLIC_` serverseitig über `import.meta.env` bzw. `process.env`.

## 4. Inline-Hervorhebungen

`inline`-Felder enthalten bereinigtes HTML mit erlaubten Mark-Klassen. Astro gibt sie mit `set:html` aus.
Die Website definiert die CSS-Klassen aus `marks` selbst.

## 5. Formulare und Statistik

Die Website kennt das CMS über zwei öffentliche Variablen (`.env`):

```
PUBLIC_KERN_URL=http://localhost:3000
PUBLIC_KERN_SITE=baeckerei-mueller
```

- Formular: `POST {PUBLIC_KERN_URL}/api/public/{site}/forms/{form}` mit JSON oder `FormData`.
  Antwort `{ ok: true }` oder `{ ok: false, errors: { feld: "Meldung" } }`. CORS ist offen.
  Ein Honeypot-Feld `_gotcha` muss leer bleiben.
- Statistik (ohne Cookies, ohne IP-Speicherung):
  `POST {PUBLIC_KERN_URL}/api/public/{site}/collect` mit `{ "path": "/", "referrer": "…", "width": 1280 }`,
  gesendet per `navigator.sendBeacon` beim Laden jeder Seite. Nicht senden, wenn `KERN_PREVIEW` aktiv ist
  oder `navigator.doNotTrack === "1"`.

## 6. Weiterleitungen

`src/content/globals/redirects.json`: `[{ "from": "/alt", "to": "/neu", "status": 301 }]`.
`astro.config.mjs` liest die Datei und setzt `redirects`.

## 7. Git-Ablauf im CMS

- Das CMS arbeitet in einem eigenen Worktree auf dem Branch `kern/draft` (unter `.kern-data/` im CMS).
- Bearbeiten schreibt Dateien in den Worktree → Astro-Vorschau lädt neu.
- „Speichern" = Commit auf `kern/draft`.
- „Veröffentlichen" = Merge von `kern/draft` in `main`, danach Build.
- `node_modules` der Website wird in den Worktree verlinkt; vorher einmal `pnpm install` im Repo.
