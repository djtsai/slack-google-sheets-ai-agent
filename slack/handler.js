const { App, ExpressReceiver } = require("@slack/bolt");
const { google } = require("googleapis");
const { runAgent } = require("../agent/agent");

// Create receiver
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  processBeforeResponse: false,
  middlewares: [
    (req, res, next) => {
      if (req.headers["x-slack-retry-num"]) {
        return res.status(200).send();
      }
      next();
    },
  ],
});

// Bolt app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});

// Access underlying Express app
const expressApp = receiver.app;

// OAuth setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Add auth google routes
expressApp.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

expressApp.get("/auth/google", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/spreadsheets.readonly"
    ],
  });

  res.redirect(url);
});

expressApp.get("/auth/google/callback", async (req, res) => {
  const { tokens } = await oauth2Client.getToken(req.query.code);

  res.send("Done");
});

const processedEvents = new Set();

app.event("app_mention", async ({ event, say }) => {
  if (processedEvents.has(event.event_ts)) return;
  processedEvents.add(event.event_ts);
  setTimeout(() => processedEvents.delete(event.event_ts), 5 * 60 * 1000);

  const text = event.text;
  const thread_ts = event.thread_ts || event.ts;

  await say({ text: "Thinking...", thread_ts });

  try {
    const response = await runAgent(text);
    await say({ text: response, thread_ts });
  } catch (err) {
    console.error("Agent error:", err);
    await say({ text: "Sorry, something went wrong. Please try your question again.", thread_ts });
  }
});

module.exports = app;
