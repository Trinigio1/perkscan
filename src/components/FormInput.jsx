import React from "react";
import { View, Text, TextInput } from "react-native";

export default function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "sentences",
  style,
  onFocus,
  onBlur,
}) {
  const colors = {
    textSecondary: "#9CA3AF",
    secondary: "#2A2A2A",
    text: "#FFFFFF",
    border: "#374151",
    textDisabled: "#4B5563",
  };

  return (
    <View style={[{ marginBottom: 20 }, style]}>
      <Text
        style={{
          fontFamily: "Roboto_500Medium",
          fontSize: 14,
          color: colors.textSecondary,
          marginBottom: 8,
        }}
      >
        {label}
      </Text>
      <TextInput
        style={{
          backgroundColor: colors.secondary,
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 14,
          fontSize: 16,
          fontFamily: "Roboto_400Regular",
          color: colors.text,
          borderWidth: 1,
          borderColor: colors.border,
        }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDisabled}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </View>
  );
}
