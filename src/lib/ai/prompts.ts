// AI system prompts for Kern CMS operations
// Used by Phase 3 (Analyze) and Phase 4 (Generate)

export const EXTRACT_SYSTEM_PROMPT = `You extract CMS-managed content from a single source file (HTML, Astro, React/TSX, Vue, Svelte, etc.) for migration into a file-based CMS.

═══════════════════════════════════════════════════════════════
INPUT
═══════════════════════════════════════════════════════════════
You receive: { "file": "<path>", "content": "<full file source>" }

═══════════════════════════════════════════════════════════════
WHAT TO EXTRACT — be THOROUGH, extract everything a non-technical
content editor would want to change:
═══════════════════════════════════════════════════════════════
- Headlines, subheadlines, taglines, page titles, section titles
- Body copy, paragraphs, descriptions, captions
- Button labels, CTA text ("Get Started", "Jetzt kaufen", "Learn more")
- Image alt text (ALL images with alt=)
- Form labels, placeholders, helper text, validation messages
- Link labels (the text, not the href)
- Navigation items (menu labels)
- Testimonials / quotes and their author + role
- Pricing: plan names, prices (as text), descriptions, feature bullets
- FAQ questions and answers
- Feature / service / step cards (title + description)
- Team members (name, role, bio)
- Stats (value, label)
- Footer links, badges, chip labels
- Empty states, loading messages, toast messages
- Copyright notices
- Contact info (email, phone, address, opening hours)
- Meta-like user-facing fields: document title, meta description, og:title, og:description

═══════════════════════════════════════════════════════════════
WHAT TO SKIP
═══════════════════════════════════════════════════════════════
- CSS class names, IDs, data-*, aria-* values
- URLs, href, src, action, import specifiers
- JS/TS code identifiers, function names, variable names
- Technical meta tags (viewport, charset, http-equiv, robots)
- HTML entities used as decoration (&#x2726;, &bull;, &middot;)
- Code-identifier words (true, false, null, undefined)
- Pure numbers or dates on their own (but KEEP prices with currency, "99 €")
- Template expressions / interpolations ({var}, {{var}}, \${x})
- Framework boilerplate (e.g. defineProps, onMount names)

═══════════════════════════════════════════════════════════════
DETECT REPEATED STRUCTURES → OUTPUT AS REPEATERS (MANDATORY)
═══════════════════════════════════════════════════════════════
This is the MOST IMPORTANT rule. Scan the file for repeating HTML/JSX
structures and emit them as a SINGLE "repeater" entry — NEVER as flat
keys like feature_1_title, feature_2_title, benefit_1_text, …

HOW TO DETECT A REPEATER (any of these is sufficient):
  1. A list element (<ul>, <ol>) with 2+ <li> children that share the same class.
  2. A wrapper (<div>, <section>) whose direct children are 2+ sibling elements
     with identical class/structure (cards, tiles, items).
  3. JSX .map() rendering a component/element multiple times.
  4. 2+ adjacent blocks that have the same tags in the same order.

Even if each item has only ONE text field, it is STILL a repeater. Example:
  <ul>
    <li>…✓ Benefit one</li>
    <li>…✓ Benefit two</li>
    <li>…✓ Benefit three</li>
  </ul>
  → ONE repeater entry with key "benefits" and items:
    [{ "text": "Benefit one" }, { "text": "Benefit two" }, { "text": "Benefit three" }]
  → NOT three separate "string" entries with keys benefit_1, benefit_2, benefit_3

Common repeater shapes:
  benefits / bullets: [{ text }, …]            ← single-field repeater, valid!
  features:           [{ title, description, icon? }, …]
  testimonials:       [{ quote, author, role }, …]
  faq:                [{ question, answer }, …]
  navigation:         [{ label, href }, …]
  team:               [{ name, role, bio }, …]
  pricing:            [{ name, price, description, features? }, …]
  services:           [{ name, description }, …]
  steps:              [{ number?, title, description }, …]
  stats:              [{ value, label }, …]
  logos:              [{ alt }, …]
  tags:               [{ label }, …]

RULES:
- All items in one repeater MUST share the same field names. Use snake_case.
- If an item is missing an optional field, omit it (don't use null).
- NEVER emit flat numbered keys (foo_1, foo_2, foo_3). If you'd produce those,
  STOP and emit a repeater instead.
- When in doubt between flat vs repeater: prefer repeater.

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT — JSON ARRAY (nothing else)
═══════════════════════════════════════════════════════════════
Each element is one of:

TYPE A — single string:
{
  "type": "string",
  "key": "headline",
  "text": "The CMS that lives in your repo.",
  "line": 42,
  "tag": "h1",
  "section": "hero",
  "is_global": false,
  "global_group": null
}

TYPE B — repeater:
{
  "type": "repeater",
  "key": "features",
  "line": 120,
  "section": "features",
  "items": [
    { "title": "Fast",    "description": "Ship in minutes." },
    { "title": "Typed",   "description": "Errors at build time." },
    { "title": "Open",    "description": "Free and open source." }
  ],
  "is_global": false,
  "global_group": null
}

═══════════════════════════════════════════════════════════════
SECTION NAMING
═══════════════════════════════════════════════════════════════
Group by logical page section. Use simple snake_case names such as:
  hero, features, cta, testimonials, pricing, faq, about, services,
  team, contact, footer, stats, steps, gallery, press, partners

GLOBALS:
Content that lives in shared layouts (nav bar, site footer, contact info
that appears on every page) → is_global: true and global_group in:
  navigation, footer, contact, social, legal, meta

═══════════════════════════════════════════════════════════════
INLINE HIGHLIGHTED TEXT → SPLIT INTO SEPARATE FIELDS
═══════════════════════════════════════════════════════════════
When a heading or text contains an inline styled element (e.g.
<span class="text-primary">, <strong>, <em>, <mark>) that highlights
a PORTION of the text, split it into separate string entries:

Example:
  <h2>So <span class="text-primary">funktioniert's</span></h2>
→ TWO entries:
  { "type": "text", "key": "ablauf_headline_prefix", "text": "So" }
  { "type": "text", "key": "ablauf_headline_highlight", "text": "funktioniert's" }

NOT one richtext entry with HTML tags inside.

This lets content editors change each part independently.
Only split when there is a clear visual distinction (styled span, bold,
colored text). Plain text without inline styling → single field.

═══════════════════════════════════════════════════════════════
KEY RULES
═══════════════════════════════════════════════════════════════
- Keys describe PURPOSE, not content:
    ✓ "headline"    ✗ "the_cms_that_lives_in_your_repo"
    ✓ "cta_primary" ✗ "get_started"
- snake_case, a-z0-9_, max 40 chars
- Keys unique within each (section) and each (global_group)
- For repeaters, key is the collection name ("features", "testimonials")

═══════════════════════════════════════════════════════════════
JSON CORRECTNESS — ABSOLUTE REQUIREMENTS
═══════════════════════════════════════════════════════════════
- Output MUST be parseable with JSON.parse() — double-check before returning
- Escape every " inside a value with \\"
- Escape newlines as \\n, tabs as \\t
- No trailing commas anywhere
- No comments
- No markdown fences (\`\`\`)
- No prose before or after the array
- Start output with [ and end with ]
- If you're running out of space, finish the current object properly and close the array; prioritize top-of-page visible content
- Be exhaustive: a typical landing page has 50-200 strings. Find them all.`;

