import { Image } from "expo-image";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

type Role = "user" | "assistant";

type Segment =
  | { type: "text"; value: string }
  | { type: "image"; alt: string; uri: string };

const IMAGE_REGEX = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

function parseSegments(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  IMAGE_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMAGE_REGEX.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ type: "text", value: text.slice(last, m.index) });
    }
    out.push({ type: "image", alt: m[1], uri: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push({ type: "text", value: text.slice(last) });
  }
  return out;
}

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
  const segments = useMemo(() => parseSegments(shown), [shown]);

  const fgColor = isUser ? colors.userBubbleForeground : colors.assistantBubbleForeground;

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
        {segments.length === 0 && isAnimating ? (
          <Text style={[styles.text, { color: fgColor }]}>
            <Text style={{ color: colors.primary }}>▍</Text>
          </Text>
        ) : null}
        {segments.map((seg, idx) => {
          const isLast = idx === segments.length - 1;
          if (seg.type === "text") {
            const trimmed = seg.value;
            if (!trimmed) return null;
            return (
              <Text key={idx} style={[styles.text, { color: fgColor }]}>
                {trimmed}
                {isLast && isAnimating ? (
                  <Text style={{ color: colors.primary }}>▍</Text>
                ) : null}
              </Text>
            );
          }
          return (
            <View key={idx} style={styles.imageWrapper}>
              <Image
                source={{ uri: seg.uri }}
                style={styles.image}
                contentFit="cover"
                transition={200}
                accessibilityLabel={seg.alt}
              />
              {seg.alt ? (
                <Text style={[styles.caption, { color: fgColor }]} numberOfLines={2}>
                  {seg.alt}
                </Text>
              ) : null}
            </View>
          );
        })}
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
  imageWrapper: {
    marginTop: 6,
    marginBottom: 4,
    borderRadius: 12,
    overflow: "hidden",
    width: 240,
    maxWidth: "100%",
  },
  image: {
    width: "100%",
    height: 240,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  caption: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    opacity: 0.7,
    marginTop: 4,
  },
});
