/* Chat model of the editor's AI assistant, shared by the API route (which stores chats) and the panel. */

/** Something the person points the assistant at, next to their message. */
export type Attachment =
  | { kind: "page"; page: string; label: string }
  | { kind: "block"; page: string; blockId: string; label: string }
  | { kind: "field"; page: string; blockId: string; field: string; label: string }
  | { kind: "global"; key: string; label: string };

export type Step = { id: string; label: string; status: "running" | "ok" | "error"; detail?: string };
export type Part = { kind: "text"; text: string } | { kind: "step"; step: Step };

export type UserTurn = { role: "user"; content: string; attachments?: Attachment[] };
export type AssistantTurn = { role: "assistant"; parts: Part[]; files: string[]; error: string | null; running: boolean };
export type Turn = UserTurn | AssistantTurn;

export type ChatSummary = { id: string; title: string; updatedAt: string };

export type ServerEvent =
  | { type: "chat"; id: string; title: string }
  | { type: "text"; text: string }
  | { type: "tool"; id: string; label: string }
  | { type: "tool_done"; id: string; ok: boolean; detail?: string }
  | { type: "done"; files: string[]; commit: string | null }
  | { type: "error"; message: string };

export const attachmentKey = (a: Attachment) =>
  a.kind === "global" ? `global:${a.key}` : a.kind === "page" ? `page:${a.page}` : a.kind === "block" ? `block:${a.page}:${a.blockId}` : `field:${a.page}:${a.blockId}:${a.field}`;

export function isAttachment(value: unknown): value is Attachment {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  const s = (k: string) => typeof a[k] === "string" && (a[k] as string).length > 0 && (a[k] as string).length < 300;
  if (!s("label")) return false;
  switch (a.kind) {
    case "page":
      return s("page");
    case "block":
      return s("page") && s("blockId");
    case "field":
      return s("page") && s("blockId") && s("field");
    case "global":
      return s("key");
    default:
      return false;
  }
}

export function textOf(turn: Turn) {
  if (turn.role === "user") return turn.content;
  return turn.parts
    .filter((p): p is Extract<Part, { kind: "text" }> => p.kind === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}

export function emptyAssistantTurn(): AssistantTurn {
  return { role: "assistant", parts: [], files: [], error: null, running: true };
}

export function applyEvent(turn: AssistantTurn, event: ServerEvent): AssistantTurn {
  switch (event.type) {
    case "text": {
      const last = turn.parts.at(-1);
      if (last?.kind === "text") return { ...turn, parts: [...turn.parts.slice(0, -1), { kind: "text", text: last.text + event.text }] };
      return { ...turn, parts: [...turn.parts, { kind: "text", text: event.text }] };
    }
    case "tool":
      return { ...turn, parts: [...turn.parts, { kind: "step", step: { id: event.id, label: event.label, status: "running" } }] };
    case "tool_done":
      return {
        ...turn,
        parts: turn.parts.map((p) =>
          p.kind === "step" && p.step.id === event.id ? { kind: "step", step: { ...p.step, status: event.ok ? "ok" : "error", detail: event.detail } } : p,
        ),
      };
    case "error":
      return { ...turn, error: event.message };
    case "done":
      return { ...turn, files: event.files, running: false };
    case "chat":
      return turn;
  }
}

/** A finished turn: steps that never reported back count as failed. */
export function settleTurn(turn: AssistantTurn): AssistantTurn {
  return {
    ...turn,
    running: false,
    parts: turn.parts.map((p) => (p.kind === "step" && p.step.status === "running" ? { kind: "step", step: { ...p.step, status: "error" } } : p)),
  };
}

/** Chat title from the first message. */
export function chatTitle(text: string) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 58)}…` : line || "Neuer Chat";
}
