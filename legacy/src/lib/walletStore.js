// src/lib/walletStore.js
import AsyncStorage from "@react-native-async-storage/async-storage";

const WALLET_KEY = "perkscan.wallet.cards";

export async function getWalletCards() {
  const raw = await AsyncStorage.getItem(WALLET_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function addWalletCard(card) {
  // card: { id, product_id, product_name, issuer }
  const current = await getWalletCards();
  const exists = current.some((c) => c.product_id === card.product_id);
  const next = exists ? current : [card, ...current];
  await AsyncStorage.setItem(WALLET_KEY, JSON.stringify(next));
  return next;
}

export async function removeWalletCard(productId) {
  const current = await getWalletCards();
  const next = current.filter((c) => c.product_id !== productId);
  await AsyncStorage.setItem(WALLET_KEY, JSON.stringify(next));
  return next;
}
