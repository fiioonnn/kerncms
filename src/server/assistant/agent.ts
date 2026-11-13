import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { AiProvider } from "@/db/schema";
import { readSkillFile } from "../skill";
import { runTool, toolLabel, TOOLS, type ToolContext } from "./tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool"; id: string; label: string }
  | { type: "tool_done"; id: string; ok: boolean; detail?: string }
  | { type: "done"; files: string[]; commit: string | null }
  | { type: "error"; message: string };

export type AgentRun = {
  provider: AiProvider;
  model: string;
  apiKey: string;
  history: ChatMessage[];
  context: string;
  tools: ToolContext;
  signal: AbortSignal;
  emit: (event: AgentEvent) => void;
};

const MAX_STEPS = 60;

let guide: Promise<string> | null = null;

/** The kerncms-astro skill (workflow, contract, patterns), loaded once. */
function skillText() {
  guide ??= Promise.all(
    ["SKILL.md", "references/contract.md", "references/patterns.md"].map(async (name) => `<file name="${name}">\n${(await readSkillFile(name))?.toString("utf8") ?? ""}\n</file>`),
  ).then((parts) => parts.join("\n\n"));
  return guide;
}

async function systemPrompt() {
  return `Du bist der KI-Assistent von kerncms, einem Git-basierten visuellen CMS für Astro-Websites. Du arbeitest im Editor direkt mit der Person zusammen, die die Website pflegt, und hast vollen Zugriff auf das Repository der Website: Inhalte (Seiten-JSON, Markdown-Einträge, Globals), kern.config.yaml, Astro-Komponenten, Styles und alles andere.

Wie du arbeitest:
- Du arbeitest im Entwurf (Branch kern/draft). Die Vorschau im Editor zeigt jede Änderung sofort. Am Ende deiner Antwort werden alle Dateien, die du geändert hast, automatisch im Entwurf gespeichert. Live geht nichts, bis jemand im Editor auf „Veröffentlichen“ klickt.
- Sieh dir zuerst die betroffenen Dateien an, bevor du etwas änderst. Nutze edit_file für gezielte Änderungen und write_file für neue Dateien.
- Für reine Textänderungen ändere nur die Inhaltsdateien (Seiten-JSON, Einträge, Globals), nicht die Komponenten.
- Für strukturelle Änderungen (neue Blöcke, Felder, Globals, Sammlungen; etwa einen fest eingebauten Text in ein Global verschieben) halte dich genau an den Skill unten: kern.config.yaml, src/content.config.ts, Inhaltsdateien, Komponenten und die Editor-Markierungen (data-kern-*) müssen zusammenpassen. Prüfe kern.config.yaml danach mit validate_config.
- Erhalte die vorhandene Formatierung von JSON-Dateien (Einrückung, Schlüsselreihenfolge).
- Neue oder geänderte Blöcke in Seiten-JSON müssen genau zum Schema der Website passen (src/content.config.ts und kern.config.yaml), sonst verwirft der Dev-Server die Seite und zeigt alte Inhalte. Prüfe nach Änderungen an Inhalten oder Komponenten mit check_preview, ob die Seite sie wirklich zeigt, und behebe gemeldete Fehler, bevor du fertig bist.
- Arbeite die Aufgabe vollständig ab, ohne zwischendurch nachzufragen, außer etwas ist wirklich unklar oder würde Inhalte unwiderruflich entfernen.
- Antworte auf Deutsch, kurz und ohne Fachjargon, wenn die Person keinen benutzt. Sage am Ende in ein bis drei Sätzen, was du geändert hast.

Der Skill für kerncms-Websites (verbindlich):

${await skillText()}`;
}

/* ---------- Anthropic ---------- */

/** Models that take the server-side refusal fallback. */
const FALLBACK_MODELS = /^claude-(fable-5-[12]|opus-5(-5)?|sonnet-5-5)$/;

