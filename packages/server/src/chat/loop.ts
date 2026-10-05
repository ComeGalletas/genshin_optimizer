/**
 * The chat's tool loop (TODO 3.6, ADR-0035): the configured model gets the
 * owner's messages and the same tools as MCP (`../mcp/tools.ts`); the
 * server runs every tool call it makes, with arguments checked by the
 * tool's zod schema, and feeds the results back until the model answers.
 *
 * The answer is then held to CLAUDE.md's third principle: a number that no
 * tool result (or the owner) gave is sent back once for revision, and
 * masked if it survives (`grounding.ts`). The model is the interface; the
 * tools do the math.
 * @packageDocumentation
 */

import * as z from 'zod';
import { ServiceError } from '../api/services';
import { TOOL_INSTRUCTIONS, type ToolDef } from '../mcp/tools';
import {
  LlmError,
  type ChatMessage,
  type ChatTool,
  type LlmClient,
  type ToolCall,
} from '../llm/client';
import { maskUngrounded, ungroundedNumbers } from './grounding';

export const CHAT_SYSTEM = `You are the chat in genshin-build-lab, answering the owner's questions about their own Genshin Impact account with the tools you have.
${TOOL_INSTRUCTIONS}
- Call a tool for any fact about the owner's characters, artifacts, builds or imports; never answer those from memory.
- Quote numbers as the tools give them (rounding to fewer decimals is fine). Don't work out new numbers yourself (sums, differences, averages, percentages): if you need one, get it from a tool (compare_builds gives differences). A number no tool gave is removed from your answer.
- Write for a chat panel: short paragraphs or "-" lists, no tables, no headings.`;

/** One message of the conversation as the web app keeps it. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** A tool the model called while answering. */
export interface ToolStep {
  tool: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  /** The tool's error, as the model saw it. */
  error?: string;
  ms: number;
}

export interface ChatAnswer {
  answer: string;
  steps: ToolStep[];
  /** Numbers the model wrote that no tool gave, masked in `answer`. */
  masked: string[];
  /** `step_limit`: the model kept calling tools and was stopped. */
  stop: 'answer' | 'step_limit';
}

export interface ChatOptions {
  /** Model calls per question, tool rounds and the one revision included. */
  maxModelCalls?: number;
  /** A tool result longer than this is refused, so it can't crowd out the
   *  conversation in a local model's context. */
  maxResultChars?: number;
}

export const DEFAULT_MAX_MODEL_CALLS = 8;
/** Fits the full character list of a large account (~21k characters for
 *  94 characters) and stays small next to a local model's 32k-token
 *  context. */
export const DEFAULT_MAX_RESULT_CHARS = 24_000;

/** The tools as the model sees them: name, description, JSON Schema. */
export function chatTools(tools: readonly ToolDef[]): ChatTool[] {
  return tools.map((t) => {
    const schema = z.toJSONSchema(z.object(t.input ?? {}), {
      io: 'input',
      unrepresentable: 'any',
    }) as Record<string, unknown>;
    delete schema.$schema;
    return { name: t.name, description: t.description, parameters: schema };
  });
}

const issues = (e: z.ZodError) =>
  e.issues.map((i) => `${i.path.join('.') || 'arguments'}: ${i.message}`);

/** Run one tool call and say what happened, as text for the model. */
async function runTool(
  call: ToolCall,
  byName: ReadonlyMap<string, ToolDef>,
  maxResultChars: number,
): Promise<{ content: string; step: ToolStep }> {
  const started = performance.now();
  const done = (content: string, error?: string) => ({
    content,
    step: {
      tool: call.name,
      arguments: call.arguments,
      ok: error === undefined,
      ...(error !== undefined && { error }),
      ms: Math.round(performance.now() - started),
    },
  });
  const fail = (error: string) => done(`error: ${error}`, error);
  const def = byName.get(call.name);
  if (!def)
    return fail(
      `no tool named ${call.name}; the tools are ${[...byName.keys()].join(', ')}`,
    );
  // Strict: an invented argument is reported to the model, not dropped.
  const parsed = z.strictObject(def.input ?? {}).safeParse(call.arguments);
  if (!parsed.success)
    return fail(`invalid arguments: ${issues(parsed.error).join('; ')}`);
  try {
    const run = def.run as (a: unknown) => ReturnType<ToolDef['run']>;
    const json = JSON.stringify(await run(parsed.data));
    if (json.length > maxResultChars)
      return fail(
        `the result is too large (${json.length} characters); narrow the request (filters, a smaller limit or topK)`,
      );
    return done(json);
  } catch (e) {
    if (e instanceof ServiceError) return fail(`${e.code}: ${e.message}`);
    throw e;
  }
}

const reviseRequest = (numbers: string[]) =>
  `Your answer uses numbers that no tool result gave: ${numbers.join(', ')}. Answer again using only numbers from the tool results above (call a tool if you need another number), or leave those numbers out.`;

/** Answer the last user message, calling tools as the model asks. */
export async function runChat(
  client: LlmClient,
  tools: readonly ToolDef[],
  history: readonly ChatTurn[],
  opts: ChatOptions = {},
): Promise<ChatAnswer> {
  const maxCalls = opts.maxModelCalls ?? DEFAULT_MAX_MODEL_CALLS;
  const maxResultChars = opts.maxResultChars ?? DEFAULT_MAX_RESULT_CHARS;
  const byName = new Map(tools.map((t) => [t.name, t]));
  const offered = chatTools(tools);
  const messages: ChatMessage[] = history.map((m) => ({ ...m }));
  // What the answer may quote: the owner's words, earlier answers (already
  // held to this rule) and every tool result of this turn.
  const sources = history.map((m) => m.content);
  const steps: ToolStep[] = [];
  let revised = false;

  for (let call = 0; call < maxCalls; call++) {
    const r = await client.chat({
      system: CHAT_SYSTEM,
      messages,
      tools: offered,
    });
    if (r.toolCalls.length) {
      messages.push({
        role: 'assistant',
        content: r.text,
        toolCalls: r.toolCalls,
      });
      for (const tc of r.toolCalls) {
        const { content, step } = await runTool(tc, byName, maxResultChars);
        steps.push(step);
        sources.push(content);
        messages.push({
          role: 'tool',
          toolCallId: tc.id,
          name: tc.name,
          content,
        });
      }
      continue;
    }
    if (!r.text)
      throw new LlmError(
        'bad_response',
        r.stop === 'max_tokens'
          ? `${client.model} used its whole output budget without an answer`
          : `${client.model} returned no answer`,
      );
    const ungrounded = ungroundedNumbers(r.text, sources);
    if (ungrounded.length && !revised && call + 1 < maxCalls) {
      revised = true;
      messages.push(
        { role: 'assistant', content: r.text },
        { role: 'user', content: reviseRequest(ungrounded) },
      );
      continue;
    }
    const { text, masked } = maskUngrounded(r.text, sources);
    return { answer: text, steps, masked, stop: 'answer' };
  }
  return {
    answer:
      'The model kept calling tools without giving an answer, so the chat stopped it. Try a narrower question.',
    steps,
    masked: [],
    stop: 'step_limit',
  };
}
