import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  type Snippet,
  getSnippet,
  normalizeName,
  saveSnippet,
  userSnippetExists,
  validateName,
} from "@/lib/snippetsStore";

const LANG_PRESETS = ["html", "css", "js", "ts", "tsx", "json", "md", "text"];

export default function SnippetEditor() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ name?: string }>();
  const rawName = String(params.name ?? "");
  const isNew = rawName === "new" || !rawName;

  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [lang, setLang] = useState("html");
  const [tagsStr, setTagsStr] = useState("");
  const [code, setCode] = useState("");
  const [loaded, setLoaded] = useState(isNew);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const initial = useRef<Snippet | null>(null);

  useEffect(() => {
    if (isNew) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snippet = await getSnippet(rawName);
        if (cancelled) return;
        if (!snippet) {
          setError(`Snippet "${rawName}" tidak ditemukan.`);
          return;
        }
        initial.current = snippet;
        setTitle(snippet.title);
        setName(snippet.name);
        setDesc(snippet.desc);
        setLang(snippet.lang);
        setTagsStr(snippet.tags.join(", "));
        setCode(snippet.code);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, rawName]);

  const markDirty = useCallback(() => setDirty(true), []);

  const handleSave = async () => {
    const finalTitle = title.trim();
    if (!finalTitle) {
      Alert.alert("Validasi", "Judul snippet wajib diisi.");
      return;
    }
    if (!code.trim()) {
      Alert.alert("Validasi", "Kode snippet kosong.");
      return;
    }
    let finalName = name.trim();
    if (isNew) {
      finalName = normalizeName(finalName || finalTitle);
    } else {
      finalName = initial.current?.name ?? rawName;
    }
    if (!validateName(finalName)) {
      Alert.alert(
        "Validasi",
        "Nama harus huruf/angka/dash, maks 64 karakter, contoh: 'tombol-primer'.",
      );
      return;
    }
    if (isNew && (await userSnippetExists(finalName))) {
      Alert.alert("Sudah ada", `Snippet "${finalName}" sudah ada di koleksi kamu.`);
      return;
    }
    const tags = tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await saveSnippet({
        name: finalName,
        title: finalTitle,
        desc: desc.trim(),
        lang: lang.trim() || "text",
        tags,
        code,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDirty(false);
      if (isNew) {
        router.replace(`/snippets/${encodeURIComponent(finalName)}`);
      } else {
        router.back();
      }
    } catch (e) {
      Alert.alert("Gagal menyimpan", e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    const beforeRemove = (e: { preventDefault: () => void; data: { action: unknown } }) => {
      if (!dirty) return;
      e.preventDefault();
      Alert.alert("Buang perubahan?", "Ada perubahan yang belum disimpan.", [
        { text: "Tetap di sini", style: "cancel" },
        {
          text: "Buang",
          style: "destructive",
          onPress: () => navigation.dispatch(e.data.action as never),
        },
      ]);
    };
    const sub = navigation.addListener("beforeRemove" as never, beforeRemove as never);
    return sub;
  }, [dirty, navigation]);

  if (error) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          },
        ]}
      >
        <Feather name="alert-circle" size={32} color={colors.destructive} />
        <Text
          style={{
            color: colors.foreground,
            fontFamily: "Inter_600SemiBold",
            marginTop: 8,
          }}
        >
          {error}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.8 : 1,
              marginTop: 12,
            },
          ]}
        >
          <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>
            Kembali
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!loaded) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
            alignItems: "center",
            justifyContent: "center",
          },
        ]}
      >
        <Text style={{ color: colors.mutedForeground }}>Memuat…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ paddingTop: insets.top }}>
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
              {isNew ? "Snippet baru" : title || rawName}
            </Text>
            {dirty && (
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                Belum disimpan
              </Text>
            )}
          </View>
          <Pressable
            onPress={handleSave}
            hitSlop={8}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="check" size={18} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 14,
          paddingBottom: insets.bottom + 24,
          gap: 14,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Field label="Judul">
          <TextInput
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              markDirty();
            }}
            placeholder="Tombol primer biru"
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
          />
        </Field>

        {isNew && (
          <Field label="Nama (slug)" hint="Otomatis dari judul kalau kosong. Hanya huruf/angka/dash.">
            <TextInput
              value={name}
              onChangeText={(v) => {
                setName(v);
                markDirty();
              }}
              placeholder="tombol-primer"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.input,
                {
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                  color: colors.foreground,
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                },
              ]}
            />
          </Field>
        )}

        <Field label="Deskripsi singkat" hint="Bantu AI tau kapan harus pakai snippet ini.">
          <TextInput
            value={desc}
            onChangeText={(v) => {
              setDesc(v);
              markDirty();
            }}
            placeholder="Contoh: Tombol biru bulat dengan hover state"
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                borderColor: colors.border,
                color: colors.foreground,
                minHeight: 60,
                textAlignVertical: "top",
              },
            ]}
          />
        </Field>

        <Field label="Bahasa">
          <View style={styles.chipsRow}>
            {LANG_PRESETS.map((l) => {
              const active = lang === l;
              return (
                <Pressable
                  key={l}
                  onPress={() => {
                    setLang(l);
                    markDirty();
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: active ? colors.primary : colors.secondary,
                      borderColor: active ? colors.primary : colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active
                          ? colors.primaryForeground
                          : colors.secondaryForeground,
                      },
                    ]}
                  >
                    {l}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Field label="Tags" hint="Pisah pakai koma. Contoh: button, primary, ui">
          <TextInput
            value={tagsStr}
            onChangeText={(v) => {
              setTagsStr(v);
              markDirty();
            }}
            placeholder="button, primary, ui"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
          />
        </Field>

        <Field label="Kode">
          <TextInput
            value={code}
            onChangeText={(v) => {
              setCode(v);
              markDirty();
            }}
            placeholder={"<button class=\"btn\">Klik</button>"}
            placeholderTextColor={colors.mutedForeground}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            style={[
              styles.codeInput,
              {
                backgroundColor: colors.input,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
          />
        </Field>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      {children}
      {hint && (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          {hint}
        </Text>
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
    gap: 12,
  },
  title: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtn: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
  },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  codeInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    minHeight: 240,
    textAlignVertical: "top",
  },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
