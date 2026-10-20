import React, { useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  useFonts,
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
} from "@expo-google-fonts/roboto";
import { Sparkles, CreditCard, Gift, TrendingUp } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "@/utils/auth/useAuth";
import { useRouter } from "expo-router";


export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { auth, isReady, signIn } = useAuth();
  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
  });

  useEffect(() => {
    // Auto-redirect to wallet if already authenticated
    if (isReady && auth) {
      router.replace("/(tabs)/wallet");
    }
  }, [isReady, auth]);

  if (!fontsLoaded || !isReady) {
    return null;
  }

  const colors = {
    background: "#000000",
    primary: "#A78BFA",
    primaryText: "#000000",
    text: "#FFFFFF",
    textSecondary: "#9CA3AF",
    textMuted: "#6B7280",
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top + 40,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 24,
      }}
    >
      <StatusBar style="light" />

      {/* Logo/Icon */}
      <View
        style={{
          alignItems: "center",
          marginBottom: 40,
        }}
      >
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          <Sparkles size={40} color={colors.primaryText} strokeWidth={2} />
        </View>
        <Text
          style={{
            fontFamily: "Roboto_700Bold",
            fontSize: 36,
            color: colors.text,
            marginBottom: 8,
          }}
        >
          PerkScan
        </Text>
        <Text
          style={{
            fontFamily: "Roboto_400Regular",
            fontSize: 16,
            color: colors.textSecondary,
            textAlign: "center",
          }}
        >
          Discover credit card perks you're missing
        </Text>
      </View>

      {/* Hero Value Prop */}
      <View
        style={{
          backgroundColor: "#1A1A1A",
          borderRadius: 20,
          padding: 28,
          marginBottom: 32,
          borderWidth: 1,
          borderColor: "#2A2A2A",
        }}
      >
        <Text
          style={{
            fontFamily: "Roboto_500Medium",
            fontSize: 14,
            color: colors.textSecondary,
            marginBottom: 12,
            textAlign: "center",
          }}
        >
          Average user saves
        </Text>
        <Text
          style={{
            fontFamily: "Roboto_700Bold",
            fontSize: 56,
            color: colors.primary,
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          $847
        </Text>
        <Text
          style={{
            fontFamily: "Roboto_400Regular",
            fontSize: 14,
            color: colors.textMuted,
            textAlign: "center",
          }}
        >
          per year in unclaimed perks
        </Text>
      </View>

      {/* Features */}
      <View style={{ marginBottom: 32 }}>
        <Feature
          icon={CreditCard}
          title="Add Your Cards"
          description="AI-powered card detection makes it easy"
          colors={colors}
        />
        <Feature
          icon={Gift}
          title="Find Hidden Perks"
          description="Discover benefits you didn't know existed"
          colors={colors}
        />
        <Feature
          icon={TrendingUp}
          title="Track Value"
          description="See exactly how much you're missing out on"
          colors={colors}
        />
      </View>

      {/* CTA Buttons */}
      <View style={{ marginTop: "auto" }}>
        <TouchableOpacity
          onPress={() => router.push("/signin")}
          style={{
            backgroundColor: colors.primary,
            paddingVertical: 18,
            borderRadius: 14,
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto_700Bold",
              fontSize: 18,
              color: colors.primaryText,
            }}
          >
            Get Started
          </Text>
        </TouchableOpacity>

        <Text
          style={{
            fontFamily: "Roboto_400Regular",
            fontSize: 13,
            color: colors.textMuted,
            textAlign: "center",
          }}
        >
          Free • No credit card required
        </Text>
      </View>
    </View>
  );
}

function Feature({ icon: Icon, title, description, colors }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 20,
        gap: 16,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: "#1A1A1A",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={24} color={colors.primary} strokeWidth={1.5} />
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
          {title}
        </Text>
        <Text
          style={{
            fontFamily: "Roboto_400Regular",
            fontSize: 14,
            color: colors.textSecondary,
          }}
        >
          {description}
        </Text>
      </View>
    </View>
  );
}
