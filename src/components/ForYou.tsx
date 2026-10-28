import { router } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { INTERESTS } from "@/domain/deals";
import type { ForYouItem } from "@/domain/forYou";
import type { IconTone } from "@/domain/visuals";
import { track } from "@/lib/analytics";
import { useData } from "@/lib/data";
import { sendPerkFeedback } from "@/lib/forYou";
import { useToast } from "@/lib/toast";
import { space, useColors } from "@/theme";
import { Button, IconBubble, Row, T, type IconName } from "./ui";

export function forYouIcon(
  item: Pick<ForYouItem, "kind" | "interest" | "group">,
): { icon: IconName; tone: IconTone } {
  if (item.kind === "unclaimed") return { icon: "search", tone: "green" };
  if (item.kind === "library") return { icon: "library", tone: "pink" };
  if (item.kind === "price_adjust")
    return { icon: "trending-down", tone: "teal" };
  const interest = INTERESTS.find((i) => i.id === item.interest);
  if (interest) return { icon: interest.icon, tone: interest.tone };
  return item.group === "yours"
    ? { icon: "card", tone: "blue" }
    : { icon: "gift", tone: "green" };
}

/** Where it comes from: "With your Gold Card", "Sephora · free to join". */
const fromLine = (item: ForYouItem) =>
  item.kind === "card_perk"
    ? `With your ${item.from}`
    : item.group === "yours"
      ? `${item.from} · for cardholders`
      : `${item.from} · free`;

/** One perk for you: what it is, why it's here, and Get it / I have it / Not for me. */
export function PerkForYouRow({ item }: { item: ForYouItem }) {
  const c = useColors();
  const toast = useToast();
  const { refresh } = useData();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"have" | "dismissed" | null>(null);
  const { icon, tone } = forYouIcon(item);

  const get = async () => {
    track("perk_for_you", { action: "open", group: item.group });
    if (item.userCardId)
      router.push({ pathname: "/card/[id]", params: { id: item.userCardId } });
    else if (item.url) await Linking.openURL(item.url);
  };
  const answer = async (action: "have" | "dismissed") => {
    if (!item.programId) return;
    setBusy(action);
    try {
      await sendPerkFeedback(item.programId, action, item.group);
      await refresh();
      toast(
        action === "have"
          ? "Nice — you’re already getting it."
          : "Hidden. PerkScan won’t suggest it again.",
        { tone: "info" },
      );
    } catch (e) {
      toast((e as Error).message, { tone: "info" });
      setBusy(null);
    }
  };

  return (
    // The text opens (or expands) the perk; the buttons sit outside it so they're never nested.
    <View style={{ paddingVertical: space.md, gap: space.sm }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={item.title}
        style={({ pressed }) => ({
          flexDirection: "row",
          gap: space.md,
          alignItems: "flex-start",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <IconBubble icon={icon} tone={tone} size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="subheading">{item.title}</T>
          <T variant="caption" muted numberOfLines={1}>
            {fromLine(item)}
          </T>
          {item.why.length ? (
            <T variant="caption" color={c.accentStrong}>
              {item.why.join(" · ")}
            </T>
          ) : null}
          {item.summary ? (
            <T
              variant="caption"
              numberOfLines={open ? undefined : 2}
              style={{ marginTop: 2 }}
            >
              {item.summary}
            </T>
          ) : null}
        </View>
      </Pressable>
      <Row
        gap={space.sm}
        style={{ flexWrap: "wrap", marginLeft: 36 + space.md }}
      >
        {item.userCardId || item.url ? (
          <Button
            title={item.userCardId ? "See card" : "Get it"}
            size="sm"
            icon={item.userCardId ? "card" : "open-outline"}
            onPress={get}
          />
        ) : null}
        {item.programId ? (
          <>
            <Button
              title="I have it"
              size="sm"
              kind="secondary"
              loading={busy === "have"}
              disabled={!!busy}
              onPress={() => answer("have")}
            />
            <Button
              title="Not for me"
              size="sm"
              kind="ghost"
              loading={busy === "dismissed"}
              disabled={!!busy}
              onPress={() => answer("dismissed")}
            />
          </>
        ) : null}
      </Row>
    </View>
  );
}
