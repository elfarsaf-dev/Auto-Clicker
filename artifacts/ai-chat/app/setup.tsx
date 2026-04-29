import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApiKey } from "@/contexts/ApiKeyContext";
import { useColors } from "@/hooks/useColors";

export default function SetupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { apiKey, saveApiKey } = useApiKey();
  const [value, setValue] = useState(apiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const isEditing = !!apiKey;

  const handleSave = async () => {
    const trimmed = value.trim();
    if (trimmed.length < 10) {
      Alert.alert("API Key tidak valid", "Sepertinya API key terlalu pendek. Periksa lagi ya.");
      return;
    }
    try {
      setSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await saveApiKey(trimmed);
      router.replace("/chat");
    } catch {
      Alert.alert("Gagal menyimpan", "Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const openOpenRouter = async () => {
    const url = "https://openrouter.ai/keys";
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Linking.openURL(url);
    }
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 24 + webTopInset,
            paddingBottom: insets.bottom + 32 + webBottomInset,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        {isEditing && (
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backBtn,
              { backgroundColor: colors.card, opacity: pressed ? 0.6 : 1 },
            ]}
            hitSlop={10}
          >
            <Feather name="chevron-left" size={22} color={colors.foreground} />
          </Pressable>
        )}

        <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
          <Feather name="key" size={32} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>
          {isEditing ? "Ubah API Key" : "Mulai dengan API Key"}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Aplikasi ini berjalan langsung dari HP kamu.{"\n"}Pakai API key OpenRouter milikmu sendiri — tersimpan lokal.
        </Text>

        <View style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: colors.border }]}>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="sk-or-v1-..."
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            style={[styles.input, { color: colors.foreground }]}
            selectionColor={colors.primary}
          />
          <Pressable
            onPress={() => setShowKey((s) => !s)}
            style={({ pressed }) => [styles.eyeBtn, { opacity: pressed ? 0.6 : 1 }]}
            hitSlop={10}
          >
            <Feather
              name={showKey ? "eye-off" : "eye"}
              size={20}
              color={colors.mutedForeground}
            />
          </Pressable>
        </View>

        <Pressable
          onPress={handleSave}
          disabled={saving || value.trim().length === 0}
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: colors.primary,
              opacity: saving || value.trim().length === 0 ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
        >
          {saving ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>
              {isEditing ? "Simpan" : "Lanjut"}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={openOpenRouter}
          style={({ pressed }) => [styles.linkBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="external-link" size={14} color={colors.mutedForeground} />
          <Text style={[styles.linkText, { color: colors.mutedForeground }]}>
            Belum punya API key? Dapatkan di openrouter.ai
          </Text>
        </Pressable>

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.infoRow}>
            <Feather name="lock" size={16} color={colors.mutedForeground} />
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              Disimpan hanya di perangkatmu
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Feather name="zap" size={16} color={colors.mutedForeground} />
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              Permintaan langsung ke OpenRouter, tanpa server perantara
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Feather name="cloud-off" size={16} color={colors.mutedForeground} />
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              Tidak butuh akun, tidak butuh internet selain ke OpenRouter
            </Text>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 24, gap: 18 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginTop: -4,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 14 : 4,
    marginTop: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    paddingVertical: Platform.OS === "android" ? 14 : 0,
  },
  eyeBtn: {
    padding: 6,
    marginLeft: 4,
  },
  cta: {
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  ctaText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  linkText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    marginTop: 8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
