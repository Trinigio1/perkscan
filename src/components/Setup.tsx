import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import type { ReactNode } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { relativeDays } from '@/domain/format';
import type { IngestToken } from '@/domain/types';
import { useToast } from '@/lib/toast';
import { font, radius, space, useColors } from '@/theme';
import { Button, IconBubble, Panel, Row, T } from './ui';

// Building blocks for the Connect Gmail and Connect texts screens.

export function CopyBox({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const c = useColors();
  const toast = useToast();
  return (
    <View style={{ gap: 6 }}>
      <T variant="label">{label}</T>
      <Pressable
        onPress={async () => {
          await Clipboard.setStringAsync(value);
          toast(`${label} copied`, { tone: 'info' });
        }}
        accessibilityLabel={`Copy ${label}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          padding: space.md,
          borderRadius: radius.md,
          backgroundColor: secret ? c.warnSoft : c.surfaceAlt,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <T variant="caption" style={{ flex: 1, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) }} numberOfLines={3}>
          {value}
        </T>
        <Ionicons name="copy-outline" size={18} color={c.textMuted} />
      </Pressable>
    </View>
  );
}

export function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  const c = useColors();
  return (
    <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
        <T variant="label" color={c.accentText} style={{ fontFamily: font.bold }}>{n}</T>
      </View>
      <View style={{ flex: 1, gap: space.sm }}>
        <T variant="subheading">{title}</T>
        {children}
      </View>
    </Row>
  );
}


/** Asks before revoking; the browser's confirm on web, where Alert buttons don't work. */
export function confirmRevoke(consequence: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`Revoke this token? ${consequence}`)) onConfirm();
    return;
  }
  Alert.alert('Revoke this token?', consequence, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Revoke', style: 'destructive', onPress: onConfirm },
  ]);
}

export function TokenList({ tokens, onRevoke }: { tokens: IngestToken[]; onRevoke: (t: IngestToken) => void }) {
  if (!tokens.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      <T variant="overline" muted>Active tokens</T>
      <Panel style={{ paddingVertical: space.xs }}>
        {tokens.map((t) => (
          <Row key={t.id} gap={space.md} style={{ paddingVertical: space.sm }}>
            <IconBubble icon="key" tone="gray" size={34} />
            <View style={{ flex: 1 }}>
              <T variant="subheading">{t.label}</T>
              <T variant="caption" muted>
                Created {relativeDays(new Date(t.created_at), new Date())} · {t.last_used_at ? `last used ${relativeDays(new Date(t.last_used_at), new Date())}` : 'not used yet'}
              </T>
            </View>
            <Button title="Revoke" kind="danger" size="sm" onPress={() => onRevoke(t)} />
          </Row>
        ))}
      </Panel>
    </View>
  );
}
