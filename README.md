# Slack Google Sheets AI Agent

A Slack bot that answers questions by reading from a Google Spreadsheet. When mentioned in Slack, the bot runs an LLM agent that uses tool calls to fetch the relevant spreadsheet tabs, grounds its answer entirely in that data, and replies in the thread.

## How it works

1. A user `@mentions` the bot in Slack.
2. The Slack handler ([`slack/handler.js`](slack/handler.js)) receives the `app_mention` event, posts a playful "thinking" message, and passes the question to the agent.
3. The agent ([`agent/agent.js`](agent/agent.js)) drives an LLM (Meta Llama 3.3 70B, served via the NVIDIA API) through an OpenAI-compatible chat loop. The model is given a set of tools and a system prompt describing the known spreadsheet tabs.
4. The model decides which tabs to read, calls the Google Sheets tools ([`sheets/client.js`](sheets/client.js)) to fetch data, and finally calls `submit_answer`.
5. The answer is posted back to the Slack thread.

The agent is constrained to answer **only** from data retrieved during the conversation — it never answers from prior knowledge.

### Agent tools

| Tool | Purpose |
| --- | --- |
| `get_sheet_names` | List all tab names in the spreadsheet (always called first). |
| `get_sheet_data` | Fetch all rows from a tab by exact name. |
| `find_cutoff_row` | Find the first row in column A on or after a cutoff date (used for the Weekly Calendar tab). |
| `get_sheet_data_from_row` | Fetch rows starting from a given row number. |
| `submit_answer` | Return the final answer to the user. |

## Project structure

```
agent/agent.js        LLM agent loop, system prompt, and tool definitions
sheets/client.js      Google Sheets API client (OAuth2 + read helpers)
slack/handler.js      Slack Bolt app, event handling, and Google OAuth routes
constants/            Misc constants (e.g. "thinking" verbs for Slack replies)
server.js             Entry point for the Slack bot server
run.js                CLI entry point for asking the agent a one-off question
```

## Prerequisites

- Node.js (with npm)
- A Slack app with a bot token and signing secret
- Google Cloud OAuth credentials with access to the target spreadsheet
- An NVIDIA API key (for the LLM)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file based on [`.env.example`](.env.example):

   ```
   # NVIDIA API
   NVIDIA_API_KEY=nvapi-...
   NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1

   # Slack
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_SIGNING_SECRET=...

   # Google OAuth
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=...
   GOOGLE_REFRESH_TOKEN=1//0g...

   # Google Sheets
   SPREADSHEET_ID=...
   ```

### Getting a Google refresh token

The server exposes OAuth helper routes to obtain a refresh token:

1. Start the server (`npm start`).
2. Visit `/auth/google` to begin the consent flow.
3. After granting access, the callback at `/auth/google/callback` completes the exchange. Capture the returned `refresh_token` and set it as `GOOGLE_REFRESH_TOKEN` in your `.env`.

The bot requests the read-only Sheets scope (`spreadsheets.readonly`).

## Usage

### Run the Slack bot

```bash
npm start
```

This starts the Express/Bolt server (default port `3000`). Point your Slack app's event subscriptions at the server's public URL and subscribe to the `app_mention` event. A `/health` endpoint is available for health checks.

### Ask a one-off question from the CLI

```bash
npm run ask -- "<your question>"
```

(or `node run.js "<your question>"`)

## Known spreadsheet tabs

The agent's system prompt is tuned for a ministry spreadsheet containing tabs such as:

- **Directory** — links, owners, and account credentials for the various campus ministries.
- **Weekly Calendar** — events by campus and date.
- **Team Roster** — ministry members and their details.
- **Birthdays** — birthdays laid out by month (columns) and day (rows).

Additional tabs are handled gracefully — the agent discovers all tab names at runtime via `get_sheet_names`.

## Notes

- `.env`, the OAuth client secret JSON, and `node_modules` are git-ignored. Keep credentials out of version control.
- Retried Slack events and duplicate event deliveries are de-duplicated in the handler to avoid double-answering.
