export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolHandler = (args: Record<string, unknown>) => Promise<string> | string;

export type Tool = {
  definition: ToolDefinition;
  execute: ToolHandler;
  label: string;
};

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function formatTanggalIndo(d: Date): string {
  const hari = HARI[d.getDay()];
  const tgl = d.getDate();
  const bln = BULAN[d.getMonth()];
  const thn = d.getFullYear();
  const jam = String(d.getHours()).padStart(2, "0");
  const mnt = String(d.getMinutes()).padStart(2, "0");
  const dtk = String(d.getSeconds()).padStart(2, "0");
  const tz = -d.getTimezoneOffset() / 60;
  const tzStr = `UTC${tz >= 0 ? "+" : ""}${tz}`;
  return `${hari}, ${tgl} ${bln} ${thn}, ${jam}:${mnt}:${dtk} (${tzStr})`;
}

function safeEval(expr: string): number {
  const cleaned = expr.replace(/\s+/g, "");
  if (!/^[-+*/().0-9%^,eE]+$/.test(cleaned)) {
    throw new Error("Ekspresi mengandung karakter yang tidak diizinkan.");
  }
  const normalized = cleaned.replace(/\^/g, "**").replace(/,/g, ".");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function(`"use strict"; return (${normalized});`);
  const result = fn();
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error("Hasil bukan angka.");
  }
  return result;
}

export const TOOLS: Tool[] = [
  {
    label: "Cek waktu",
    definition: {
      type: "function",
      function: {
        name: "get_current_time",
        description:
          "Dapatkan tanggal dan waktu saat ini di perangkat pengguna, beserta zona waktunya. Gunakan ini setiap kali pengguna bertanya tentang jam, tanggal, hari, atau tahun saat ini.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    },
    execute: () => {
      const now = new Date();
      return JSON.stringify({
        iso: now.toISOString(),
        formatted_id: formatTanggalIndo(now),
        unix_seconds: Math.floor(now.getTime() / 1000),
        timezone_offset_minutes: -now.getTimezoneOffset(),
      });
    },
  },
  {
    label: "Hitung",
    definition: {
      type: "function",
      function: {
        name: "calculate",
        description:
          "Hitung ekspresi matematika sederhana. Mendukung +, -, *, /, %, ^ (pangkat), dan tanda kurung. Gunakan untuk semua kalkulasi numerik yang melibatkan lebih dari satu operasi.",
        parameters: {
          type: "object",
          properties: {
            expression: {
              type: "string",
              description: "Ekspresi matematika, contoh: '12 * (3 + 4) / 2'",
            },
          },
          required: ["expression"],
          additionalProperties: false,
        },
      },
    },
    execute: (args) => {
      const expr = String(args.expression ?? "");
      if (!expr) throw new Error("Ekspresi kosong.");
      const result = safeEval(expr);
      return JSON.stringify({ expression: expr, result });
    },
  },
];

export function getToolDefinitions(): ToolDefinition[] {
  return TOOLS.map((t) => t.definition);
}

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.definition.function.name === name);
}
