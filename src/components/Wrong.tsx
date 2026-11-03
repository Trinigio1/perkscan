import { useState } from 'react';
import { View } from 'react-native';
import { track } from '@/lib/analytics';
import { useData } from '@/lib/data';
import { reportWrong, type WrongKind, type WrongReason } from '@/lib/inbox';
import { useToast } from '@/lib/toast';
import { space } from '@/theme';
import { Button, Chip, Row, T } from './ui';

const LABELS: Record<WrongReason, string> = {
  not_mine: 'Not mine',
  wrong_amount: 'Wrong amount',
  does_not_apply: 'Doesn’t apply',
  expired: 'Expired',
  other: 'Something else',
};

/**
 * "This is wrong": one tap opens the reasons, a second tap hides it for you and adds it to the list the
 * team works through. Every item PerkScan shows should have one.
 */
export function WrongButton({ kind, itemKey, catalogRef, reasons = ['not_mine', 'does_not_apply', 'wrong_amount', 'expired'], label = 'This is wrong' }: { kind: WrongKind; itemKey: string; catalogRef?: string; reasons?: WrongReason[]; label?: string }) {
  const toast = useToast();
  const { refresh } = useData();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async (reason: WrongReason) => {
    setBusy(true);
    try {
      await reportWrong(kind, itemKey, reason, { catalogRef });
      track('reported_wrong', { kind, reason });
      toast('Thanks — hidden, and it helps fix PerkScan', { tone: 'info' });
      await refresh();
    } catch (e) {
      toast((e as Error).message, { tone: 'info' });
      setBusy(false);
    }
  };
  if (!open) return <Button title={label} size="sm" kind="ghost" icon="flag-outline" onPress={() => setOpen(true)} />;
  return (
    <View style={{ gap: space.xs }}>
      <T variant="caption" muted>What’s wrong?</T>
      <Row gap={space.xs} style={{ flexWrap: 'wrap' }}>
        {reasons.map((r) => (
          <Chip key={r} label={LABELS[r]} onPress={() => !busy && send(r)} />
        ))}
        <Chip label="Cancel" onPress={() => setOpen(false)} />
      </Row>
    </View>
  );
}
