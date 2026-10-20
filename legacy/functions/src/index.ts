import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { google } from "googleapis";
import * as functions from "firebase-functions/v2";
import { gmailSyncPerksCore } from "./gmailSyncPerks";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";

export const debugConnectEmail = onCall(async (request) => {
  try {
    logger.info("debugConnectEmail called");

    const uid = request.auth?.uid;
    logger.info("uid", { uid });

    if (!uid) {
      throw new HttpsError("unauthenticated", "Not logged in to Firebase.");
    }

    const db = getFirestore();
    await db
      .collection("users")
      .doc(uid)
      .collection("gmailTokens")
      .doc("main")
      .set(
        {
          debug: true,
          updatedAt: Date.now(),
        },
        { merge: true }
      );

    return { ok: true };
  } catch (err: any) {
    logger.error("debugConnectEmail error:", err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError("internal", String(err?.message || err));
  }
});

export const gmailSyncPerks = onCall(
  { secrets: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"] },
  async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Login required.");
  return await gmailSyncPerksCore(uid);
});

admin.initializeApp();

const GOOGLE_OAUTH_CLIENT_ID = defineSecret("GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_OAUTH_CLIENT_SECRET = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");

/**
 * Exchange Google auth code for tokens and store refresh token
 */
export const gmailOauthExchange = onCall(
  { secrets: [GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET] },
  async (request) => {
    const uid = request.auth?.uid;
if (!uid) throw new HttpsError("unauthenticated", "Login required.");


    const { code, redirectUri } = request.data || {};
    if (!code || !redirectUri) {
      throw new HttpsError("invalid-argument", "Missing code or redirectUri.");
    }

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_OAUTH_CLIENT_ID.value(),
      GOOGLE_OAUTH_CLIENT_SECRET.value(),
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      throw new HttpsError(
        "failed-precondition",
        "No refresh token returned. Reconnect with prompt=consent."
      );
    }

    await admin.firestore().doc(`users/${uid}/emailConnections/gmail`).set(
      {
        provider: "gmail",
        refreshToken: tokens.refresh_token,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastScanAt: null,
      },
      { merge: true }
    );

    return { ok: true };
  }
);

/**
 * Scan Gmail (last 90 days) for issuer perk-related messages and store findings
 */
export const scanGmailNow = onCall(
  { secrets: [GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Login required.");

    const connRef = admin.firestore().doc(`users/${uid}/emailConnections/gmail`);
    const connSnap = await connRef.get();

    if (!connSnap.exists) {
      throw new HttpsError("failed-precondition", "Gmail not connected.");
    }

    const refreshToken = (connSnap.data() as any)?.refreshToken;
    if (!refreshToken) {
      throw new HttpsError("failed-precondition", "Missing refresh token.");
    }

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_OAUTH_CLIENT_ID.value(),
      GOOGLE_OAUTH_CLIENT_SECRET.value()
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const q = [
      "newer_than:90d",
      "(category:promotions OR in:inbox)",
      "(from:americanexpress.com OR from:chase.com OR from:chasepay.com)",
      "(credit OR enroll OR activate OR offer OR expires)",
    ].join(" ");

    const list = await gmail.users.messages.list({
      userId: "me",
      q,
      maxResults: 50,
    });

    const messages = list.data.messages || [];
    let saved = 0;

    for (const m of messages) {
      const id = m.id;
      if (!id) continue;

      const msg = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });

      const headers = msg.data.payload?.headers || [];
      const from = headers.find((h) => h.name === "From")?.value || "";
      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const date = headers.find((h) => h.name === "Date")?.value || "";

      await admin.firestore().collection(`users/${uid}/emailFindings`).doc(id).set(
        {
          source: { provider: "gmail", messageId: id },
          from,
          subject,
          date,
          status: "needs_review",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      saved += 1;
    }

    await connRef.set(
      { lastScanAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    return { ok: true, found: messages.length, saved };
  }
);
