/**
 * Test-only fixtures. The sample GOOD export is synthetic and committed, so
 * every clone and CI run has it and the tests that use it never skip. Never
 * import this from app code — it is fixture data, not shipped content.
 * @packageDocumentation
 */
import sampleAccount from '../import/__fixtures__/sample-account.good.json';

/**
 * A small synthetic GOOD export: 8 characters with levels/talents/
 * constellations, 8 weapons equipped on them, and 20 five-star artifacts
 * across all five slots (17 of them equipped, so build scores compute).
 * Typed `unknown` on purpose — the importers take untrusted JSON, and the
 * fixture must exercise that contract rather than a pre-narrowed shape.
 */
export function loadSampleGOOD(): unknown {
  return sampleAccount;
}
