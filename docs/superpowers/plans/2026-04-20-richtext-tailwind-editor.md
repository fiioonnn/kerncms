# Richtext Tailwind Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Tailwind class support via bubble menu and HTML source toggle to the TipTap rich text editor.

**Architecture:** Custom TailwindClass Mark extension stores classes on `<span>` elements. BubbleMenu from `@tiptap/react/menus` provides the selection popup. HTML toggle swaps between EditorContent and a textarea. Storage switches from Markdown to raw HTML.

**Tech Stack:** TipTap v3.22.3, `@tiptap/react/menus` (BubbleMenu), `@tiptap/core` (Mark), React, Tailwind CSS v4

---

### Task 1: Switch storage from Markdown to HTML + backward compat

**Files:**
- Modify: `src/components/kern/fields/RichtextField.tsx`

- [ ] **Step 1: Replace storage logic**

Keep `markdownToHtml` for backward compat detection but remove `htmlToMarkdown`. Change `onUpdate` to emit raw HTML and `content` to receive HTML directly.

```tsx
function looksLikeMarkdown(str: string): boolean {
  if (!str) return false;
  return /^#{1,3}\s|^\*\*|\*[^*]|\[.+\]\(.+\)|^- /m.test(str) && !/<[a-z][\s\S]*>/i.test(str);
}
```

In the component, replace:
```tsx
content: markdownToHtml(value ?? ""),
```
with:
```tsx
content: looksLikeMarkdown(value ?? "") ? markdownToHtml(value ?? "") : (value ?? ""),
```

Replace `onUpdate`:
```tsx
onUpdate: ({ editor }) => {
  onChange(editor.getHTML());
},
```

- [ ] **Step 2: Remove `htmlToMarkdown` function**

Delete the entire `htmlToMarkdown` function (lines 53-71).

- [ ] **Step 3: Verify editor loads and emits HTML**

Run dev server (`npm run dev`), open content editor, type text, confirm the onChange value is HTML not Markdown.

- [ ] **Step 4: Commit**

```bash
git add src/components/kern/fields/RichtextField.tsx
git commit -m "kerncms: switch richtext storage from markdown to html"
```

---

### Task 2: Add TailwindClass Mark extension

**Files:**
- Modify: `src/components/kern/fields/RichtextField.tsx`

- [ ] **Step 1: Add the Mark import and define extension**

Add at top of file:
```tsx
import { Mark, mergeAttributes } from "@tiptap/core";
```

Define the extension above the component:
```tsx
const TailwindClass = Mark.create({
  name: "tailwindClass",

  addAttributes() {
    return {
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute("class"),
        renderHTML: (attributes) => {
          if (!attributes.class) return {};
          return { class: attributes.class };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[class]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});
```

- [ ] **Step 2: Register extension in the editor**

Add `TailwindClass` to the extensions array:
```tsx
extensions: [
  StarterKit.configure({
    heading: { levels: [2, 3] },
  }),
  Link.configure({ openOnClick: false }),
  TailwindClass,
],
```

- [ ] **Step 3: Add helper to apply/toggle classes**

Below the TailwindClass definition, add:
```tsx
function getClassPrefix(cls: string): string | null {
  const match = cls.match(/^(text|bg|font|tracking|leading|decoration|underline|italic)[-]?/);
  return match ? match[1] : null;
}

function applyTailwindClass(editor: ReturnType<typeof useEditor>, newClass: string) {
  if (!editor) return;
  const currentAttrs = editor.getAttributes("tailwindClass");
  const existing = (currentAttrs.class || "").split(/\s+/).filter(Boolean);
  const newPrefix = getClassPrefix(newClass);

  const filtered = newPrefix
    ? existing.filter((cls) => getClassPrefix(cls) !== newPrefix)
    : existing;

  const alreadyHas = existing.includes(newClass);
  if (alreadyHas) {
    const without = existing.filter((c) => c !== newClass);
    if (without.length === 0) {
      editor.chain().focus().unsetMark("tailwindClass").run();
    } else {
      editor.chain().focus().setMark("tailwindClass", { class: without.join(" ") }).run();
    }
  } else {
    filtered.push(newClass);
    editor.chain().focus().setMark("tailwindClass", { class: filtered.join(" ") }).run();
  }
}
```

