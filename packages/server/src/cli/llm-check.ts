/**
 * `npm run llm:check`: which model `config/llm.json` selects, whether its
 * key is set, and whether the provider has the model (TODO 3.3). Never
 * prints the key.
 * @packageDocumentation
 */

import { loadServerEnv } from '../env';
import { describeLlm, loadLlmConfig, LlmConfigError } from '../llm/config';
import { checkLlm } from '../llm/check';

loadServerEnv();
try {
  const config = loadLlmConfig();
  const d = describeLlm(config);
  console.log(
    `provider  ${d.provider}\nmodel     ${d.model}\nbase URL  ${d.baseUrl}\nAPI key   ${d.apiKey}`,
  );
  const r = await checkLlm(config);
  console.log(`${r.ok ? 'OK  ' : 'FAIL'}      ${r.detail}`);
  if (r.available?.length) console.log(`available ${r.available.join(', ')}`);
  process.exitCode = r.ok ? 0 : 1;
} catch (e) {
  if (!(e instanceof LlmConfigError)) throw e;
  console.error(`FAIL      ${e.message}`);
  process.exitCode = 1;
}
