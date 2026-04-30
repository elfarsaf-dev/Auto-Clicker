import {
  FileSystem,
  ensureParentDir,
  ensureSandboxRoot,
  isFsAvailable,
  resolveSandboxPath,
} from "./agentFs";
import {
  type CustomTool,
  getCustomTool,
  listCustomTools,
} from "./customToolsStore";
import { buildToolDefinition, runHttpTool } from "./httpToolRunner";
import { nexrayGet } from "./nexray";
import { getSnippet, listSnippets } from "./snippetsStore";

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

export const BUILTIN_TOOLS: Tool[] = [
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
  {
    label: "Membuat gambar...",
    definition: {
      type: "function",
      function: {
        name: "generate_image",
        description:
          "Generate gambar dari prompt teks pakai AI (MagicStudio). Hasilnya disimpan di sandbox lokal app. PENTING: setelah dapat hasil, sertakan tag markdown ![deskripsi](file_uri) di balasan kamu agar gambar muncul di chat.",
        parameters: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Deskripsi gambar yang diinginkan, dalam bahasa Inggris akan kasih hasil terbaik",
            },
          },
          required: ["prompt"],
          additionalProperties: false,
        },
      },
    },
    execute: async (args) => {
      const prompt = String(args.prompt ?? "").trim();
      if (!prompt) throw new Error("Prompt kosong.");
      if (!isFsAvailable()) {
        throw new Error(
          "Penyimpanan lokal tidak tersedia di preview web. Pakai Expo Go atau build native untuk fitur ini.",
        );
      }
      await ensureSandboxRoot();
      const { absolute: imagesDirAbs, relative: imagesDirRel } = resolveSandboxPath("images");
      const dirInfo = await FileSystem.getInfoAsync(imagesDirAbs);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(imagesDirAbs, { intermediates: true });
      }
      const slug =
        prompt
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 30) || "image";
      const filename = `${slug}-${Date.now()}.jpg`;
      const filePath = `${imagesDirAbs}/${filename}`;
      const url = `https://api.nexray.eu.cc/ai/magicstudio?prompt=${encodeURIComponent(prompt)}`;
      const res = await FileSystem.downloadAsync(url, filePath);
      if (res.status !== 200) {
        throw new Error(`Gagal mengunduh gambar (HTTP ${res.status}).`);
      }
      return JSON.stringify({
        prompt,
        path: `${imagesDirRel}/${filename}`,
        uri: res.uri,
        markdown_to_show: `![${prompt}](${res.uri})`,
      });
    },
  },
  {
    label: "Menulis file...",
    definition: {
      type: "function",
      function: {
        name: "fs_write_file",
        description:
          "Tulis (atau timpa) file teks di sandbox lokal app. Folder parent dibuat otomatis. Gunakan untuk simpan catatan, kode, HTML, JSON, dll.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path relatif dari sandbox root, contoh: 'notes/todo.md', 'project/index.html'",
            },
            content: { type: "string", description: "Isi file (teks UTF-8)" },
          },
          required: ["path", "content"],
          additionalProperties: false,
        },
      },
    },
    execute: async (args) => {
      const path = String(args.path ?? "");
      const content = String(args.content ?? "");
      if (!path) throw new Error("Path kosong.");
      if (!isFsAvailable()) throw new Error("Penyimpanan lokal tidak tersedia di lingkungan ini.");
      await ensureSandboxRoot();
      const { absolute, relative } = resolveSandboxPath(path);
      await ensureParentDir(absolute);
      await FileSystem.writeAsStringAsync(absolute, content);
      return JSON.stringify({ ok: true, path: relative, bytes: content.length });
    },
  },
  {
    label: "Membaca file...",
    definition: {
      type: "function",
      function: {
        name: "fs_read_file",
        description: "Baca isi file teks dari sandbox lokal app.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path relatif dari sandbox root" },
          },
          required: ["path"],
          additionalProperties: false,
        },
      },
    },
    execute: async (args) => {
      const path = String(args.path ?? "");
      if (!path) throw new Error("Path kosong.");
      if (!isFsAvailable()) throw new Error("Penyimpanan lokal tidak tersedia di lingkungan ini.");
      await ensureSandboxRoot();
      const { absolute, relative } = resolveSandboxPath(path);
      const info = await FileSystem.getInfoAsync(absolute);
      if (!info.exists) throw new Error(`File tidak ditemukan: ${relative}`);
      if (info.isDirectory) throw new Error(`${relative} adalah folder, bukan file.`);
      const content = await FileSystem.readAsStringAsync(absolute);
      const max = 8000;
      const truncated = content.length > max;
      return JSON.stringify({
        path: relative,
        bytes: content.length,
        content: truncated ? content.slice(0, max) + "\n... [truncated]" : content,
        truncated,
      });
    },
  },
  {
    label: "Melihat folder...",
    definition: {
      type: "function",
      function: {
        name: "fs_list_folder",
        description:
          "Daftar isi folder di sandbox lokal app. Path kosong = root sandbox. Mengembalikan nama, tipe (file/folder), dan ukuran.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path folder relatif, kosongkan untuk root" },
          },
          additionalProperties: false,
        },
      },
    },
    execute: async (args) => {
      if (!isFsAvailable()) throw new Error("Penyimpanan lokal tidak tersedia di lingkungan ini.");
      await ensureSandboxRoot();
      const { absolute, relative } = resolveSandboxPath(String(args.path ?? ""));
      const info = await FileSystem.getInfoAsync(absolute);
      if (!info.exists) throw new Error(`Folder tidak ada: ${relative}`);
      if (!info.isDirectory) throw new Error(`${relative} adalah file, bukan folder.`);
      const entries = await FileSystem.readDirectoryAsync(absolute);
      const detailed = await Promise.all(
        entries.map(async (name) => {
          const full = `${absolute.replace(/\/$/, "")}/${name}`;
          const i = await FileSystem.getInfoAsync(full);
          return {
            name,
            type: i.isDirectory ? "folder" : "file",
            size: i.isDirectory ? null : (i as { size?: number }).size ?? null,
          };
        }),
      );
      return JSON.stringify({ path: relative, entries: detailed });
    },
  },
  {
    label: "Membuat folder...",
    definition: {
      type: "function",
      function: {
        name: "fs_create_folder",
        description: "Buat folder baru (termasuk parent folder otomatis) di sandbox lokal app.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path folder relatif" },
          },
          required: ["path"],
          additionalProperties: false,
        },
      },
    },
    execute: async (args) => {
      const path = String(args.path ?? "");
      if (!path) throw new Error("Path kosong.");
      if (!isFsAvailable()) throw new Error("Penyimpanan lokal tidak tersedia di lingkungan ini.");
      await ensureSandboxRoot();
      const { absolute, relative } = resolveSandboxPath(path);
      await FileSystem.makeDirectoryAsync(absolute, { intermediates: true });
      return JSON.stringify({ ok: true, path: relative });
    },
  },
  {
    label: "Menghapus file...",
    definition: {
      type: "function",
      function: {
        name: "fs_delete",
        description: "Hapus file atau folder (rekursif kalau folder) di sandbox lokal app.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path file/folder relatif" },
          },
          required: ["path"],
          additionalProperties: false,
        },
      },
    },
    execute: async (args) => {
      const path = String(args.path ?? "");
      if (!path) throw new Error("Path kosong.");
      if (path.replace(/^\/+/, "").replace(/\/+$/, "") === "") {
        throw new Error("Tidak boleh menghapus root sandbox.");
      }
      if (!isFsAvailable()) throw new Error("Penyimpanan lokal tidak tersedia di lingkungan ini.");
      await ensureSandboxRoot();
      const { absolute, relative } = resolveSandboxPath(path);
      await FileSystem.deleteAsync(absolute, { idempotent: true });
      return JSON.stringify({ ok: true, deleted: relative });
    },
  },
  {
    label: "Mencari snippet...",
    definition: {
      type: "function",
      function: {
        name: "list_snippets",
        description:
          "Daftar snippet kode contoh di library lokal (campuran bawaan Joko UI + buatan user). Gunakan SEBELUM menulis kode dari nol untuk komponen UI umum. Tag bawaan: 'joko-ui' + kategori (navbars, sidebars, breadcrumbs, avatars, forms, buttons, cards, loaders, badges, alerts, progress, skeleton, table). Filter pakai tag kategori (mis: tag='buttons') buat lihat semua tombol Tailwind yang ada. Kembalikan nama, judul, desc, lang, tag. Ambil isi pakai get_snippet sebelum bikin versi sendiri.",
        parameters: {
          type: "object",
          properties: {
            lang: {
              type: "string",
              description: "Filter opsional bahasa (mis: 'html', 'css', 'js', 'tsx').",
            },
            tag: {
              type: "string",
              description: "Filter opsional tag (mis: 'button', 'card', 'form').",
            },
          },
          additionalProperties: false,
        },
      },
    },
    execute: async (args) => {
      const items = await listSnippets();
      const lang = (args.lang ? String(args.lang) : "").trim().toLowerCase();
      const tag = (args.tag ? String(args.tag) : "").trim().toLowerCase();
      const filtered = items.filter((s) => {
        if (lang && s.lang.toLowerCase() !== lang) return false;
        if (tag && !s.tags.some((t) => t.toLowerCase() === tag)) return false;
        return true;
      });
      return JSON.stringify({
        total: filtered.length,
        snippets: filtered.map((s) => ({
          name: s.name,
          title: s.title,
          desc: s.desc,
          lang: s.lang,
          tags: s.tags,
        })),
        hint:
          filtered.length === 0
            ? "Tidak ada snippet yang cocok. Tulis kode dari pengetahuanmu sendiri."
            : "Panggil get_snippet({name}) untuk lihat kode lengkap.",
      });
    },
  },
  {
    label: "Mengambil snippet...",
    definition: {
      type: "function",
      function: {
        name: "get_snippet",
        description:
          "Ambil isi kode lengkap dari satu snippet di library lokal user. Pakai NAMA persis dari hasil list_snippets. Pakai snippet ini sebagai dasar/contoh saat menulis kode untuk user.",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Nama snippet (slug, contoh: 'tombol-primer').",
            },
          },
          required: ["name"],
          additionalProperties: false,
        },
      },
    },
    execute: async (args) => {
      const name = String(args.name ?? "").trim();
      if (!name) throw new Error("Nama snippet kosong.");
      const snippet = await getSnippet(name);
      if (!snippet) {
        return JSON.stringify({
          error: `Snippet "${name}" tidak ditemukan. Coba list_snippets dulu untuk lihat daftar lengkap.`,
        });
      }
      return JSON.stringify({
        name: snippet.name,
        title: snippet.title,
        desc: snippet.desc,
        lang: snippet.lang,
        tags: snippet.tags,
        code: snippet.code,
      });
    },
  },
];

