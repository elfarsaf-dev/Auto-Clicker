import type { CustomTool, ParamDef } from "./customToolsStore";

const PLACEHOLDER = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

function coerceArg(def: ParamDef, raw: unknown): unknown {
  if (raw === undefined || raw === null) return raw;
  switch (def.type) {
    case "number":
    case "integer": {
      if (typeof raw === "number") return def.type === "integer" ? Math.trunc(raw) : raw;
      const n = Number(String(raw));
      if (!Number.isFinite(n)) {
        throw new Error(`Argumen "${def.name}" harus angka.`);
      }
      return def.type === "integer" ? Math.trunc(n) : n;
    }
    case "boolean": {
      if (typeof raw === "boolean") return raw;
      const s = String(raw).toLowerCase();
      if (["true", "1", "yes"].includes(s)) return true;
      if (["false", "0", "no"].includes(s)) return false;
      throw new Error(`Argumen "${def.name}" harus boolean.`);
    }
    default:
      return String(raw);
  }
}

function validateAndPrepareArgs(
  tool: CustomTool,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of tool.parameters) {
    const v = args[def.name];
    if (v === undefined || v === null || v === "") {
      if (def.required) {
        throw new Error(`Argumen "${def.name}" wajib diisi.`);
      }
      continue;
    }
    const coerced = coerceArg(def, v);
    if (def.enumValues && def.enumValues.length > 0) {
      const s = String(coerced);
      if (!def.enumValues.includes(s)) {
        throw new Error(
          `Argumen "${def.name}" harus salah satu dari: ${def.enumValues.join(", ")}.`,
        );
      }
    }
    out[def.name] = coerced;
  }
  // pass through extra args (in case template references something not listed)
  for (const [k, v] of Object.entries(args)) {
    if (!(k in out) && v !== undefined && v !== null) {
      out[k] = v;
    }
  }
  return out;
}

function substitute(template: string, args: Record<string, unknown>): string {
  return template.replace(PLACEHOLDER, (_full, key: string) => {
    const v = args[key];
    if (v === undefined || v === null) return "";
    return String(v);
  });
}

function buildUrl(
  rawUrl: string,
  query: Record<string, string>,
  args: Record<string, unknown>,
): string {
  const url = substitute(rawUrl, args);
  const parts: string[] = [];
  for (const [k, vTpl] of Object.entries(query)) {
    if (!k) continue;
    const v = substitute(vTpl, args);
    if (v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  if (parts.length === 0) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${parts.join("&")}`;
}

function buildBody(
  tool: CustomTool,
  args: Record<string, unknown>,
): { body: BodyInit | undefined; contentType: string | undefined } {
  const { bodyType, bodyTemplate } = tool.request;
  if (bodyType === "none") return { body: undefined, contentType: undefined };
  const filled = substitute(bodyTemplate, args);
  switch (bodyType) {
    case "json":
      return { body: filled || "{}", contentType: "application/json" };
    case "form":
      return {
        body: filled,
        contentType: "application/x-www-form-urlencoded",
      };
    case "text":
      return { body: filled, contentType: "text/plain" };
    default:
      return { body: undefined, contentType: undefined };
  }
}

function pickByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function applyPick(data: unknown, pick: string[] | undefined): unknown {
  if (!pick || pick.length === 0) return data;
  if (Array.isArray(data)) {
    return data.map((item) => {
      const out: Record<string, unknown> = {};
      for (const p of pick) {
        out[p] = pickByPath(item, p);
      }
      return out;
    });
  }
  const out: Record<string, unknown> = {};
  for (const p of pick) {
    out[p] = pickByPath(data, p);
  }
  return out;
}

export async function runHttpTool(
  tool: CustomTool,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  const prepared = validateAndPrepareArgs(tool, args);
  const fullUrl = buildUrl(tool.request.url, tool.request.query, prepared);
  if (!/^https?:\/\//i.test(fullUrl)) {
    throw new Error(`URL tidak valid: ${fullUrl}`);
  }

  const headers: Record<string, string> = {};
  for (const [k, vTpl] of Object.entries(tool.request.headers)) {
    if (!k) continue;
    const v = substitute(vTpl, prepared);
    if (v === "") continue;
    headers[k] = v;
  }

  const { body, contentType } = buildBody(tool, prepared);
  if (body !== undefined && contentType && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = contentType;
  }

  const timeoutCtl = new AbortController();
  const timer = setTimeout(() => timeoutCtl.abort(), tool.request.timeoutMs);
  const onAbort = () => timeoutCtl.abort();
  signal?.addEventListener("abort", onAbort);

  let res: Response;
  try {
    res = await fetch(fullUrl, {
      method: tool.request.method,
      headers,
      body,
      signal: timeoutCtl.signal,
    });
  } catch (e) {
    if (timeoutCtl.signal.aborted && !signal?.aborted) {
      throw new Error(`Request timeout setelah ${tool.request.timeoutMs}ms.`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  const rawText = await res.text();
  const max = tool.response.maxChars ?? 6000;

  if (!res.ok) {
    const truncated = rawText.length > max ? `${rawText.slice(0, max)}...` : rawText;
    return JSON.stringify({
      ok: false,
      status: res.status,
      statusText: res.statusText,
      body: truncated,
    });
  }

  if (tool.response.type === "text") {
    const truncated = rawText.length > max ? `${rawText.slice(0, max)}...` : rawText;
    return JSON.stringify({ ok: true, status: res.status, body: truncated });
  }

  let parsed: unknown;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    const truncated = rawText.length > max ? `${rawText.slice(0, max)}...` : rawText;
    return JSON.stringify({
      ok: true,
      status: res.status,
      note: "Response bukan JSON valid, dikembalikan sebagai teks.",
      body: truncated,
    });
  }

  const picked = applyPick(parsed, tool.response.pick);
  let serialized = JSON.stringify(picked);
  if (serialized.length > max) {
    serialized = `${serialized.slice(0, max)}...`;
  }
  return JSON.stringify({ ok: true, status: res.status, data: JSON.parse(safeWrap(serialized)) });
}

function safeWrap(s: string): string {
  // if we truncated and produced invalid JSON, wrap it in a string
  try {
    JSON.parse(s);
    return s;
  } catch {
    return JSON.stringify(s);
  }
}

export function buildToolDefinition(tool: CustomTool): {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
} {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  for (const p of tool.parameters) {
    const prop: Record<string, unknown> = {
      type: p.type,
    };
    if (p.description) prop.description = p.description;
    if (p.enumValues && p.enumValues.length > 0) prop.enum = p.enumValues;
    properties[p.name] = prop;
    if (p.required) required.push(p.name);
  }
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
      },
    },
  };
}
