// Worker threads don't inherit the tsx loader the server runs under, so the
// worker registers it itself before loading its TypeScript entry.
import { register } from 'tsx/esm/api';

register();
await import('./worker.ts');
