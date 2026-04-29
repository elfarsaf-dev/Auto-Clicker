import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";

import { useApiKey } from "@/contexts/ApiKeyContext";
import { useColors } from "@/hooks/useColors";

export default function Index() {
  const { apiKey, isLoaded } = useApiKey();
  const colors = useColors();

  if (!isLoaded) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!apiKey) {
    return <Redirect href="/setup" />;
  }

  return <Redirect href="/chat" />;
}
