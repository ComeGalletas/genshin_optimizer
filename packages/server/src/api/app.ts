/**
 * The local HTTP API (TODO 3.1, ADR-0030): the engine and the snapshot store
 * over JSON, for the web app (3.5) and anything else on this machine, plus
 * the MCP server over streamable HTTP at `/mcp` (TODO 3.2, ADR-0031) and
 * "explain this build" and the chat on the configured model (TODO 3.4 and
 * 3.6, ADR-0033 and ADR-0035).
 *
 * Localhost only (ADR-0021): the server listens on 127.0.0.1, and every
 * request must name a localhost Host (so a web page can't reach it through
 * DNS rebinding) and, if it comes from a browser, a localhost Origin. Errors
 * are `{ error, message, issues? }` with a matching status code. The routes
 * are thin: what they answer is `Services`, shared with the MCP tools.
 * @packageDocumentation
 */

import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import * as z from 'zod';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StoreError, type Store } from '../store/store';
import { DEFAULT_INBOX, processInbox } from '../inbox/inbox';
import { SearchRunner } from '../optimize/pool';
import { createMcpServer } from '../mcp/server';
import {
  ArtifactQuery,
  ChatBody,
  CompareBody,
  SpecBody,
  TranslateBody,
  IdParam,
  OptimizeBody,
  SnapshotParam,
} from './schemas';
import { ServiceError, Services } from './services';
import { describeLlm, type LlmConfig } from '../llm/config';
import { createLlmClient, LlmError, type LlmClient } from '../llm/client';
import { explainBuild } from '../llm/explain';
import { runChat } from '../chat/loop';
import { accountTools } from '../mcp/tools';
import { parseExplainPayload } from '@genshin-build-lab/engine/explain/explain';
import { installedRotationDeps, type RotationDeps } from '../sim/drafts';

export interface AppOptions {
  db: Store;
  inboxDir?: string;
  /** Fastify's logger; off by default (tests), on for `npm run server`. */
  logger?: boolean;
  /** Time limit for one exact search (default 120 s). */
  searchLimitMs?: number;
  /** The language model config (TODO 3.3); `GET /llm` describes it, key
   *  never included. */
  llm?: LlmConfig;
  /** The model client; built from `llm` when not given (tests pass a
   *  fake). */
  llmClient?: LlmClient;
  /** The rotation library and the gcsim that runs drafts (TODO 5.7); by
   *  default the repository's library and gcsim if installed. */
  rotations?: { dir?: string; deps?: RotationDeps };
}

/** An explain request is a few hundred bytes (`parseExplainPayload` bounds
 *  every field); this refuses anything far larger before parsing it. */
const EXPLAIN_BODY_LIMIT = 16_000;

/** A model that is down, slow or misconfigured is a gateway problem, not
 *  the caller's; a missing key means the feature isn't available yet. */
