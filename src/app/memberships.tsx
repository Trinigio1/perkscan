import { MembershipPicker } from '@/components/MembershipPicker';
import { Panel, Screen, T } from '@/components/ui';
import { useMembershipHints } from '@/lib/memberships';
import { space } from '@/theme';

/** Memberships you belong to: each comes with perks, and some include things you may be paying for twice. */
export default function Memberships() {
  const hints = useMembershipHints();
  return (
    <Screen edges={[]}>
      <T muted>Turn on what you’re a member of. PerkScan shows what each one includes and spots subscriptions you might be paying for twice.</T>
      <Panel style={{ paddingVertical: space.xs }}>
        <MembershipPicker suggested={hints.map((h) => h.membershipId)} />
      </Panel>
      <T variant="caption" faint center>Perks come from each company’s own pages. Terms change: check your account before relying on one.</T>
    </Screen>
  );
}
