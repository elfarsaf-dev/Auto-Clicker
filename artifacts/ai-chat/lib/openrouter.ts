import { findTool, getToolDefinitions, type ToolDefinition } from "./tools";

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type OpenRouterResponse = {
  id?: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      reasoning?: string;
      tool_calls?: ToolCall[];
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: {
    message: string;
    code?: number;
    metadata?: {
      raw?: string;
      provider_name?: string;
      reasons?: string[];
    };
  };
};

export type ModelOption = {
  id: string;
  label: string;
  hint?: string;
  builtIn?: boolean;
};

export const BUILTIN_MODELS: ModelOption[] = [
  { id: "openai/gpt-oss-120b:free", label: "GPT-OSS 120B", hint: "Pintar, gratis", builtIn: true },
  { id: "poolside/laguna-xs.2:free", label: "Laguna XS.2", hint: "Cepat, gratis", builtIn: true },
  { id: "baidu/qianfan-ocr-fast:free", label: "Qianfan OCR Fast", hint: "OCR, gratis", builtIn: true },
  { id: "nvidia/nemotron-nano-9b-v2:free", label: "Nemotron Nano 9B", hint: "Ringan, gratis", builtIn: true },
];

export const DEFAULT_MODEL = BUILTIN_MODELS[0]!.id;

type CallResult =
  | { ok: true; content: string; toolCalls?: ToolCall[] }
  | { ok: false; data: OpenRouterResponse; status: number; statusText: string };

async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  reasoning: boolean,
  tools: ToolDefinition[] | undefined,
  signal?: AbortSignal,
): Promise<CallResult> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.7,
  };
  if (reasoning) {
    body.reasoning = { enabled: true };
  }
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://replit.com/",
      "X-Title": "AI Chat",
    },
    body: JSON.stringify(body),
    signal,
  });

  const data: OpenRouterResponse = await res.json().catch(() => ({} as OpenRouterResponse));

  if (!res.ok || data.error) {
    return { ok: false, data, status: res.status, statusText: res.statusText };
  }

  const msg = data.choices?.[0]?.message;
  const toolCalls = msg?.tool_calls;
  const content = (msg?.content ?? "").trim();

  if (toolCalls && toolCalls.length > 0) {
    return { ok: true, content, toolCalls };
  }

  if (!content) {
    return {
      ok: false,
      data: { choices: [], error: { message: "Model tidak mengembalikan jawaban." } },
      status: res.status,
      statusText: res.statusText,
    };
  }
  return { ok: true, content };
}

function buildErrorMessage(
  data: OpenRouterResponse,
  status: number,
  statusText: string,
  model: string,
  triedReasoning: boolean,
): string {
  const err = data.error;
  const baseMsg =
    err?.message ||
    err?.metadata?.raw ||
    (err?.metadata?.reasons?.length ? err.metadata.reasons.join(", ") : null) ||
    `HTTP ${status}: ${statusText || "permintaan gagal"}`;

  const lower = baseMsg.toLowerCase();
  const hints: string[] = [];

  if (
    lower.includes("not a valid model") ||
    lower.includes("no allowed providers") ||
    lower.includes("model not found") ||
    status === 404
  ) {
    hints.push(
      `Periksa ulang ID model "${model}". Format harus persis "provider/nama-model" atau "provider/nama-model:free" sesuai daftar di openrouter.ai/models.`,
    );
  } else if (status === 401 || lower.includes("invalid api key") || lower.includes("unauthorized")) {
    hints.push("API key tidak valid. Atur ulang di Pengaturan.");
  } else if (status === 402 || lower.includes("insufficient credit") || lower.includes("payment required")) {
    hints.push(
      "Model ini butuh saldo. Pakai model bertanda :free atau isi saldo di openrouter.ai/credits.",
    );
  } else if (status === 429 || lower.includes("rate limit")) {
    hints.push("Terkena batas pemakaian. Tunggu beberapa saat lalu coba lagi.");
  } else if (triedReasoning && (lower.includes("reasoning") || lower.includes("unsupported"))) {
    hints.push("Model ini tampaknya tidak mendukung mode Reasoning. Matikan saklarnya di pemilih model.");
  } else if (status >= 500 || lower.includes("provider returned error")) {
    hints.push(
      "Penyedia model sedang bermasalah atau opsi yang dikirim tidak didukung. Coba matikan Reasoning, atau pilih model lain.",
    );
  }

  return hints.length > 0 ? `${baseMsg}\n\n${hints.join(" ")}` : baseMsg;
}

export type ToolEvent = {
  name: string;
  label?: string;
  args: Record<string, unknown>;
  result?: string;
  error?: string;
};

const MAX_TOOL_HOPS = 50;

export async function sendChatRequest(params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  reasoning?: boolean;
  toolsEnabled?: boolean;
  onToolCall?: (event: ToolEvent) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const { apiKey, model, reasoning, toolsEnabled, onToolCall, signal } = params;
  const tools = toolsEnabled ? await getToolDefinitions() : undefined;

  const conversation: ChatMessage[] = [...params.messages];

  for (let hop = 0; hop <= MAX_TOOL_HOPS; hop++) {
    const result = await callOpenRouter(
      apiKey,
      model,
      conversation,
      !!reasoning,
      tools,
      signal,
    );

    if (!result.ok) {
      if (reasoning || (toolsEnabled && hop === 0)) {
        const errMsg = (result.data.error?.message || "").toLowerCase();
        const looksUnsupported =
          errMsg.includes("reasoning") ||
          errMsg.includes("tool") ||
          errMsg.includes("function") ||
          errMsg.includes("unsupported") ||
          errMsg.includes("provider returned error") ||
          result.status >= 500;

        if (looksUnsupported) {
          const retry = await callOpenRouter(
            apiKey,
            model,
            conversation,
            false,
            undefined,
            signal,
          );
          if (retry.ok) return retry.content;
        }
      }
      throw new Error(
        buildErrorMessage(result.data, result.status, result.statusText, model, !!reasoning),
      );
    }

    if (!result.toolCalls || result.toolCalls.length === 0) {
      return result.content;
    }

    if (hop === MAX_TOOL_HOPS) {
      return (
        result.content ||
        "Maaf, terlalu banyak panggilan tool sehingga proses dihentikan."
      );
    }

    conversation.push({
      role: "assistant",
      content: result.content,
      tool_calls: result.toolCalls,
    });

    for (const call of result.toolCalls) {
      const tool = await findTool(call.function.name);
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = call.function.arguments
          ? JSON.parse(call.function.arguments)
          : {};
      } catch {
        parsedArgs = {};
      }

      let toolResult: string;
      let toolError: string | undefined;
      if (!tool) {
        toolError = `Tool "${call.function.name}" tidak dikenal.`;
        toolResult = JSON.stringify({ error: toolError });
      } else {
        try {
          toolResult = await tool.execute(parsedArgs, signal);
        } catch (e) {
          toolError = e instanceof Error ? e.message : String(e);
          toolResult = JSON.stringify({ error: toolError });
        }
      }

      onToolCall?.({
        name: call.function.name,
        label: tool?.label,
        args: parsedArgs,
        result: toolError ? undefined : toolResult,
        error: toolError,
      });

      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: toolResult,
      });
    }
  }

  throw new Error("Tool loop tidak selesai.");
}