const LLM_STATUS: Record<LlmError['kind'], number> = {
  not_ready: 503,
  timeout: 504,
  unreachable: 502,
  auth: 502,
  no_model: 502,
  upstream: 502,
  bad_response: 502,
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** The hostname part of a Host header or an Origin URL, lowercased. */
function hostnameOf(value: string, isOrigin: boolean): string | undefined {
  try {
    return new URL(isOrigin ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function fail(
  reply: FastifyReply,
  status: number,
  error: string,
  message: string,
  issues?: unknown,
) {
  return reply
    .code(status)
    .send({ error, message, ...(issues !== undefined && { issues }) });
}

/** Parse with a schema, or answer 400 naming each problem. */
function parse<T>(
  schema: z.ZodType<T>,
  value: unknown,
  reply: FastifyReply,
): T | undefined {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  fail(
    reply,
    400,
    'bad_request',
    r.error.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join('; '),
    r.error.issues.map((i) => ({ path: i.path, message: i.message })),
  );
  return undefined;
}

export function buildApp(opts: AppOptions): FastifyInstance {
  const inboxDir = opts.inboxDir ?? DEFAULT_INBOX;
  const app = Fastify({ logger: opts.logger ?? false });
  const services = new Services(
    opts.db,
    new SearchRunner(opts.searchLimitMs),
    opts.rotations ?? { deps: installedRotationDeps() },
  );
  const llmClient =
    opts.llmClient ?? (opts.llm ? createLlmClient(opts.llm) : undefined);
  const tools = accountTools(services);
  app.addHook('onClose', () => services.searches.close());

  // ---- localhost guard and CORS -----------------------------------------
  app.addHook('onRequest', async (req, reply) => {
    const host = hostnameOf(req.headers.host ?? '', false);
    if (!host || !LOCAL_HOSTS.has(host))
      return fail(
        reply,
        403,
        'forbidden',
        'this server only answers localhost',
      );
    const origin = req.headers.origin;
    if (origin !== undefined) {
      const o = hostnameOf(origin, true);
      if (!o || !LOCAL_HOSTS.has(o))
        return fail(reply, 403, 'forbidden', `origin ${origin} is not local`);
      reply
        .header('Access-Control-Allow-Origin', origin)
        .header('Vary', 'Origin');
      if (req.method === 'OPTIONS')
        return reply
          .header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
          .header(
            'Access-Control-Allow-Headers',
            'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version',
          )
          .code(204)
          .send();
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ServiceError)
      return fail(reply, err.status, err.code, err.message, err.issues);
    if (err instanceof StoreError)
      return fail(reply, 404, 'not_found', err.message);
    if (err instanceof LlmError)
      return fail(reply, LLM_STATUS[err.kind], `llm_${err.kind}`, err.message);
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status < 500)
      return fail(reply, status, 'bad_request', (err as Error).message);
    app.log.error(err);
    return fail(reply, 500, 'internal', 'the server hit an error; see its log');
  });
  app.setNotFoundHandler((req, reply) =>
    fail(reply, 404, 'not_found', `no route ${req.method} ${req.url}`),
  );

  // ---- account and characters ------------------------------------------------
  app.get('/health', async () => services.health());
  app.get('/llm', async (_req, reply) =>
    opts.llm
      ? describeLlm(opts.llm)
      : fail(reply, 404, 'not_found', 'no language model configured'),
  );
  app.get('/account', async () => services.accountSummary());
  app.get('/account/good', async () => services.accountGood());
  app.get('/characters', async () => services.listCharacters());
  app.get('/characters/:id', async (req, reply) => {
    const p = parse(IdParam, req.params, reply);
    if (p) return services.getCharacter(p.id);
  });

  // ---- artifacts and builds --------------------------------------------------
  app.post('/artifacts/query', async (req, reply) => {
    const q = parse(ArtifactQuery, req.body ?? {}, reply);
    if (q) return services.queryArtifacts(q);
  });
  app.post('/optimize', async (req, reply) => {
    const body = parse(OptimizeBody, req.body, reply);
    if (body) return services.optimize(body);
  });
  // ---- ConstraintSpec (TODO 4.3, ADR-0038) --------------------------------
  // check: the "I understood" summary, nothing run. run: checked, mapped,
  // searched. translate: words to a checked spec, nothing run.
  app.post('/spec/check', async (req, reply) => {
    const body = parse(SpecBody, req.body, reply);
    if (!body) return;
    const { spec, run, understood } = services.checkSpec(body.spec, body.topK);
    return {
      understood: understood.text,
      conditions: understood.conditions,
      spec,
      request: run.request,
      pool: { artifacts: run.pool.length },
    };
  });
  app.post('/spec/run', async (req, reply) => {
    const body = parse(SpecBody, req.body, reply);
    if (body) return services.runSpec(body.spec, body.topK);
  });
  app.post('/spec/translate', async (req, reply) => {
    if (!llmClient)
      return fail(reply, 503, 'llm_not_ready', 'no language model configured');
    const body = parse(TranslateBody, req.body, reply);
    if (body) return services.translateSpec(llmClient, body.text);
  });

  app.post('/compare', async (req, reply) => {
    const body = parse(CompareBody, req.body, reply);
    if (body) return services.compareBuilds(body);
  });

  // ---- language model (TODO 3.4, ADR-0033) ---------------------------------
  app.post(
    '/explain',
    { bodyLimit: EXPLAIN_BODY_LIMIT },
    async (req, reply) => {
      if (!llmClient)
        return fail(
          reply,
          503,
          'llm_not_ready',
          'no language model configured',
        );
      const payload = parseExplainPayload(req.body);
      if (!payload)
        return fail(
          reply,
          400,
          'bad_request',
          'not a valid explain payload: characterKey, objective, totals and gap, within their limits',
        );
      return explainBuild(llmClient, payload);
    },
  );

  // The chat (TODO 3.6, ADR-0035): the same tools as MCP, run by the server
  // for the configured model, numbers held to the tool results.
  app.post('/chat', async (req, reply) => {
    if (!llmClient)
      return fail(reply, 503, 'llm_not_ready', 'no language model configured');
    const body = parse(ChatBody, req.body, reply);
    if (!body) return;
    const r = await runChat(llmClient, tools, body.messages);
    return { ...r, provider: llmClient.provider, model: llmClient.model };
  });

  // ---- later phases ----------------------------------------------------------
  app.post('/allocate', async (_req, reply) =>
    fail(
      reply,
      501,
      'not_implemented',
      'account-wide allocation comes in Phase 7',
    ),
  );
  app.post('/sim', async (_req, reply) =>
    fail(reply, 501, 'not_implemented', 'gcsim simulation comes in Phase 5'),
  );

  // ---- imports ---------------------------------------------------------------
  app.get('/imports', async () => services.imports());
  app.get('/imports/report', async () => services.importReport());
  app.get('/imports/:id/changes', async (req, reply) => {
    const p = parse(SnapshotParam, req.params, reply);
    if (p) return services.changes(p.id);
  });
  app.post('/imports/scan', async () => processInbox(opts.db, inboxDir));

  // ---- MCP over streamable HTTP (stateless) ---------------------------------
  // One server and transport per request: no session state to keep, and the
  // localhost guard above has already run.
  app.post('/mcp', async (req, reply) => {
    const server = createMcpServer(services);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
  for (const method of ['GET', 'DELETE'] as const)
    app.route({
      method,
      url: '/mcp',
      handler: async (_req, reply) =>
        fail(
          reply,
          405,
          'method_not_allowed',
          'this MCP endpoint is stateless: POST only',
        ),
    });

  return app;
}
