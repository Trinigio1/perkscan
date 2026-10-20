import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";
import * as Google from "expo-auth-session/providers/google";
WebBrowser.maybeCompleteAuthSession();

export default function ConnectEmail() {
  const [loading, setLoading] = useState(false);

  // ✅ Use ANDROID client id for your dev build on Android
  const androidClientId =
  Constants.expoConfig?.extra?.googleOAuthAndroidClientId ??
  Constants.manifest?.extra?.googleOAuthAndroidClientId ??
  process.env.EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID;

if (!androidClientId) {
  Alert.alert("Missing config", "Android OAuth Client ID not set.");
  return null;
}

const redirectUri = AuthSession.makeRedirectUri({
  native: `com.googleusercontent.apps.${androidClientId.split(".apps.googleusercontent.com")[0]}:/oauth2redirect`,
});

  const discovery = useMemo(
    () => ({
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      revocationEndpoint: "https://oauth2.googleapis.com/revoke",
    }),
    []
  );

  // Helpful debug
  useEffect(() => {
    console.log("ANDROID CLIENT ID:", androidClientId);
    console.log("REDIRECT URI:", redirectUri);
  }, [androidClientId, redirectUri]);

  console.log("ANDROID CLIENT ID USED:", androidClientId);
console.log("REDIRECT USED:", redirectUri);


  const [request, response, promptAsync] = Google.useAuthRequest({
  androidClientId,
  scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  clientId: androidClientId,
redirectUri,

});

  useEffect(() => {
    const exchange = async () => {
      if (response?.type !== "success") return;

      const code = response.params?.code;
      if (!code) {
        Alert.alert("Error", "No auth code returned.");
        return;
      }

      setLoading(true);
      try {
        const fn = httpsCallable(getFunctions(getApp()), "gmailOauthExchange");
        await fn({ code, redirectUri });
        Alert.alert("Connected", "Gmail connected successfully.");
      } catch (e) {
  console.log("CONNECT EMAIL callable error raw:", e);
  console.log("code:", e?.code);
  console.log("message:", e?.message);
  console.log("details:", e?.details);
  Alert.alert(
    "Sync failed",
    `${e?.code || ""}\n${e?.message || ""}\n${JSON.stringify(e?.details || {})}`
  );
}

    };

    exchange();
  }, [response, redirectUri]);

  const onConnect = async () => {
    if (!androidClientId) {
      Alert.alert(
        "Missing config",
        "googleOAuthAndroidClientId / EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID not set."
      );
      return;
    }
    if (!request) {
      Alert.alert("Please wait", "Auth request not ready yet.");
      return;
    }

    try {
      await promptAsync({ showInRecents: true });
    } catch (e) {
      console.error("promptAsync error:", e);
      Alert.alert("Error", String(e?.message || e));
    }
  };

  return (
    <View style={{ padding: 20, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "600" }}>Connect Email</Text>

      <TouchableOpacity
        onPress={onConnect}
        disabled={loading}
        style={{
          borderWidth: 1,
          padding: 14,
          borderRadius: 12,
          opacity: loading ? 0.6 : 1,
        }}
      >
        <Text style={{ textAlign: "center" }}>
          {loading ? "Connecting..." : "Connect Gmail"}
        </Text>
      </TouchableOpacity>

      <Text style={{ opacity: 0.7 }}>Redirect: {redirectUri}</Text>
    </View>
  );
}
