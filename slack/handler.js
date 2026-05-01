const { App, ExpressReceiver } = require("@slack/bolt");
const { google } = require("googleapis");
const { runAgent } = require("../agent/agent");

// Create receiver
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
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

  console.log(tokens);

  res.send("Done");
});

app.event("app_mention", async ({ event, say }) => {
  const text = event.text;

  await say("Thinking...");

  const response = await runAgent(text);

  await say(response);
});

module.exports = app;
