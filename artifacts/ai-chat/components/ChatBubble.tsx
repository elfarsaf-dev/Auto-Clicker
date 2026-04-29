import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

type Role = "user" | "assistant";

function getStepForLength(length: number): number {
  if (length > 800) return 8;
  if (length > 400) return 5;
  if (length > 150) return 3;
  return 2;
}

export function ChatBubble({
  role,
  content,
  animate = false,
  onAnimateDone,
}: {
  role: Role;
  content: string;
  animate?: boolean;
  onAnimateDone?: () => void;
}) {
  const colors = useColors();
  const isUser = role === "user";
  const [shown, setShown] = useState(animate ? "" : content);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!animate) {
      setShown(content);
      return;
    }

    let i = 0;
    const step = getStepForLength(content.length);
    setShown("");
    doneRef.current = false;

    intervalRef.current = setInterval(() => {
      i = Math.min(i + step, content.length);
      setShown(content.slice(0, i));
      if (i >= content.length) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (!doneRef.current) {
          doneRef.current = true;
          onAnimateDone?.();
        }
      }
    }, 24);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [animate, content, onAnimateDone]);

  const isAnimating = animate && shown.length < content.length;

  return (
    <View
      style={[
        styles.row,
        { justifyContent: isUser ? "flex-end" : "flex-start" },
      ]}
    >
      <View
        style={[
          styles.bubble,
          isUser
            ? {
                backgroundColor: colors.userBubble,
                borderTopRightRadius: 6,
              }
            : {
                backgroundColor: colors.assistantBubble,
                borderTopLeftRadius: 6,
                borderWidth: 1,
                borderColor: colors.border,
              },
        ]}
      >
        <Text
          style={[
            styles.text,
            {
              color: isUser
                ? colors.userBubbleForeground
                : colors.assistantBubbleForeground,
            },
          ]}
        >
          {shown}
          {isAnimating ? (
            <Text style={{ color: colors.primary }}>▍</Text>
          ) : null}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  bubble: {
    maxWidth: "84%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  text: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
});
