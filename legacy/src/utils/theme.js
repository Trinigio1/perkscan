export const useTheme = () => {
  const colors = {
    background: "#000000",
    elevated: "#1A1A1A",
    card: "#1F1F1F",
    primary: "#A78BFA", // Purple
    primaryText: "#000000",
    secondary: "#2A2A2A",
    secondaryText: "#FFFFFF",
    text: "#FFFFFF",
    textSecondary: "#9CA3AF",
    textMuted: "#6B7280",
    textDisabled: "#4B5563",
    border: "#374151",
    success: "#10B981",
    error: "#EF4444",
    warning: "#F59E0B",
    tabBackground: "#1F1F1F",
    tabActive: "#A78BFA",
    tabInactive: "#6B7280",
  };

  return {
    colors,
    statusBarStyle: "light",
  };
};
