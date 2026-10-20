import React from "react";
import { View, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ScreenLayout({
  children,
  padding = true,
  paddingTop = 20,
  paddingHorizontal = 24,
  style,
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[{ flex: 1, backgroundColor: "#000000" }, style]}>
      <StatusBar barStyle="light-content" />

      <View
        style={{
          flex: 1,
          paddingTop: padding ? insets.top + paddingTop : 0,
          paddingHorizontal: padding ? paddingHorizontal : 0,
        }}
      >
        {children}
      </View>
    </View>
  );
}
