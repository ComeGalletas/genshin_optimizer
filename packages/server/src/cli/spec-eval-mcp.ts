/**
 * The stdio MCP server behind `npm run spec:eval -- --via claude-code`
 * (TODO 4.4, ADR-0039). It offers one tool, the app's own `submit_spec`
 * (the spec's JSON Schema, as the translator gives it to a model), and
 * answers it the way the translator does: `checkSpec` against the sample
 * account, every problem sent back with the same retry message, at most
 * `MAX_ATTEMPTS` submissions. The low-level SDK server is used so neither
 * the schema nor the checks go through the SDK's own validation.
 *
 * What happened goes to the JSON file named by `SPEC_EVAL_STATE`, for the
 * evaluation to read: the accepted spec, or the last problems, and the
 * number of attempts. Not for use outside the evaluation.
 * @packageDocumentation
 */

import { writeFileSync } from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { SpecIssue } from '@genshin-build-lab/engine/constraints/spec';
import { ServiceError } from '../api/services';
import { sampleAccountServices } from '../llm/evaluate';
import {
  MAX_ATTEMPTS,
  retryMessage,
  submitSpecTool,
  SUBMIT_SPEC,
} from '../llm/translate';

const statePath = process.env.SPEC_EVAL_STATE;
if (!statePath) {
  console.error('SPEC_EVAL_STATE must name the file to write to');
  process.exit(1);
}

const services = sampleAccountServices();
const tool = submitSpecTool();
const state: { attempts: number; spec?: unknown; issues?: SpecIssue[] } = {
  attempts: 0,
};
const save = () => writeFileSync(statePath, JSON.stringify(state));
save();

const server = new Server(
  { name: 'genshin-build-lab-spec-eval', version: '0.0.0' },
  { capabilities: { tools: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters as { type: 'object' },
    },
  ],
}));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const text = (t: string, isError = false) => ({
    content: [{ type: 'text' as const, text: t }],
    ...(isError && { isError: true }),
  });
  if (req.params.name !== SUBMIT_SPEC)
    return text(`error: no tool named ${req.params.name}`, true);
  if (state.spec) return text('The spec was already accepted.');
  if (state.attempts >= MAX_ATTEMPTS)
    return text('error: no attempts left.', true);
  state.attempts++;
  try {
    const checked = services.checkSpec(req.params.arguments ?? {});
    state.spec = checked.spec;
    delete state.issues;
    save();
    return text(`Accepted. ${checked.understood.text}`);
  } catch (e) {
    if (!(e instanceof ServiceError) || !e.issues) throw e;
    state.issues = e.issues;
    save();
    return text(retryMessage(e.issues), true);
  }
});
await server.connect(new StdioServerTransport());
