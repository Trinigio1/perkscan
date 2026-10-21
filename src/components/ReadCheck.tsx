import { router } from 'expo-router';
import { useState } from 'react';
import { submitReview } from '@/lib/feedback';
import { useToast } from '@/lib/toast';
import { space } from '@/theme';
import { Button, Panel, Row, T } from './ui';

/** "Did PerkScan read this right?" on an offer that came from an email or text. */
export function ReadCheck({ messageId, opportunityId }: { messageId: string; opportunityId: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (done) return null;
  return (
    <Panel style={{ gap: space.sm }}>
      <T variant="subheading">Did PerkScan read this right?</T>
      <T variant="caption" muted>Compare it with the original email or text. Your answer helps measure accuracy.</T>
      <Row gap={space.sm}>
        <Button
          title="Yes"
          icon="thumbs-up-outline"
          size="sm"
          kind="secondary"
          loading={busy}
          style={{ flex: 1 }}
          onPress={async () => {
            setBusy(true);
            try {
              await submitReview({ messageId, verdict: 'right' });
              toast('Thanks — marked right', { tone: 'info' });
              setDone(true);
            } catch (e) {
              toast((e as Error).message, { tone: 'info' });
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button
          title="No, fix it"
          icon="create-outline"
          size="sm"
          kind="secondary"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/report', params: { messageId, opportunityId } })}
        />
      </Row>
    </Panel>
  );
}
