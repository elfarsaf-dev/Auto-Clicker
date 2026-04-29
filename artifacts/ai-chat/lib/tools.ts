import { nexrayGet } from "./nexray";

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolHandler = (
  args: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<string> | string;

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

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
}

const NEWS_SOURCES = [
  "cnn",
  "kompas",
  "antara",
  "merdeka",
  "sindonews",
  "suara",
  "cnbcindonesia",
] as const;

export const TOOLS: Tool[] = [
  {
    label: "Memeriksa waktu...",
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
    label: "Menghitung...",
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
  {
    label: "Mencari di web...",
    definition: {
      type: "function",
      function: {
        name: "web_search",
        description:
          "Cari informasi di internet menggunakan Brave Search. Pakai untuk pertanyaan tentang berita, fakta terbaru, atau topik apa pun yang butuh data dari web. Hasilnya berupa daftar judul halaman.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Kata kunci pencarian" },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, signal) => {
      const query = String(args.query ?? "").trim();
      if (!query) throw new Error("Query kosong.");
      const result = await nexrayGet<Array<{ title: string; image_url?: string }>>(
        "/search/brave",
        { q: query },
        signal,
      );
      const top = (Array.isArray(result) ? result : []).slice(0, 8).map((r) => ({
        title: r.title,
      }));
      return JSON.stringify({ query, results: top });
    },
  },
  {
    label: "Mencari di Wikipedia...",
    definition: {
      type: "function",
      function: {
        name: "wikipedia_search",
        description:
          "Cari artikel di Wikipedia (bahasa Inggris). Bagus untuk topik ensiklopedis: tokoh, tempat, sejarah, sains. Hasilnya berupa daftar judul + cuplikan artikel.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Topik yang dicari" },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, signal) => {
      const query = String(args.query ?? "").trim();
      if (!query) throw new Error("Query kosong.");
      const result = await nexrayGet<Array<{ title: string; snippet?: string }>>(
        "/search/wikipedia",
        { q: query },
        signal,
      );
      const top = (Array.isArray(result) ? result : []).slice(0, 5).map((r) => ({
        title: r.title,
        snippet: stripHtml(r.snippet ?? ""),
      }));
      return JSON.stringify({ query, results: top });
    },
  },
  {
    label: "Mengecek cuaca...",
    definition: {
      type: "function",
      function: {
        name: "weather",
        description:
          "Prakiraan cuaca terkini untuk kota di Indonesia (data BMKG). Mengembalikan suhu, kelembaban, dan kondisi cuaca untuk beberapa slot waktu ke depan.",
        parameters: {
          type: "object",
          properties: {
            kota: {
              type: "string",
              description: "Nama kota di Indonesia, contoh: Jakarta, Bandung, Surabaya",
            },
          },
          required: ["kota"],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, signal) => {
      const kota = String(args.kota ?? "").trim();
      if (!kota) throw new Error("Nama kota kosong.");
      const result = await nexrayGet<{
        location?: Record<string, string>;
        forecasts?: Array<Record<string, string>>;
      }>("/information/cuaca", { kota }, signal);
      return JSON.stringify({
        lokasi: result.location ?? null,
        forecasts: (result.forecasts ?? []).slice(0, 6).map((f) => ({
          waktu: f.waktu,
          cuaca: f.cuaca,
          suhu: f.suhu,
          kelembaban: f.kelembaban,
          angin: f.kecepatan_angin,
          arah_angin: f.arah_angin,
          visibilitas: f.visibilitas,
        })),
      });
    },
  },
  {
    label: "Mengecek gempa terbaru...",
    definition: {
      type: "function",
      function: {
        name: "earthquake_latest",
        description:
          "Info gempa bumi terbaru di Indonesia dari BMKG: lokasi, magnitudo, kedalaman, dan wilayah yang merasakan.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    },
    execute: async (_args, signal) => {
      const result = await nexrayGet("/information/gempa", {}, signal);
      return JSON.stringify(result);
    },
  },
  {
    label: "Mengambil jadwal sholat...",
    definition: {
      type: "function",
      function: {
        name: "prayer_times",
        description: "Jadwal sholat hari ini untuk kota di Indonesia.",
        parameters: {
          type: "object",
          properties: {
            kota: {
              type: "string",
              description: "Nama kota, contoh: Jakarta, Yogyakarta, Medan",
            },
          },
          required: ["kota"],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, signal) => {
      const kota = String(args.kota ?? "").trim();
      if (!kota) throw new Error("Nama kota kosong.");
      const result = await nexrayGet("/information/jadwalsholat", { kota }, signal);
      return JSON.stringify(result);
    },
  },
  {
    label: "Mengambil jadwal TV...",
    definition: {
      type: "function",
      function: {
        name: "tv_schedule",
        description:
          "Jadwal program TV stasiun Indonesia untuk hari ini. Channel yang umum: rcti, sctv, indosiar, trans7, trans, gtv, mnctv, antv, tvone, metrotv, kompas, jaktv.",
        parameters: {
          type: "object",
          properties: {
            channel: {
              type: "string",
              description: "Nama channel TV, huruf kecil tanpa spasi",
            },
          },
          required: ["channel"],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, signal) => {
      const channel = String(args.channel ?? "").toLowerCase().trim();
      if (!channel) throw new Error("Channel kosong.");
      const result = await nexrayGet<Array<{ time: string; program: string }>>(
        "/information/jadwaltv",
        { channel },
        signal,
      );
      return JSON.stringify({ channel, schedule: Array.isArray(result) ? result : [] });
    },
  },
  {
    label: "Mencari lirik...",
    definition: {
      type: "function",
      function: {
        name: "song_lyrics",
        description:
          "Cari lirik lagu berdasarkan judul dan/atau nama artis. Mengembalikan judul, artis, dan teks lirik lengkap.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Judul lagu, opsional dengan nama artis. Contoh: 'Bohemian Rhapsody Queen'",
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, signal) => {
      const query = String(args.query ?? "").trim();
      if (!query) throw new Error("Query kosong.");
      const result = await nexrayGet<{
        title?: string;
        artist?: string;
        lyrics?: { plain_lyrics?: string };
      }>("/search/lyrics", { q: query }, signal);
      const lyrics = String(result.lyrics?.plain_lyrics ?? "").slice(0, 4000);
      return JSON.stringify({
        title: result.title ?? null,
        artist: result.artist ?? null,
        lyrics,
      });
    },
  },
  {
    label: "Mencari resep...",
    definition: {
      type: "function",
      function: {
        name: "recipe_search",
        description:
          "Cari resep masakan (sebagian besar masakan Indonesia). Mengembalikan judul, waktu masak, bahan, dan langkah pembuatan.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Nama masakan, contoh: 'nasi goreng', 'rendang ayam'",
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, signal) => {
      const query = String(args.query ?? "").trim();
      if (!query) throw new Error("Query kosong.");
      const result = await nexrayGet<Array<Record<string, string>>>(
        "/search/resep",
        { q: query },
        signal,
      );
      const top = (Array.isArray(result) ? result : []).slice(0, 3).map((r) => ({
        judul: r.judul,
        waktu_masak: r.waktu_masak,
        hasil: r.hasil,
        tingkat_kesulitan: r.tingkat_kesulitan,
        bahan: r.bahan,
        langkah: String(r.langkah_langkah ?? "").slice(0, 1500),
      }));
      return JSON.stringify({ query, recipes: top });
    },
  },
  {
    label: "Mengambil berita...",
    definition: {
      type: "function",
      function: {
        name: "news_indonesia",
        description: `Berita terbaru dari media Indonesia. Pilih sumber: ${NEWS_SOURCES.join(", ")}. Default: cnn.`,
        parameters: {
          type: "object",
          properties: {
            source: {
              type: "string",
              enum: NEWS_SOURCES as unknown as string[],
              description: "Sumber berita",
            },
          },
          additionalProperties: false,
        },
      },
    },
    execute: async (args, signal) => {
      const requested = String(args.source ?? "cnn").toLowerCase();
      const src = (NEWS_SOURCES as readonly string[]).includes(requested) ? requested : "cnn";
      const result = await nexrayGet<Array<Record<string, string>>>(
        `/berita/${src}`,
        {},
        signal,
      );
      const items = (Array.isArray(result) ? result : []).slice(0, 8).map((r) => ({
        title: r.title,
        link: r.link,
        ...(r.category ? { category: r.category } : {}),
      }));
      return JSON.stringify({ source: src, items });
    },
  },
];

export function getToolDefinitions(): ToolDefinition[] {
  return TOOLS.map((t) => t.definition);
}

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.definition.function.name === name);
}
