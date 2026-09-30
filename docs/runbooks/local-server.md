# Runbook: running the app with the local server, and connecting Claude over MCP

How to run the web app together with the local server, choose the language
model, and connect Claude Desktop or Claude Code to your account through
MCP. The architecture is in [ADR-0021](../adr/0021-local-first-server-architecture.md)
(local-first server), [ADR-0031](../adr/0031-mcp-tool-surface.md) (MCP
tools), [ADR-0032](../adr/0032-llm-provider-config.md) (model config),
[ADR-0034](../adr/0034-web-and-local-server.md) (web and server) and
[ADR-0035](../adr/0035-chat-tool-loop.md) (chat).

## Prerequisites

- Node ≥ 22 and `npm ci`. `better-sqlite3` is a native module built for the
  Node that installed it: after switching Node versions, run `npm ci` again
  and `npm run mcp:config` again (the MCP config names that Node).
- For the chat and explanations with the default model: [Ollama](https://ollama.com)
  running on `localhost:11434`, and `ollama pull qwen3:8b`.
- An account in the store: drop an Irminsul (or other GOOD) export into
  `imports/inbox/` and run `npm run inbox`. The store is
  `var/store.sqlite` at the repository root; both it and the inbox are
  git-ignored.

## Commands and ports

| Command              | What it runs                                                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`        | The web app (Vite, <http://localhost:5199>) and the server (<http://127.0.0.1:5198>) together, output prefixed `[web]` / `[server]`; the server restarts on its source changes. Ctrl+C stops both. |
| `npm run dev:web`    | The web app alone (client-only).                                                                                                                                                                   |
| `npm run server`     | The server alone: the HTTP API, MCP over HTTP at `/mcp`, explain and chat. `-- --port <n>` and `-- --store <path>` override the defaults.                                                          |
| `npm run mcp`        | The MCP server over stdio, for MCP clients that start it themselves (Claude Desktop). `-- --store <path>` overrides the store.                                                                     |
| `npm run mcp:config` | Prints the Claude Desktop and Claude Code configuration for this checkout, with absolute paths; `-- --install` adds it to Claude Desktop (quit it first).                                          |
| `npm run inbox`      | Imports every new file in `imports/inbox/` (`-- --watch` keeps watching).                                                                                                                          |
| `npm run llm:check`  | Says which model `config/llm.json` selects and whether the provider has it.                                                                                                                        |

Ollama listens on 11434. Everything listens on localhost only.

The server finds `var/store.sqlite`, `imports/inbox/`, `config/llm.json`
and `.env` at the repository root whatever directory it starts in, so an
MCP client can start it from anywhere. A `--store` path you pass is
relative to where you run the command, as usual.

## Choosing the model

`config/llm.json` selects the provider and model for explanations and the
chat. It is committed, and never holds keys:

- Local (default): `{ "provider": "ollama", "model": "qwen3:8b", "baseUrl": "http://localhost:11434" }`.
- Anthropic: `{ "provider": "anthropic", "model": "<model id>" }`, with
  `ANTHROPIC_API_KEY` in `.env` (copy `.env.example`).
- An OpenAI-compatible server (LM Studio, llama.cpp, vLLM, OpenRouter):
  `{ "provider": "openai_compatible", "model": "<id>", "baseUrl": "http://localhost:1234/v1" }`,
  with `OPENAI_API_KEY` in `.env` if it checks one.

Run `npm run llm:check` after a change, then restart the server. The web
app's header chip shows the model in use, or why there is none.

## A typical session

1. Export the account with Irminsul into `imports/inbox/`, then `npm run inbox`.
2. `npm run dev` and open <http://localhost:5199>.
3. The header chip says "Local server · qwen3:8b". In Inventory, **Load
   Account** loads the server's account into the page.
4. Optimise as usual; **Explain This Build** and the **Ask** button (the
   chat) use the configured model. Every number the chat gives comes from
   a tool result; any other number is removed and shown as `[?]`.

## Claude Desktop (MCP over stdio)

Claude Desktop starts the MCP server itself, so the server doesn't need to
be running.

1. Quit Claude Desktop completely: from the tray icon (Windows) or the menu
   bar (macOS), not just the window. While it runs it rewrites
   `claude_desktop_config.json` from memory, and an entry added from
   outside is lost within seconds (seen on Windows, 2026-09-30).
2. In a terminal at the repository root: `npm run mcp:config -- --install`.
   It refuses while Claude Desktop is running, backs the file up next to
   itself, and adds only the `genshin-build-lab` entry to `mcpServers`,
   with absolute paths to this Node, tsx's CLI and
   `packages/server/src/cli/mcp.ts` (Claude Desktop starts servers from its
   own directory, often without your terminal's `PATH`). To do it by hand
   instead, `npm run mcp:config` prints the entry to merge.
3. Start Claude Desktop.
4. The tools appear under the `genshin-build-lab` server in the chat's
   tools menu: `get_account_summary`, `list_characters`, `get_character`,
   `query_artifacts`, `optimize_build`, `compare_builds`,
   `get_import_report`. All are read-only.
5. Ask, for example, "What's my best Furina build with at least 180% ER?".

The stdio server reads the store when it starts and re-reads it per call,
so new imports show up without a restart; changes to the server's code
need a Claude Desktop restart.

## Claude Code

Over stdio (works whether or not the server is running): run the
`claude mcp add … --scope user` command that `npm run mcp:config` prints.
User scope, because the command holds this machine's paths; don't commit
them in a project `.mcp.json`.

Over HTTP, while `npm run server` or `npm run dev` runs:

```bash
claude mcp add --transport http genshin-build-lab http://127.0.0.1:5198/mcp
```

Check with `claude mcp list`, or `/mcp` inside a session.

## Troubleshooting

- **Where the Claude Desktop config is on Windows.** The Microsoft Store
  version keeps it in its package folder,
  `%LOCALAPPDATA%\Packages\Claude_…\LocalCache\Roaming\Claude\claude_desktop_config.json`;
  `%APPDATA%\Claude` is only a view of that folder while the app runs.
  `--install` looks in the package folder first, and refuses rather than
  start a new config where the app wouldn't read it.

- **Claude Desktop shows the server as failed.** Its log is
  `mcp-server-genshin-build-lab.log` in Claude's logs folder
  (`%APPDATA%\Claude\logs` on Windows, `~/Library/Logs/Claude` on macOS).
  A `better-sqlite3` "compiled against a different Node.js version" error
  means the config names another Node than the one that ran `npm ci`:
  rerun `npm run mcp:config` and update the config. The same after moving
  the checkout.
- **Tools answer "no account imported yet".** The store is empty: import
  into `imports/inbox/` and run `npm run inbox`.
- **`[server] Error: listen EADDRINUSE … 5198`** under `npm run dev`: a
  server is already running (another terminal, or `npm run server`). The
  web app keeps working and uses that server; stop one of them to run
  yours.
- **The chip says "Client-only".** No server answered at
  `http://127.0.0.1:5198` within 2 s. Start it; the app checks again when
  the tab regains focus, or press the chip.
- **The chip says "no model".** Hover it for the reason (a missing key, an
  unreachable Ollama); `npm run llm:check` says the same with a fix.
- **The chat or `optimize_build` takes minutes, or times out.** An exact
  search over a large account without a set requirement can hit the 120 s
  limit. Ask with a set or main stats, or for unequipped pieces only. Phase
  4's constraint spec is meant to make "the defaults plus this condition"
  the normal case.
