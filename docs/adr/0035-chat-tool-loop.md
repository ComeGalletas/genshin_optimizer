# 0035. The chat: a server-side tool loop over the MCP tools, with numbers checked against tool results

- Status: Accepted
- Date: 2026-09-30

## Context

TODO 3.6 adds a chat panel whose model uses the same tools as MCP
(ADR-0031), run by the server for whichever model `config/llm.json`
selects (ADR-0032, ADR-0033). CLAUDE.md's third principle says every
number in an answer must come from a tool result; the TODO asks for a test
with a fake model showing an answer can't contain other numbers. A prompt
alone doesn't guarantee that, least of all for a small local model.

The first live runs with `qwen3:8b` on the owner's account showed what the
loop has to survive: arguments the tools reject (`element: "water"`), a
first search that times out and a second, narrower one that works,
optional fields that replace curated defaults, and a character list larger
than a naive result cap. They also exposed a server bug, fixed separately:
the server never applied ADR-0014's off-element goblet zeroing.

## Decision

1. **One tool list.** The tool definitions move to
   `packages/server/src/mcp/tools.ts` (name, title, description, zod input
   shape, body over `Services`). The MCP server registers them; the chat
   offers the same list, with JSON Schemas from `z.toJSONSchema`. A test
   checks that the chat offers exactly the tools an MCP client lists.
2. **The loop runs on the server** (`packages/server/src/chat/loop.ts`):
   the model gets the conversation, the system prompt (the MCP
   instructions plus chat rules) and the tools; the server runs each call
   with the tool's zod schema, feeds results back, and repeats until an
   answer, up to 8 model calls. Bad arguments, unknown tools, service
   errors and results over 24,000 characters go back to the model as
   `error: ...` tool results for it to correct, never to the owner as
   failures. `POST /chat` takes the conversation (text only, at most 40
   messages of 4,000 characters, ending with a question) and returns the
   answer, the tool steps, and the provider and model.
3. **Numbers are checked, not trusted** (`chat/grounding.ts`). Each number
   in an answer must be in this turn's tool results or the conversation
   (the owner's words, earlier checked answers), as written or rounded or
   cut to the precision the answer uses. Integers up to 10 are exempt as
   counting words. An answer that fails is sent back once, naming the
   numbers; what still fails is replaced by `[?]` and listed, and the
   panel says so. A seeded property test checks that no masked answer
   keeps an ungrounded number; fake-model tests show an invented figure
   never reaches the owner.
4. **Tool contracts steer the model.** Descriptions say what a small
   model gets wrong: character keys are lowercase dataset keys and a
   named character goes to `get_character`; `optimize_build`'s
   `constraints` replace the curated defaults, so read them first and
   merge; filters are enums, so a guess is an error listing valid values
   instead of an empty list read as "not owned".
5. **The panel** (`packages/web/src/components/ChatPanel.tsx`) follows
   ADR-0034: an "Ask" button, shown only while the server runs with a
   ready model, opens a drawer. The conversation lives for the session;
   each answer shows the tools used (failed ones marked) and whether
   numbers were removed. The chat answers from the server's account, and
   the panel says so.

## Consequences

- Grounding is a floor, not a guarantee of good answers: a model can
  quote a real number about the wrong thing, or pick the wrong tool
  arguments. The Phase 3 acceptance records how each model does.
- Exempt small integers and matching by value mean a made-up number that
  equals any number in a tool result passes. Tool results are specific
  enough that this is rare, and the check stays simple to reason about.
- A question can take minutes on a local model when it triggers an exact
  search (120 s limit per search). The panel says so while waiting; the
  web client allows 300 s.
- Phase 4's `ConstraintSpec` should replace "constraints replace the
  defaults" with explicit add-or-override, which the prompt now only
  describes.

## Rejected alternatives

- **The model calls the HTTP API or MCP itself** (a client-side loop).
  The browser would hold the loop and the model's key path; ADR-0021
  keeps both on the server.
- **Refusing any answer with an ungrounded number.** One stray figure
  would cost the whole answer; masking keeps the grounded rest and says
  what was removed.
- **Checking only numbers next to stat names.** Too easy to miss one
  written another way; every number is checked instead.
- **Streaming tool progress to the panel.** Worth it once answers are
  common enough to wait on; one request with a clear "working" state is
  enough for now.