- [ ] **Step 4: Verify class application**

Open browser, select text, run in console: the mark should render `<span class="...">` in the HTML output.

- [ ] **Step 5: Commit**

```bash
git add src/components/kern/fields/RichtextField.tsx
git commit -m "kerncms: add TailwindClass mark extension with class merge logic"
```

---

### Task 3: Add Bubble Menu with color dots + shade expander

**Files:**
- Modify: `src/components/kern/fields/RichtextField.tsx`

- [ ] **Step 1: Add BubbleMenu import**

```tsx
import { BubbleMenu } from "@tiptap/react/menus";
```

- [ ] **Step 2: Define color/shade constants**

Above the component:
```tsx
const COLORS = [
  { name: "red", hex: "#ef4444", shades: { 100: "#fee2e2", 200: "#fecaca", 300: "#fca5a5", 400: "#f87171", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c", 800: "#991b1b", 900: "#7f1d1d" } },
  { name: "blue", hex: "#3b82f6", shades: { 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd", 400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8", 800: "#1e40af", 900: "#1e3a8a" } },
  { name: "green", hex: "#22c55e", shades: { 100: "#dcfce7", 200: "#bbf7d0", 300: "#86efac", 400: "#4ade80", 500: "#22c55e", 600: "#16a34a", 700: "#15803d", 800: "#166534", 900: "#14532d" } },
  { name: "yellow", hex: "#eab308", shades: { 100: "#fef9c3", 200: "#fef08a", 300: "#fde047", 400: "#facc15", 500: "#eab308", 600: "#ca8a04", 700: "#a16207", 800: "#854d0e", 900: "#713f12" } },
  { name: "purple", hex: "#a855f7", shades: { 100: "#f3e8ff", 200: "#e9d5ff", 300: "#d8b4fe", 400: "#c084fc", 500: "#a855f7", 600: "#9333ea", 700: "#7e22ce", 800: "#6b21a8", 900: "#581c87" } },
  { name: "orange", hex: "#f97316", shades: { 100: "#ffedd5", 200: "#fed7aa", 300: "#fdba74", 400: "#fb923c", 500: "#f97316", 600: "#ea580c", 700: "#c2410c", 800: "#9a3412", 900: "#7c2d12" } },
  { name: "pink", hex: "#ec4899", shades: { 100: "#fce7f3", 200: "#fbcfe8", 300: "#f9a8d4", 400: "#f472b6", 500: "#ec4899", 600: "#db2777", 700: "#be185d", 800: "#9d174d", 900: "#831843" } },
  { name: "slate", hex: "#64748b", shades: { 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1", 400: "#94a3b8", 500: "#64748b", 600: "#475569", 700: "#334155", 800: "#1e293b", 900: "#0f172a" } },
] as const;

const SIZES = ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl"] as const;
const WEIGHTS = ["font-light", "font-normal", "font-medium", "font-semibold", "font-bold"] as const;
```

- [ ] **Step 3: Build the TailwindBubbleMenu component**

Inside `RichtextField.tsx`, add this component:

