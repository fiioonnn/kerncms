"use server";

import { run } from "../action";
import { deleteChat, findChat, listChats } from "../assistant/chats";
import { assistantFor } from "../assistant/settings";
import { getWorkspace } from "../sites";

/* The signed-in person's chats with the AI assistant on the current site. */

async function assistantWorkspace() {
  const ws = await getWorkspace("viewer");
  if (!(await assistantFor(ws.user, ws.role))) throw new Error("Der KI-Assistent ist für dich nicht freigeschaltet.");
  return ws;
}

export async function listAssistantChats() {
  return run(async () => {
    const ws = await assistantWorkspace();
    return listChats(ws.site.id, ws.user.id);
  });
}

export async function loadAssistantChat(id: string) {
  return run(async () => {
    const ws = await assistantWorkspace();
    const chat = await findChat(ws.site.id, ws.user.id, id);
    if (!chat) throw new Error("Diesen Chat gibt es nicht mehr.");
    return { id: chat.id, title: chat.title, turns: chat.turns };
  });
}

export async function deleteAssistantChat(id: string) {
  return run(async () => {
    const ws = await assistantWorkspace();
    await deleteChat(ws.site.id, ws.user.id, id);
    return null;
  });
}
