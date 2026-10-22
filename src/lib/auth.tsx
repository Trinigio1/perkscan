import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/** Deep link Supabase sends users back to (magic links and Google). Add it to Supabase → Auth → URL Configuration. */
export const authRedirectUrl = () => Linking.createURL('auth/callback');

interface AuthState {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo(() => state, [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export async function sendEmailCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: authRedirectUrl() },
  });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

/**
 * Completes a sign-in redirect to …/auth/callback.
 * - Email links carry ?token_hash=…&type=email (see supabase/templates). These work in any
 *   browser or app that opens them, unlike PKCE codes.
 * - Google returns ?code=…, which must be exchanged in the same app that started the flow.
 */
export async function completeAuthFromUrl(url: string) {
  const { queryParams } = Linking.parse(url);
  const errorDescription = queryParams?.error_description;
  if (typeof errorDescription === 'string') throw new Error(errorDescription);

  const tokenHash = queryParams?.token_hash;
  if (typeof tokenHash === 'string') {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    if (error) throw error;
    return true;
  }

  const code = queryParams?.code;
  if (typeof code !== 'string') return false;
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return true;
}

/** Google via the system browser. Works in Expo Go and in builds — no native Google SDK needed. */
export async function signInWithGoogle() {
  const redirectTo = authRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;
  return completeAuthFromUrl(result.url);
}

/** Sign in with Apple (iOS only, needs a paid Apple Developer account). */
export async function signInWithApple() {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });
  if (!credential.identityToken) throw new Error('Apple did not return an identity token.');
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
  // Apple only shares the name on the first sign-in.
  const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
  if (name) {
    const { data } = await supabase.auth.getUser();
    if (data.user) await supabase.from('profiles').update({ display_name: name }).eq('id', data.user.id);
  }
  return true;
}

/** `local` only clears this device's session (used after the account was deleted on the server). */
export async function signOut(scope: 'global' | 'local' = 'global') {
  await supabase.auth.signOut({ scope });
}
