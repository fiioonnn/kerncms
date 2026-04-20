# Richtext Editor: Tailwind Class Support + HTML Mode

**Date:** 2026-04-20
**Status:** Approved

## Summary

Enhance the existing TipTap rich text editor to support applying Tailwind CSS classes to text selections via a bubble menu, and add an HTML source code toggle for direct HTML editing. Storage switches from Markdown to HTML (escaped in JSON).

## Decisions

- **Bubble menu style:** Hybrid — color dots with shade expander (100-900), size/weight dropdowns, free-text class input (Option C)
- **HTML mode:** Fullscreen toggle — switches between WYSIWYG and code editor, no split view (Option A)
- **Storage:** HTML as JSON string value — `JSON.stringify()` handles escaping automatically
- **Migration:** Existing Markdown content converted to HTML on first load via existing `markdownToHtml()`, then saved as HTML going forward

## Architecture

### Custom TipTap Mark Extension: `TailwindClass`

A custom Mark that stores an arbitrary `class` attribute on `<span>` elements.

```typescript
// Renders as: <span class="text-blue-500 font-bold">text</span>
// Schema: { attrs: { class: { default: null } } }
// ParseHTML: span[class] -> extract class attribute
// RenderHTML: span with class attribute
```

- Multiple classes stored as space-separated string
- Toggling a class on already-classed text merges/replaces intelligently
- Removing all classes removes the mark entirely

### Bubble Menu Component

Appears on text selection. Structure:

```
[ 🔴 🔵 🟢 🟡 🟣 | sm ▾ | bold ▾ | + class ]
  └─ shade panel (100-900) expands on dot click
```

**Color dots:** red, blue, green, yellow, purple, orange, pink, slate
**Shade panel:** On color click, shows shades 100-900 as small squares. Applies `text-{color}-{shade}`.
**Size dropdown:** text-xs, text-sm, text-base, text-lg, text-xl, text-2xl
**Weight dropdown:** font-light, font-normal, font-medium, font-semibold, font-bold
**Free-text input:** Type any Tailwind class(es), press Enter to apply

Active classes are visually indicated (border/highlight on active dot/option).

### HTML Source Toggle

A `</>` button in the main toolbar toggles between modes:

- **WYSIWYG mode (default):** Normal TipTap editor with bubble menu
- **HTML mode:** `<textarea>` showing raw HTML with syntax-like monospace font. On toggle back to WYSIWYG, the textarea content is parsed into TipTap.

The toggle is bidirectional — edits in HTML mode reflect in WYSIWYG and vice versa.

### Storage Migration

1. Remove `markdownToHtml()` and `htmlToMarkdown()` converters
2. `onChange` now emits `editor.getHTML()` directly
3. `content` prop receives HTML directly
4. Backward compat: if content looks like Markdown (no HTML tags), run one-time conversion via existing converter before feeding to editor

## File Changes

| File | Change |
|------|--------|
| `src/components/kern/fields/RichtextField.tsx` | Major rewrite: remove MD converters, add HTML toggle, integrate bubble menu, add TailwindClass mark |

Single file change — all logic stays in `RichtextField.tsx` to keep it self-contained. The TailwindClass extension and bubble menu are defined inline (not separate files) since they're only used here.

## Tailwind Rendering

Tailwind classes in the editor content work because the editor lives inside the Next.js app which already has Tailwind configured. The `prose` wrapper may override some Tailwind utilities — use `[&_.tiptap]:all-unset` or scope the content area to avoid conflicts. The `prose` class should remain for base typography but allow Tailwind overrides via specificity.

## Edge Cases

- **Empty class removal:** If user removes all classes from a span, remove the mark entirely (no empty `class=""`)
- **Class conflicts:** Applying `text-red-500` when `text-blue-500` exists should replace (same prefix group). Applying `font-bold` alongside `text-red-500` should add (different group).
- **HTML mode validation:** Invalid HTML in the textarea should show a warning but not crash — TipTap's parser is lenient
- **Paste handling:** Pasted HTML with class attributes should be preserved by the TailwindClass mark's parseHTML rules
