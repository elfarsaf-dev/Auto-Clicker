import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { useColors } from "@/hooks/useColors";
import {
  findEntryFile,
  getFileExt,
  readAllProjectFiles,
} from "@/lib/projectFs";

function inferMime(ext: string): string {
  switch (ext) {
    case "html":
    case "htm":
      return "text/html";
    case "css":
      return "text/css";
    case "js":
      return "application/javascript";
    case "json":
      return "application/json";
    case "svg":
      return "image/svg+xml";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "text/plain";
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildBundledHtml(
  files: Map<string, string>,
  entry: string,
): string {
  const html = files.get(entry) || "";
  let out = html;

  out = out.replace(
    /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
    (match, href) => {
      const key = resolveRelative(entry, href);
      const css = files.get(key);
      if (css === undefined) return match;
      return `<style data-src="${escapeHtml(href)}">${css}</style>`;
    },
  );

  out = out.replace(
    /<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*>/gi,
    (match, href) => {
      const key = resolveRelative(entry, href);
      const css = files.get(key);
      if (css === undefined) return match;
      return `<style data-src="${escapeHtml(href)}">${css}</style>`;
    },
  );

  out = out.replace(
    /<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
    (match, src) => {
      if (/^(https?:|\/\/)/i.test(src)) return match;
      const key = resolveRelative(entry, src);
      const js = files.get(key);
      if (js === undefined) return match;
      return `<script data-src="${escapeHtml(src)}">${js}</script>`;
    },
  );

  out = out.replace(
    /(<img[^>]*\ssrc=["'])([^"']+)(["'])/gi,
    (match, pre, src, post) => {
      if (/^(https?:|data:|\/\/)/i.test(src)) return match;
      const key = resolveRelative(entry, src);
      const data = files.get(key);
      if (data === undefined) return match;
      const mime = inferMime(getFileExt(key));
      try {
        const b64 =
          typeof btoa === "function"
            ? btoa(unescape(encodeURIComponent(data)))
            : Buffer.from(data, "utf-8").toString("base64");
        return `${pre}data:${mime};base64,${b64}${post}`;
      } catch {
        return match;
      }
    },
  );

  return out;
}

function resolveRelative(from: string, to: string): string {
  if (to.startsWith("/")) return to.slice(1);
  const fromParts = from.split("/").slice(0, -1);
  const toParts = to.split("/");
  for (const seg of toParts) {
    if (seg === "..") fromParts.pop();
    else if (seg === ".") continue;
    else fromParts.push(seg);
  }
  return fromParts.join("/");
}

export default function PreviewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ project: string; path?: string }>();
  const project = decodeURIComponent(params.project || "");
  const explicitPath = params.path ? decodeURIComponent(params.path) : "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [html, setHtml] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let entryPath = explicitPath;
        if (!entryPath) {
          const entry = await findEntryFile(project);
          if (!entry) {
            setError(
              "Tidak ada file index.html di projek ini. Buat dulu file index.html.",
            );
            setLoading(false);
            return;
          }
          entryPath = entry.path;
        }
        const files = await readAllProjectFiles(project);
        const bundled = buildBundledHtml(files, entryPath);
        setHtml(bundled);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [project, explicitPath, reloadKey]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.border, backgroundColor: colors.background },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.title, { color: colors.foreground }]}
            numberOfLines={1}
          >
            Preview
          </Text>
          <Text
            style={[styles.subtitle, { color: colors.mutedForeground }]}
            numberOfLines={1}
          >
            {project}
            {explicitPath ? ` · ${explicitPath}` : ""}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setReloadKey((k) => k + 1);
          }}
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="refresh-cw" size={16} color={colors.foreground} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.empty}>
          <Feather name="alert-circle" size={32} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.foreground }]}>
            {error}
          </Text>
        </View>
      ) : (
        <WebView
          key={reloadKey}
          originWhitelist={["*"]}
          source={{ html, baseUrl: "" }}
          style={{ flex: 1, backgroundColor: "#fff" }}
          javaScriptEnabled
          domStorageEnabled
          scalesPageToFit
          mixedContentMode="always"
          allowFileAccess
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: Platform.OS === "android" ? 8 : 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 10,
  },
  errorText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
