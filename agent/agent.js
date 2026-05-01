const OpenAI = require("openai");
const { getSheetByName, findRowByDate, getSheetDataFromRow, getSheetNames } = require("../sheets/client");

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: process.env.NVIDIA_BASE_URL,
});

const tools = [
  {
    type: "function",
    function: {
      name: "get_sheet_names",
      description: "Get the names of all tabs/sheets in the spreadsheet",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sheet_data",
      description: "Get all rows of data from a specific sheet tab by name. Do not use this for the Weekly Calendar — use find_cutoff_row and get_sheet_data_from_row instead.",
      parameters: {
        type: "object",
        properties: {
          sheet_name: {
            type: "string",
            description: "The exact name of the sheet tab to fetch data from",
          },
        },
        required: ["sheet_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_cutoff_row",
      description: "Scan column A of a sheet to find the first row number where the date is on or after a given cutoff date. Use this before fetching Weekly Calendar data.",
      parameters: {
        type: "object",
        properties: {
          sheet_name: { type: "string", description: "The exact name of the sheet tab" },
          cutoff_date: { type: "string", description: "The cutoff date, e.g. 'March 31, 2026'" },
        },
        required: ["sheet_name", "cutoff_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sheet_data_from_row",
      description: "Fetch all rows from a sheet starting at a specific row number. Use this after find_cutoff_row to retrieve Weekly Calendar data.",
      parameters: {
        type: "object",
        properties: {
          sheet_name: { type: "string", description: "The exact name of the sheet tab" },
          start_row: { type: "number", description: "The 1-based row number to start fetching from" },
        },
        required: ["sheet_name", "start_row"],
      },
    },
  },
];

async function runAgent(query) {
  const today = new Date();
  const todayStr = today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  const cutoffDateStr = cutoffDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const messages = [
    {
      role: "system",
      content: `You are a helpful assistant for a college ministry. You answer questions by searching the ministry's Google Spreadsheet for relevant data.

Today's date is ${todayStr}.

## Known Spreadsheet Tabs
The spreadsheet contains at least the following tabs. There may be additional tabs not listed here.

- Directory: Links and owners for Silicon Valley (SV) Region, 4Corners (4C) at SJSU, ISMP at De Anza, and Stanford. Also contains account credentials (usernames/passwords) for ministry tools and platforms.
- Weekly Calendar: Ministry events by campus and date. Fields per row: event name, start/end time, venue, person in charge, helpers, notes.
- Team Roster: All ministry members and their details.
- Birthdays: Birthdays of ministry members.

## How to Answer

Step 1 — Call get_sheet_names to retrieve all available tab names. The user may refer to a tab by a name that does not exactly match the actual tab name — use the full list of tab names to make your best judgment about which tab the user is referring to.

Step 2 — Fetch data from the most relevant tab:
- For the Weekly Calendar: call find_cutoff_row with cutoff date ${cutoffDateStr}, then call get_sheet_data_from_row using the returned row number.
- For all other tabs: call get_sheet_data directly.

Step 3 — If the retrieved data answers the question, respond clearly and concisely. Use bullet points for lists.

Step 4 — If the data is insufficient, continue fetching the next most relevant tabs one at a time. Never fetch the same tab twice.

Step 5 — If you have exhausted all relevant tabs and still cannot answer, say "I don't know" rather than guessing.`,
    },
    { role: "user", content: query },
  ];

  let hasStarted = false;

  while (true) {
    const toolChoice = hasStarted ? "auto" : "required";

    const res = await client.chat.completions.create({
      model: "meta/llama-3.1-70b-instruct",
      messages,
      tools,
      tool_choice: toolChoice,
    });

    const message = res.choices[0].message;
    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content;
    }

    hasStarted = true;

    for (const call of message.tool_calls) {
      let result;

      if (call.function.name === "get_sheet_names") {
        result = await getSheetNames();
      } else if (call.function.name === "get_sheet_data") {
        const { sheet_name } = JSON.parse(call.function.arguments);
        result = await getSheetByName(sheet_name);
      } else if (call.function.name === "find_cutoff_row") {
        const { sheet_name, cutoff_date } = JSON.parse(call.function.arguments);
        result = await findRowByDate(sheet_name, cutoff_date);
      } else if (call.function.name === "get_sheet_data_from_row") {
        const { sheet_name, start_row } = JSON.parse(call.function.arguments);
        result = await getSheetDataFromRow(sheet_name, start_row);
      } else {
        result = `Unknown tool: ${call.function.name}`;
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }
}

module.exports = { runAgent };
