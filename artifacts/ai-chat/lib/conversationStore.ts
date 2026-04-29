import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ChatMessage } from "./openrouter";

export type DisplayMessage = ChatMessage & { id: string };

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

const LIST_KEY = "@ai-chat/conversations";
const ACTIVE_KEY = "@ai-chat/active-conv";
const MSG_KEY_PREFIX = "@ai-chat/conv/";
const LEGACY_MESSAGES_KEY = "@ai-chat/messages";

export const DEFAULT_TITLE = "Obrolan baru";

function newId(): string {
  return Date.now().toString() + Math.random().toString(36).slice(2, 9);
}

function msgKey(id: string): string {
  return `${MSG_KEY_PREFIX}${id}/messages`;
}

export function makeTitleFromContent(content: string): string {
  const trimmed = content.replace(/\s+/g, " ").trim();
  if (!trimmed) return DEFAULT_TITLE;
  if (trimmed.length <= 40) return trimmed;
  return trimmed.slice(0, 40).trimEnd() + "…";
}

export async function listConversations(): Promise<Conversation[]> {
  try {
    const raw = await AsyncStorage.getItem(LIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (c): c is Conversation =>
          c &&
          typeof c.id === "string" &&
          typeof c.title === "string" &&
          typeof c.createdAt === "number" &&
          typeof c.updatedAt === "number",
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

async function saveList(list: Conversation[]): Promise<void> {
  await AsyncStorage.setItem(LIST_KEY, JSON.stringify(list));
}

export async function getActiveConvId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export async function setActiveConvIdStorage(id: string | null): Promise<void> {
  if (id) await AsyncStorage.setItem(ACTIVE_KEY, id);
  else await AsyncStorage.removeItem(ACTIVE_KEY);
}

export async function loadConversationMessages(id: string): Promise<DisplayMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(msgKey(id));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as DisplayMessage[];
  } catch {
    return [];
  }
}

export async function saveConversationMessages(
  id: string,
  messages: DisplayMessage[],
): Promise<void> {
  await AsyncStorage.setItem(msgKey(id), JSON.stringify(messages));
}

export async function createConversation(title: string = DEFAULT_TITLE): Promise<Conversation> {
  const now = Date.now();
  const conv: Conversation = {
    id: newId(),
    title,
    createdAt: now,
    updatedAt: now,
  };
  const list = await listConversations();
  list.unshift(conv);
  await saveList(list);
  return conv;
}

export async function updateConversation(
  id: string,
  patch: Partial<Pick<Conversation, "title" | "updatedAt">>,
): Promise<void> {
  const list = await listConversations();
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch };
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  await saveList(list);
}

export async function deleteConversation(id: string): Promise<void> {
  const list = await listConversations();
  const filtered = list.filter((c) => c.id !== id);
  await saveList(filtered);
  await AsyncStorage.removeItem(msgKey(id));
}

export async function migrateLegacyIfAny(): Promise<{ migrated: boolean; conv?: Conversation }> {
  try {
    const legacy = await AsyncStorage.getItem(LEGACY_MESSAGES_KEY);
    if (!legacy) return { migrated: false };
    let parsed: unknown;
    try {
      parsed = JSON.parse(legacy);
    } catch {
      await AsyncStorage.removeItem(LEGACY_MESSAGES_KEY);
      return { migrated: false };
    }
    await AsyncStorage.removeItem(LEGACY_MESSAGES_KEY);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { migrated: false };
    }
    const firstUser = (parsed as DisplayMessage[]).find(
      (m) => m && m.role === "user" && typeof m.content === "string",
    );
    const title = firstUser ? makeTitleFromContent(firstUser.content) : "Obrolan lama";
    const conv = await createConversation(title);
    await saveConversationMessages(conv.id, parsed as DisplayMessage[]);
    return { migrated: true, conv };
  } catch {
    return { migrated: false };
  }
}