async function runAnthropic(run: AgentRun) {
  const client = new Anthropic({ apiKey: run.apiKey });
  const tools: Anthropic.Beta.BetaTool[] = TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.schema,
    eager_input_streaming: true,
  }));
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: await systemPrompt(), cache_control: { type: "ephemeral" } },
    { type: "text", text: run.context },
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = run.history.map((m) => ({ role: m.role, content: m.content }));
  const fallback = FALLBACK_MODELS.test(run.model);

  for (let step = 0; step < MAX_STEPS; step++) {
    const stream = client.beta.messages.stream(
      {
        model: run.model,
        max_tokens: 64000,
        system,
        tools,
        messages,
        cache_control: { type: "ephemeral" },
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal: run.signal },
    );
    stream.on("text", (delta) => run.emit({ type: "text", text: delta }));
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      run.emit({ type: "text", text: "\n\nDiese Anfrage hat das Modell abgelehnt." });
      return;
    }
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (calls.length === 0) return;
    if (message.stop_reason === "max_tokens") throw new Error("Die Antwort war zu lang und wurde abgeschnitten. Bitte die Aufgabe in kleinere Schritte teilen.");

    messages.push({ role: "assistant", content: message.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const args = (call.input ?? {}) as Record<string, unknown>;
      run.emit({ type: "tool", id: call.id, label: toolLabel(call.name, args) });
      const result = await runTool(run.tools, call.name, args);
      run.emit({ type: "tool_done", id: call.id, ok: result.ok, detail: result.ok ? undefined : result.output });
      results.push({ type: "tool_result", tool_use_id: call.id, content: result.output, ...(result.ok ? {} : { is_error: true }) });
    }
    messages.push({ role: "user", content: results });
    run.emit({ type: "text", text: "\n\n" });
  }
  throw new Error("Der Assistent hat nach zu vielen Schritten abgebrochen.");
}

/* ---------- OpenAI ---------- */

async function runOpenAI(run: AgentRun) {
  const client = new OpenAI({ apiKey: run.apiKey });
  const tools: OpenAI.Responses.FunctionTool[] = TOOLS.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: t.schema,
    strict: false,
  }));
  const instructions = `${await systemPrompt()}\n\n${run.context}`;
  const input: OpenAI.Responses.ResponseInputItem[] = run.history.map((m) => ({ role: m.role, content: m.content }));

  for (let step = 0; step < MAX_STEPS; step++) {
    const stream = await client.responses.create({ model: run.model, instructions, input, tools, stream: true }, { signal: run.signal });
    let response: OpenAI.Responses.Response | null = null;
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") run.emit({ type: "text", text: event.delta });
      else if (event.type === "response.completed" || event.type === "response.incomplete") response = event.response;
      else if (event.type === "response.failed") throw new Error(event.response.error?.message ?? "Die Anfrage ist fehlgeschlagen.");
      else if (event.type === "error") throw new Error(event.message);
    }
    if (!response) throw new Error("Keine Antwort vom Modell.");
    const calls = response.output.filter((item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call");
    if (calls.length === 0) return;
    if (response.status === "incomplete") throw new Error("Die Antwort war zu lang und wurde abgeschnitten. Bitte die Aufgabe in kleinere Schritte teilen.");

    input.push(...(response.output as OpenAI.Responses.ResponseInputItem[]));
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      let parsed = true;
      try {
        args = JSON.parse(call.arguments || "{}");
      } catch {
        parsed = false;
      }
      run.emit({ type: "tool", id: call.call_id, label: toolLabel(call.name, args) });
      const result = parsed ? await runTool(run.tools, call.name, args) : { ok: false, output: "Die Argumente waren kein gültiges JSON." };
      run.emit({ type: "tool_done", id: call.call_id, ok: result.ok, detail: result.ok ? undefined : result.output });
      input.push({ type: "function_call_output", call_id: call.call_id, output: result.output });
    }
    run.emit({ type: "text", text: "\n\n" });
  }
  throw new Error("Der Assistent hat nach zu vielen Schritten abgebrochen.");
}

export function runAgent(run: AgentRun) {
  return run.provider === "anthropic" ? runAnthropic(run) : runOpenAI(run);
}

/** Readable message for API errors; never leaks the key. */
export function agentErrorMessage(error: unknown) {
  if (error instanceof Anthropic.AuthenticationError || error instanceof OpenAI.AuthenticationError) return "Der API-Schlüssel wurde abgelehnt. Ein Admin muss ihn in den Einstellungen erneuern.";
  if (error instanceof Anthropic.RateLimitError || error instanceof OpenAI.RateLimitError) return "Zu viele Anfragen beim Anbieter. Bitte gleich noch einmal versuchen.";
  if (error instanceof Anthropic.NotFoundError || error instanceof OpenAI.NotFoundError) return "Das eingestellte Modell gibt es beim Anbieter nicht.";
  if (error instanceof Anthropic.APIConnectionError || error instanceof OpenAI.APIConnectionError) return "Der Anbieter ist gerade nicht erreichbar.";
  if (error instanceof Anthropic.APIError || error instanceof OpenAI.APIError) return `Fehler beim Anbieter: ${error.message}`;
  return (error as Error).message || "Etwas ist schiefgelaufen.";
}
