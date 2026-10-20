import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, shadow, space, useColors } from '@/theme';

type Show = (message: string, opts?: { tone?: 'success' | 'info' }) => void;
const ToastCtx = createContext<Show>(() => {});
export const useToast = () => useContext(ToastCtx);

/** Small banner that slides in from the top for confirmations ("$15 recovered"). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<{ text: string; tone: 'success' | 'info' } | null>(null);
  const [anim] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const native = Platform.OS !== 'web';

  const show = useCallback<Show>(
    (text, opts) => {
      if (timer.current) clearTimeout(timer.current);
      setMsg({ text, tone: opts?.tone ?? 'success' });
      if (native && opts?.tone !== 'info') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Animated.spring(anim, { toValue: 1, useNativeDriver: native, friction: 8 }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: native }).start(() => setMsg(null));
      }, 2600);
    },
    [anim, native],
  );

  const value = useMemo(() => show, [show]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      {msg ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: insets.top + space.sm,
            left: space.lg,
            right: space.lg,
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }],
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              backgroundColor: msg.tone === 'success' ? c.accent : c.text,
              borderRadius: radius.pill,
              paddingVertical: 12,
              paddingHorizontal: space.lg,
              alignSelf: 'center',
              ...shadow(c, 2),
            }}
          >
            <Ionicons name={msg.tone === 'success' ? 'checkmark-circle' : 'information-circle'} size={20} color={msg.tone === 'success' ? c.accentText : c.bg} />
            <Text style={{ color: msg.tone === 'success' ? c.accentText : c.bg, fontFamily: font.bold, fontSize: 15 }}>{msg.text}</Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}
