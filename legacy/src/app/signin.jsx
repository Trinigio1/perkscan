import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useRouter } from "expo-router";


export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const onSignIn = async () => {
    setErr("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace("/"); // or /home if you have it
    } catch (e) {
      setErr(e?.message ?? "Sign in failed");
    }
  };

  return (
    <View style={{ padding: 20, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "600" }}>Sign in</Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        placeholder="Email"
        style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}
      />

      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Password"
        style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}
      />

      {!!err && <Text style={{ color: "red" }}>{err}</Text>}

      <TouchableOpacity onPress={onSignIn} style={{ padding: 14, borderWidth: 1, borderRadius: 10 }}>
        <Text style={{ textAlign: "center" }}>Sign in</Text>
      </TouchableOpacity>
    </View>
  );
}
