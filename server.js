require("dotenv").config();
const app = require("./slack/handler");

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡️ Slack bot is running!");
})();
