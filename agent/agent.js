const OpenAI = require("openai");
const { getSheet } = require("../sheets/client");

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: process.env.NVIDIA_BASE_URL,
});

async function runAgent(query) {
  const data = await getSheet("Sheet1!A:D");

  const prompt = `
You are analyzing spreadsheet data.

Data:
${JSON.stringify(data)}

Question:
${query}

Return a concise answer.
If unsure, say "I don't know".
`;

  const res = await client.chat.completions.create({
    model: "meta/llama-3-70b-instruct",
    messages: [
      { role: "user", content: prompt }
    ],
  });

  return res.choices[0].message.content;
}

module.exports = { runAgent };
