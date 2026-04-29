import * as FileSystem from "expo-file-system/legacy";

const SANDBOX_FOLDER = "sandbox";

export function isFsAvailable(): boolean {
  return typeof FileSystem.documentDirectory === "string" && !!FileSystem.documentDirectory;
}

export function getSandboxRoot(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error(
      "Penyimpanan lokal tidak tersedia. Jalankan di Expo Go atau build native (bukan preview web).",
    );
  }
  return FileSystem.documentDirectory + SANDBOX_FOLDER + "/";
}

export type ResolvedPath = { absolute: string; relative: string };

const FORBIDDEN_CHARS = /[\\:*?"<>|]/;

export function resolveSandboxPath(userPath: string): ResolvedPath {
  const root = getSandboxRoot();
  let p = String(userPath ?? "").trim();
  p = p.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!p) {
    return { absolute: root.replace(/\/$/, ""), relative: "/" };
  }
  const parts = p.split("/");
  for (const seg of parts) {
    if (seg === "" || seg === "." || seg === "..") {
      throw new Error(`Segmen path tidak valid: "${seg}"`);
    }
    if (FORBIDDEN_CHARS.test(seg)) {
      throw new Error(`Karakter tidak diizinkan dalam path: "${seg}"`);
    }
  }
  const relative = "/" + parts.join("/");
  const absolute = root + parts.join("/");
  return { absolute, relative };
}

export async function ensureSandboxRoot(): Promise<void> {
  const root = getSandboxRoot();
  const info = await FileSystem.getInfoAsync(root);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  }
}

export async function ensureParentDir(absoluteFile: string): Promise<void> {
  const idx = absoluteFile.lastIndexOf("/");
  if (idx <= 0) return;
  const parent = absoluteFile.substring(0, idx);
  const info = await FileSystem.getInfoAsync(parent);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(parent, { intermediates: true });
  }
}

export { FileSystem };
