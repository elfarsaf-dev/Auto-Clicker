import { FileSystem, isFsAvailable } from "./agentFs";
import { getDefaultSnippet, isDefaultSnippet, listDefaultSnippets } from "./defaultSnippets";

const SNIPPETS_DIR = `${FileSystem.documentDirectory ?? ""}snippets/`;

export type SnippetMeta = {
  name: string;
  title: string;
  desc: string;
  lang: string;
  tags: string[];
  source?: "default" | "user";
};

export type Snippet = SnippetMeta & {
  code: string;
};

const SAFE_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export function normalizeName(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "untitled";
}

export function validateName(name: string): boolean {
  return SAFE_NAME.test(name);
}

async function ensureDir(): Promise<void> {
  if (!isFsAvailable()) throw new Error("Penyimpanan lokal tidak tersedia.");
  const info = await FileSystem.getInfoAsync(SNIPPETS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(SNIPPETS_DIR, { intermediates: true });
  }
}

function pathFor(name: string): string {
  if (!validateName(name)) throw new Error(`Nama snippet tidak valid: ${name}`);
  return `${SNIPPETS_DIR}${name}.md`;
}

function serialize(s: Snippet): string {
  const tags = s.tags.join(", ");
  return `---\ntitle: ${s.title}\ndesc: ${s.desc}\nlang: ${s.lang}\ntags: ${tags}\n---\n${s.code}`;
}

function parse(name: string, raw: string): Snippet {
  const meta: Record<string, string> = {};
  let code = raw;
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (m) {
    const block = m[1] ?? "";
    code = raw.slice(m[0].length);
    for (const line of block.split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const val = line.slice(idx + 1).trim();
      if (key) meta[key] = val;
    }
  }
  const tags = (meta.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    name,
    title: meta.title || name,
    desc: meta.desc || "",
    lang: meta.lang || "text",
    tags,
    code,
  };
}

export async function listSnippets(): Promise<SnippetMeta[]> {
  const userMap = new Map<string, SnippetMeta>();
  if (isFsAvailable()) {
    const info = await FileSystem.getInfoAsync(SNIPPETS_DIR);
    if (info.exists) {
      const entries = await FileSystem.readDirectoryAsync(SNIPPETS_DIR);
      for (const entry of entries) {
        if (!entry.endsWith(".md")) continue;
        const name = entry.slice(0, -3);
        if (!validateName(name)) continue;
        try {
          const raw = await FileSystem.readAsStringAsync(`${SNIPPETS_DIR}${entry}`);
          const s = parse(name, raw);
          userMap.set(s.name, {
            name: s.name,
            title: s.title,
            desc: s.desc,
            lang: s.lang,
            tags: s.tags,
            source: "user",
          });
        } catch {
          // skip bad files
        }
      }
    }
  }

  const items: SnippetMeta[] = [];
  for (const d of listDefaultSnippets()) {
    if (userMap.has(d.name)) continue; // user override wins
    items.push({
      name: d.name,
      title: d.title,
      desc: d.desc,
      lang: d.lang,
      tags: d.tags,
      source: "default",
    });
  }
  for (const u of userMap.values()) items.push(u);

  items.sort((a, b) => a.title.localeCompare(b.title));
  return items;
}

export async function getSnippet(name: string): Promise<Snippet | null> {
  const safe = name.trim();
  if (!validateName(safe)) return null;
  if (isFsAvailable()) {
    const path = pathFor(safe);
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      const raw = await FileSystem.readAsStringAsync(path);
      const s = parse(safe, raw);
      return { ...s, source: "user" };
    }
  }
  const def = getDefaultSnippet(safe);
  if (def) return { ...def, source: "default" };
  return null;
}

export async function saveSnippet(snippet: Snippet): Promise<void> {
  await ensureDir();
  const path = pathFor(snippet.name);
  await FileSystem.writeAsStringAsync(path, serialize(snippet));
}

export async function deleteSnippet(name: string): Promise<void> {
  if (!validateName(name)) throw new Error(`Nama snippet tidak valid: ${name}`);
  const path = pathFor(name);
  await FileSystem.deleteAsync(path, { idempotent: true });
}

export async function renameSnippet(oldName: string, newName: string): Promise<void> {
  if (oldName === newName) return;
  const existing = await getSnippet(oldName);
  if (!existing) throw new Error(`Snippet "${oldName}" tidak ditemukan.`);
  const replaced = await getSnippet(newName);
  if (replaced) throw new Error(`Snippet "${newName}" sudah ada.`);
  await saveSnippet({ ...existing, name: newName });
  await deleteSnippet(oldName);
}

export async function snippetExists(name: string): Promise<boolean> {
  if (!validateName(name)) return false;
  if (isDefaultSnippet(name)) return true;
  if (!isFsAvailable()) return false;
  const info = await FileSystem.getInfoAsync(pathFor(name));
  return info.exists;
}

export async function userSnippetExists(name: string): Promise<boolean> {
  if (!validateName(name)) return false;
  if (!isFsAvailable()) return false;
  const info = await FileSystem.getInfoAsync(pathFor(name));
  return info.exists;
}
