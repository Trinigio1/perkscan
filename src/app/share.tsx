import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo } from 'react';
import { Share, View } from 'react-native';
import { Hero } from '@/components/Hero';
import { Button, Note, Screen, T } from '@/components/ui';
import { shareText } from '@/domain/digest';
import { addToBag, formatBag, getHomeCurrency, type MoneyBag } from '@/domain/format';
import { scoreByCurrency } from '@/domain/score';
import { track } from '@/lib/analytics';
import { useData } from '@/lib/data';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';

/** A shareable card with one number — no stores, cards or offers. */
export default function ShareCard() {
  const c = useColors();
  const toast = useToast();
  const { data } = useData();
  const home = data.profile?.home_currency?.trim() || getHomeCurrency();
  useEffect(() => track('share_opened'), []);

  // "Found" = recovered this year + still available: money PerkScan surfaced that was easy to miss.
  const found = useMemo(() => {
    const bag: MoneyBag = {};
    for (const { currency, score } of scoreByCurrency(data.opportunities, data.recovered, new Date(), home)) {
      addToBag(bag, currency, score.recoveredThisYear + score.available + score.atRiskThisWeek);
    }
    return bag;
  }, [data, home]);
  const hasAny = Object.values(found).some((v) => v > 0);
  const text = shareText(formatBag(found, home));

  const share = async () => {
    try {
      await Share.share({ message: text });
    } catch {
      // No share sheet (e.g. some browsers): copy instead.
      await Clipboard.setStringAsync(text);
      toast('Copied — paste it anywhere', { tone: 'info' });
    }
  };

  return (
    <Screen edges={[]}>
      <Hero style={{ paddingVertical: space.xxl }}>
        <T variant="label" color={c.heroMuted}>PerkScan</T>
        <T variant="display" color={c.heroText}>I found {formatBag(found, home)}</T>
        <T variant="heading" color={c.heroText}>I was leaving on the table.</T>
      </Hero>
      <View style={{ gap: space.sm }}>
        <Button title="Share" icon="share-outline" onPress={share} disabled={!hasAny} />
        <Button title="Copy text" icon="copy-outline" kind="secondary" onPress={async () => {
          await Clipboard.setStringAsync(text);
          toast('Copied', { tone: 'info' });
        }} disabled={!hasAny} />
      </View>
      {!hasAny ? <T muted>Nothing to share yet — use a credit or an offer first.</T> : null}
      <Note icon="lock-closed-outline">Only this total is shared — never your stores, cards or offers.</Note>
    </Screen>
  );
}
