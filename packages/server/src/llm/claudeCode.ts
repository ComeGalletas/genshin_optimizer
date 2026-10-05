/**
 * A golden-set translator that runs Claude through Claude Code
 * (`claude -p`), on the owner's Claude subscription, with no API key
 * (TODO 4.4, ADR-0039). Each request gets the app's translator prompt as
 * the system prompt and one tool, the app's `submit_spec`, served by
 * `cli/spec-eval-mcp.ts`, which checks every submission with `checkSpec`
 * and sends problems back as the translator does. Claude Code's own agent
 * loop does the retrying.
 *
 * The same prompt, schema, checks, messages and attempt cap as
 * `POST /spec/translate`; what differs is the loop around them (Claude
 * Code's, not `translateRequest`'s), and that a text answer gets no
 * reminder. The in-app chat still needs an API key to use Claude.
 * Evaluation only.
 * @packageDocumentation
 */

import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type {
  ConstraintSpec,
  SpecIssue,
} from '@genshin-build-lab/engine/constraints/spec';
import { fromRoot } from '../paths';
import { SUBMIT_SPEC, translationCatalog, translatorPrompt } from './translate';
import type { Translator } from './evaluate';

const run = promisify(execFile);

/** Long enough for a cold start, a few tool calls and a slow answer. */
const PER_REQUEST_MS = 240_000;

export interface ClaudeCodeTranslator {
  translate: Translator;
  /** The model Claude Code reported, once a request has run. */
  model: () => string | undefined;
}

export function claudeCodeTranslator(options: {
  model?: string;
  /** The `claude` executable (default: on PATH). */
  command?: string;
}): ClaudeCodeTranslator {
  const require = createRequire(fromRoot('package.json'));
  const tsxManifest = require.resolve('tsx/package.json');
  const tsxCli = join(
    tsxManifest,
    '..',
    (require(tsxManifest) as { bin: string }).bin,
  );
  const prompt = `${translatorPrompt(translationCatalog())}\n\nThe only tool you have is ${SUBMIT_SPEC}. When it reports problems, fix them all and call it again; when it accepts the spec, stop.`;
  let seenModel: string | undefined;

  const translate: Translator = async (request) => {
    const dir = mkdtempSync(join(tmpdir(), 'gbl-spec-eval-'));
    try {
      const state = join(dir, 'state.json');
      const promptFile = join(dir, 'system.md');
      const config = join(dir, 'mcp.json');
      writeFileSync(promptFile, prompt);
      writeFileSync(
        config,
        JSON.stringify({
          mcpServers: {
            spec: {
              command: process.execPath,
              args: [
                tsxCli,
                fromRoot('packages/server/src/cli/spec-eval-mcp.ts'),
              ],
              env: { SPEC_EVAL_STATE: state },
            },
          },
        }),
      );
      const { stdout } = await run(
        options.command ?? 'claude',
        [
          '-p',
          request,
          '--system-prompt-file',
          promptFile,
          '--mcp-config',
          config,
          '--strict-mcp-config',
          '--tools',
          '',
          '--allowedTools',
          `mcp__spec__${SUBMIT_SPEC}`,
          '--permission-mode',
          'dontAsk',
          '--output-format',
          'stream-json',
          '--verbose',
          ...(options.model ? ['--model', options.model] : []),
        ],
        // An empty directory: no project instructions or settings to read.
        { cwd: dir, timeout: PER_REQUEST_MS, maxBuffer: 16 * 1024 * 1024 },
      );
      for (const line of stdout.split('\n')) {
        if (!line.startsWith('{')) continue;
        const e = JSON.parse(line) as {
          type?: string;
          subtype?: string;
          model?: string;
        };
        if (e.type === 'system' && e.subtype === 'init' && e.model)
          seenModel = e.model;
      }
      const result = JSON.parse(readFileSync(state, 'utf8')) as {
        attempts: number;
        spec?: ConstraintSpec;
        issues?: SpecIssue[];
      };
      if (result.spec) return { spec: result.spec, attempts: result.attempts };
      throw Object.assign(
        new Error(
          result.issues
            ? `no valid spec in ${result.attempts} tries: ${result.issues
                .map((i) => `${i.path}: ${i.message}`)
                .join('; ')}`
            : `Claude answered without calling ${SUBMIT_SPEC}`,
        ),
        { issues: result.issues },
      );
    } finally {
      rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    }
  };
  return { translate, model: () => seenModel };
}
