// app.config.js (CommonJS - Windows safe)
require("dotenv").config({ path: ".env" });

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    googleOAuthAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID,
  },
});
