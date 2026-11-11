"use client";

import { useState } from "react";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { MarkDef } from "@/lib/kern-types";
import { cn } from "@/lib/utils";
import { cleanMarkHtml, createMarkExtensions } from "./marks";

/** Single line of text where selected words can get one of the site's highlight styles. */
const SingleLine = Document.extend({ content: "paragraph" });

function stripParagraph(html: string) {
  return cleanMarkHtml(html.replace(/^<p>/, "").replace(/<\/p>$/, ""));
}

export function InlineEditor({
  id,
  defaultValue,
  onValueChange,
  marks,
  invalid,
  label,
}: {
  id?: string;
  defaultValue: string;
  onValueChange: (html: string) => void;
  marks: MarkDef[];
  invalid?: boolean;
  label: string;
}) {
  const [extensions] = useState(() => createMarkExtensions(marks));
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [SingleLine, Paragraph, Text, HardBreak, UndoRedo, ...extensions],
    content: `<p>${defaultValue ?? ""}</p>`,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        "aria-label": label,
        class: "min-h-11 px-3.5 py-2.5 text-[15px] leading-relaxed outline-none",
      },
    },
    onUpdate: ({ editor }) => onValueChange(stripParagraph(editor.getHTML())),
  });
  const active = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? marks.filter((m) => editor.isActive(`kern-${m.id}`)).map((m) => m.id) : []),
  });
  const hasSelection = useEditorState({ editor, selector: ({ editor }) => (editor ? !editor.state.selection.empty : false) });

  return (
    <div
      className={cn(
        "rounded-xl border bg-surface transition-colors focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15",
        invalid ? "border-danger" : "border-border-strong",
      )}
    >
      {editor ? <EditorContent editor={editor} /> : <div className="min-h-11" />}
      {marks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-2 py-1.5">
          <span className="px-1 text-xs text-muted">{hasSelection ? "Markierung:" : "Wörter markieren, dann:"}</span>
          {marks.map((mark, index) => {
            const isActive = active?.includes(mark.id);
            return (
              <button
                key={mark.id}
                type="button"
                aria-pressed={isActive}
                disabled={!editor}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor?.chain().focus().toggleMark(`kern-${mark.id}`).run()}
                className={cn(
                  "h-7 rounded-md px-2 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  isActive ? "bg-accent text-white" : "bg-subtle text-foreground hover:bg-border",
                )}
              >
                <span data-kern-mark={isActive ? undefined : String(index % 4)}>{mark.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
