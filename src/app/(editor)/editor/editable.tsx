"use client";

import { cn } from "@/lib/utils";

type EditableTag = "h1" | "h2" | "p" | "blockquote" | "span";

const editableStyles =
  "cursor-text rounded-md outline-offset-4 hover:outline-1 hover:outline-dashed hover:outline-current/30 focus:outline-2 focus:outline-solid focus:outline-accent/60";

/**
 * Text that becomes contentEditable while its block is selected. The DOM is
 * left to the browser while typing (only `onDirty` fires); the text is read
 * back on blur via `onCommit`. Callers key this by its content, so React
 * remounts it with fresh markup whenever the value changes from elsewhere.
 */
export function Editable({
  tag = "p",
  editable,
  onDirty,
  onCommit,
  className,
  editRef,
  children,
}: {
  tag?: EditableTag;
  editable: boolean;
  onDirty: () => void;
  onCommit: (element: HTMLElement) => void;
  className?: string;
  editRef?: React.Ref<HTMLElement>;
  children: React.ReactNode;
}) {
  const Tag = tag as React.ElementType;
  if (!editable) return <Tag className={className}>{children}</Tag>;
  return (
    <Tag
      ref={editRef}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onInput={onDirty}
      onBlur={(e: React.FocusEvent<HTMLElement>) => onCommit(e.currentTarget)}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onPaste={(e: React.ClipboardEvent<HTMLElement>) => {
        // Paste as plain text so no foreign markup ends up in the block.
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain").replace(/\s*\n\s*/g, " ");
        document.execCommand("insertText", false, text);
      }}
      className={cn(editableStyles, className)}
    >
      {children}
    </Tag>
  );
}

/** Reads a contentEditable element's text, collapsing whitespace. */
export function readText(element: HTMLElement) {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Reads a headline whose highlighted part is wrapped in `[data-mark]`. */
export function readHeadline(element: HTMLElement, fallbackHighlight: string) {
  const headline = readText(element);
  const marked = element.querySelector("[data-mark]");
  const highlight = marked ? readText(marked as HTMLElement) : "";
  return { headline, highlight: highlight || (headline.includes(fallbackHighlight) ? fallbackHighlight : "") };
}
