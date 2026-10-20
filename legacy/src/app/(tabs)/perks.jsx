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
import { Gift, Plus } from "lucide-react-native";

import ScreenLayout from "../../components/ScreenLayout";
import EmptyState from "../../components/EmptyState";
import PrimaryButton from "../../components/PrimaryButton";
import PerkCard from "../../components/PerkCard";
import { useFocusEffect } from "@react-navigation/native";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebaseClient";



import { getWalletCards } from "../../lib/walletStore";
import { getProductById } from "../../data/cardCatalog";
import { useQueryClient } from "@tanstack/react-query";






export default function Perks() {
  const insets = useSafeAreaInsets();
  

  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
   
  });
  
  const scanEmailNow = async () => {
  Alert.alert("Tapped", "Scan Email Now pressed ✅");

  try {
    const fn = httpsCallable(functions, "gmailSyncPerks");
const res = await fn({});
    console.log("gmailSyncPerks result:", res.data);

    Alert.alert("Sync complete", JSON.stringify(res.data));
  } catch (e) {
    console.log("gmailSyncPerks error:", e);
    Alert.alert("Sync failed", String(e?.message || e));
  }
};




  const [perks, setPerks] = useState([]);
  const [totalUnclaimed, setTotalUnclaimed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasCards, setHasCards] = useState(false);

  const fetchPerks = useCallback(async () => {
    try {
      const cards = await getWalletCards();
      setHasCards((cards || []).length > 0);

      const perksFromWallet = [];
      for (const c of cards || []) {
        const product = getProductById(c.product_id);
        if (!product) continue;

        for (const perk of product.perks || []) {
          perksFromWallet.push({
            ...perk,
            status: "unclaimed",
          });
        }
      }

      setPerks(perksFromWallet);

      const total = perksFromWallet.reduce((sum, p) => {
        const v = parseFloat(p.est_value);
        return sum + (Number.isFinite(v) ? v : 0);
      }, 0);

      setTotalUnclaimed(total);
    } catch (error) {
      console.error("Error building perks:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
  useCallback(() => {
    // runs every time Perks tab becomes active
    fetchPerks();
  }, [fetchPerks])
);


  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPerks();
  }, [fetchPerks]);

  const handleToggleStatus = useCallback((perkId, newStatus) => {
    // local-only for now (no backend)
    setPerks((prev) =>
      prev.map((perk) =>
        perk.perk_id === perkId ? { ...perk, status: newStatus } : perk
      )
    );
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

  if (!hasCards) {
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
          icon={Gift}
          title="No Perks Yet"
          description="Add credit cards to your wallet to discover perks you're eligible for."
        >
          <PrimaryButton title="Scan Email Now" onPress={scanEmailNow} />

        </EmptyState>
      </ScreenLayout>
    );
  }

  const unclaimedPerks = perks.filter((p) => p.status === "unclaimed");

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
        <Text
          style={{
            fontFamily: "Roboto_700Bold",
            fontSize: 32,
            color: "#FFFFFF",
            marginBottom: 24,
          }}
        >
          Your Perks
        </Text>

        {totalUnclaimed > 0 && (
          <View
            style={{
              backgroundColor: "#A78BFA",
              borderRadius: 20,
              padding: 24,
              marginBottom: 24,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto_500Medium",
                fontSize: 14,
                color: "#000000",
                marginBottom: 8,
                opacity: 0.8,
              }}
            >
              You're missing out on
            </Text>
            <Text
              style={{
                fontFamily: "Roboto_700Bold",
                fontSize: 48,
                color: "#000000",
                marginBottom: 8,
              }}
            >
              ${totalUnclaimed.toFixed(0)}
            </Text>
            <Text
              style={{
                fontFamily: "Roboto_400Regular",
                fontSize: 14,
                color: "#000000",
                opacity: 0.9,
              }}
            >
              in unclaimed perks ({unclaimedPerks.length} perk
              {unclaimedPerks.length !== 1 ? "s" : ""})
            </Text>
          </View>
        )}

        {perks.map((perk) => (
          <PerkCard
            key={perk.perk_id}
            perk={perk}
            onToggleStatus={handleToggleStatus}
          />
        ))}
      </ScrollView>
    </ScreenLayout>
  );
}
