"use client";

import { useMemo, useState } from "react";
import type { MarkDef } from "@/lib/kern-types";
import { cleanMarkHtml, createMarkExtensions } from "@/components/kern/marks";
import { EditorContent, Mark, mergeAttributes, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

/** Brand highlight: wraps text in <span class="text-accent">. */
const Accent = Mark.create({
  name: "accent",
  parseHTML() {
    return [{ tag: "span.text-accent" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "text-accent" }), 0];
  },
});

const prose = cn(
  "min-h-80 px-5 py-4 text-base leading-relaxed text-foreground outline-none",
  "[&_p]:my-3 [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight",
  "[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:tracking-tight",
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_li_p]:my-0",
  "[&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:text-muted [&_blockquote]:italic",
  "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold",
  "[&>*:first-child]:mt-0",
);

function ToolbarButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={cn("size-10", active && "bg-accent-soft text-accent hover:bg-accent-soft")}
      >
        <Icon strokeWidth={1.75} />
      </Button>
    </Tooltip>
  );
}

function Divider() {
  return <span className="mx-1 h-6 w-px self-center bg-border" />;
}

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  function apply() {
    const href = url.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!href) {
      chain.unsetLink().run();
    } else if (editor.state.selection.empty && !active) {
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] })
        .run();
    } else {
      chain.setLink({ href }).run();
    }
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setUrl((editor.getAttributes("link").href as string | undefined) ?? "");
        setOpen(next);
      }}
    >
      <Tooltip label="Link">
        <PopoverTrigger
          aria-label="Link"
          className={buttonStyles({
            variant: "ghost",
            size: "icon",
            className: cn("size-10", (active || open) && "bg-accent-soft text-accent hover:bg-accent-soft"),
          })}
        >
          <Link2 strokeWidth={1.75} />
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="start" className="w-80">
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="text-[15px] font-medium">Adresse</span>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
          </label>
          <p className="text-sm text-muted">Eine Webadresse oder ein Pfad deiner Website, z. B. /kontakt.</p>
          <div className="flex justify-end gap-2">
            {active && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  setOpen(false);
                }}
              >
                Entfernen
              </Button>
            )}
            <Button type="submit" size="sm">
              Übernehmen
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function RichTextEditor({
  label,
  defaultValue = "",
  onValueChange,
  marks,
  compact,
  className,
}: {
  label?: string;
  /** Initial content as HTML. */
  defaultValue?: string;
  onValueChange?: (html: string) => void;
  /** Highlight styles of the site (kern.config.yaml `marks`). Without them a single "Akzent" mark is offered. */
  marks?: MarkDef[];
  /** Smaller minimum height, e.g. in the editor sidebar. */
  compact?: boolean;
  className?: string;
}) {
  // Extensions are created once per editor instance.
  const [markExtensions] = useState(() => (marks?.length ? createMarkExtensions(marks) : [Accent]));
  const markButtons = useMemo(
    () => (marks?.length ? marks.map((m) => ({ name: `kern-${m.id}`, label: m.label })) : [{ name: "accent", label: "Akzentfarbe" }]),
    [marks],
  );
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: false, underline: false, code: false, codeBlock: false }),
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
      ...markExtensions,
    ],
    content: defaultValue,
    editorProps: {
      attributes: { class: cn(prose, compact && "min-h-40"), "aria-label": label ?? "Inhalt" },
    },
    onUpdate: ({ editor }) => onValueChange?.(cleanMarkHtml(editor.getHTML())),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            h2: editor.isActive("heading", { level: 2 }),
            h3: editor.isActive("heading", { level: 3 }),
            bold: editor.isActive("bold"),
            italic: editor.isActive("italic"),
            activeMarks: markButtons.filter((m) => editor.isActive(m.name)).map((m) => m.name),
            link: editor.isActive("link"),
            bulletList: editor.isActive("bulletList"),
            orderedList: editor.isActive("orderedList"),
            blockquote: editor.isActive("blockquote"),
            canUndo: editor.can().undo(),
            canRedo: editor.can().redo(),
          }
        : null,
  });

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && <span className="text-[15px] font-medium">{label}</span>}
      <div className="overflow-hidden rounded-xl border border-border-strong bg-surface transition-colors focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
        <div className="flex flex-wrap items-center gap-1 border-b border-border bg-subtle/60 p-2">
          {editor && state ? (
            <>
              <ToolbarButton
                icon={Heading2}
                label="Zwischenüberschrift"
                active={state.h2}
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              />
              <ToolbarButton
                icon={Heading3}
                label="Kleine Zwischenüberschrift"
                active={state.h3}
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              />
              <Divider />
              <ToolbarButton
                icon={Bold}
                label="Fett"
                active={state.bold}
                onClick={() => editor.chain().focus().toggleBold().run()}
              />
              <ToolbarButton
                icon={Italic}
                label="Kursiv"
                active={state.italic}
                onClick={() => editor.chain().focus().toggleItalic().run()}
              />
              {markButtons.map((mark) => (
                <ToolbarButton
                  key={mark.name}
                  icon={Highlighter}
                  label={mark.label}
                  active={state.activeMarks.includes(mark.name)}
                  onClick={() => editor.chain().focus().toggleMark(mark.name).run()}
                />
              ))}
              <LinkButton editor={editor} active={state.link} />
              <Divider />
              <ToolbarButton
                icon={List}
                label="Aufzählung"
                active={state.bulletList}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
              />
              <ToolbarButton
                icon={ListOrdered}
                label="Nummerierte Liste"
                active={state.orderedList}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
              />
              <ToolbarButton
                icon={Quote}
                label="Zitat"
                active={state.blockquote}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
              />
              <span className="flex-1" />
              <ToolbarButton
                icon={Undo2}
                label="Rückgängig"
                disabled={!state.canUndo}
                onClick={() => editor.chain().focus().undo().run()}
              />
              <ToolbarButton
                icon={Redo2}
                label="Wiederholen"
                disabled={!state.canRedo}
                onClick={() => editor.chain().focus().redo().run()}
              />
            </>
          ) : (
            <div className="h-10" />
          )}
        </div>
        {editor ? <EditorContent editor={editor} /> : <div className={compact ? "min-h-40" : "min-h-80"} />}
      </div>
    </div>
  );
}
