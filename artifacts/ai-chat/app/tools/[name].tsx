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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  type CustomTool,
  type ParamDef,
  type ParamType,
  customToolExists,
  emptyCustomTool,
  getCustomTool,
  normalizeToolName,
  saveCustomTool,
  validateToolName,
} from "@/lib/customToolsStore";
import { runHttpTool } from "@/lib/httpToolRunner";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const BODY_TYPES = ["none", "json", "form", "text"] as const;
const PARAM_TYPES: ParamType[] = ["string", "number", "integer", "boolean"];
const RESP_TYPES = ["json", "text"] as const;

type KV = { key: string; value: string };

function recordToKV(rec: Record<string, string>): KV[] {
  return Object.entries(rec).map(([key, value]) => ({ key, value }));
}

function kvToRecord(kvs: KV[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of kvs) {
    const k = kv.key.trim();
    if (!k) continue;
    out[k] = kv.value;
  }
  return out;
}

export default function ToolEditor() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ name?: string }>();
  const rawName = String(params.name ?? "");
  const isNew = rawName === "new" || !rawName;

  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [parameters, setParameters] = useState<ParamDef[]>([]);
  const [method, setMethod] = useState<(typeof METHODS)[number]>("GET");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState<KV[]>([]);
  const [query, setQuery] = useState<KV[]>([]);
  const [bodyType, setBodyType] = useState<(typeof BODY_TYPES)[number]>("none");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [timeoutMs, setTimeoutMs] = useState("15000");
  const [respType, setRespType] = useState<(typeof RESP_TYPES)[number]>("json");
  const [pickStr, setPickStr] = useState("");
  const [maxCharsStr, setMaxCharsStr] = useState("");

  const [loaded, setLoaded] = useState(isNew);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const initial = useRef<CustomTool | null>(null);

  useEffect(() => {
    if (isNew) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const tool = await getCustomTool(rawName);
        if (cancelled) return;
        if (!tool) {
          setError(`Tool "${rawName}" tidak ditemukan.`);
          return;
        }
        initial.current = tool;
        setName(tool.name);
        setLabel(tool.label);
        setDescription(tool.description);
        setParameters(tool.parameters);
        setMethod(tool.request.method);
        setUrl(tool.request.url);
        setHeaders(recordToKV(tool.request.headers));
        setQuery(recordToKV(tool.request.query));
        setBodyType(tool.request.bodyType);
        setBodyTemplate(tool.request.bodyTemplate);
        setTimeoutMs(String(tool.request.timeoutMs));
        setRespType(tool.response.type);
        setPickStr((tool.response.pick ?? []).join(", "));
        setMaxCharsStr(tool.response.maxChars ? String(tool.response.maxChars) : "");
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

  const buildToolFromForm = useCallback((): CustomTool => {
    const finalName = isNew
      ? normalizeToolName(name || "tool_baru")
      : initial.current?.name ?? rawName;
    const t = Number(timeoutMs);
    const m = Number(maxCharsStr);
    return {
      name: finalName,
      label: label.trim() || `Menjalankan ${finalName}...`,
      description: description.trim(),
      parameters,
      request: {
        method,
        url: url.trim(),
        headers: kvToRecord(headers),
        query: kvToRecord(query),
        bodyType,
        bodyTemplate,
        timeoutMs: Number.isFinite(t) && t >= 1000 ? Math.min(60000, Math.floor(t)) : 15000,
      },
      response: {
        type: respType,
        ...(pickStr.trim()
          ? {
              pick: pickStr
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            }
          : {}),
        ...(Number.isFinite(m) && m > 0 ? { maxChars: Math.floor(m) } : {}),
      },
    };
  }, [
    isNew,
    name,
    rawName,
    label,
    description,
    parameters,
    method,
    url,
    headers,
    query,
    bodyType,
    bodyTemplate,
    timeoutMs,
    respType,
    pickStr,
    maxCharsStr,
  ]);

  const handleSave = async () => {
    if (!description.trim()) {
      Alert.alert("Validasi", "Deskripsi wajib — ini yang AI baca untuk tahu kapan pakai tool ini.");
      return;
    }
    if (!url.trim()) {
      Alert.alert("Validasi", "URL request wajib diisi.");
      return;
    }
    const tool = buildToolFromForm();
    if (!validateToolName(tool.name)) {
      Alert.alert(
        "Validasi",
        "Nama tool harus diawali huruf kecil, hanya huruf/angka/_ , maks 48 karakter.",
      );
      return;
    }
    if (isNew && (await customToolExists(tool.name))) {
      Alert.alert("Sudah ada", `Tool "${tool.name}" sudah ada.`);
      return;
    }
    try {
      await saveCustomTool(tool);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDirty(false);
      if (isNew) {
        router.replace(`/tools/${encodeURIComponent(tool.name)}`);
      } else {
        router.back();
      }
    } catch (e) {
      Alert.alert("Gagal menyimpan", e instanceof Error ? e.message : String(e));
    }
  };

  const handleTest = async () => {
    if (!url.trim()) {
      Alert.alert("Test", "URL belum diisi.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const tool = buildToolFromForm();
      const sampleArgs: Record<string, unknown> = {};
      for (const p of parameters) {
        if (p.enumValues && p.enumValues.length > 0) {
          sampleArgs[p.name] = p.enumValues[0];
          continue;
        }
        switch (p.type) {
          case "number":
          case "integer":
            sampleArgs[p.name] = 1;
            break;
          case "boolean":
            sampleArgs[p.name] = true;
            break;
          default:
            sampleArgs[p.name] = "test";
        }
      }
      const result = await runHttpTool(tool, sampleArgs);
      setTestResult(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestResult(JSON.stringify({ error: msg }, null, 2));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setTesting(false);
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

  const updateParam = (idx: number, patch: Partial<ParamDef>) => {
    setParameters((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
    markDirty();
  };

  const addParam = () => {
    setParameters((prev) => [
      ...prev,
      { name: `param${prev.length + 1}`, type: "string", description: "", required: false },
    ]);
    markDirty();
  };

  const removeParam = (idx: number) => {
    setParameters((prev) => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  const updateKV = (
    setter: React.Dispatch<React.SetStateAction<KV[]>>,
    idx: number,
    patch: Partial<KV>,
  ) => {
    setter((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
    markDirty();
  };
  const addKV = (setter: React.Dispatch<React.SetStateAction<KV[]>>) => {
    setter((prev) => [...prev, { key: "", value: "" }]);
    markDirty();
  };
  const removeKV = (setter: React.Dispatch<React.SetStateAction<KV[]>>, idx: number) => {
    setter((prev) => prev.filter((_, i) => i !== idx));
    markDirty();
  };

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
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1, marginTop: 12 },
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
          { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
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
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
              {isNew ? "Tool baru" : name || rawName}
            </Text>
            {dirty && (
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                Belum disimpan
              </Text>
            )}
          </View>
          <Pressable
            onPress={handleTest}
            disabled={testing}
            hitSlop={8}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                backgroundColor: colors.card,
                opacity: testing ? 0.5 : pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather name="play" size={18} color={colors.foreground} />
          </Pressable>
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
          gap: 18,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Section title="Identitas">
          {isNew && (
            <Field
              label="Nama (function name)"
              hint="Otomatis dari isi kalau kosong. Hanya huruf kecil/angka/_, contoh: github_user."
            >
              <TextInput
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  markDirty();
                }}
                placeholder="github_user"
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
          <Field
            label="Deskripsi (untuk AI)"
            hint="Jelaskan fungsinya — AI baca ini untuk memutuskan kapan memanggil tool."
          >
            <TextInput
              value={description}
              onChangeText={(v) => {
                setDescription(v);
                markDirty();
              }}
              placeholder="Cek profil publik user GitHub berdasarkan username."
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
          <Field label="Label status (opsional)" hint="Tampil saat tool jalan, contoh: 'Mengambil data GitHub...'">
            <TextInput
              value={label}
              onChangeText={(v) => {
                setLabel(v);
                markDirty();
              }}
              placeholder="Mengambil data GitHub..."
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
        </Section>

        <Section
          title="Parameter"
          right={
            <Pressable
              onPress={addParam}
              hitSlop={6}
              style={({ pressed }) => [
                styles.smallBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="plus" size={12} color={colors.primaryForeground} />
              <Text style={[styles.smallBtnText, { color: colors.primaryForeground }]}>
                Tambah
              </Text>
            </Pressable>
          }
        >
          <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: -4 }]}>
            Argumen yang AI kirim. Pakai placeholder {"{nama}"} di URL/headers/query/body untuk
            menyisipkan nilainya.
          </Text>
          {parameters.length === 0 && (
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Belum ada parameter. Tool tetap bisa jalan tanpa parameter.
            </Text>
          )}
          {parameters.map((p, idx) => (
            <View
              key={idx}
              style={[
                styles.paramCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={p.name}
                  onChangeText={(v) => updateParam(idx, { name: v })}
                  placeholder="nama"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[
                    styles.input,
                    {
                      flex: 1,
                      backgroundColor: colors.input,
                      borderColor: colors.border,
                      color: colors.foreground,
                      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                    },
                  ]}
                />
                <Pressable
                  onPress={() => removeParam(idx)}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.iconBtn,
                    {
                      backgroundColor: colors.secondary,
                      opacity: pressed ? 0.7 : 1,
                      width: 40,
                      height: 40,
                    },
                  ]}
                >
                  <Feather name="trash-2" size={14} color={colors.destructive} />
                </Pressable>
              </View>
              <View style={styles.chipsRow}>
                {PARAM_TYPES.map((t) => {
                  const active = p.type === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => updateParam(idx, { type: t })}
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
                        {t}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={p.description}
                onChangeText={(v) => updateParam(idx, { description: v })}
                placeholder="Deskripsi (untuk AI)"
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
              <TextInput
                value={(p.enumValues ?? []).join(", ")}
                onChangeText={(v) =>
                  updateParam(idx, {
                    enumValues: v
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="enum (opsional, pisah koma)"
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
              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: colors.foreground }]}>
                  Wajib diisi
                </Text>
                <Switch
                  value={p.required}
                  onValueChange={(v) => updateParam(idx, { required: v })}
                />
              </View>
            </View>
          ))}
        </Section>

        <Section title="Request">
          <Field label="Method">
            <View style={styles.chipsRow}>
              {METHODS.map((m) => {
                const active = method === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => {
                      setMethod(m);
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
                      {m}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>
          <Field label="URL" hint="Pakai {nama_param} untuk substitusi. Contoh: https://api.github.com/users/{username}">
            <TextInput
              value={url}
              onChangeText={(v) => {
                setUrl(v);
                markDirty();
              }}
              placeholder="https://api.example.com/path/{id}"
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

          <KVList
            title="Headers"
            items={headers}
            onAdd={() => addKV(setHeaders)}
            onUpdate={(i, patch) => updateKV(setHeaders, i, patch)}
            onRemove={(i) => removeKV(setHeaders, i)}
            keyPlaceholder="Authorization"
            valuePlaceholder="Bearer {token}"
          />

          <KVList
            title="Query string"
            items={query}
            onAdd={() => addKV(setQuery)}
            onUpdate={(i, patch) => updateKV(setQuery, i, patch)}
            onRemove={(i) => removeKV(setQuery, i)}
            keyPlaceholder="q"
            valuePlaceholder="{query}"
          />

          <Field label="Body type">
            <View style={styles.chipsRow}>
              {BODY_TYPES.map((b) => {
                const active = bodyType === b;
                return (
                  <Pressable
                    key={b}
                    onPress={() => {
                      setBodyType(b);
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
                      {b}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          {bodyType !== "none" && (
            <Field
              label="Body template"
              hint={
                bodyType === "json"
                  ? 'Contoh: {"prompt": "{prompt}", "max_tokens": 100}'
                  : bodyType === "form"
                    ? "Contoh: prompt={prompt}&n=2"
                    : "Teks bebas. Pakai {nama} untuk substitusi."
              }
            >
              <TextInput
                value={bodyTemplate}
                onChangeText={(v) => {
                  setBodyTemplate(v);
                  markDirty();
                }}
                placeholder={bodyType === "json" ? '{"key": "{value}"}' : "key={value}"}
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
          )}

          <Field label="Timeout (ms)" hint="1000–60000.">
            <TextInput
              value={timeoutMs}
              onChangeText={(v) => {
                setTimeoutMs(v.replace(/[^0-9]/g, ""));
                markDirty();
              }}
              keyboardType="number-pad"
              placeholder="15000"
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
        </Section>

        <Section title="Response">
          <Field label="Tipe response">
            <View style={styles.chipsRow}>
              {RESP_TYPES.map((r) => {
                const active = respType === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => {
                      setRespType(r);
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
                      {r}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          {respType === "json" && (
            <Field
              label="Pick fields (opsional)"
              hint="Ambil field tertentu agar konteks ke AI tidak boros. Pisah koma. Bisa pakai dot-notation: data.name"
            >
              <TextInput
                value={pickStr}
                onChangeText={(v) => {
                  setPickStr(v);
                  markDirty();
                }}
                placeholder="login, name, public_repos"
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
          )}

          <Field label="Maks panjang response (chars)" hint="Default 6000. Lebih dari ini dipotong.">
            <TextInput
              value={maxCharsStr}
              onChangeText={(v) => {
                setMaxCharsStr(v.replace(/[^0-9]/g, ""));
                markDirty();
              }}
              keyboardType="number-pad"
              placeholder="6000"
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
        </Section>

        {testResult !== null && (
          <Section
            title="Hasil test"
            right={
              <Pressable
                onPress={() => setTestResult(null)}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.smallBtn,
                  { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Feather name="x" size={12} color={colors.secondaryForeground} />
                <Text style={[styles.smallBtnText, { color: colors.secondaryForeground }]}>
                  Tutup
                </Text>
              </Pressable>
            }
          >
            <View
              style={[
                styles.codeBlock,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text
                style={[
                  styles.codeText,
                  { color: colors.foreground },
                ]}
                selectable
              >
                {testResult}
              </Text>
            </View>
          </Section>
        )}

        {testing && (
          <Text style={[styles.hint, { color: colors.mutedForeground, textAlign: "center" }]}>
            Mengirim request test...
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
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
      {hint && <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text>}
    </View>
  );
}

function KVList({
  title,
  items,
  onAdd,
  onUpdate,
  onRemove,
  keyPlaceholder,
  valuePlaceholder,
}: {
  title: string;
  items: KV[];
  onAdd: () => void;
  onUpdate: (idx: number, patch: Partial<KV>) => void;
  onRemove: (idx: number) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={[styles.label, { color: colors.foreground }]}>{title}</Text>
        <Pressable
          onPress={onAdd}
          hitSlop={6}
          style={({ pressed }) => [
            styles.smallBtn,
            { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="plus" size={12} color={colors.secondaryForeground} />
          <Text style={[styles.smallBtnText, { color: colors.secondaryForeground }]}>
            Tambah
          </Text>
        </Pressable>
      </View>
      {items.length === 0 && (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>—</Text>
      )}
      {items.map((kv, idx) => (
        <View key={idx} style={{ flexDirection: "row", gap: 6 }}>
          <TextInput
            value={kv.key}
            onChangeText={(v) => onUpdate(idx, { key: v })}
            placeholder={keyPlaceholder}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.input,
              {
                flex: 1,
                backgroundColor: colors.input,
                borderColor: colors.border,
                color: colors.foreground,
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              },
            ]}
          />
          <TextInput
            value={kv.value}
            onChangeText={(v) => onUpdate(idx, { value: v })}
            placeholder={valuePlaceholder}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.input,
              {
                flex: 1.4,
                backgroundColor: colors.input,
                borderColor: colors.border,
                color: colors.foreground,
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              },
            ]}
          />
          <Pressable
            onPress={() => onRemove(idx)}
            hitSlop={6}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                backgroundColor: colors.secondary,
                opacity: pressed ? 0.7 : 1,
                width: 40,
                height: 40,
              },
            ]}
          >
            <Feather name="trash-2" size={14} color={colors.destructive} />
          </Pressable>
        </View>
      ))}
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
  smallBtn: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: "center",
  },
  smallBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
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
    minHeight: 100,
    textAlignVertical: "top",
  },
  codeBlock: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  codeText: {
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 16,
  },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  paramCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
