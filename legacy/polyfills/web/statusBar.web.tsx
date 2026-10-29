import { useEffect } from "react";
import { Appearance, useColorScheme } from "react-native";
import {
  StatusBar as ExpoStatusBar,
  type StatusBarStyle,
  type StatusBarAnimation,
  type StatusBarProps,
} from "expo-status-bar";
import * as ExpoSB from "expo-status-bar";

function postColorToParent(color: string) {
  try {
    if (typeof window !== "undefined" && "parent" in window) {
      window.parent.postMessage(
        { type: "sandbox:mobile:statusbarcolor", color, timestamp: Date.now() },
        "*"
      );
    }
  } catch {
    console.warn("Color was not sent to parent");
  }
}

function styleToBarColor(
  style: StatusBarStyle | "auto" | "inverted" = "auto",
  colorScheme = Appearance.getColorScheme()
) {
  const actual = colorScheme ?? "light";
  let resolved:
    | Exclude<StatusBarStyle, "auto" | "inverted">
    | "light"
    | "dark" = style as any;

  if (style === "auto") resolved = actual === "light" ? "dark" : "light";
  else if (style === "inverted")
    resolved = actual === "light" ? "light" : "dark";

  return resolved === "light" ? "#FFFFFF" : "#000000";
}

// expo-status-bar 58 (SDK 58) takes no ref and dropped the background-color, translucent and
// network-indicator setters (edge-to-edge made them meaningless), so only what it still has is wrapped.
export function StatusBar({ style = "auto", ...props }: StatusBarProps) {
  const colorScheme = useColorScheme();

  useEffect(() => {
    postColorToParent(styleToBarColor(style, colorScheme));
  }, [style, colorScheme]);

  return <ExpoStatusBar style={style} {...props} />;
}

export const setStatusBarStyle = (style: StatusBarStyle, animated?: boolean) =>
  ExpoSB.setStatusBarStyle(style, animated);

export const setStatusBarHidden = (
  hidden: boolean,
  animation?: StatusBarAnimation
) => ExpoSB.setStatusBarHidden(hidden, animation);

export type { StatusBarStyle, StatusBarAnimation, StatusBarProps };
