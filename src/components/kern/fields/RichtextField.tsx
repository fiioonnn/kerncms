"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Mark, mergeAttributes } from "@tiptap/core";
import { useEffect, useState } from "react";

interface FieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
}

function ToolbarButton({
  active,
  onClick,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-7 w-7 inline-flex items-center justify-center rounded transition-colors ${
        active ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      } disabled:opacity-30`}
    >
      {children}
    </button>
  );
}

function markdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(new RegExp("(<li>.*<\\/li>)", "s"), "<ul>$1</ul>")
    .replace(/\n\n/g, "<p></p>")
    .replace(/\n/g, "<br>");
}

function looksLikeMarkdown(str: string): boolean {
  if (!str) return false;
  return /^#{1,3}\s|^\*\*|\*[^*]|\[.+\]\(.+\)|^- /m.test(str) && !/<[a-z][\s\S]*>/i.test(str);
}

const TailwindClass = Mark.create({
  name: "tailwindClass",

  addAttributes() {
    return {
      class: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("class"),
        renderHTML: (attributes: Record<string, string>) => {
          if (!attributes.class) return {};
          return { class: attributes.class };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[class]" }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, string> }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});

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

type EditorInstance = NonNullable<ReturnType<typeof useEditor>>;

function getClassPrefix(cls: string): string | null {
  const match = cls.match(/^(text|bg|font|tracking|leading|decoration|underline)[-]?/);
  return match ? match[1] : null;
}

function applyTailwindClass(editor: EditorInstance, newClass: string) {
  const currentAttrs = editor.getAttributes("tailwindClass");
  const existing = (currentAttrs.class || "").split(/\s+/).filter(Boolean);
  const newPrefix = getClassPrefix(newClass);

  const alreadyHas = existing.includes(newClass);
  if (alreadyHas) {
    const without = existing.filter((c: string) => c !== newClass);
    if (without.length === 0) {
      editor.chain().focus().unsetMark("tailwindClass").run();
    } else {
      editor.chain().focus().setMark("tailwindClass", { class: without.join(" ") }).run();
    }
  } else {
    const filtered = newPrefix
      ? existing.filter((cls: string) => getClassPrefix(cls) !== newPrefix)
      : existing;
    filtered.push(newClass);
    editor.chain().focus().setMark("tailwindClass", { class: filtered.join(" ") }).run();
  }
}

function TailwindBubbleMenu({ editor }: { editor: EditorInstance }) {
  const [expandedColor, setExpandedColor] = useState<string | null>(null);
  const [showSizes, setShowSizes] = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const [customClass, setCustomClass] = useState("");

  const currentClasses = (editor.getAttributes("tailwindClass").class || "").split(/\s+/).filter(Boolean);

  const activeColor = COLORS.find((c) =>
    currentClasses.some((cls: string) => cls.startsWith(`text-${c.name}-`))
  );
  const activeSize = SIZES.find((s) => currentClasses.includes(s));
  const activeWeight = WEIGHTS.find((w) => currentClasses.includes(w));

  return (
    <BubbleMenu editor={editor} className="flex items-center gap-1 rounded-lg border border-input bg-popover p-1.5 shadow-lg relative">
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

      <div className="relative">
        <button
          type="button"
          onClick={() => { setShowSizes(!showSizes); setShowWeights(false); setExpandedColor(null); }}
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

      <div className="relative">
        <button
          type="button"
          onClick={() => { setShowWeights(!showWeights); setShowSizes(false); setExpandedColor(null); }}
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

      {expandedColor && (
        <div className="absolute top-full left-0 mt-1 flex items-center gap-1 bg-popover border border-input rounded-md p-1.5 shadow-lg z-50">
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

export function RichtextField({ value, onChange, label, disabled }: FieldProps) {
  const [htmlMode, setHtmlMode] = useState(false);
  const [htmlSource, setHtmlSource] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({ openOnClick: false }),
      TailwindClass,
    ],
    content: looksLikeMarkdown(value ?? "") ? markdownToHtml(value ?? "") : (value ?? ""),
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && disabled !== undefined) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  if (!editor) return null;

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

  function handleLink() {
    if (!editor) return;
    const url = window.prompt("URL:", editor.getAttributes("link").href ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <div className="rounded-lg border border-input overflow-hidden dark:bg-input/30">
        <div className="flex items-center gap-0.5 border-b border-input px-1.5 py-1">
          <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} disabled={disabled}>
            <span className="text-xs font-bold">B</span>
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} disabled={disabled}>
            <span className="text-xs italic">I</span>
          </ToolbarButton>
          <div className="w-px h-4 bg-input mx-0.5" />
          <ToolbarButton active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} disabled={disabled}>
            <span className="text-[10px] font-bold">H2</span>
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} disabled={disabled}>
            <span className="text-[10px] font-bold">H3</span>
          </ToolbarButton>
          <div className="w-px h-4 bg-input mx-0.5" />
          <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} disabled={disabled}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" x2="21" y1="6" y2="6" /><line x1="8" x2="21" y1="12" y2="12" /><line x1="8" x2="21" y1="18" y2="18" /><line x1="3" x2="3.01" y1="6" y2="6" /><line x1="3" x2="3.01" y1="12" y2="12" /><line x1="3" x2="3.01" y1="18" y2="18" /></svg>
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} disabled={disabled}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" x2="21" y1="6" y2="6" /><line x1="10" x2="21" y1="12" y2="12" /><line x1="10" x2="21" y1="18" y2="18" /><path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></svg>
          </ToolbarButton>
          <div className="w-px h-4 bg-input mx-0.5" />
          <ToolbarButton active={editor.isActive("link")} onClick={handleLink} disabled={disabled}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
          </ToolbarButton>
          <div className="w-px h-4 bg-input mx-0.5" />
          <ToolbarButton active={htmlMode} onClick={toggleHtmlMode} disabled={disabled}>
            <span className="text-[10px] font-mono">&lt;/&gt;</span>
          </ToolbarButton>
        </div>
        {!disabled && !htmlMode && <TailwindBubbleMenu editor={editor} />}
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
            className="prose prose-sm dark:prose-invert max-w-none px-3 py-2 min-h-[120px] focus-within:outline-none [&_.tiptap]:outline-none [&_.tiptap]:min-h-[100px] [&_.tiptap_span[class]]:text-inherit"
          />
        )}
      </div>
    </div>
  );
}