```tsx
function TailwindBubbleMenu({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
  const [expandedColor, setExpandedColor] = useState<string | null>(null);
  const [showSizes, setShowSizes] = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const [customClass, setCustomClass] = useState("");

  const currentClasses = (editor.getAttributes("tailwindClass").class || "").split(/\s+/).filter(Boolean);

  const activeColor = COLORS.find((c) =>
    currentClasses.some((cls) => cls.startsWith(`text-${c.name}-`))
  );
  const activeSize = SIZES.find((s) => currentClasses.includes(s));
  const activeWeight = WEIGHTS.find((w) => currentClasses.includes(w));

  return (
    <BubbleMenu editor={editor} className="flex items-center gap-1 rounded-lg border border-input bg-popover p-1.5 shadow-lg">
      {/* Color dots */}
      <div className="flex items-center gap-1">
        {COLORS.map((color) => (
          <button
            key={color.name}
            type="button"
            onClick={() => setExpandedColor(expandedColor === color.name ? null : color.name)}
            className={`w-4 h-4 rounded-full transition-all ${
              activeColor?.name === color.name ? "ring-2 ring-white ring-offset-1 ring-offset-popover" : "hover:scale-110"
            }`}
            style={{ backgroundColor: color.hex }}
          />
        ))}
      </div>

      <div className="w-px h-4 bg-input" />

      {/* Size dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setShowSizes(!showSizes); setShowWeights(false); }}
          className="text-[10px] text-muted-foreground bg-muted/50 hover:bg-muted px-1.5 py-0.5 rounded"
        >
          {activeSize?.replace("text-", "") || "Aa"} ▾
        </button>
        {showSizes && (
          <div className="absolute top-full left-0 mt-1 bg-popover border border-input rounded-md shadow-lg p-1 z-50">
            {SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => { applyTailwindClass(editor, size); setShowSizes(false); }}
                className={`block w-full text-left text-[10px] px-2 py-1 rounded ${
                  activeSize === size ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {size.replace("text-", "")}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Weight dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setShowWeights(!showWeights); setShowSizes(false); }}
          className="text-[10px] text-muted-foreground bg-muted/50 hover:bg-muted px-1.5 py-0.5 rounded"
        >
          {activeWeight?.replace("font-", "") || "B"} ▾
        </button>
        {showWeights && (
          <div className="absolute top-full left-0 mt-1 bg-popover border border-input rounded-md shadow-lg p-1 z-50">
            {WEIGHTS.map((weight) => (
              <button
                key={weight}
                type="button"
                onClick={() => { applyTailwindClass(editor, weight); setShowWeights(false); }}
                className={`block w-full text-left text-[10px] px-2 py-1 rounded whitespace-nowrap ${
                  activeWeight === weight ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {weight.replace("font-", "")}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-input" />

      {/* Free-text class input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (customClass.trim()) {
            customClass.trim().split(/\s+/).forEach((cls) => applyTailwindClass(editor, cls));
            setCustomClass("");
          }
        }}
        className="flex items-center"
      >
        <input
          type="text"
          value={customClass}
          onChange={(e) => setCustomClass(e.target.value)}
          placeholder="+ class"
          className="text-[10px] bg-muted/50 text-foreground placeholder:text-muted-foreground px-1.5 py-0.5 rounded w-16 focus:w-28 transition-all outline-none focus:ring-1 focus:ring-ring"
        />
      </form>

      {/* Shade expander panel */}
      {expandedColor && (
        <div className="absolute top-full left-0 mt-1 flex items-center gap-1 bg-popover border border-input rounded-md p-1.5 shadow-lg">
          {Object.entries(
            COLORS.find((c) => c.name === expandedColor)!.shades
          ).map(([shade, hex]) => (
            <button
              key={shade}
              type="button"
              onClick={() => {
                applyTailwindClass(editor, `text-${expandedColor}-${shade}`);
                setExpandedColor(null);
              }}
              className={`w-5 h-5 rounded transition-all ${
                currentClasses.includes(`text-${expandedColor}-${shade}`) ? "ring-2 ring-white ring-offset-1 ring-offset-popover" : "hover:scale-110"
              }`}
              style={{ backgroundColor: hex }}
              title={`text-${expandedColor}-${shade}`}
            />
          ))}
        </div>
      )}
    </BubbleMenu>
  );
}
```

- [ ] **Step 4: Add useState import**

Update the React import:
```tsx
import { useEffect, useState } from "react";
```

- [ ] **Step 5: Integrate into the editor render**

Inside the `RichtextField` return, after the toolbar `<div>` and before `<EditorContent>`, add:

```tsx
{!disabled && <TailwindBubbleMenu editor={editor} />}
```

- [ ] **Step 6: Test bubble menu**

Run dev server. Select text in the editor, verify the bubble menu appears with color dots, dropdowns, and free-text input. Click a color dot, verify shade panel expands. Pick a shade, verify class is applied and visible in editor output.

- [ ] **Step 7: Commit**

```bash
git add src/components/kern/fields/RichtextField.tsx
git commit -m "kerncms: add tailwind bubble menu with colors, sizes, weights, free-text"
```

---

### Task 4: Add HTML source code toggle

**Files:**
- Modify: `src/components/kern/fields/RichtextField.tsx`

- [ ] **Step 1: Add HTML mode state and toggle button**

Inside `RichtextField`, add state:
```tsx
const [htmlMode, setHtmlMode] = useState(false);
const [htmlSource, setHtmlSource] = useState("");
```

Add toggle handler:
```tsx
function toggleHtmlMode() {
  if (!editor) return;
  if (htmlMode) {
    editor.commands.setContent(htmlSource);
    onChange(editor.getHTML());
  } else {
    setHtmlSource(editor.getHTML());
  }
  setHtmlMode(!htmlMode);
}
```

- [ ] **Step 2: Add `</>` toggle button in toolbar**

After the link `ToolbarButton` in the toolbar, add a spacer and the toggle:

```tsx
<div className="w-px h-4 bg-input mx-0.5" />
<ToolbarButton active={htmlMode} onClick={toggleHtmlMode} disabled={disabled}>
  <span className="text-[10px] font-mono">&lt;/&gt;</span>
</ToolbarButton>
```

- [ ] **Step 3: Conditionally render textarea or EditorContent**

Replace the `<EditorContent ... />` block with:

```tsx
{htmlMode ? (
  <textarea
    value={htmlSource}
    onChange={(e) => setHtmlSource(e.target.value)}
    className="w-full min-h-[120px] px-3 py-2 font-mono text-xs text-cyan-300 bg-[#1a1a2e] outline-none resize-y"
    spellCheck={false}
  />
) : (
  <EditorContent
    editor={editor}
    className="prose prose-sm dark:prose-invert max-w-none px-3 py-2 min-h-[120px] focus-within:outline-none [&_.tiptap]:outline-none [&_.tiptap]:min-h-[100px]"
  />
)}
```

- [ ] **Step 4: Test HTML toggle**

Run dev server. Type text, apply some Tailwind classes. Toggle to HTML mode — verify the raw HTML shows with `<span class="...">` tags. Edit the HTML. Toggle back — verify changes appear in WYSIWYG.

- [ ] **Step 5: Commit**

```bash
git add src/components/kern/fields/RichtextField.tsx
git commit -m "kerncms: add html source code toggle to richtext editor"
```

---

### Task 5: Handle prose/Tailwind specificity + polish

**Files:**
- Modify: `src/components/kern/fields/RichtextField.tsx`

- [ ] **Step 1: Fix Tailwind class rendering in prose context**

The `prose` class overrides inline styles. Add `not-prose` wrapper around TipTap content so Tailwind utilities on spans take effect, but keep base typography via the outer prose wrapper:

Change EditorContent className to:
```tsx
className="prose prose-sm dark:prose-invert max-w-none px-3 py-2 min-h-[120px] focus-within:outline-none [&_.tiptap]:outline-none [&_.tiptap]:min-h-[100px] [&_span[class]]:!text-[inherit] [&_.tiptap_span]:all-[unset]"
```

Actually, simpler approach — scope the spans to override prose with important:
The TailwindClass renderHTML should add `style` as a fallback for colors that prose would override. But since we're inside the CMS app with Tailwind running, the utility classes should work. Test and adjust specificity only if needed.

Keep the existing className and add one override:
```tsx
className="prose prose-sm dark:prose-invert max-w-none px-3 py-2 min-h-[120px] focus-within:outline-none [&_.tiptap]:outline-none [&_.tiptap]:min-h-[100px] [&_.tiptap_span[class]]:text-inherit"
```

- [ ] **Step 2: Clean up — remove dead `markdownToHtml` if no Markdown content exists**

Keep `markdownToHtml` and `looksLikeMarkdown` for backward compat. Remove only `htmlToMarkdown`.

- [ ] **Step 3: Final end-to-end test**

1. Open editor, type text
2. Select text, use bubble menu to apply `text-red-500`
3. Verify red text in WYSIWYG
4. Toggle to HTML mode, verify `<span class="text-red-500">`
5. Edit HTML to add `font-bold` to class
6. Toggle back, verify bold red text
7. Save, reload, verify HTML persists

- [ ] **Step 4: Commit**

```bash
git add src/components/kern/fields/RichtextField.tsx
git commit -m "kerncms: polish tailwind richtext editor specificity and cleanup"
```
