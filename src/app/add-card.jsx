import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useFonts,
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
} from "@expo-google-fonts/roboto";
import { X, Sparkles } from "lucide-react-native";
import { router } from "expo-router";
import { detectCardFromQuery } from "../lib/detectCard"; // adjust path if needed
import { addWalletCard } from "../lib/walletStore";
import { useRouter } from "expo-router";


export default function AddCard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
  });

  const [cardName, setCardName] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleDetect = async () => {
  if (!cardName.trim()) {
    Alert.alert("Error", "Please enter a card name");
    return;
  }

  setDetecting(true);
  setResult(null);

  try {
    const data = detectCardFromQuery(cardName);

    if (!data.productId) {
      Alert.alert("Not found", "Couldn’t match that card. Try a more specific name.");
      setResult(data); // still show suggestions
      return;
    }

    setResult(data);
  } catch (error) {
    console.error("Detection error:", error);
    Alert.alert("Error", "Failed to detect card. Please try again.");
  } finally {
    setDetecting(false);
  }


    setDetecting(true);
    setResult(null);

    try {
      const response = await fetch("/api/detect-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: cardName }),
      });

      if (!response.ok) {
        throw new Error("Detection failed");
      }

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error("Detection error:", error);
      Alert.alert("Error", "Failed to detect card. Please try again.");
    } finally {
      setDetecting(false);
    }
  };

  const handleSaveCard = async (productId, productName, issuer) => {
  setSaving(true);
  try {
    await addWalletCard({
      id: productId,            // used by UI components
      product_id: productId,    // used by existing wallet code patterns
      product_name: productName,
      issuer,
    });

    Alert.alert("Saved", "Card added to wallet.");
    router.back();
  } catch (e) {
    console.error(e);
    Alert.alert("Error", "Failed to save card.");
  } finally {
    setSaving(false);
  }
};

  if (!fontsLoaded) {
    return null;
  }

  const colors = {
    background: "#000000",
    card: "#1F1F1F",
    primary: "#A78BFA",
    primaryText: "#000000",
    secondary: "#2A2A2A",
    text: "#FFFFFF",
    textSecondary: "#9CA3AF",
    textMuted: "#6B7280",
    border: "#374151",
    success: "#10B981",
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 20,
          paddingHorizontal: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 32,
          }}
        >
          <Text
            style={{
              fontSize: 28,
              fontFamily: "Roboto_700Bold",
              color: colors.text,
            }}
          >
            Add Card
          </Text>

          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.secondary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={24} color={colors.text} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>

        {/* Input Section */}
        <View style={{ marginBottom: 24 }}>
          <Text
            style={{
              fontFamily: "Roboto_500Medium",
              fontSize: 14,
              color: colors.textSecondary,
              marginBottom: 8,
            }}
          >
            Card Name
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
              marginBottom: 16,
            }}
            value={cardName}
            onChangeText={setCardName}
            placeholder="e.g., Chase Sapphire Preferred"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />

          <TouchableOpacity
            onPress={handleDetect}
            disabled={detecting || !cardName.trim()}
            style={{
              backgroundColor:
                detecting || !cardName.trim() ? colors.border : colors.primary,
              paddingVertical: 16,
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {detecting ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <>
                <Sparkles
                  size={20}
                  color={colors.primaryText}
                  strokeWidth={2}
                />
                <Text
                  style={{
                    fontFamily: "Roboto_700Bold",
                    fontSize: 16,
                    color: colors.primaryText,
                  }}
                >
                  Auto-Detect
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Results Section */}
        {result && (
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 20,
              borderWidth: 2,
              borderColor:
                result.confidence >= 0.8 ? colors.success : colors.primary,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto_700Bold",
                fontSize: 18,
                color: colors.text,
                marginBottom: 12,
              }}
            >
              Detected Card
            </Text>

            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontFamily: "Roboto_700Bold",
                  fontSize: 20,
                  color: colors.text,
                  marginBottom: 4,
                }}
              >
                {result.productName}
              </Text>
              <Text
                style={{
                  fontFamily: "Roboto_400Regular",
                  fontSize: 14,
                  color: colors.textMuted,
                  marginBottom: 12,
                }}
              >
                {result.issuer}
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Roboto_500Medium",
                    fontSize: 14,
                    color: colors.textSecondary,
                  }}
                >
                  Confidence:
                </Text>
                <Text
                  style={{
                    fontFamily: "Roboto_700Bold",
                    fontSize: 14,
                    color:
                      result.confidence >= 0.8
                        ? colors.success
                        : colors.primary,
                  }}
                >
                  {(result.confidence * 100).toFixed(0)}%
                </Text>
              </View>

              {result.matchedOn && (
                <Text
                  style={{
                    fontFamily: "Roboto_400Regular",
                    fontSize: 12,
                    color: colors.textMuted,
                  }}
                >
                  Matched on: {result.matchedOn}
                </Text>
              )}
            </View>

            {result.needsConfirmation && result.topSuggestions?.length > 0 && (
              <View
                style={{
                  backgroundColor: colors.background,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Roboto_700Bold",
                    fontSize: 14,
                    color: colors.textSecondary,
                    marginBottom: 12,
                  }}
                >
                  Other suggestions:
                </Text>
                {result.topSuggestions.slice(0, 3).map((suggestion, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() =>
                      handleSaveCard(
                        suggestion.productId,
                        suggestion.displayName,
                        suggestion.issuer,
                      )
                    }
                    style={{
                      paddingVertical: 12,
                      borderBottomWidth: index < 2 ? 1 : 0,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Roboto_500Medium",
                        fontSize: 14,
                        color: colors.text,
                      }}
                    >
                      {suggestion.displayName}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Roboto_400Regular",
                        fontSize: 12,
                        color: colors.textMuted,
                      }}
                    >
                      {suggestion.issuer}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity
              onPress={() =>
                handleSaveCard(
                  result.productId,
                  result.productName,
                  result.issuer,
                )
              }
              disabled={saving}
              style={{
                backgroundColor: saving ? colors.border : colors.primary,
                paddingVertical: 16,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto_700Bold",
                  fontSize: 16,
                  color: colors.primaryText,
                }}
              >
                {saving ? "Saving..." : "Add to Wallet"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
