"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** Read-only, dark code view with line numbers and a copy button. */
export function CodeBlock({
  code,
  filename,
  className,
}: {
  code: string;
  filename?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const lines = code.replace(/\n$/, "").split("\n");

  return (
    <div className={cn("overflow-hidden rounded-xl bg-code text-white", className)}>
      <div className="flex h-11 items-center justify-between gap-3 border-b border-white/10 pr-1.5 pl-4">
        <span className="truncate font-mono text-sm text-white/70">{filename}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code);
            setCopied(true);
            toast.success("In die Zwischenablage kopiert");
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check className="size-4" strokeWidth={1.75} /> : <Copy className="size-4" strokeWidth={1.75} />}
          {copied ? "Kopiert" : "Kopieren"}
        </button>
      </div>
      <div className="max-h-[560px] overflow-auto py-3">
        <pre className="font-mono text-[13px] leading-6">
          {lines.map((line, i) => (
            <div key={i} className="flex hover:bg-white/5">
              <span className="w-12 shrink-0 pr-4 text-right text-white/30 select-none">{i + 1}</span>
              <code className={cn("pr-6 whitespace-pre", line.trimStart().startsWith("#") && "text-white/45")}>
                {line || " "}
              </code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
