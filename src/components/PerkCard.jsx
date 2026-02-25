import React from "react";
import { View, Text, TouchableOpacity, Linking } from "react-native";
import { Gift, ExternalLink } from "lucide-react-native";

export default function PerkCard({ perk, onToggleStatus }) {
  const colors = {
    card: "#1F1F1F",
    text: "#FFFFFF",
    textSecondary: "#9CA3AF",
    textMuted: "#6B7280",
    primary: "#A78BFA",
    primaryText: "#000000",
    secondary: "#2A2A2A",
  };

  const isHighValue = parseFloat(perk.est_value) >= 200;
  const isActive = perk.status === "active";

  const handleEnroll = () => {
    if (perk.enrollment_url) {
      Linking.openURL(perk.enrollment_url);
    }
  };

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: isHighValue ? 2 : 0,
        borderColor: isHighValue ? colors.primary : "transparent",
        shadowColor: "#fff",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 3,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <View style={{ flex: 1, marginRight: 12 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto_700Bold",
                fontSize: 18,
                color: colors.text,
              }}
            >
              {perk.title}
            </Text>
            {isHighValue && (
              <View
                style={{
                  backgroundColor: colors.primary,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 4,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Roboto_700Bold",
                    fontSize: 10,
                    color: colors.primaryText,
                  }}
                >
                  HIGH VALUE
                </Text>
              </View>
            )}
          </View>

          <Text
            style={{
              fontFamily: "Roboto_400Regular",
              fontSize: 12,
              color: colors.textMuted,
              marginBottom: 8,
            }}
          >
            {perk.category}
          </Text>
        </View>

        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: isActive ? colors.primary : colors.secondary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Gift
            size={24}
            color={isActive ? colors.primaryText : colors.text}
            strokeWidth={1.5}
          />
        </View>
      </View>

      {/* Details */}
      <Text
        style={{
          fontFamily: "Roboto_400Regular",
          fontSize: 14,
          color: colors.textSecondary,
          lineHeight: 20,
          marginBottom: 12,
        }}
      >
        {perk.details}
      </Text>

      {/* Value */}
      <Text
        style={{
          fontFamily: "Roboto_700Bold",
          fontSize: 16,
          color: colors.primary,
          marginBottom: 16,
        }}
      >
        Estimated value: ${parseFloat(perk.est_value).toFixed(2)}
      </Text>

      {/* Actions */}
      <View
        style={{
          flexDirection: "row",
          gap: 12,
        }}
      >
        <TouchableOpacity
          onPress={() =>
            onToggleStatus(perk.perk_id, isActive ? "unclaimed" : "active")
          }
          style={{
            flex: 1,
            backgroundColor: isActive ? colors.secondary : colors.primary,
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto_700Bold",
              fontSize: 14,
              color: isActive ? colors.text : colors.primaryText,
            }}
          >
            {isActive ? "Mark Unclaimed" : "Mark Active"}
          </Text>
        </TouchableOpacity>

        {perk.enrollment_url && (
          <TouchableOpacity
            onPress={handleEnroll}
            style={{
              backgroundColor: colors.secondary,
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ExternalLink size={18} color={colors.text} strokeWidth={1.5} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
