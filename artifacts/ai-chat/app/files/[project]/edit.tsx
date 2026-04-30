import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { findEntryFile, getFileExt, readFile, writeFile } from "@/lib/projectFs";

const PREVIEWABLE_EXT = new Set(["html", "htm"]);

export default function EditFileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ project: string; path?: string }>();
  const project = decodeURIComponent(params.project || "");
  const filePath = params.path ? decodeURIComponent(params.path) : "";

  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasEntry, setHasEntry] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await readFile(project, filePath);
        setContent(data);
        setOriginal(data);
        const entry = await findEntryFile(project);
        setHasEntry(entry !== null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [project, filePath]);

  const dirty = content !== original;

  const handleSave = async () => {
    setSaving(true);
    try {
      await writeFile(project, filePath, content);
      setOriginal(content);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Gagal simpan", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert("Perubahan belum disimpan", "Buang perubahan?", [
      { text: "Lanjut edit", style: "cancel" },
      {
        text: "Buang",
        style: "destructive",
        onPress: () => router.back(),
      },
    ]);
  };

  const ext = getFileExt(filePath);
  const fileName = filePath.split("/").pop() || filePath;
  const previewable = PREVIEWABLE_EXT.has(ext) || (ext === "" && hasEntry);

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
          onPress={handleBack}
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
            {fileName}
          </Text>
          <Text
            style={[styles.subtitle, { color: colors.mutedForeground }]}
            numberOfLines={1}
          >
            {project}
            {dirty ? " · belum disimpan" : ""}
          </Text>
        </View>
        {previewable ? (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              router.push(
                `/files/${encodeURIComponent(project)}/preview?path=${encodeURIComponent(filePath)}`,
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
          onPress={handleSave}
          disabled={!dirty || saving}
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: dirty ? colors.primary : colors.muted,
              opacity: !dirty ? 0.5 : pressed ? 0.7 : 1,
            },
          ]}
        >
          {saving ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Feather
              name="check"
              size={18}
              color={dirty ? colors.primaryForeground : colors.mutedForeground}
            />
          )}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <ScrollView contentContainerStyle={styles.empty}>
          <Feather name="alert-circle" size={32} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.foreground }]}>
            {error}
          </Text>
        </ScrollView>
      ) : (
        <KeyboardAvoidingView
          behavior="padding"
          style={{ flex: 1 }}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              padding: 12,
              paddingBottom: insets.bottom + 24,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <TextInput
              value={content}
              onChangeText={setContent}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              placeholder="// tulis kode di sini"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.editor,
                {
                  color: colors.foreground,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
              textAlignVertical="top"
            />
          </ScrollView>
        </KeyboardAvoidingView>
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
  editor: {
    minHeight: 360,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
});
