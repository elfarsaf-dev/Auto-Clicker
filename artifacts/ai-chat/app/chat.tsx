import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatBubble } from "@/components/ChatBubble";
import { ModelSheet } from "@/components/ModelSheet";
import { useApiKey } from "@/contexts/ApiKeyContext";
import { useChatPrefs } from "@/contexts/ChatPrefsContext";
import { useColors } from "@/hooks/useColors";
import { type ChatMessage, sendChatRequest } from "@/lib/openrouter";
import { findTool } from "@/lib/tools";

const MESSAGES_KEY = "@ai-chat/messages";
const MAX_HISTORY = 30;

type DisplayMessage = ChatMessage & { id: string };

function newId() {
  return Date.now().toString() + Math.random().toString(36).slice(2, 9);
}

const SUGGESTIONS = [
  "Jelaskan apa itu AI agent dengan singkat",
  "Tulis email izin tidak masuk kerja",
  "Beri 5 ide nama brand kopi lokal",
  "Bantu saya rencanakan belajar JavaScript",
];

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { apiKey } = useApiKey();
  const { model, reasoning, toolsEnabled, allModels } = useChatPrefs();

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const animatedIdsRef = useRef<Set<string>>(new Set());
  const [, forceRerender] = useState(0);
  const [toolStatus, setToolStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const storedMsgs = await AsyncStorage.getItem(MESSAGES_KEY);
        if (storedMsgs) {
          const parsed = JSON.parse(storedMsgs) as DisplayMessage[];
          if (Array.isArray(parsed)) {
            setMessages(parsed);
            for (const m of parsed) animatedIdsRef.current.add(m.id);
          }
        }
      } catch {
        // ignore
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const markAnimated = useCallback((id: string) => {
    animatedIdsRef.current.add(id);
    forceRerender((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(messages)).catch(() => {});
  }, [messages, hydrated]);

  const handleSend = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || loading) return;
      if (!apiKey) {
        router.replace("/setup");
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const userMsg: DisplayMessage = {
        id: newId(),
        role: "user",
        content,
      };

      const baseMessages = [...messages, userMsg];
      setMessages(baseMessages);
      setInput("");
      setLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const trimmed = baseMessages.slice(-MAX_HISTORY);
        const apiMessages: ChatMessage[] = [
          {
            role: "system",
            content:
              toolsEnabled
                ? [
                    "Kamu adalah asisten AI multi-fungsi (AI agent) yang ramah, jelas, dan ringkas. Jawab dalam bahasa yang sama dengan pengguna. Hindari emoji.",
                    "Kamu punya akses ke beberapa kategori tools:",
                    "- Utility: get_current_time, calculate.",
                    "- Pencarian & info: web_search (Brave), wikipedia_search, weather (BMKG), earthquake_latest (BMKG), prayer_times, tv_schedule, song_lyrics, recipe_search, news_indonesia.",
                    "- Kreatif: generate_image (bikin gambar dari prompt, hasilnya disimpan ke sandbox lokal app).",
                    "- File system sandbox lokal app (BUKAN server, semua file ada di HP pengguna): fs_write_file, fs_read_file, fs_list_folder, fs_create_folder, fs_delete.",
                    "Aturan penting:",
                    "1. Selalu pakai tools daripada menebak untuk data faktual, terkini, atau spesifik.",
                    "2. Untuk tugas kompleks, lakukan rantai tool calls (misal: generate gambar → simpan ke folder; tulis kode HTML → baca lagi untuk verifikasi).",
                    "3. Setelah memanggil generate_image, WAJIB sertakan tag markdown ![deskripsi](file_uri) di balasanmu sehingga gambar muncul di chat — pakai persis nilai 'uri' dari hasil tool.",
                    "4. Path file system selalu relatif terhadap sandbox root, contoh: 'notes/todo.md', 'project/index.html'. Jangan pakai absolute path atau '..'.",
                    "5. Setelah selesai, ringkas hasilnya tanpa menyebut nama tool secara teknis.",
                  ].join("\n")
                : "Kamu adalah asisten AI yang ramah, jelas, dan ringkas. Jawab dalam bahasa yang sama dengan pengguna. Hindari emoji.",
          },
          ...trimmed.map(({ role, content }) => ({ role, content })),
        ];

        const reply = await sendChatRequest({
          apiKey,
          model,
          messages: apiMessages,
          reasoning,
          toolsEnabled,
          onToolCall: (event) => {
            const tool = findTool(event.name);
            setToolStatus(tool?.label ?? `Menjalankan ${event.name}...`);
          },
          signal: controller.signal,
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "assistant", content: reply },
        ]);
      } catch (err) {
        if (controller.signal.aborted) {
          // user cancelled
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const message =
          err instanceof Error ? err.message : "Permintaan gagal. Coba lagi.";
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            content: `⚠ ${message}`,
          },
        ]);
      } finally {
        setLoading(false);
        setToolStatus(null);
        abortRef.current = null;
      }
    },
    [apiKey, input, loading, messages, model, reasoning, toolsEnabled],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleClear = useCallback(() => {
    if (messages.length === 0) return;
    Alert.alert(
      "Hapus percakapan?",
      "Semua pesan dalam chat ini akan dihapus.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setMessages([]);
          },
        },
      ],
    );
  }, [messages.length]);

  const currentModelLabel =
    allModels.find((m) => m.id === model)?.label ?? "Model";

  const reversed = [...messages].reverse();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8 + webTopInset,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setShowModels(true);
          }}
          style={({ pressed }) => [
            styles.modelBtn,
            { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.modelLabel, { color: colors.foreground }]} numberOfLines={1}>
            {currentModelLabel}
          </Text>
          {reasoning ? (
            <View style={[styles.badge, { backgroundColor: colors.accent }]}>
              <Feather name="cpu" size={10} color={colors.primary} />
            </View>
          ) : null}
          <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
        </Pressable>

        <View style={styles.headerActions}>
          <Pressable
            onPress={handleClear}
            disabled={messages.length === 0}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                backgroundColor: colors.card,
                opacity: messages.length === 0 ? 0.4 : pressed ? 0.7 : 1,
              },
            ]}
            hitSlop={8}
          >
            <Feather name="trash-2" size={18} color={colors.foreground} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/setup")}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
            ]}
            hitSlop={8}
          >
            <Feather name="settings" size={18} color={colors.foreground} />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={0}
        style={{ flex: 1 }}
      >
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.accent }]}>
              <Feather name="message-circle" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Mulai obrolan
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              Tanya apa saja, atau coba salah satu ide di bawah
            </Text>

            <View style={styles.suggestList}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => handleSend(s)}
                  style={({ pressed }) => [
                    styles.suggestPill,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.suggestText, { color: colors.foreground }]}>
                    {s}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            data={reversed}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <ChatBubble
                role={item.role as "user" | "assistant"}
                content={item.content}
                animate={
                  item.role === "assistant" &&
                  !animatedIdsRef.current.has(item.id)
                }
                onAnimateDone={() => markAnimated(item.id)}
              />
            )}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 8 }}
            ListHeaderComponent={
              loading ? (
                <View style={styles.typingRow}>
                  <View
                    style={[
                      styles.typingBubble,
                      { backgroundColor: colors.assistantBubble, borderColor: colors.border },
                    ]}
                  >
                    <ActivityIndicator size="small" color={colors.mutedForeground} />
                    <Text style={[styles.typingText, { color: colors.mutedForeground }]}>
                      {toolStatus ?? "Berpikir…"}
                    </Text>
                  </View>
                </View>
              ) : null
            }
            scrollEnabled={messages.length > 0}
          />
        )}

        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + 10 + webBottomInset,
            },
          ]}
        >
          <View
            style={[
              styles.inputWrap,
              { backgroundColor: colors.input, borderColor: colors.border },
            ]}
          >
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Tulis pesan…"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.textInput, { color: colors.foreground }]}
              multiline
              maxLength={4000}
              selectionColor={colors.primary}
              editable={!loading}
            />
            {loading ? (
              <Pressable
                onPress={handleStop}
                style={({ pressed }) => [
                  styles.sendBtn,
                  { backgroundColor: colors.destructive, opacity: pressed ? 0.85 : 1 },
                ]}
                hitSlop={6}
              >
                <Feather name="square" size={16} color={colors.destructiveForeground} />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => handleSend()}
                disabled={input.trim().length === 0}
                style={({ pressed }) => [
                  styles.sendBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity:
                      input.trim().length === 0 ? 0.4 : pressed ? 0.85 : 1,
                  },
                ]}
                hitSlop={6}
              >
                <Feather name="arrow-up" size={18} color={colors.primaryForeground} />
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <ModelSheet
        visible={showModels}
        onClose={() => setShowModels(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  modelLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    maxWidth: 180,
  },
  badge: {
    width: 18,
    height: 18,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    textAlign: "center",
  },
  suggestList: {
    marginTop: 24,
    gap: 8,
    width: "100%",
  },
  suggestPill: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  suggestText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  typingRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderTopLeftRadius: 6,
    borderWidth: 1,
  },
  typingText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  inputBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    maxHeight: 140,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});
