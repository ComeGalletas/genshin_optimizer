/**
 * Natural language → `ConstraintSpec` (TODO 4.3, ADR-0038): the configured
 * model reads one request and fills the spec in through a single tool,
 * `submit_spec`, whose parameters are the spec's own JSON Schema. Every
 * submission goes through the spec's checks and the account mapping
 * (`check`); problems go back to the model, all at once, for another try.
 * Nothing here runs the optimizer: the caller shows the "I understood"
 * summary first, and runs only a spec that passed.
 * @packageDocumentation
 */

import * as z from 'zod';
import {
  ConstraintSpecSchema,
  type SpecIssue,
} from '@genshin-build-lab/engine/constraints/spec';
import { STAT_KEYS } from '@genshin-build-lab/engine/game/types';
import { genshinAdapter } from '@genshin-build-lab/engine/game/genshin/adapter';
import type { ChatMessage, ChatTool, LlmClient } from './client';

/** The tool the model answers with. */
export const SUBMIT_SPEC = 'submit_spec';

/** What the translator may name: the account's characters and the sets. */
export interface Catalog {
  characters: { key: string; name: string }[];
  sets: { key: string; name: string }[];
}

/** Checks a submitted spec: the caller's spec checks plus the account
 *  mapping, so the model hears "no weapon equipped" as well as "unknown
 *  set". */
export type CheckSpec<T> = (
  input: unknown,
) => { ok: true; value: T } | { ok: false; issues: SpecIssue[] };

export type Translation<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; issues: SpecIssue[]; attempts: number; said?: string };

/** Attempts in all: the first, then two corrections. */
export const MAX_ATTEMPTS = 3;

/** A spec is short; this caps a model that rambles before calling. */
const TRANSLATE_MAX_OUTPUT_TOKENS = 1200;

/** Every character and set in the dataset: a character the account lacks
 *  can still be built, with a weapon named. */
export function translationCatalog(): Catalog {
  return {
    characters: genshinAdapter
      .characters()
      .map((c) => ({ key: c.key, name: c.name })),
    sets: genshinAdapter.sets().map((s) => ({ key: s.key, name: s.name })),
  };
}

export function translatorPrompt(catalog: Catalog): string {
  const list = (xs: { key: string; name: string }[]) =>
    xs.map((x) => `${x.key} (${x.name})`).join(', ');
  return `You turn one request from the owner of a Genshin Impact account into a ConstraintSpec by calling ${SUBMIT_SPEC} once. Don't answer in text and don't work out builds yourself: the optimizer does that from your spec.

How to fill it in:
- character: the key of the one character to build, from the list below.
- Leave out everything the request doesn't say. The spec extends the character's curated defaults (their usual set, main stats, ER floor and objective). Only when the owner asks to ignore those, set "defaults": "replace".
- Stats are in percent where the game shows percent: "180% ER" or "180 ER" is minStats {"er_pct": 180}; "at least 60% crit rate" is {"crit_rate": 60}. hp, atk, def and em are flat. Stat keys: ${STAT_KEYS.join(', ')}.
- set: "4-piece X" is {"kind": "4pc", "setKey": X}; "2-piece A and 2-piece B" is {"kind": "2+2", "setKeys": [A, B]}; "any set" or "no set requirement" is {"kind": "any"}.
- mainStats only for sands, goblet and circlet: {"sands": "er_pct"}; "any" removes that slot's default.
- maxStats for upper limits ("no more than 70% crit rate").
- objective only when the owner asks what to maximise: "most damage" is "avg_damage"; "crit value" is "crit_value"; "maximise EM" is "em"; a mix is {"weights": {"hp_pct": 1, "crit_rate": 2}}.
- keepEquippedOn: characters whose pieces must stay where they are ("don't take Neuvillette's artifacts"); "only unequipped pieces" or "don't touch anyone's gear" is "all".
- excludeArtifacts: artifact ids the owner names.
- teamBuffs: stats teammates add ("with Bennett's 1000 ATK buff" is {"atk": 1000}).
- enemy: {"level": n, "res": percent} ("an enemy with -20% resistance" is {"res": -20}).
- weapon and buildLevel only when the request names them.

Characters (key and name; one the account lacks needs a weapon named): ${list(catalog.characters)}.
Artifact sets: ${list(catalog.sets)}.`;
}

/** The spec's JSON Schema as a tool, `version` left out (it defaults). */
export function submitSpecTool(): ChatTool {
  const schema = z.toJSONSchema(ConstraintSpecSchema as never, {
    io: 'input',
    unrepresentable: 'any',
  }) as Record<string, unknown> & { properties: Record<string, unknown> };
  delete schema.$schema;
  delete schema.properties.version;
  return {
    name: SUBMIT_SPEC,
    description:
      'Submit the ConstraintSpec for the request. Only fields the request asks for.',
    parameters: schema,
  };
}

/** What the model hears when a submission fails its checks. */
export const retryMessage = (issues: SpecIssue[]) =>
  `error: the spec has ${issues.length === 1 ? 'a problem' : `${issues.length} problems`}:\n${issues
    .map((i) => `- ${i.path}: ${i.message}`)
    .join(
      '\n',
    )}\nFix ${issues.length === 1 ? 'it' : 'them all'} and call ${SUBMIT_SPEC} again.`;

/** Translate `text` into a checked spec, or say why it couldn't. */
export async function translateRequest<T>(
  client: LlmClient,
  text: string,
  catalog: Catalog,
  check: CheckSpec<T>,
): Promise<Translation<T>> {
  const system = translatorPrompt(catalog);
  const tools = [submitSpecTool()];
  const messages: ChatMessage[] = [{ role: 'user', content: text }];
  let issues: SpecIssue[] = [];
  let said: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const r = await client.chat({
      system,
      messages,
      tools,
      maxOutputTokens: TRANSLATE_MAX_OUTPUT_TOKENS,
    });
    const call = r.toolCalls.find((c) => c.name === SUBMIT_SPEC);
    if (!call) {
      said = r.text || undefined;
      issues = [
        {
          path: 'spec',
          message: `the model answered without calling ${SUBMIT_SPEC}`,
        },
      ];
      messages.push(
        { role: 'assistant', content: r.text },
        {
          role: 'user',
          content: `Call ${SUBMIT_SPEC} with the spec; don't answer in text.`,
        },
      );
      continue;
    }
    const checked = check(call.arguments);
    if (checked.ok)
      return { ok: true, value: checked.value, attempts: attempt };
    issues = checked.issues;
    messages.push(
      { role: 'assistant', content: r.text, toolCalls: [call] },
      {
        role: 'tool',
        toolCallId: call.id,
        name: SUBMIT_SPEC,
        content: retryMessage(issues),
      },
    );
  }
  return {
    ok: false,
    issues,
    attempts: MAX_ATTEMPTS,
    ...(said && { said }),
  };
}
