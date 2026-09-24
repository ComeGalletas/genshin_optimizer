/**
 * The engine's allowlist of runtime globals.
 *
 * `tsconfig.lib.json` typechecks engine source with neither DOM nor Node
 * types, so anything that reaches the outside world (`fetch`, `document`,
 * `localStorage`, `fs`, `process`) is a type error. A few web-standard APIs
 * are pure computation and exist identically in browsers, workers and Node;
 * they are declared here, narrowed to what the engine actually calls. Adding
 * an entry is a review decision: it must be deterministic-or-random
 * computation, never I/O.
 *
 * Only `tsconfig.lib.json` includes this file. The package's own tsconfig
 * (tests, with Node types) and consumers (DOM types) get the real
 * definitions, so these never clash.
 */

/** Monotonic clock, for benchmark timing. */
declare const performance: { now(): number };

/** UUIDs for imported artifact ids. */
declare const crypto: { randomUUID(): string };

/** Base64 for share links. */
declare function btoa(data: string): string;
declare function atob(data: string): string;

declare class TextEncoder {
  encode(input?: string): Uint8Array<ArrayBuffer>;
}
declare class TextDecoder {
  decode(input?: Uint8Array): string;
}

/** Minimal web-streams surface: share links deflate/inflate via these. */
interface EngineStreamReadResult<T> {
  done: boolean;
  value: T;
}
interface EngineStreamReader<T> {
  read(): Promise<EngineStreamReadResult<T>>;
  cancel(): Promise<void>;
}
interface EngineStreamWriter<T> {
  write(chunk: T): Promise<void>;
  close(): Promise<void>;
}
interface EngineTransformStream {
  readonly writable: { getWriter(): EngineStreamWriter<Uint8Array> };
  readonly readable: { getReader(): EngineStreamReader<Uint8Array> };
}
declare class CompressionStream implements EngineTransformStream {
  constructor(format: 'deflate' | 'deflate-raw' | 'gzip');
  readonly writable: { getWriter(): EngineStreamWriter<Uint8Array> };
  readonly readable: { getReader(): EngineStreamReader<Uint8Array> };
}
declare class DecompressionStream implements EngineTransformStream {
  constructor(format: 'deflate' | 'deflate-raw' | 'gzip');
  readonly writable: { getWriter(): EngineStreamWriter<Uint8Array> };
  readonly readable: { getReader(): EngineStreamReader<Uint8Array> };
}
