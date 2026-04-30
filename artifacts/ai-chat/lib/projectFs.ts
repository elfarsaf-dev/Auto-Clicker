import {
  FileSystem,
  ensureSandboxRoot,
  getSandboxRoot,
  isFsAvailable,
} from "@/lib/agentFs";

export type FileNode = {
  name: string;
  relativePath: string;
  absolutePath: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: number;
};

const FORBIDDEN = /[\\/:*?"<>|]/;

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Nama tidak boleh kosong.";
  if (trimmed === "." || trimmed === "..") return "Nama tidak valid.";
  if (FORBIDDEN.test(trimmed))
    return 'Nama tidak boleh mengandung: \\ / : * ? " < > |';
  if (trimmed.length > 80) return "Nama maksimal 80 karakter.";
  return null;
}

function joinPath(...segs: string[]): string {
  return segs
    .map((s) => s.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

export async function ensureSandbox(): Promise<void> {
  await ensureSandboxRoot();
}

export async function listProjects(): Promise<FileNode[]> {
  await ensureSandbox();
  const root = getSandboxRoot();
  const names = await FileSystem.readDirectoryAsync(root);
  const out: FileNode[] = [];
  for (const name of names) {
    const abs = root + name;
    const info = await FileSystem.getInfoAsync(abs);
    if (info.exists && info.isDirectory) {
      out.push({
        name,
        relativePath: "/" + name,
        absolutePath: abs,
        isDirectory: true,
        modifiedAt:
          "modificationTime" in info ? info.modificationTime * 1000 : undefined,
      });
    }
  }
  out.sort(
    (a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0) || a.name.localeCompare(b.name),
  );
  return out;
}

export async function createProject(name: string): Promise<FileNode> {
  const err = validateName(name);
  if (err) throw new Error(err);
  await ensureSandbox();
  const root = getSandboxRoot();
  const abs = root + name.trim();
  const info = await FileSystem.getInfoAsync(abs);
  if (info.exists) throw new Error(`Projek "${name}" sudah ada.`);
  await FileSystem.makeDirectoryAsync(abs, { intermediates: true });
  return {
    name: name.trim(),
    relativePath: "/" + name.trim(),
    absolutePath: abs,
    isDirectory: true,
    modifiedAt: Date.now(),
  };
}

export async function deleteProject(name: string): Promise<void> {
  const root = getSandboxRoot();
  await FileSystem.deleteAsync(root + name, { idempotent: true });
}

export async function renameProject(oldName: string, newName: string): Promise<void> {
  const err = validateName(newName);
  if (err) throw new Error(err);
  const root = getSandboxRoot();
  const from = root + oldName;
  const to = root + newName.trim();
  const info = await FileSystem.getInfoAsync(to);
  if (info.exists) throw new Error(`"${newName}" sudah ada.`);
  await FileSystem.moveAsync({ from, to });
}

function projectRoot(project: string): string {
  return getSandboxRoot() + project + "/";
}

export async function listFiles(
  project: string,
  subPath: string = "",
): Promise<FileNode[]> {
  const root = projectRoot(project);
  const abs = root + (subPath ? joinPath(subPath) + "/" : "");
  const info = await FileSystem.getInfoAsync(abs);
  if (!info.exists) return [];
  const names = await FileSystem.readDirectoryAsync(abs);
  const out: FileNode[] = [];
  for (const name of names) {
    const childAbs = abs + name;
    const childInfo = await FileSystem.getInfoAsync(childAbs);
    if (!childInfo.exists) continue;
    out.push({
      name,
      relativePath: "/" + joinPath(subPath, name),
      absolutePath: childAbs,
      isDirectory: childInfo.isDirectory,
      size:
        !childInfo.isDirectory && "size" in childInfo
          ? childInfo.size
          : undefined,
      modifiedAt:
        "modificationTime" in childInfo
          ? childInfo.modificationTime * 1000
          : undefined,
    });
  }
  out.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

export async function readFile(project: string, path: string): Promise<string> {
  const root = projectRoot(project);
  const abs = root + joinPath(path);
  return FileSystem.readAsStringAsync(abs);
}

export async function writeFile(
  project: string,
  path: string,
  content: string,
): Promise<void> {
  const root = projectRoot(project);
  const abs = root + joinPath(path);
  const idx = abs.lastIndexOf("/");
  if (idx > 0) {
    const parent = abs.substring(0, idx);
    const info = await FileSystem.getInfoAsync(parent);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(parent, { intermediates: true });
    }
  }
  await FileSystem.writeAsStringAsync(abs, content);
}

export async function createFile(
  project: string,
  path: string,
  initialContent: string = "",
): Promise<void> {
  const segs = path.split("/").filter(Boolean);
  for (const seg of segs) {
    const err = validateName(seg);
    if (err) throw new Error(err);
  }
  const root = projectRoot(project);
  const abs = root + joinPath(path);
  const info = await FileSystem.getInfoAsync(abs);
  if (info.exists) throw new Error(`File "${path}" sudah ada.`);
  await writeFile(project, path, initialContent);
}

export async function createFolder(
  project: string,
  path: string,
): Promise<void> {
  const segs = path.split("/").filter(Boolean);
  for (const seg of segs) {
    const err = validateName(seg);
    if (err) throw new Error(err);
  }
  const root = projectRoot(project);
  const abs = root + joinPath(path);
  await FileSystem.makeDirectoryAsync(abs, { intermediates: true });
}

export async function deleteEntry(project: string, path: string): Promise<void> {
  const root = projectRoot(project);
  const abs = root + joinPath(path);
  await FileSystem.deleteAsync(abs, { idempotent: true });
}

export async function renameEntry(
  project: string,
  oldPath: string,
  newName: string,
): Promise<void> {
  const err = validateName(newName);
  if (err) throw new Error(err);
  const root = projectRoot(project);
  const from = root + joinPath(oldPath);
  const idx = oldPath.lastIndexOf("/");
  const parent = idx > 0 ? oldPath.substring(0, idx) : "";
  const to = root + joinPath(parent, newName);
  const info = await FileSystem.getInfoAsync(to);
  if (info.exists) throw new Error(`"${newName}" sudah ada.`);
  await FileSystem.moveAsync({ from, to });
}

export async function findEntryFile(
  project: string,
): Promise<{ path: string; mime: string } | null> {
  const candidates = ["index.html", "index.htm", "main.html"];
  for (const c of candidates) {
    try {
      const root = projectRoot(project);
      const info = await FileSystem.getInfoAsync(root + c);
      if (info.exists && !info.isDirectory) {
        return { path: c, mime: "text/html" };
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export async function readAllProjectFiles(
  project: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (sub: string) => {
    const items = await listFiles(project, sub);
    for (const item of items) {
      if (item.isDirectory) {
        await walk(joinPath(sub, item.name));
      } else if (item.size !== undefined && item.size < 2 * 1024 * 1024) {
        try {
          const txt = await readFile(project, joinPath(sub, item.name));
          out.set(joinPath(sub, item.name), txt);
        } catch {
          // skip binary
        }
      }
    }
  };
  await walk("");
  return out;
}

export function formatSize(bytes?: number): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

export function getFileExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.substring(idx + 1).toLowerCase() : "";
}

export function isPreviewable(project: string): Promise<boolean> {
  return findEntryFile(project).then((f) => f !== null);
}

export function fsAvailable(): boolean {
  return isFsAvailable();
}
