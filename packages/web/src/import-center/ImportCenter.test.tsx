import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportCenter } from './ImportCenter';
import type { Artifact } from '@genshin-build-lab/engine/game/types';

const piece = (over: Partial<Artifact> = {}): Artifact => ({
  id: 's1-0',
  setKey: 'GladiatorsFinale',
  slot: 'sands',
  rarity: 5,
  level: 20,
  mainStat: 'atk_pct',
  mainStatValue: 46.6,
  subStats: [{ key: 'crit_rate', value: 10.5 }],
  ...over,
});

const snapshot = (id: number, kind: string, over: object = {}) => ({
  id,
  kind,
  fileName: `${kind}-${id}.json`,
  takenAt: `2026-10-0${id}T10:00:00.000Z`,
  importedAt: `2026-10-0${id}T11:00:00.000Z`,
  artifacts: 1650,
  issues: 0,
  ...over,
});

const IMPORTS = {
  snapshots: [
    snapshot(1, 'irminsul'),
    snapshot(2, 'ocr', { artifacts: 300 }),
    snapshot(3, 'ocr', { fault: { repeatedPieces: 40, extraEntries: 90 } }),
  ],
  merges: [
    {
      id: 1,
      createdAt: '2026-10-01T11:00:00.000Z',
      snapshotIds: [1],
      rejected: [],
      artifacts: 1650,
    },
    {
      id: 2,
      createdAt: '2026-10-02T11:00:00.000Z',
      snapshotIds: [1, 2],
      rejected: [
        { snapshot: '3', fault: { repeatedPieces: 40, extraEntries: 90 } },
      ],
      artifacts: 1651,
    },
  ],
};

const MERGE_2 = {
  merge: IMPORTS.merges[1],
  listCap: 100,
  reports: [
    {
      snapshot: 2,
      against: [1],
      counts: {
        paired: 299,
        exact: 297,
        fuzzy: 1,
        levelled: 1,
        mismatches: 1,
        moved: 0,
        onlySnapshot: 0,
        onlyAccount: 1350,
      },
      mismatches: [
        {
          account: piece({ location: 'eula' }),
          snapshot: piece({ subStats: [{ key: 'crit_rate', value: 17.5 }] }),
          stats: ['crit_rate'],
        },
      ],
      moved: [],
      onlySnapshot: [],
      onlyAccount: [piece({ setKey: 'NoblesseOblige', slot: 'plume' })],
    },
  ],
};

const CHANGES_2 = {
  changes: null,
};
const CHANGES_1 = {
  changes: {
    from: 0,
    to: 1,
    diff: {
      added: [4],
      removed: [],
      upgraded: [{ before: 2, after: 2, by: 'first-rolls' }],
      moved: [{ before: 3, after: 3, from: 'diona', to: 'furina' }],
      lockChanged: [],
      unchanged: 1645,
      unexplained: [],
    },
    pieces: {
      before: {
        2: piece({ level: 16 }),
        3: piece({ location: 'diona', slot: 'goblet' }),
      },
      after: {
        2: piece(),
        3: piece({ location: 'furina', slot: 'goblet' }),
        4: piece({ setKey: 'EmblemOfSeveredFate', slot: 'flower' }),
      },
    },
  },
};

