import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { CreditCard, Trash2 } from "lucide-react-native";

export default function CardProductCard({ card, onDelete }) {
  const colors = {
    card: "#1F1F1F",
    text: "#FFFFFF",
    textMuted: "#6B7280",
    secondary: "#2A2A2A",
    primary: "#A78BFA",
    error: "#EF4444",
  };

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 20,
        marginBottom: 12,
        shadowColor: "#fff",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 3,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flex: 1,
            gap: 16,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: colors.secondary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CreditCard size={24} color={colors.primary} strokeWidth={1.5} />
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: "Roboto_700Bold",
                fontSize: 16,
                color: colors.text,
                marginBottom: 4,
              }}
            >
              {card.product_name}
            </Text>
            <Text
              style={{
                fontFamily: "Roboto_400Regular",
                fontSize: 14,
                color: colors.textMuted,
              }}
            >
              {card.issuer}
            </Text>
          </View>
        </View>

        {onDelete && (
          <TouchableOpacity
            onPress={() => onDelete(card.id)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.secondary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Trash2 size={18} color={colors.error} strokeWidth={1.5} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
