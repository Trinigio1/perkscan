import React from "react";
import { TouchableOpacity, Text } from "react-native";

export default function PrimaryButton({
  title,
  icon: Icon,
  onPress,
  variant = "primary",
  style,
  disabled = false,
}) {
  const colors = {
    primary: "#A78BFA",
    primaryText: "#000000",
    secondary: "#2A2A2A",
    secondaryText: "#FFFFFF",
    border: "#374151",
  };

  const isPrimary = variant === "primary";
  const bgColor = isPrimary ? colors.primary : colors.secondary;
  const textColor = isPrimary ? colors.primaryText : colors.secondaryText;

  return (
    <TouchableOpacity
      style={[
        {
          backgroundColor: disabled ? colors.border : bgColor,
          paddingHorizontal: 28,
          paddingVertical: 16,
          borderRadius: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        },
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {Icon && <Icon size={20} color={textColor} strokeWidth={2} />}
      <Text
        style={{
          fontFamily: "Roboto_700Bold",
          fontSize: 16,
          color: textColor,
        }}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}
