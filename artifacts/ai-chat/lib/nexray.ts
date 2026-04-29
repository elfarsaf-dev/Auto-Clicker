const NEXRAY_BASE = "https://api.nexray.web.id";
const DEFAULT_TIMEOUT_MS = 25_000;

type NexRayResponse<T = unknown> = {
  status: boolean;
  author?: string;
  result?: T;
  error?: string;
};

async function withTimeout<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new Error("Request dibatalkan.");
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  const onAbort = () => ac.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    return await p;
  } finally {
    clearTimeout(t);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function nexrayGet<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(NEXRAY_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }

  const ac = new AbortController();
  const onAbort = () => ac.abort();
  signal?.addEventListener("abort", onAbort);
  const timeoutId = setTimeout(() => ac.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ac.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onAbort);
    if ((e as Error).name === "AbortError") {
      throw new Error("Permintaan ke server kelamaan, coba lagi.");
    }
    throw new Error(`Gagal menghubungi server: ${(e as Error).message}`);
  }
  clearTimeout(timeoutId);
  signal?.removeEventListener("abort", onAbort);

  let data: NexRayResponse<T>;
  try {
    data = (await res.json()) as NexRayResponse<T>;
  } catch {
    throw new Error(`Server membalas non-JSON (HTTP ${res.status}).`);
  }

  if (data.status === false || data.error) {
    throw new Error(data.error || `Permintaan gagal (HTTP ${res.status}).`);
  }
  if (data.result === undefined) {
    throw new Error("Server tidak mengembalikan data.");
  }
  return data.result;
}

export const _internal = { withTimeout };
