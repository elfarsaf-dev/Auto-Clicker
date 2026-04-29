import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useChatPrefs } from "@/contexts/ChatPrefsContext";
import { useColors } from "@/hooks/useColors";
import { BUILTIN_MODELS, type ModelOption } from "@/lib/openrouter";

export function ModelSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    model,
    setModel,
    customModels,
    addCustomModel,
    removeCustomModel,
    reasoning,
    setReasoning,
    toolsEnabled,
    setToolsEnabled,
  } = useChatPrefs();

  const [adding, setAdding] = useState(false);
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setConfirmDeleteId(null);
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleSelect = (id: string) => {
    Haptics.selectionAsync();
    setModel(id);
    onClose();
  };

  const handleAdd = () => {
    const id = newId.trim();
    if (!id.includes("/")) {
      Alert.alert("ID Model tidak valid", "Format harus seperti `provider/model:tag`, contoh: `openai/gpt-oss-120b:free`.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addCustomModel(id, newLabel);
    setNewId("");
    setNewLabel("");
    setAdding(false);
    onClose();
  };

  const handleRemove = (m: ModelOption) => {
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    if (confirmDeleteId === m.id) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      removeCustomModel(m.id);
      setConfirmDeleteId(null);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setConfirmDeleteId(m.id);
    confirmTimerRef.current = setTimeout(() => {
      setConfirmDeleteId(null);
      confirmTimerRef.current = null;
    }, 3000);
  };

  const renderRow = (m: ModelOption) => {
    const active = m.id === model;
    const isConfirming = confirmDeleteId === m.id;
    return (
      <Pressable
        key={m.id}
        onPress={() => {
          if (isConfirming) {
            setConfirmDeleteId(null);
            return;
          }
          handleSelect(m.id);
        }}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: isConfirming
              ? "rgba(239, 68, 68, 0.12)"
              : active
                ? colors.accent
                : colors.background,
            borderColor: isConfirming
              ? "#ef4444"
              : active
                ? colors.primary
                : colors.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, { color: colors.foreground }]} numberOfLines={1}>
            {m.label}
          </Text>
          <Text style={[styles.rowHint, { color: colors.mutedForeground }]} numberOfLines={1}>
            {isConfirming ? "Tap ikon merah lagi untuk hapus" : m.id}
          </Text>
        </View>
        {!m.builtIn ? (
          <Pressable
            onPress={() => handleRemove(m)}
            hitSlop={12}
            style={({ pressed }) => [
              styles.deleteBtn,
              {
                backgroundColor: isConfirming ? "#ef4444" : "transparent",
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Feather
              name={isConfirming ? "check" : "trash-2"}
              size={16}
              color={isConfirming ? "#ffffff" : colors.mutedForeground}
            />
          </Pressable>
        ) : null}
        {active && !isConfirming ? (
          <Feather name="check" size={20} color={colors.primary} />
        ) : null}
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.sheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View style={styles.handle}>
              <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
            </View>

            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.foreground }]}>Model & Mode</Text>
              <Pressable
                onPress={() => setAdding((a) => !a)}
                style={({ pressed }) => [
                  styles.addToggle,
                  {
                    backgroundColor: adding ? colors.accent : colors.background,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                hitSlop={6}
              >
                <Feather
                  name={adding ? "x" : "plus"}
                  size={16}
                  color={adding ? colors.primary : colors.foreground}
                />
                <Text
                  style={[
                    styles.addToggleText,
                    { color: adding ? colors.primary : colors.foreground },
                  ]}
                >
                  {adding ? "Tutup" : "Tambah"}
                </Text>
              </Pressable>
            </View>

            {adding ? (
              <View
                style={[
                  styles.addCard,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.addLabel, { color: colors.mutedForeground }]}>
                  ID Model OpenRouter
                </Text>
                <TextInput
                  value={newId}
                  onChangeText={setNewId}
                  placeholder="provider/model-name:tag"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  selectionColor={colors.primary}
                  style={[
                    styles.addInput,
                    {
                      color: colors.foreground,
                      backgroundColor: colors.input,
                      borderColor: colors.border,
                    },
                  ]}
                />
                <Text style={[styles.addLabel, { color: colors.mutedForeground, marginTop: 10 }]}>
                  Nama tampilan (opsional)
                </Text>
                <TextInput
                  value={newLabel}
                  onChangeText={setNewLabel}
                  placeholder="Contoh: My Model"
                  placeholderTextColor={colors.mutedForeground}
                  autoCorrect={false}
                  selectionColor={colors.primary}
                  style={[
                    styles.addInput,
                    {
                      color: colors.foreground,
                      backgroundColor: colors.input,
                      borderColor: colors.border,
                    },
                  ]}
                />
                <Pressable
                  onPress={handleAdd}
                  disabled={newId.trim().length === 0}
                  style={({ pressed }) => [
                    styles.addCta,
                    {
                      backgroundColor: colors.primary,
                      opacity:
                        newId.trim().length === 0 ? 0.4 : pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.addCtaText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    Tambah & Pakai
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              Bawaan
            </Text>
            <View style={{ gap: 8 }}>{BUILTIN_MODELS.map(renderRow)}</View>

            {customModels.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                  Kustom
                </Text>
                <View style={{ gap: 8 }}>{customModels.map(renderRow)}</View>
              </>
            ) : null}

            <View
              style={[
                styles.toggleCard,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>
                  Mode Reasoning
                </Text>
                <Text style={[styles.toggleHint, { color: colors.mutedForeground }]}>
                  Aktifkan jika model mendukung penalaran. Bisa lebih lambat.
                </Text>
              </View>
              <Switch
                value={reasoning}
                onValueChange={(v) => {
                  Haptics.selectionAsync();
                  setReasoning(v);
                }}
                trackColor={{ false: colors.muted, true: colors.primary }}
                thumbColor={Platform.OS === "android" ? colors.foreground : undefined}
                ios_backgroundColor={colors.muted}
              />
            </View>

            <View
              style={[
                styles.toggleCard,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  marginTop: 10,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>
                  Aksi & Tools
                </Text>
                <Text style={[styles.toggleHint, { color: colors.mutedForeground }]}>
                  Beri AI kemampuan cek waktu sekarang & menghitung. Hanya berfungsi pada model yang mendukung tools.
                </Text>
              </View>
              <Switch
                value={toolsEnabled}
                onValueChange={(v) => {
                  Haptics.selectionAsync();
                  setToolsEnabled(v);
                }}
                trackColor={{ false: colors.muted, true: colors.primary }}
                thumbColor={Platform.OS === "android" ? colors.foreground : undefined}
                ios_backgroundColor={colors.muted}
              />
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "92%",
  },
  handle: {
    alignItems: "center",
    paddingVertical: 8,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  addToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  addToggleText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  addCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  addLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
  },
  addInput: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  addCta: {
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  addCtaText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  rowLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  rowHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 16,
    gap: 12,
  },
  toggleLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  toggleHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    lineHeight: 16,
  },
});
