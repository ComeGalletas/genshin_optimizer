import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportPanel } from './ImportPanel';
import { useInventory } from '../state/inventory';
import { SAMPLE_INVENTORY } from '@genshin-build-lab/engine/sample/sampleInventory';
import { useRoster } from '../state/roster';

const goodJson = JSON.stringify({
  format: 'GOOD',
  version: 2,
  artifacts: [
    {
      setKey: 'EmblemOfSeveredFate',
      slotKey: 'sands',
      rarity: 5,
      level: 20,
      mainStatKey: 'atk_',
      substats: [{ key: 'critDMG_', value: 14 }],
    },
  ],
});

const uidShowcase = {
  avatarInfoList: [
    {
      equipList: [
        {
          reliquary: { level: 21 },
          flat: {
            itemType: 'ITEM_RELIQUARY',
            equipType: 'EQUIP_BRACER',
            rankLevel: 5,
            setNameTextMapHash: 'x',
            reliquaryMainstat: { mainPropId: 'FIGHT_PROP_HP', statValue: 4780 },
            reliquarySubstats: [
              { appendPropId: 'FIGHT_PROP_CRITICAL', statValue: 7 },
            ],
          },
        },
      ],
    },
  ],
};

beforeEach(() => {
  useInventory.setState({ artifacts: [] });
  useRoster.getState().clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  useInventory.setState({ artifacts: [] });
  useRoster.getState().clear();
});

