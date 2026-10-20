import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, RefreshControl, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  useFonts,
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
} from "@expo-google-fonts/roboto";
import { CreditCard, Plus } from "lucide-react-native";

import ScreenLayout from "../../components/ScreenLayout";
import EmptyState from "../../components/EmptyState";
import PrimaryButton from "../../components/PrimaryButton";
import CardProductCard from "../../components/CardProductCard";
import { useFocusEffect } from "@react-navigation/native";


import { getWalletCards, removeWalletCard } from "../../lib/walletStore";

export default function Wallet() {
  const insets = useSafeAreaInsets();

  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
  });

  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCards = useCallback(async () => {
    try {
      const localCards = await getWalletCards();
      setCards(localCards || []);
    } catch (error) {
      console.error("Error fetching cards:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
  useCallback(() => {
    // runs every time Wallet tab becomes active
    fetchCards();
  }, [fetchCards])
);


  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCards();
  }, [fetchCards]);

  const handleDeleteCard = useCallback((productId) => {
    Alert.alert("Delete Card", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const next = await removeWalletCard(productId);
            setCards(next);
          } catch (error) {
            console.error("Error deleting card:", error);
            Alert.alert("Error", "Failed to delete card");
          }
        },
      },
    ]);
  }, []);

  if (!fontsLoaded) return null;

  if (loading) {
    return (
      <ScreenLayout
        style={{
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 80,
          alignItems: "center",
          justifyContent: "center",
        }}
        padding={false}
      >
        <Text style={{ color: "#FFFFFF", fontFamily: "Roboto_400Regular" }}>
          Loading...
        </Text>
      </ScreenLayout>
    );
  }

  if (cards.length === 0) {
    return (
      <ScreenLayout
        style={{
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 80,
          alignItems: "center",
          justifyContent: "center",
        }}
        padding={false}
      >
        <EmptyState
          icon={CreditCard}
          title="Your Wallet"
          description="Add your credit cards to discover perks you're missing out on."
        >
          <PrimaryButton
            title="Add Card"
            icon={Plus}
            onPress={() => router.push("/add-card")}
            style={{ minWidth: 200 }}
          />
        </EmptyState>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout padding={false}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 80,
          paddingHorizontal: 24,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#A78BFA"
          />
        }
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto_700Bold",
              fontSize: 32,
              color: "#FFFFFF",
            }}
          >
            My Wallet
          </Text>
        </View>

        {cards.map((card) => (
          <CardProductCard
            key={card.id || card.product_id}
            card={{
              // normalize shape so existing CardProductCard works
              id: card.id || card.product_id,
              product_id: card.product_id,
              product_name: card.product_name,
              issuer: card.issuer,
            }}
            onDelete={() => handleDeleteCard(card.product_id)}
          />
        ))}

        <PrimaryButton
          title="Add Another Card"
          icon={Plus}
          onPress={() => router.push("/add-card")}
          style={{ marginTop: 8 }}
        />
      </ScrollView>
    </ScreenLayout>
  );
}