function customToolToTool(ct: CustomTool): Tool {
  return {
    label: ct.label || `Menjalankan ${ct.name}...`,
    definition: buildToolDefinition(ct),
    execute: (args, signal) => runHttpTool(ct, args, signal),
  };
}

const BUILTIN_NAMES = new Set(BUILTIN_TOOLS.map((t) => t.definition.function.name));

export async function getAllTools(): Promise<Tool[]> {
  let custom: CustomTool[] = [];
  try {
    custom = await listCustomTools();
  } catch {
    custom = [];
  }
  const filtered = custom.filter((c) => !BUILTIN_NAMES.has(c.name));
  return [...BUILTIN_TOOLS, ...filtered.map(customToolToTool)];
}

export async function getToolDefinitions(): Promise<ToolDefinition[]> {
  const all = await getAllTools();
  return all.map((t) => t.definition);
}

export async function findTool(name: string): Promise<Tool | undefined> {
  const builtin = BUILTIN_TOOLS.find((t) => t.definition.function.name === name);
  if (builtin) return builtin;
  try {
    const ct = await getCustomTool(name);
    if (ct) return customToolToTool(ct);
  } catch {
    // ignore
  }
  return undefined;
}

export async function getCustomToolsBrief(): Promise<
  Array<{ name: string; description: string }>
> {
  try {
    const list = await listCustomTools();
    return list
      .filter((c) => !BUILTIN_NAMES.has(c.name))
      .map((c) => ({ name: c.name, description: c.description }));
  } catch {
    return [];
  }
}
