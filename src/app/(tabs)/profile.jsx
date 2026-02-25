import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useFonts,
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
} from "@expo-google-fonts/roboto";
import { LogOut, Mail } from "lucide-react-native";
import ScreenLayout from "../../components/ScreenLayout";


export default function Profile() {
  const insets = useSafeAreaInsets();
  
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
  });

  

  if (!fontsLoaded) return null;


  const colors = {
    card: "#1F1F1F",
    background: "#000000",
    text: "#FFFFFF",
    textMuted: "#6B7280",
    textSecondary: "#9CA3AF",
    primary: "#A78BFA",
    primaryText: "#000000",
    error: "#EF4444",
    border: "#374151",
  };

  return (
    <ScreenLayout padding={false}>
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 80,
          paddingHorizontal: 24,
        }}
      >
        <Text
          style={{
            fontFamily: "Roboto_700Bold",
            fontSize: 32,
            color: colors.text,
            marginBottom: 32,
          }}
        >
          Profile
        </Text>

        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
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
              gap: 16,
              marginBottom: 16,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto_700Bold",
                  fontSize: 28,
                  color: colors.primaryText,
                }}
              >
                {auth?.user?.email?.[0]?.toUpperCase() || "U"}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: "Roboto_700Bold",
                  fontSize: 20,
                  color: colors.text,
                  marginBottom: 4,
                }}
              >
                {auth?.user?.name || "User"}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Mail size={14} color={colors.textMuted} />
                <Text
                  style={{
                    fontFamily: "Roboto_400Regular",
                    fontSize: 14,
                    color: colors.textMuted,
                  }}
                >
                  {auth?.user?.email || "Email"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
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
            About PerkScan
          </Text>
          <Text
            style={{
              fontFamily: "Roboto_400Regular",
              fontSize: 14,
              color: colors.textSecondary,
              lineHeight: 20,
            }}
          >
            PerkScan helps you discover credit card perks you already qualify
            for but aren't using. Add your cards and unlock hidden value!
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => {}}
          style={{
            backgroundColor: colors.error,
            paddingVertical: 16,
            borderRadius: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: "auto",
          }}
        >
          <LogOut size={20} color="#FFFFFF" strokeWidth={2} />
          <Text
            style={{
              fontFamily: "Roboto_700Bold",
              fontSize: 16,
              color: "#FFFFFF",
            }}
          >
            Sign Out
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenLayout>
  );
}
