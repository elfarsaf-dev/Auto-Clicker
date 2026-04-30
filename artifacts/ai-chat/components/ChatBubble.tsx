import { Image } from "expo-image";
import * as Linking from "expo-linking";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Markdown, { MarkdownIt } from "react-native-markdown-display";

import { useColors } from "@/hooks/useColors";

type Role = "user" | "assistant";

const markdownIt = MarkdownIt({ typographer: true, linkify: true, breaks: true });

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
  const fgColor = isUser
    ? colors.userBubbleForeground
    : colors.assistantBubbleForeground;
  const codeBg = isUser ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.06)";
  const codeBorder = isUser ? "rgba(0,0,0,0.35)" : colors.border;
  const linkColor = isUser ? "#fff" : colors.primary;
  const quoteBorder = isUser ? "rgba(255,255,255,0.5)" : colors.primary;

  const mdStyles = useMemo(
    () =>
      StyleSheet.create({
        body: {
          color: fgColor,
          fontSize: 15,
          fontFamily: "Inter_400Regular",
          lineHeight: 22,
        },
        paragraph: {
          marginTop: 0,
          marginBottom: 6,
          color: fgColor,
        },
        heading1: {
          fontSize: 22,
          fontFamily: "Inter_700Bold",
          color: fgColor,
          marginTop: 6,
          marginBottom: 4,
        },
        heading2: {
          fontSize: 19,
          fontFamily: "Inter_700Bold",
          color: fgColor,
          marginTop: 6,
          marginBottom: 4,
        },
        heading3: {
          fontSize: 17,
          fontFamily: "Inter_600SemiBold",
          color: fgColor,
          marginTop: 4,
          marginBottom: 3,
        },
        heading4: {
          fontSize: 15,
          fontFamily: "Inter_600SemiBold",
          color: fgColor,
        },
        heading5: {
          fontSize: 14,
          fontFamily: "Inter_600SemiBold",
          color: fgColor,
        },
        heading6: {
          fontSize: 13,
          fontFamily: "Inter_600SemiBold",
          color: fgColor,
        },
        strong: { fontFamily: "Inter_700Bold", color: fgColor },
        em: { fontStyle: "italic", color: fgColor },
        s: { textDecorationLine: "line-through", color: fgColor },
        link: {
          color: linkColor,
          textDecorationLine: "underline",
        },
        bullet_list: { marginVertical: 2 },
        ordered_list: { marginVertical: 2 },
        list_item: { marginVertical: 1, color: fgColor },
        bullet_list_icon: {
          color: fgColor,
          marginRight: 6,
          marginTop: 8,
          fontSize: 6,
        },
        ordered_list_icon: {
          color: fgColor,
          marginRight: 6,
          fontFamily: "Inter_600SemiBold",
        },
        code_inline: {
          backgroundColor: codeBg,
          borderColor: codeBorder,
          borderWidth: 1,
          borderRadius: 6,
          paddingHorizontal: 5,
          paddingVertical: 1,
          fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
          fontSize: 13,
          color: fgColor,
        },
        code_block: {
          backgroundColor: codeBg,
          borderColor: codeBorder,
          borderWidth: 1,
          borderRadius: 10,
          padding: 10,
          marginVertical: 6,
          fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
          fontSize: 13,
          color: fgColor,
        },
        fence: {
          backgroundColor: codeBg,
          borderColor: codeBorder,
          borderWidth: 1,
          borderRadius: 10,
          padding: 10,
          marginVertical: 6,
          fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
          fontSize: 13,
          color: fgColor,
        },
        blockquote: {
          backgroundColor: codeBg,
          borderLeftColor: quoteBorder,
          borderLeftWidth: 3,
          paddingHorizontal: 10,
          paddingVertical: 6,
          marginVertical: 4,
          borderRadius: 6,
        },
        hr: {
          backgroundColor: codeBorder,
          height: 1,
          marginVertical: 8,
        },
        table: {
          borderWidth: 1,
          borderColor: codeBorder,
          borderRadius: 6,
          marginVertical: 6,
        },
        thead: { backgroundColor: codeBg },
        th: {
          padding: 6,
          color: fgColor,
          fontFamily: "Inter_600SemiBold",
        },
        td: {
          padding: 6,
          borderTopWidth: 1,
          borderTopColor: codeBorder,
          color: fgColor,
        },
      }),
    [fgColor, codeBg, codeBorder, linkColor, quoteBorder],
  );

  const renderRules = useMemo(
    () => ({
      image: (
        node: { attributes: { src?: string; alt?: string } },
        _children: unknown,
        _parent: unknown,
        _styles: unknown,
        _inheritedStyles: unknown = {},
      ) => {
        const src = node.attributes?.src;
        const alt = node.attributes?.alt ?? "";
        if (!src) return null;
        return (
          <View key={src + alt} style={styles.imageWrapper}>
            <Image
              source={{ uri: src }}
              style={styles.image}
              contentFit="cover"
              transition={200}
              accessibilityLabel={alt}
            />
            {alt ? (
              <Text
                style={[styles.caption, { color: fgColor }]}
                numberOfLines={2}
              >
                {alt}
              </Text>
            ) : null}
          </View>
        );
      },
    }),
    [fgColor],
  );

  const onLinkPress = (url: string) => {
    Linking.openURL(url).catch(() => {});
    return false;
  };

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
        {shown.length === 0 && isAnimating ? (
          <Text style={[styles.text, { color: fgColor }]}>
            <Text style={{ color: colors.primary }}>▍</Text>
          </Text>
        ) : (
          <View>
            <Markdown
              markdownit={markdownIt}
              style={mdStyles}
              rules={renderRules}
              onLinkPress={onLinkPress}
            >
              {shown}
            </Markdown>
            {isAnimating ? (
              <Text style={[styles.cursorInline, { color: colors.primary }]}>
                ▍
              </Text>
            ) : null}
          </View>
        )}
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
  cursorInline: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: -4,
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
