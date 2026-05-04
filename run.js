require("dotenv").config();
const { runAgent } = require("./agent/agent");

const query = process.argv.slice(2).join(" ");

if (!query) {
  console.error("Usage: node run.js <your query>");
  process.exit(1);
}

console.log(`Query: ${query}\n`);

runAgent(query)
  .then((response) => {
    console.log(`Response:\n${response}`);
  })
  .catch((err) => {
    console.error("Agent error:", err);
    process.exit(1);
  });
