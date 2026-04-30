import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  type FileNode,
  createFile,
  createFolder,
  deleteEntry,
  findEntryFile,
  formatSize,
  formatTime,
  getFileExt,
  listFiles,
  renameEntry,
} from "@/lib/projectFs";

const FILE_TEMPLATES: Record<string, string> = {
  html: `<!DOCTYPE html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Halaman Baru</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <h1>Halo Dunia</h1>
    <p>Edit file ini di file manager.</p>
    <script src="script.js"></script>
  </body>
</html>
`,
  css: `body {
  font-family: -apple-system, system-ui, sans-serif;
  margin: 24px;
  color: #222;
}
`,
  js: `console.log("Halo dari script.js");
`,
  json: "{\n  \n}\n",
  md: "# Judul\n\nTulis sesuatu di sini.\n",
  txt: "",
};

function getIconForFile(name: string, isDir: boolean): { icon: keyof typeof Feather.glyphMap; color?: string } {
  if (isDir) return { icon: "folder" };
  const ext = getFileExt(name);
  if (["html", "htm"].includes(ext)) return { icon: "globe" };
  if (["css"].includes(ext)) return { icon: "feather" };
  if (["js", "jsx", "ts", "tsx", "json"].includes(ext))
    return { icon: "code" };
  if (["md", "txt"].includes(ext)) return { icon: "file-text" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
    return { icon: "image" };
  return { icon: "file" };
}

export default function ProjectScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ project: string; path?: string }>();
  const project = decodeURIComponent(params.project || "");
  const subPath = params.path ? decodeURIComponent(params.path) : "";

  const [items, setItems] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasEntry, setHasEntry] = useState(false);
  const [creatingType, setCreatingType] = useState<"file" | "folder" | null>(
    null,
  );
  const [newName, setNewName] = useState("");
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [actionsFor, setActionsFor] = useState<FileNode | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listFiles(project, subPath);
      setItems(list);
      const entry = await findEntryFile(project);
      setHasEntry(entry !== null);
    } catch (e) {
      Alert.alert("Gagal", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [project, subPath]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handleCreate = async () => {
    if (!creatingType) return;
    try {
      const targetPath = subPath ? `${subPath}/${newName}` : newName;
      if (creatingType === "folder") {
        await createFolder(project, targetPath);
      } else {
        const ext = getFileExt(newName);
        const template = FILE_TEMPLATES[ext] ?? "";
        await createFile(project, targetPath, template);
      }
      setCreatingType(null);
      setNewName("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    } catch (e) {
      Alert.alert("Gagal", e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = (item: FileNode) => {
    setActionsFor(null);
    Alert.alert(
      "Hapus?",
      `"${item.name}"${item.isDirectory ? " dan semua isinya" : ""} akan dihapus permanen.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            try {
              const targetPath = subPath
                ? `${subPath}/${item.name}`
                : item.name;
              await deleteEntry(project, targetPath);
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
              await refresh();
            } catch (e) {
              Alert.alert("Gagal", e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    try {
      const targetPath = subPath ? `${subPath}/${renameTarget}` : renameTarget;
      await renameEntry(project, targetPath, renameValue);
      setRenameTarget(null);
      setRenameValue("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    } catch (e) {
      Alert.alert("Gagal", e instanceof Error ? e.message : String(e));
    }
  };

  const openItem = (item: FileNode) => {
    Haptics.selectionAsync();
    const targetPath = subPath ? `${subPath}/${item.name}` : item.name;
    if (item.isDirectory) {
      router.push(
        `/files/${encodeURIComponent(project)}?path=${encodeURIComponent(targetPath)}`,
      );
    } else {
      router.push(
        `/files/${encodeURIComponent(project)}/edit?path=${encodeURIComponent(targetPath)}`,
      );
    }
  };

  const headerTitle = subPath ? `${project}/${subPath}` : project;

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
        <Text
          style={[styles.title, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {headerTitle}
        </Text>
        {hasEntry && !subPath ? (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              router.push(
                `/files/${encodeURIComponent(project)}/preview`,
              );
            }}
            hitSlop={8}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: colors.accent, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="play" size={16} color={colors.primary} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => {
            setCreatingType("file");
            setNewName("");
          }}
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="file-plus" size={18} color={colors.primaryForeground} />
        </Pressable>
        <Pressable
          onPress={() => {
            setCreatingType("folder");
            setNewName("");
          }}
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="folder-plus" size={18} color={colors.foreground} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.empty}>
          <Text style={{ color: colors.mutedForeground }}>Memuat…</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="file" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            Folder kosong
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            Tap ikon + di kanan atas untuk buat file atau folder baru.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.name}
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => {
            const ico = getIconForFile(item.name, item.isDirectory);
            return (
              <Pressable
                onPress={() => openItem(item)}
                onLongPress={() => setActionsFor(item)}
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.iconBox,
                    {
                      backgroundColor: item.isDirectory
                        ? colors.accent
                        : colors.muted,
                    },
                  ]}
                >
                  <Feather
                    name={ico.icon}
                    size={18}
                    color={item.isDirectory ? colors.primary : colors.foreground}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.cardTitle, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={[
                      styles.cardSub,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {item.isDirectory
                      ? "Folder"
                      : `${formatSize(item.size)} · ${formatTime(item.modifiedAt)}`}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setActionsFor(item)}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.iconBtnSmall,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Feather
                    name="more-vertical"
                    size={16}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}

      <PromptModal
        visible={creatingType !== null}
        title={creatingType === "folder" ? "Folder baru" : "File baru"}
        placeholder={creatingType === "folder" ? "nama-folder" : "index.html"}
        value={newName}
        setValue={setNewName}
        onCancel={() => {
          setCreatingType(null);
          setNewName("");
        }}
        onSubmit={handleCreate}
        helper={
          creatingType === "file"
            ? "Akhiri dgn .html .css .js .json .md untuk dapat template & preview"
            : undefined
        }
      />
      <PromptModal
        visible={renameTarget !== null}
        title="Ganti nama"
        placeholder="nama baru"
        value={renameValue}
        setValue={setRenameValue}
        onCancel={() => {
          setRenameTarget(null);
          setRenameValue("");
        }}
        onSubmit={handleRename}
      />

      <ActionsSheet
        target={actionsFor}
        onClose={() => setActionsFor(null)}
        onRename={(it) => {
          setActionsFor(null);
          setRenameTarget(it.name);
          setRenameValue(it.name);
        }}
        onDelete={handleDelete}
        onOpen={openItem}
      />
    </View>
  );
}

function ActionsSheet({
  target,
  onClose,
  onOpen,
  onRename,
  onDelete,
}: {
  target: FileNode | null;
  onClose: () => void;
  onOpen: (item: FileNode) => void;
  onRename: (item: FileNode) => void;
  onDelete: (item: FileNode) => void;
}) {
  const colors = useColors();
  return (
    <Modal
      transparent
      visible={target !== null}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text
            style={[styles.sheetTitle, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {target?.name}
          </Text>
          {target ? (
            <>
              <SheetItem
                icon={target.isDirectory ? "folder" : "edit-3"}
                label={target.isDirectory ? "Buka folder" : "Edit isi"}
                onPress={() => {
                  onClose();
                  onOpen(target);
                }}
              />
              <SheetItem
                icon="type"
                label="Ganti nama"
                onPress={() => onRename(target)}
              />
              <SheetItem
                icon="trash-2"
                label="Hapus"
                destructive
                onPress={() => onDelete(target)}
              />
            </>
          ) : null}
        </View>
      </Pressable>
    </Modal>
  );
}

function SheetItem({
  icon,
  label,
  destructive,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const tint = destructive ? colors.destructive : colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.sheetItem,
        { backgroundColor: pressed ? colors.accent : "transparent" },
      ]}
    >
      <Feather name={icon} size={18} color={tint} />
      <Text style={[styles.sheetItemText, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

function PromptModal({
  visible,
  title,
  placeholder,
  value,
  setValue,
  onCancel,
  onSubmit,
  helper,
}: {
  visible: boolean;
  title: string;
  placeholder: string;
  value: string;
  setValue: (s: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  helper?: string;
}) {
  const colors = useColors();
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalBox,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            {title}
          </Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.mutedForeground}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                color: colors.foreground,
                borderColor: colors.border,
              },
            ]}
          />
          {helper ? (
            <Text style={[styles.helper, { color: colors.mutedForeground }]}>
              {helper}
            </Text>
          ) : null}
          <View style={styles.modalActions}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.modalBtn,
                {
                  backgroundColor: colors.secondary,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.modalBtnText,
                  { color: colors.secondaryForeground },
                ]}
              >
                Batal
              </Text>
            </Pressable>
            <Pressable
              onPress={onSubmit}
              style={({ pressed }) => [
                styles.modalBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.modalBtnText,
                  { color: colors.primaryForeground },
                ]}
              >
                Simpan
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnSmall: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 6,
  },
  emptyDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  cardSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalBox: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  helper: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    justifyContent: "flex-end",
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  modalBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  sheet: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 8,
  },
  sheetTitle: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    opacity: 0.7,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  sheetItemText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});
