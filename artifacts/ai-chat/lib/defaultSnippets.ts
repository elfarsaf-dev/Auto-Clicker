import data from "./defaultSnippets.json";
import type { Snippet } from "./snippetsStore";

const SNIPPETS = data as Snippet[];

const BY_NAME = new Map<string, Snippet>();
for (const s of SNIPPETS) BY_NAME.set(s.name, s);

export function listDefaultSnippets(): Snippet[] {
  return SNIPPETS;
}

export function getDefaultSnippet(name: string): Snippet | null {
  return BY_NAME.get(name) ?? null;
}

export function isDefaultSnippet(name: string): boolean {
  return BY_NAME.has(name);
}