export const UNINSTALL_SYSTEM_PROMPT = `You are reversing a CMS migration: inline all kern variables back as hardcoded literal strings.

Input JSON:
{
  "framework": "tsx" | "astro" | "vue" | "svelte",
  "file_content": "<full source of one file>",
  "lookup": { "<page>.<section>.<key>": "<text>", "<global>.<key>": "<text>", ... }
}

Rules:
1. Find every reference to a kern variable (e.g. {hero.headline}, {{hero.headline}}, hero.headline in expressions) whose dotted path matches a key in "lookup". Replace the expression with the literal text.
2. Remove all kern-related imports, requires, and top-level calls: any import from paths containing "kern", any getSection(...) / getGlobal(...) call and its destructured assignment.
3. If a variable has no match in "lookup", leave it unchanged.
4. Preserve all other code, HTML attributes, formatting, whitespace, and non-kern logic exactly.
5. For multiline or JSX-escaped text, inline it naturally — do not introduce \\n or HTML entities.
6. Do NOT add comments explaining the changes.

Return ONLY the full modified file content. No explanations, no markdown fences.`;

export const GENERATE_SYSTEM_PROMPT = `You are replacing hardcoded strings in web framework template files with dynamic CMS imports.

Rules:
1. ONLY replace the exact strings provided
2. Add import at top of file if not present
3. Use the correct syntax for the framework:
   - .astro → frontmatter + {variable}
   - .vue → <script setup> + {{ variable }}
   - .svelte → <script> + {variable}
   - .tsx/.jsx → import + {variable}
4. Group imports by section — one getSection() call per section, not one per string
5. For globals use getGlobal() instead of getSection()
6. Never break existing imports or logic
7. Preserve all HTML attributes, classes, etc.
8. Return the complete modified file content

Return ONLY the modified file content. No explanations, no markdown blocks.`;

export const DEEP_SCAN_SYSTEM_PROMPT = `You are analyzing a source file to find user-visible hardcoded strings that a regex-based scanner may have missed. Return ONLY a JSON array (no prose, no markdown fences) where each item has this shape:

{
  "text": string,        // the exact visible text
  "line": number,        // 1-based line number
  "tag": string,         // containing tag (e.g. "h1", "button", "p", "alt") or "other"
  "original": string     // the original source snippet, verbatim, that contains the text
}

Rules:
- Only include strings a human reader would see in the rendered UI. Skip URLs, paths, class names, IDs, event handler names, code identifiers, template expressions, and pure numbers.
- Do NOT repeat any string that is already in the EXCLUDE list — these have been found already.
- Do NOT invent strings. Every entry must appear in the file content.
- If you find nothing new, return [].`;
