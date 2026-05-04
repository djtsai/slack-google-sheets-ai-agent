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
      description: "Returns the exact names of all tabs/sheets in the spreadsheet. Always call this first before any other tool. Use the returned names verbatim in all subsequent tool calls — never guess or paraphrase a sheet name.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sheet_data",
      description: "Fetches all rows of data from a sheet by its exact tab name. Only use sheet names returned by get_sheet_names. Do NOT use this for the Weekly Calendar tab — use find_cutoff_row followed by get_sheet_data_from_row instead.",
      parameters: {
        type: "object",
        properties: {
          sheet_name: {
            type: "string",
            description: "The exact tab name as returned by get_sheet_names",
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
      description: "Scans column A of a sheet to find the first 1-based row number where the date is on or after the given cutoff date. Must be called before get_sheet_data_from_row when fetching Weekly Calendar data.",
      parameters: {
        type: "object",
        properties: {
          sheet_name: { type: "string", description: "The exact tab name as returned by get_sheet_names" },
          cutoff_date: { type: "string", description: "The cutoff date in 'Month DD, YYYY' format, e.g. 'April 3, 2026'" },
        },
        required: ["sheet_name", "cutoff_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sheet_data_from_row",
      description: "Fetches all rows and columns from a sheet starting at a given row number. Use this for the Weekly Calendar tab, passing the row number returned by find_cutoff_row as start_row.",
      parameters: {
        type: "object",
        properties: {
          sheet_name: { type: "string", description: "The exact tab name as returned by get_sheet_names" },
          start_row: { type: "number", description: "The 1-based row number to start fetching from, as returned by find_cutoff_row" },
        },
        required: ["sheet_name", "start_row"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_answer",
      description: "Submit your final answer to the user. Call this when you have found the answer in the fetched data, or when you have exhausted all relevant tabs and still cannot find the answer. Do not call this until you are ready to give a definitive response.",
      parameters: {
        type: "object",
        properties: {
          answer: {
            type: "string",
            description: "Your final answer to the user's query. If you could not find the answer after checking all relevant tabs, pass \"I do not know\".",
          },
        },
        required: ["answer"],
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
      content: `You are a helpful assistant for a college ministry. You answer questions exclusively by fetching and reading data from the ministry's Google Spreadsheet. You must never answer from memory or prior knowledge — every answer must be grounded in data retrieved from the spreadsheet during this conversation.

Today's date is ${todayStr}.

## Known Spreadsheet Tabs
The spreadsheet contains at least the following tabs. There may be additional tabs not listed here.

- Directory: Links and owners for Silicon Valley (SV) Region, 4Corners (4C) at SJSU, ISMP at De Anza, and Stanford. Also contains account credentials (usernames/passwords) for ministry tools and platforms.
- Weekly Calendar: Ministry events by campus and date.
  - Each row contains: Date, Campus, Event, Start, End, Venue, In Charge, Helpers, Notes.
  - The Date column is often blank for consecutive rows on the same date. If a row has no date, look at the row above it and keep going back until you find a non-empty date.
- Team Roster: All ministry members and their details.
- Birthdays: Birthdays of people in the ministry.

## How to Answer

You MUST answer by calling tools to fetch real data. Never describe what you would do — always invoke the appropriate tool calls immediately.

Step 1 — Call get_sheet_names to get the exact names of all available tabs. Retain every name exactly as returned — you must pass these verbatim to all subsequent tool calls.

Step 2 — Analyze the user's query and rank the tab names from most likely to least likely to contain the answer. Consider the subject matter and what each tab is known to contain.

Step 3 — Fetch data from the highest-ranked tab:
- If the tab is the Weekly Calendar: call find_cutoff_row with cutoff date ${cutoffDateStr} to get the starting row number, then call get_sheet_data_from_row with that row number.
- For all other tabs: call get_sheet_data, passing the sheet_name exactly as it appears in the list from Step 1.

Step 4 — Evaluate whether the fetched data is sufficient to answer the query.
- If yes: call submit_answer with your final answer.
- If no: fetch the next tab in your ranked list. Never fetch the same tab twice.

Step 5 — Before calling submit_answer, evaluate your answer: if it expresses that you do not know, cannot find the information, or have insufficient data, do not call submit_answer yet. Instead, go back to Step 3 and fetch data from the next highest-ranked tab that has not yet been fetched. Repeat until you either have a confident answer or have exhausted all relevant tabs.

Step 6 — If you have fetched all relevant tabs and still cannot find the answer, call submit_answer with "I do not know". Do not invent or infer information that is not present in the spreadsheet data.
`,
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
      messages.push({
        role: "user",
        content: "Do not respond to the user yet. Go back to Step 3 and immediately call the appropriate tool to fetch data from the next highest-ranked tab you have not yet fetched. When you are ready to give your final answer, call submit_answer.",
      });
      continue;
    }

    hasStarted = true;

    for (const call of message.tool_calls) {
      let result;

      if (call.function.name === "submit_answer") {
        const { answer } = JSON.parse(call.function.arguments);
        return answer;
      } else if (call.function.name === "get_sheet_names") {
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
