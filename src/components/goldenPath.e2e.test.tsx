/**
 * One end-to-end "golden path" test: import a real GOOD export, run the
 * actual optimiser (via the worker client's synchronous fallback — jsdom has
 * no Worker, see `optimize.worker.test.ts` for the worker itself), generate
 * a share link, decode it back, and assert the round trip matches. This is
 * the "seams compose correctly" test called out in the 2026-09 testing audit
 * (testing-strategy.md §5, item 10) — every seam here is otherwise only
 * tested in isolation (import, optimizer, share/url) or with a mocked
 * worker (App.test.tsx).
 * @packageDocumentation
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { useInventory } from '../state/inventory';
import { useRoster } from '../state/roster';
import { useOptimizeRequest } from '../state/optimizeRequest';
import { loadSampleGOOD } from '@genshin-build-lab/engine/test-fixtures/sampleAccount';
import { decodeBuild } from '@genshin-build-lab/engine/share/url';

describe('golden path: import -> optimize -> share -> decode', () => {
  beforeEach(() => {
    useInventory.getState().clear();
    useRoster.getState().clear();
    useOptimizeRequest.getState().reset();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it(
    'carries a real build from a GOOD import through optimize and a share round trip',
    { timeout: 20_000 },
    async () => {
      const user = userEvent.setup();
      render(<App />);

      // 1. Import — the committed synthetic GOOD fixture (8 characters, 8
      // weapons, 20 five-star artifacts).
      const goodJson = JSON.stringify(loadSampleGOOD());
      const file = new File([goodJson], 'good.json', {
        type: 'application/json',
      });
      Object.defineProperty(file, 'text', { value: async () => goodJson });
      await user.upload(screen.getByLabelText(/Upload GOOD export/i), file);
      await waitFor(
        () => expect(useInventory.getState().artifacts.length).toBe(20),
        { timeout: 10_000 },
      );
      await waitFor(
        () =>
          expect(document.body.textContent).toMatch(/Imported 20 artifacts/i),
        { timeout: 10_000 },
      );

      // 2. Optimize — the app auto-selects the roster's best-built character
      // (App's `isDefaultSelection` effect) once the roster is populated, so
      // the Optimise button is already actionable.
      const optimiseBtn = await screen.findByRole('button', {
        name: /^optimise$/i,
      });
      await waitFor(() =>
        expect(optimiseBtn).not.toHaveAttribute('aria-disabled', 'true'),
      );
      await user.click(optimiseBtn);
      await waitFor(() =>
        expect(document.body.textContent).toMatch(/Optimisation complete/i),
      );

      // Optimising over a real 20-piece inventory yields several tied/near-tied
      // builds, each with its own "Copy Share Link" button — the rank-1 card's
      // is the first one in document order.
      const [shareBtn] = await screen.findAllByRole(
        'button',
        { name: /copy share link/i },
        { timeout: 10_000 },
      );

      // 3. Share — Results.tsx's onShare calls the real encodeBuild and then
      // navigator.clipboard.writeText. jsdom has no clipboard API; stubbing it
      // to reject exercises the same "couldn't copy automatically" manual-link
      // fallback, which conveniently puts the share URL in a readable <input>.
      vi.stubGlobal('navigator', {
        ...navigator,
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('no clipboard')),
        },
      });
      await user.click(shareBtn);
      const shareInput = await screen.findByLabelText(/share link/i);
      const shareUrl = (shareInput as HTMLInputElement).value;
      expect(shareUrl).toMatch(/\?b=/);
      const param = new URL(shareUrl).searchParams.get('b')!;

      // 4. Decode — the real decode path (share/url.ts), not a mock.
      const decoded = await decodeBuild(param);
      if ('error' in decoded) throw new Error('expected a decodable snapshot');
      expect(decoded.request.characterKey).toBeTruthy();
      expect(decoded.artifacts).toHaveLength(5);
      // Every artifact the decoded build's ids reference must be present, and
      // an artifact from the imported inventory (not synthesised).
      const importedIds = new Set(
        useInventory.getState().artifacts.map((a) => a.id),
      );
      for (const a of decoded.artifacts)
        expect(importedIds.has(a.id)).toBe(true);
    },
  );
});
