import React from "react";
import { View, Text } from "react-native";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  style,
}) {
  const colors = {
    secondary: "#2A2A2A",
    text: "#FFFFFF",
    textSecondary: "#9CA3AF",
  };

  return (
    <View
      style={[
        {
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
        },
        style,
      ]}
    >
      <View
        style={{
          width: 120,
          height: 120,
          backgroundColor: colors.secondary,
          borderRadius: 60,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 24,
        }}
      >
        <Icon size={48} color={colors.text} strokeWidth={1} />
      </View>

      <Text
        style={{
          fontSize: 24,
          fontFamily: "Roboto_700Bold",
          color: colors.text,
          textAlign: "center",
          marginBottom: 12,
        }}
      >
        {title}
      </Text>

      <Text
        style={{
          fontSize: 16,
          fontFamily: "Roboto_400Regular",
          color: colors.textSecondary,
          textAlign: "center",
          lineHeight: 24,
          marginBottom: 32,
          paddingHorizontal: 20,
        }}
      >
        {description}
      </Text>

      {children}
    </View>
  );
}
