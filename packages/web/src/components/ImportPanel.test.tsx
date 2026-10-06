import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportPanel } from './ImportPanel';
import { useInventory } from '../state/inventory';
import { SAMPLE_INVENTORY } from '@genshin-build-lab/engine/sample/sampleInventory';
import { useRoster } from '../state/roster';
import { useServer } from '../local-server/status';
import { useAccount } from '../state/account';

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
  it('offers three choices, and no count or Clear while nothing is loaded (TODO 9.4)', () => {
    render(<ImportPanel />);
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(['Demo Data', 'Your Account', 'A New Source']);
    expect(screen.queryByText(/artifacts loaded/i)).toBeNull();
    // Offline, "Your Account" says how to get it rather than offering it.
    expect(screen.getByText(/npm run server/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load Account' })).toBeNull();
  });

  it('backs out of replacing owned gear with the demo, and opens the by-hand form on demand', async () => {
    useInventory
      .getState()
      .replaceAll([{ ...SAMPLE_INVENTORY[0], id: 'owned-2' }]);
    render(<ImportPanel />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Load Demo Data' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.getByRole('button', { name: 'Load Demo Data' }),
    ).toBeVisible();
    expect(useInventory.getState().artifacts.map((a) => a.id)).toEqual([
      'owned-2',
    ]);
    // The form isn't there until asked for.
    expect(screen.queryByRole('button', { name: /add artifact/i })).toBeNull();
    await userEvent.click(screen.getByText('Add Pieces by Hand'));
    expect(
      await screen.findByRole('button', { name: /add artifact/i }),
    ).toBeInTheDocument();
  });

  it('loads the demo data, says what it is, and asks before replacing owned gear', async () => {
    render(<ImportPanel />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Load Demo Data' }),
    );
    expect(useRoster.getState().entries).toHaveProperty('neuvillette');
    expect(useAccount.getState().source).toEqual({ kind: 'demo' });
    expect(window.location.hash).toBe('#/roster');
    expect(screen.getByRole('status')).toHaveTextContent(
      /Loaded the demo data: \d+ artifacts, 8 characters\./,
    );
    // The demo is replaced by the demo without asking...
    await userEvent.click(
      screen.getByRole('button', { name: 'Load Demo Data' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Confirm Replace' }),
    ).toBeNull();
    // ...but owned gear is not.
    useInventory
      .getState()
      .replaceAll([{ ...useInventory.getState().artifacts[0], id: 'owned-1' }]);
    await userEvent.click(
      screen.getByRole('button', { name: 'Load Demo Data' }),
    );
    expect(useInventory.getState().artifacts.map((a) => a.id)).toEqual([
      'owned-1',
    ]);
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm Replace' }),
    );
    expect(useInventory.getState().artifacts.length).toBeGreaterThan(1);
    window.location.hash = '';
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

describe('ImportPanel: the local server’s account (TODO 3.5)', () => {
  const account = {
    ...JSON.parse(goodJson),
    source: 'genshin-build-lab',
    characters: [
      {
        key: 'Furina',
        level: 90,
        ascension: 6,
        constellation: 0,
        talent: { auto: 1, skill: 9, burst: 9 },
      },
    ],
    weapons: [],
  };
  const serveAccount = (body: unknown = account, status = 200) => {
    const f = vi.fn(async () => ({
      ok: status === 200,
      status,
      json: async () => body,
    }));
    vi.stubGlobal('fetch', f);
    return f;
  };
  beforeEach(() => useServer.setState({ status: 'online', llm: null }));
  afterEach(() => {
    vi.unstubAllGlobals();
    useServer.setState({ status: 'checking', llm: null });
  });
  const loadButton = () => screen.getByRole('button', { name: /Load Account/ });

  it('is offered only while the server runs', () => {
    useServer.setState({ status: 'offline' });
    render(<ImportPanel />);
    expect(
      screen.queryByRole('button', { name: /Load Account/ }),
    ).not.toBeInTheDocument();
  });

  it('replaces the sample bag with the server’s artifacts and roster in one press', async () => {
    useInventory.setState({ artifacts: SAMPLE_INVENTORY });
    const f = serveAccount();
    render(<ImportPanel />);
    await userEvent.click(loadButton());
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        /Loaded the local server’s account: 1 artifact, 1 character\./,
      ),
    );
    expect(f).toHaveBeenCalledWith(
      'http://127.0.0.1:5198/account/good',
      expect.anything(),
    );
    const arts = useInventory.getState().artifacts;
    expect(arts).toHaveLength(1);
    expect(arts[0].setKey).toBe('EmblemOfSeveredFate');
    expect(Object.keys(useRoster.getState().entries)).toEqual(['furina']);
  });

  it('asks before replacing owned gear, and replaces rather than merges', async () => {
    const owned = { ...SAMPLE_INVENTORY[0], id: 'mine-1' };
    useInventory.setState({ artifacts: [owned] });
    const f = serveAccount();
    render(<ImportPanel />);
    await userEvent.click(loadButton());
    expect(f).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/Confirm replace/);
    await userEvent.click(
      screen.getByRole('button', { name: /Confirm Replace/ }),
    );
    await waitFor(() =>
      expect(useInventory.getState().artifacts).toHaveLength(1),
    );
    expect(useInventory.getState().artifacts[0].id).not.toBe('mine-1');
  });

  // Found loading the owner's account (2026-10-06): the confirm reset after
  // 5 s, but its "Press Confirm replace" prompt stayed, naming a button that
  // was gone.
  it('takes the prompt away when the confirm times out', async () => {
    useInventory.setState({
      artifacts: [{ ...SAMPLE_INVENTORY[0], id: 'mine-1' }],
    });
    serveAccount();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<ImportPanel />);
      await userEvent.click(loadButton());
      expect(screen.getByRole('status')).toHaveTextContent(/Confirm replace/);
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(
        screen.queryByRole('button', { name: /Confirm Replace/ }),
      ).toBeNull();
      expect(screen.queryByText(/Press Confirm replace/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('can back out of the replace', async () => {
    useInventory.setState({
      artifacts: [{ ...SAMPLE_INVENTORY[0], id: 'mine-1' }],
    });
    const f = serveAccount();
    render(<ImportPanel />);
    await userEvent.click(loadButton());
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(loadButton()).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
    expect(useInventory.getState().artifacts[0].id).toBe('mine-1');
  });

  it('replaces nothing when no artifact in the account can be read (QA M3)', async () => {
    useInventory.setState({ artifacts: SAMPLE_INVENTORY });
    useRoster.getState().setRoster({ bennett: { buildLevel: 90 } });
    serveAccount({
      format: 'GOOD',
      version: 3,
      artifacts: [{ setKey: 1, slotKey: 'hat' }, null, 'x'],
      characters: [{ key: 'Furina', level: 'ninety' }],
      weapons: [],
    });
    render(<ImportPanel />);
    await userEvent.click(loadButton());
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'None of the 3 artifacts in the local server’s account could be read here, so nothing was replaced.',
      ),
    );
    expect(useInventory.getState().artifacts).toBe(SAMPLE_INVENTORY);
    expect(Object.keys(useRoster.getState().entries)).toEqual(['bennett']);
  });

  it('says what it left out when only some of the account can be read (QA M3)', async () => {
    useInventory.setState({ artifacts: SAMPLE_INVENTORY });
    serveAccount({
      ...account,
      artifacts: [...account.artifacts, { setKey: 1 }],
    });
    render(<ImportPanel />);
    await userEvent.click(loadButton());
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Loaded the local server’s account: 1 artifact, 1 character. Left out 1 artifact this app couldn’t read.',
      ),
    );
  });

  it('shows the server’s reason when it has no account, and keeps what is loaded', async () => {
    useInventory.setState({ artifacts: SAMPLE_INVENTORY });
    serveAccount(
      {
        error: 'not_found',
        message: 'no account imported yet: drop a GOOD file in imports/inbox/',
      },
      404,
    );
    render(<ImportPanel />);
    await userEvent.click(loadButton());
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Couldn’t load the server’s account: no account imported yet/,
      ),
    );
    expect(useInventory.getState().artifacts).toBe(SAMPLE_INVENTORY);
  });
});
