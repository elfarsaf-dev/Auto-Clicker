import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import type { Conversation } from "@/lib/conversationStore";

function formatRel(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "baru saja";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m lalu`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}j lalu`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}h lalu`;
  return new Date(ts).toLocaleDateString("id-ID");
}

export function ConversationsSheet({
  visible,
  onClose,
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const confirmDelete = (conv: Conversation) => {
    Alert.alert(
      "Hapus obrolan?",
      `"${conv.title}" akan dihapus permanen.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            onDelete(conv.id);
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              paddingBottom: insets.bottom + 16,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle}>
            <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
          </View>

          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.foreground }]}>Obrolan</Text>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                onNew();
              }}
              style={({ pressed }) => [
                styles.newBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
              hitSlop={6}
            >
              <Feather name="plus" size={14} color={colors.primaryForeground} />
              <Text style={[styles.newBtnText, { color: colors.primaryForeground }]}>
                Baru
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={{ maxHeight: 480 }}
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
          >
            {conversations.length === 0 ? (
              <Text style={[styles.empty, { color: colors.mutedForeground }]}>
                Belum ada obrolan.
              </Text>
            ) : (
              conversations.map((c) => {
                const isActive = c.id === activeId;
                return (
                  <View key={c.id} style={styles.itemRow}>
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        onSelect(c.id);
                      }}
                      onLongPress={() => confirmDelete(c)}
                      style={({ pressed }) => [
                        styles.item,
                        {
                          backgroundColor: isActive ? colors.accent : colors.card,
                          borderColor: isActive ? colors.primary : colors.border,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Feather
                        name={isActive ? "message-square" : "message-circle"}
                        size={16}
                        color={isActive ? colors.primary : colors.mutedForeground}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={[styles.itemTitle, { color: colors.foreground }]}
                          numberOfLines={1}
                        >
                          {c.title}
                        </Text>
                        <Text
                          style={[styles.itemMeta, { color: colors.mutedForeground }]}
                        >
                          {formatRel(c.updatedAt)}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => confirmDelete(c)}
                        hitSlop={10}
                        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 0.6 })}
                      >
                        <Feather name="trash-2" size={16} color={colors.mutedForeground} />
                      </Pressable>
                    </Pressable>
                  </View>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  handle: { alignItems: "center", paddingVertical: 8 },
  handleBar: { width: 36, height: 4, borderRadius: 2 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginBottom: 8,
  },
  title: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  newBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  empty: {
    padding: 24,
    textAlign: "center",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  itemRow: { marginBottom: 8 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  itemTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  itemMeta: { fontSize: 12, marginTop: 2, fontFamily: "Inter_400Regular" },
});