describe('ImportPanel', () => {
  it('shows the loaded artifact count (0 initially)', () => {
    render(<ImportPanel />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText(/artifacts loaded/i)).toBeInTheDocument();
  });

  it('imports a valid GOOD file and reports the count', async () => {
    const user = userEvent.setup();
    render(<ImportPanel />);
    const file = new File([goodJson], 'good.json', {
      type: 'application/json',
    });
    // jsdom + user-event don't reliably surface File.text(); pin it so the
    // onFile -> parseGOOD path is exercised deterministically.
    Object.defineProperty(file, 'text', { value: async () => goodJson });
    await user.upload(screen.getByLabelText(/Upload GOOD export/i), file);
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Imported 1 artifact\b/i,
    );
  });

  it('shows an error for an unrecognised / invalid-JSON file', async () => {
    const user = userEvent.setup();
    render(<ImportPanel />);
    const file = new File(['not json{{'], 'bad.json', {
      type: 'application/json',
    });
    Object.defineProperty(file, 'text', { value: async () => 'not json{{' });
    await user.upload(screen.getByLabelText(/Upload GOOD export/i), file);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /recognised inventory export/i,
    );
  });

  it('surfaces a UID fetch error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    const user = userEvent.setup();
    render(<ImportPanel />);
    await user.type(screen.getByLabelText('Import by UID'), '700000000');
    await user.click(screen.getByRole('button', { name: /fetch/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Couldn’t find that UID/i,
    );
  });

  it('tells the user the network is the problem when the fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const user = userEvent.setup();
    render(<ImportPanel />);
    await user.type(screen.getByLabelText('Import by UID'), '700000000');
    await user.click(screen.getByRole('button', { name: /fetch/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn’t reach enka/i,
    );
  });

  it('tells the user to turn the showcase on when the UID has no showcase', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    const user = userEvent.setup();
    render(<ImportPanel />);
    await user.type(screen.getByLabelText('Import by UID'), '700000000');
    await user.click(screen.getByRole('button', { name: /fetch/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /no artifacts on showcase/i,
    );
  });

  it('imports showcased artifacts from a UID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => uidShowcase }),
    );
    const user = userEvent.setup();
    render(<ImportPanel />);
    await user.type(screen.getByLabelText('Import by UID'), '700000000');
    await user.click(screen.getByRole('button', { name: /fetch/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Imported 1 artifact\b/i,
    );
  });

  it('dedupes a UID import against a GOOD import that landed while the UID fetch was in flight', async () => {
    // A content-identical artifact reachable via both import paths (same
    // artifactHash: setKey|slot|rarity|level|mainStat|substats).
    let resolveFetch!: (v: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending));

    const user = userEvent.setup();
    render(<ImportPanel />);

    // Start the UID fetch; it suspends on the still-pending stubbed fetch,
    // so onUid has not yet reached mergeDedupe.
    await user.type(screen.getByLabelText('Import by UID'), '700000000');
    await user.click(screen.getByRole('button', { name: /fetch/i }));

    // While that's in flight, a GOOD import of the *same* artifact lands.
    const goodJson = JSON.stringify({
      format: 'GOOD',
      artifacts: [
        {
          setKey: 'x',
          slotKey: 'sands',
          rarity: 5,
          level: 20,
          mainStatKey: 'hp',
          substats: [{ key: 'critDMG_', value: 14 }],
        },
      ],
    });
    const file = new File([goodJson], 'good.json', {
      type: 'application/json',
    });
    Object.defineProperty(file, 'text', { value: async () => goodJson });
    await user.upload(screen.getByLabelText(/Upload GOOD export/i), file);
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Imported 1 artifact\b/i,
    );

    // Now let the UID fetch resolve with the same content, mapped through
    // Enka's field names (see uid.ts's EQUIP_SLOT/PROP_STAT).
    resolveFetch({
      ok: true,
      json: async () => ({
        avatarInfoList: [
          {
            equipList: [
              {
                reliquary: { level: 21 }, // -1 => level 20
                flat: {
                  itemType: 'ITEM_RELIQUARY',
                  equipType: 'EQUIP_SHOES', // -> slot 'sands'
                  rankLevel: 5,
                  setNameTextMapHash: 'x',
                  reliquaryMainstat: {
                    mainPropId: 'FIGHT_PROP_HP', // -> mainStat 'hp'
                    statValue: 4780,
                  },
                  reliquarySubstats: [
                    { appendPropId: 'FIGHT_PROP_CRITICAL_HURT', statValue: 14 },
                  ],
                },
              },
            ],
          },
        ],
      }),
    });

    // Wait for onUid's continuation to fully finish, not just for the
    // fetch promise to resolve: waitFor's first check runs synchronously,
    // before resolveFetch's microtask chain (fetchUidArtifacts's own
    // internal awaits, then mergeDedupe) has had a chance to run — a naive
    // waitFor on the store length would pass immediately on the pre-UID
    // count and never observe the race. setBusy(false) runs synchronously
    // right before mergeDedupe(out) with no further await between them, so
    // waiting for the button to leave "Fetching…" guarantees mergeDedupe
    // has already executed.
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /^fetch$/i }),
      ).toBeInTheDocument();
    });

    // The UID import's dedupe must see the GOOD import that already
    // committed, even though its own `artifacts` closure was captured
    // before that import landed — so the duplicate must NOT be kept.
    expect(useInventory.getState().artifacts).toHaveLength(1);
  });

  it('populates the roster from a GOOD file with characters/weapons arrays and reports the count', async () => {
    const rosterJson = JSON.stringify({
      format: 'GOOD',
      artifacts: [],
      characters: [{ key: 'RaidenShogun', ascension: 6 }],
      weapons: [{ key: 'TheCatch', location: 'RaidenShogun' }],
    });
    const user = userEvent.setup();
    render(<ImportPanel />);
    const file = new File([rosterJson], 'good.json', {
      type: 'application/json',
    });
    Object.defineProperty(file, 'text', { value: async () => rosterJson });
    await user.upload(screen.getByLabelText(/Upload GOOD export/i), file);
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Roster: 1 characters/i,
    );
    expect(useRoster.getState().entries['raiden_shogun']).toEqual({
      buildLevel: 90,
      weaponKey: 'the_catch',
    });
  });

  it('leaves the roster untouched for a GOOD file without characters/weapons arrays', async () => {
    const user = userEvent.setup();
    render(<ImportPanel />);
    const file = new File([goodJson], 'good.json', {
      type: 'application/json',
    });
    Object.defineProperty(file, 'text', { value: async () => goodJson });
    await user.upload(screen.getByLabelText(/Upload GOOD export/i), file);
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Imported 1 artifact\b/i,
    );
    expect(useRoster.getState().entries).toEqual({});
  });

  it('explains why Fetch is disabled until a UID is entered', async () => {
    const user = userEvent.setup();
    render(<ImportPanel />);
    expect(
      screen.getByText(/enter your uid to enable fetch/i),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Import by UID'), '700000001');
    expect(screen.queryByText(/enter your uid/i)).not.toBeInTheDocument();
  });

  it('rejects a malformed UID before fetching', async () => {
    const user = userEvent.setup();
    render(<ImportPanel />);
    await user.type(screen.getByLabelText('Import by UID'), '123');
    expect(screen.getByText(/9–10 digits/)).toBeInTheDocument();
    // aria-disabled, not `disabled` — the button must keep focus across the
    // async fetch. `onUid` carries the matching early return.
    expect(screen.getByRole('button', { name: /fetch/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.type(screen.getByLabelText('Import by UID'), '456789');
    expect(screen.getByRole('button', { name: /fetch/i })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });

  it('does not fetch a malformed UID even when Enter submits the row', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const user = userEvent.setup();
    render(<ImportPanel />);
    await user.type(screen.getByLabelText('Import by UID'), '123{Enter}');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports a re-import as up to date rather than "imported 0"', async () => {
    const user = userEvent.setup();
    render(<ImportPanel />);
    const file = () => {
      const f = new File([goodJson], 'good.json', {
        type: 'application/json',
      });
      Object.defineProperty(f, 'text', { value: async () => goodJson });
      return f;
    };
    const input = screen.getByLabelText(/Upload GOOD export/i);
    await user.upload(input, file());
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Imported 1 artifact\b/i,
    );
    await user.upload(input, file());
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        /Already up to date — all 1 piece was already in your inventory/i,
      ),
    );
  });
  it('drops the sample gear when a real import lands', async () => {
    // The demo bag is generated, not owned: merging a real import into it
    // would rank builds around gear the player has never seen.
    useInventory.getState().replaceAll(SAMPLE_INVENTORY);
    expect(useInventory.getState().artifacts.length).toBeGreaterThan(0);

    const user = userEvent.setup();
    render(<ImportPanel />);
    const file = new File([goodJson], 'good.json', {
      type: 'application/json',
    });
    Object.defineProperty(file, 'text', { value: async () => goodJson });
    await user.upload(screen.getByLabelText(/Upload GOOD export/i), file);
    await waitFor(() =>
      expect(useInventory.getState().artifacts).toHaveLength(1),
    );
    expect(
      useInventory.getState().artifacts.some((a) => a.id.startsWith('sample-')),
    ).toBe(false);
  });

  it('says nothing was imported when the file parses but carries no artifacts', async () => {
    const emptyJson = JSON.stringify({
      format: 'GOOD',
      version: 2,
      artifacts: [],
    });
    const user = userEvent.setup();
    render(<ImportPanel />);
    const file = new File([emptyJson], 'good.json', {
      type: 'application/json',
    });
    Object.defineProperty(file, 'text', { value: async () => emptyJson });
    await user.upload(screen.getByLabelText(/Upload GOOD export/i), file);
    expect(await screen.findByRole('status')).toHaveTextContent(
      /No readable artifacts in that file/i,
    );
  });

  it('clears inventory and roster, but only on the second press', async () => {
    useInventory.getState().replaceAll(SAMPLE_INVENTORY);
    useRoster.getState().setRoster({ raiden_shogun: { buildLevel: 90 } });
    const user = userEvent.setup();
    render(<ImportPanel />);

    await user.click(screen.getByRole('button', { name: /Clear inventory/i }));
    // First press only arms the control — nothing is destroyed yet, and the
    // announcement says what the second press will do.
    expect(useInventory.getState().artifacts.length).toBeGreaterThan(0);
    expect(await screen.findByRole('status')).toHaveTextContent(
      /cannot be undone/i,
    );

    await user.click(screen.getByRole('button', { name: /Confirm clear/i }));
    expect(useInventory.getState().artifacts).toEqual([]);
    expect(useRoster.getState().entries).toEqual({});
  });

  it('offers no Clear inventory control when there is nothing to clear', () => {
    render(<ImportPanel />);
    expect(
      screen.queryByRole('button', { name: /Clear inventory/i }),
    ).toBeNull();
  });
});
