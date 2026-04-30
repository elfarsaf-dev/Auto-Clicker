import { FileSystem, isFsAvailable } from "./agentFs";

const TOOLS_DIR = `${FileSystem.documentDirectory ?? ""}custom-tools/`;

export type ParamType = "string" | "number" | "integer" | "boolean";

export type ParamDef = {
  name: string;
  type: ParamType;
  description: string;
  required: boolean;
  enumValues?: string[];
};

export type CustomToolRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  bodyType: "none" | "json" | "form" | "text";
  bodyTemplate: string;
  timeoutMs: number;
};

export type CustomToolResponse = {
  type: "json" | "text";
  pick?: string[];
  maxChars?: number;
};

export type CustomTool = {
  name: string;
  label: string;
  description: string;
  parameters: ParamDef[];
  request: CustomToolRequest;
  response: CustomToolResponse;
};

const SAFE_NAME = /^[a-z][a-z0-9_]{0,47}$/;

export function normalizeToolName(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  if (!slug) return "tool_baru";
  if (!/^[a-z]/.test(slug)) return `t_${slug}`.slice(0, 48);
  return slug;
}

export function validateToolName(name: string): boolean {
  return SAFE_NAME.test(name);
}

async function ensureDir(): Promise<void> {
  if (!isFsAvailable()) throw new Error("Penyimpanan lokal tidak tersedia.");
  const info = await FileSystem.getInfoAsync(TOOLS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(TOOLS_DIR, { intermediates: true });
  }
}

function pathFor(name: string): string {
  if (!validateToolName(name)) throw new Error(`Nama tool tidak valid: ${name}`);
  return `${TOOLS_DIR}${name}.json`;
}

function emptyTool(name: string): CustomTool {
  return {
    name,
    label: `Menjalankan ${name}...`,
    description: "",
    parameters: [],
    request: {
      method: "GET",
      url: "",
      headers: {},
      query: {},
      bodyType: "none",
      bodyTemplate: "",
      timeoutMs: 15000,
    },
    response: {
      type: "json",
    },
  };
}

function sanitizeRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof k !== "string" || !k) continue;
    if (v == null) continue;
    out[k] = String(v);
  }
  return out;
}

function sanitizeParams(value: unknown): ParamDef[] {
  if (!Array.isArray(value)) return [];
  const out: ParamDef[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const n = String(r.name ?? "").trim();
    if (!n || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n)) continue;
    const t = (r.type as ParamType) ?? "string";
    const type: ParamType =
      t === "number" || t === "integer" || t === "boolean" ? t : "string";
    const enumRaw = r.enumValues;
    const enumValues = Array.isArray(enumRaw)
      ? enumRaw.map((e) => String(e)).filter(Boolean)
      : undefined;
    out.push({
      name: n,
      type,
      description: String(r.description ?? ""),
      required: Boolean(r.required),
      ...(enumValues && enumValues.length > 0 ? { enumValues } : {}),
    });
  }
  return out;
}

function sanitizeTool(name: string, raw: unknown): CustomTool {
  const base = emptyTool(name);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const req = (r.request ?? {}) as Record<string, unknown>;
  const res = (r.response ?? {}) as Record<string, unknown>;
  const method = String(req.method ?? "GET").toUpperCase();
  const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
  const finalMethod = (allowedMethods as readonly string[]).includes(method)
    ? (method as CustomToolRequest["method"])
    : "GET";
  const allowedBody = ["none", "json", "form", "text"] as const;
  const bodyType = (allowedBody as readonly string[]).includes(
    String(req.bodyType ?? "none"),
  )
    ? (String(req.bodyType ?? "none") as CustomToolRequest["bodyType"])
    : "none";
  const respType = res.type === "text" ? "text" : "json";
  const pickRaw = res.pick;
  const pick = Array.isArray(pickRaw)
    ? pickRaw.map((p) => String(p)).filter(Boolean)
    : undefined;
  const maxChars =
    typeof res.maxChars === "number" && res.maxChars > 0
      ? Math.floor(res.maxChars)
      : undefined;
  const timeoutMs =
    typeof req.timeoutMs === "number" && req.timeoutMs >= 1000
      ? Math.min(60000, Math.floor(req.timeoutMs))
      : 15000;

  return {
    name,
    label: String(r.label ?? base.label),
    description: String(r.description ?? ""),
    parameters: sanitizeParams(r.parameters),
    request: {
      method: finalMethod,
      url: String(req.url ?? ""),
      headers: sanitizeRecord(req.headers),
      query: sanitizeRecord(req.query),
      bodyType,
      bodyTemplate: String(req.bodyTemplate ?? ""),
      timeoutMs,
    },
    response: {
      type: respType,
      ...(pick && pick.length > 0 ? { pick } : {}),
      ...(maxChars ? { maxChars } : {}),
    },
  };
}

export async function listCustomTools(): Promise<CustomTool[]> {
  if (!isFsAvailable()) return [];
  const info = await FileSystem.getInfoAsync(TOOLS_DIR);
  if (!info.exists) return [];
  const entries = await FileSystem.readDirectoryAsync(TOOLS_DIR);
  const tools: CustomTool[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const name = entry.slice(0, -5);
    if (!validateToolName(name)) continue;
    try {
      const raw = await FileSystem.readAsStringAsync(`${TOOLS_DIR}${entry}`);
      const parsed = JSON.parse(raw);
      tools.push(sanitizeTool(name, parsed));
    } catch {
      // skip bad files
    }
  }
  tools.sort((a, b) => a.name.localeCompare(b.name));
  return tools;
}

export async function getCustomTool(name: string): Promise<CustomTool | null> {
  if (!validateToolName(name)) return null;
  if (!isFsAvailable()) return null;
  const path = pathFor(name);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  try {
    const raw = await FileSystem.readAsStringAsync(path);
    return sanitizeTool(name, JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveCustomTool(tool: CustomTool): Promise<void> {
  await ensureDir();
  if (!validateToolName(tool.name)) {
    throw new Error(
      "Nama tool harus diawali huruf kecil, hanya boleh huruf/angka/_ , maks 48 karakter.",
    );
  }
  if (!tool.request.url.trim()) {
    throw new Error("URL request wajib diisi.");
  }
  if (!tool.description.trim()) {
    throw new Error("Deskripsi tool wajib diisi (untuk AI).");
  }
  const sanitized = sanitizeTool(tool.name, tool);
  await FileSystem.writeAsStringAsync(
    pathFor(sanitized.name),
    JSON.stringify(sanitized, null, 2),
  );
}

export async function deleteCustomTool(name: string): Promise<void> {
  if (!validateToolName(name)) throw new Error(`Nama tool tidak valid: ${name}`);
  await FileSystem.deleteAsync(pathFor(name), { idempotent: true });
}

export async function customToolExists(name: string): Promise<boolean> {
  if (!validateToolName(name)) return false;
  if (!isFsAvailable()) return false;
  const info = await FileSystem.getInfoAsync(pathFor(name));
  return info.exists;
}

export function emptyCustomTool(name = ""): CustomTool {
  return emptyTool(name || "tool_baru");
}
