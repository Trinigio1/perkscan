import * as admin from "firebase-admin";
import { google } from "googleapis";
import { detectPerksFromEmail } from "./perkDetector";

admin.initializeApp();

function getHeader(headers: any[] | undefined, name: string): string {
  const h = headers?.find((x) => (x.name || "").toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

export async function gmailSyncPerksCore(uid: string) {
  const db = admin.firestore();

  const tokenDoc = await db.doc(`users/${uid}/gmailTokens/main`).get();
  if (!tokenDoc.exists) throw new Error("No Gmail tokens stored for this user.");

  const { refreshToken, accessToken } = tokenDoc.data() as any;

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );

  oauth2.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  // Search: last 90 days, Promotions + Inbox, only likely perk emails
  const q = [
    "newer_than:90d",
    "(category:promotions OR category:updates OR in:inbox)",
    "(uber OR doordash OR dashpass OR lyft OR clear OR tsa OR lounge OR priority pass OR statement credit OR benefit OR enrolled OR enrollment)",
  ].join(" ");

  const list = await gmail.users.messages.list({
    userId: "me",
    maxResults: 25,
    q,
  });

  const messages = list.data.messages || [];
  const detected: any[] = [];

  for (const m of messages) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id: m.id!,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "Date"],
    });

    const headers = msg.data.payload?.headers || [];
    const subject = getHeader(headers, "Subject");
    const from = getHeader(headers, "From");
    const date = getHeader(headers, "Date");
    const snippet = msg.data.snippet || "";

    const perks = detectPerksFromEmail({
      messageId: m.id!,
      subject,
      from,
      date,
      snippet,
      bodyText: "", // metadata-only for now (fast + safer). Later we can fetch "full" if needed.
    });

    for (const p of perks) detected.push(p);
  }

  // Write to Firestore
  const batch = db.batch();
  const perksCol = db.collection(`users/${uid}/detectedPerks`);

  for (const p of detected) {
    const id = `${p.provider}-${p.title}-${p.evidence.messageId}`.replace(/[^a-zA-Z0-9-_]/g, "_");
    const ref = perksCol.doc(id);
    batch.set(
      ref,
      {
        source: "gmail",
        title: p.title,
        provider: p.provider,
        cardHint: p.cardHint || null,
        status: "active",
        validTo: p.validTo || null,
        evidence: p.evidence,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();
  return { scanned: messages.length, detected: detected.length };
}