/** A fake local server for the import routes. */
function serve(
  routes: Record<string, unknown | ((init?: RequestInit) => unknown)> = {},
) {
  const all: Record<string, unknown> = {
    'GET /imports': IMPORTS,
    'GET /imports/merges/2': MERGE_2,
    'GET /imports/merges/1': {
      ...MERGE_2,
      merge: IMPORTS.merges[0],
      reports: [],
    },
    'GET /imports/1/changes': CHANGES_1,
    'GET /imports/2/changes': CHANGES_2,
    ...routes,
  };
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(url).pathname}`;
    const r = all[key];
    const body = typeof r === 'function' ? r(init) : r;
    const status = body === undefined ? 404 : 200;
    return {
      ok: status === 200,
      status,
      json: async () => body ?? { message: `no route ${key}` },
    };
  });
  vi.stubGlobal('fetch', f);
  return f;
}

afterEach(() => vi.unstubAllGlobals());

describe('ImportCenter (TODO 8.1)', () => {
  it('shows the sources in precedence order, and every snapshot with its state', async () => {
    serve();
    render(<ImportCenter />);
    const sources = await screen.findByRole('region', {
      name: 'Sources, best first',
    });
    const items = within(sources).getAllByRole('listitem');
    expect(items.map((li) => li.firstChild!.textContent)).toEqual([
      'Irminsul',
      'OCR scanner',
      'Other GOOD file',
      'Enka showcase',
    ]);
    expect(items[0]).toHaveTextContent(
      'In the account: #1, 1,650 pieces, taken 2026-10-01 10:00 UTC.',
    );
    expect(items[1]).toHaveTextContent('2 snapshots, 1 faulty.');
    expect(items[2]).toHaveTextContent('No snapshots yet.');

    const snaps = screen.getByRole('region', {
      name: 'Snapshots, newest first',
    });
    const rows = within(snaps).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('#3 OCR scanner (ocr-3.json)');
    expect(rows[0]).toHaveTextContent('Faulty scan: 40 pieces repeated');
    // A faulty scan has nothing to compare.
    expect(within(rows[0]).queryByRole('button')).toBeNull();
    expect(rows[1]).toHaveTextContent('In the account');
  });

  it('opens what a snapshot changed, with the pieces', async () => {
    serve();
    render(<ImportCenter />);
    const snaps = await screen.findByRole('region', {
      name: 'Snapshots, newest first',
    });
    const first = within(snaps).getAllByRole('listitem')[2];
    await userEvent.click(
      within(first).getByRole('button', { name: 'What changed' }),
    );
    expect(
      await within(first).findByText(/1,645 pieces unchanged/),
    ).toBeInTheDocument();
    expect(first).toHaveTextContent('New: 1');
    expect(first).toHaveTextContent('Emblem of Severed Fate flower');
    expect(first).toHaveTextContent('(was +16)');
    expect(first).toHaveTextContent('on Furina');
    expect(first).toHaveTextContent('(from Diona)');

    const second = within(snaps).getAllByRole('listitem')[1];
    await userEvent.click(
      within(second).getByRole('button', { name: 'What changed' }),
    );
    expect(
      await within(second).findByText(/first usable snapshot/),
    ).toBeInTheDocument();
  });

  it('shows how the current merge reconciled its snapshots, and an older one on request', async () => {
    serve();
    render(<ImportCenter />);
    const merge = await screen.findByRole('region', { name: 'Reconciliation' });
    expect(
      await within(merge).findByText(/299 pieces paired/),
    ).toHaveTextContent('297 exact, 1 one step apart, 1 levelled since');
    expect(merge).toHaveTextContent(
      'Left out as faulty scans: #3 OCR scanner (ocr-3.json) (40 pieces repeated).',
    );
    expect(merge).toHaveTextContent('Misread or different pieces: 1');
    expect(merge).toHaveTextContent('differs on CRIT Rate');
    expect(merge).toHaveTextContent('Not in this snapshot: 1,350');
    expect(merge).toHaveTextContent('The first 1 of 1,350.');

    await userEvent.selectOptions(
      within(merge).getByRole('combobox', { name: 'Merge' }),
      '1',
    );
    expect(
      await within(merge).findByText('One snapshot: nothing to reconcile.'),
    ).toBeInTheDocument();
  });

  it('uploads a GOOD file the way the inbox takes one, and says what came of it', async () => {
    const f = serve({
      'POST /imports': {
        events: [
          {
            file: 'later.json',
            status: 'imported',
            snapshot: snapshot(4, 'irminsul'),
            issues: 2,
          },
        ],
        merge: { ...IMPORTS.merges[1], id: 3, artifacts: 1660 },
      },
    });
    render(<ImportCenter />);
    await screen.findByRole('region', { name: 'Sources, best first' });
    const file = new File(['{"format":"GOOD"}'], 'later.json', {
      type: 'application/json',
      lastModified: Date.UTC(2026, 9, 5, 20),
    });
    await userEvent.upload(screen.getByLabelText('Upload a GOOD File'), file);
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(
      'later.json: imported as snapshot #4: 1,650 pieces, 2 lines it couldn’t read.',
    );
    expect(status).toHaveTextContent(
      'New account (merge #3): 1,660 artifacts. Press Load Account under Load Data to use it here.',
    );
    expect(
      within(status).getByRole('link', { name: 'Load Data' }),
    ).toHaveAttribute('href', '#/start');
    const post = f.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({
      text: '{"format":"GOOD"}',
      fileName: 'later.json',
      takenAt: '2026-10-05T20:00:00.000Z',
    });
    // The list is fetched again after the import.
    expect(
      f.mock.calls.filter(
        ([url, init]) => url.endsWith('/imports') && !init?.method,
      ),
    ).toHaveLength(2);
  });

  it('scans the inbox, and says when a file was refused or the server failed', async () => {
    serve({
      'POST /imports/scan': {
        events: [
          {
            file: 'notes.json',
            status: 'refused',
            reason: 'notes.json: not a GOOD file',
          },
          {
            file: 'old.json',
            status: 'already-imported',
            snapshot: snapshot(1, 'irminsul'),
          },
        ],
      },
    });
    render(<ImportCenter />);
    await screen.findByRole('region', { name: 'Sources, best first' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Scan the Inbox' }),
    );
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(
      'notes.json: refused: notes.json: not a GOOD file.',
    );
    expect(status).toHaveTextContent(
      'old.json: already imported (snapshot #1).',
    );
    expect(status).not.toHaveTextContent('New account');

    serve({ 'GET /imports': undefined });
    render(<ImportCenter />);
    // Said with what failed, like the other views' errors.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t load the imports: no route GET /imports.',
    );
  });
});

describe('ImportCenter: the rarer cases', () => {
  it('shows gone, lock and unexplained changes, and says when a comparison fails', async () => {
    serve({
      'GET /imports/1/changes': {
        changes: {
          ...CHANGES_1.changes,
          diff: {
            ...CHANGES_1.changes.diff,
            added: [],
            removed: [5],
            upgraded: [],
            moved: [{ before: 3, after: 3, to: 'furina' }],
            lockChanged: [{ before: 2, after: 2, lock: true }],
            unexplained: [
              { before: 6, why: 'two candidates' },
              { why: 'no piece on either side' },
            ],
          },
          pieces: {
            before: {
              3: piece({ slot: 'goblet' }),
              5: piece({ setKey: 'NoblesseOblige' }),
              6: piece({ slot: 'circlet' }),
            },
            after: { 2: piece(), 3: piece({ slot: 'goblet' }) },
          },
        },
      },
      'GET /imports/2/changes': undefined,
    });
    render(<ImportCenter />);
    const snaps = await screen.findByRole('region', {
      name: 'Snapshots, newest first',
    });
    const [, second, first] = within(snaps).getAllByRole('listitem');
    await userEvent.click(
      within(first).getByRole('button', { name: 'What changed' }),
    );
    await within(first).findByText(/unchanged/);
    expect(first).toHaveTextContent('Gone: 1');
    expect(first).toHaveTextContent('Noblesse Oblige sands');
    expect(first).toHaveTextContent('(was unequipped)');
    expect(first).toHaveTextContent('(locked)');
    expect(first).toHaveTextContent('(two candidates)');
    expect(first).toHaveTextContent('no piece on either side');
    await userEvent.click(
      within(first).getByRole('button', { name: 'Hide changes' }),
    );
    await userEvent.click(
      within(second).getByRole('button', { name: 'What changed' }),
    );
    expect(await within(second).findByRole('alert')).toHaveTextContent(
      'Couldn’t compare: no route GET /imports/2/changes.',
    );
  });

  it('lists moved pieces in a reconciliation, and says when the report fails', async () => {
    serve({
      'GET /imports/merges/2': {
        ...MERGE_2,
        reports: [
          {
            ...MERGE_2.reports[0],
            counts: { ...MERGE_2.reports[0].counts, moved: 1 },
            moved: [
              {
                account: piece({ location: 'eula' }),
                snapshot: piece({ location: 'diona' }),
              },
            ],
          },
        ],
      },
      'GET /imports/merges/1': undefined,
    });
    render(<ImportCenter />);
    const merge = await screen.findByRole('region', { name: 'Reconciliation' });
    expect(await within(merge).findByText(/Moved: 1/)).toBeInTheDocument();
    expect(merge).toHaveTextContent('(in the account: on Eula)');
    await userEvent.selectOptions(
      within(merge).getByRole('combobox', { name: 'Merge' }),
      '1',
    );
    expect(await within(merge).findByRole('alert')).toHaveTextContent(
      'Couldn’t load the report: no route GET /imports/merges/1.',
    );
  });

  it('says so in place when the server sends a list it can’t read (QA M1)', async () => {
    // An array, not { snapshots, merges }: rendering it used to throw and
    // take the whole app down.
    serve({ 'GET /imports': [] });
    render(<ImportCenter />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'the local server sent a reply this app can’t read',
    );
    expect(screen.queryByText('Loading…')).toBeNull();
  });
});
