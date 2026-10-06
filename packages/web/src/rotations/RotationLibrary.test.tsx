import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RotationLibrary } from './RotationLibrary';
import { useCompareRotation } from '../teams/compareRotation';

const LIST = {
  rotations: [
    {
      id: 'nahida-aggravate',
      name: 'Nahida Aggravate (Raiden)',
      status: 'validated',
      archetype: 'nahida-aggravate',
      characters: ['raiden_shogun', 'nahida', 'fischl', 'kuki_shinobu'],
      source: 'adapted',
      dps: 47049,
      gcsim: 'v2.48.8',
      reviewed: true,
      summary: 'Raiden on field under Nahida’s Quicken.',
      sourceTitle: 'KQM Sim Database: Raiden Aggravate',
      sourceUrl: 'https://db.kqm.gg/db/kntc7TFbnPKp',
      missing: [],
    },
    {
      id: 'raiden-national',
      name: 'Raiden National',
      status: 'validated',
      characters: ['raiden_shogun', 'xiangling', 'yelan', 'bennett'],
      source: 'community',
      dps: 41000,
      reviewed: false,
      sourceTitle: 'KQM Sim Database: Raiden National',
      publishedDps: 41500,
      offPct: -1.2,
      missing: ['yelan'],
    },
    {
      id: 'my-draft',
      name: 'My Draft',
      status: 'draft',
      characters: ['furina or yelan', 'neuvillette'],
      source: 'llm',
      reviewed: false,
      missing: [],
    },
    { id: 'broken', problems: ['meta.json: slots: required'] },
  ],
};

const DETAIL = {
  meta: {
    id: 'nahida-aggravate',
    name: 'Nahida Aggravate (Raiden)',
    status: 'validated',
    summary: '…',
    slots: [
      { id: 'raiden', characters: ['raiden_shogun'], role: 'on-field-dps' },
      { id: 'nahida', characters: ['nahida'], role: 'applicator' },
    ],
    active: 'raiden',
    fight: {
      mode: 'actions',
      enemy: { level: 100, res: 10, hp: 999999999 },
    },
    energyWait: 'attack',
    rotationSec: 18,
    source: {
      kind: 'adapted',
      title: 'KQM Sim Database: Raiden Aggravate',
      url: 'https://db.kqm.gg/db/kntc7TFbnPKp',
      retrieved: '2026-10-05',
      changes: 'Fischl in Kazuha’s place.',
    },
    validation: {
      gcsim: 'v2.48.8',
      date: '2026-10-05',
      iterations: 1000,
      dps: 47049,
      sd: 1007,
      durationSec: 72.6,
      warnings: [],
    },
    review: { by: 'owner', date: '2026-10-05', gcsim: 'v2.48.8' },
  },
  template: '{{raiden}} skill;\n{{nahida}} skill, burst;',
};

function serve(list: unknown = LIST) {
  const f = vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    const body =
      path === '/rotations'
        ? list
        : path === '/rotations/nahida-aggravate'
          ? DETAIL
          : undefined;
    const found = body !== undefined && body !== null;
    return {
      ok: found,
      status: found ? 200 : 404,
      json: async () => (found ? body : { message: `no rotation at ${path}` }),
    };
  });
  vi.stubGlobal('fetch', f);
  return f;
}

afterEach(() => {
  vi.unstubAllGlobals();
  useCompareRotation.setState({ id: '' });
});

const card = async (name: string) =>
  (await screen.findByRole('heading', { name })).closest('li')!;

describe('RotationLibrary (TODO 8.2)', () => {
  it('lists each rotation with its team, status, source and numbers, and the ones that fail their checks', async () => {
    serve();
    render(<RotationLibrary />);
    const nahida = await card('Nahida Aggravate (Raiden)');
    expect(nahida).toHaveTextContent(
      'Raiden Shogun · Nahida · Fischl · Kuki Shinobu',
    );
    expect(nahida).toHaveTextContent('Validated, reviewed by you');
    expect(nahida).toHaveTextContent(
      'Adapted from a community config: KQM Sim Database: Raiden Aggravate · 47,049 team DPS on its reference builds',
    );
    const national = await card('Raiden National');
    expect(national).toHaveTextContent('(published 41,500, −1.2%)');
    expect(national).toHaveTextContent('Your account can’t field: Yelan.');
    const draft = await card('My Draft');
    expect(draft).toHaveTextContent('Draft: needs your review');
    expect(draft).toHaveTextContent('Furina or Yelan · Neuvillette');
    expect(
      screen.getByText(/Fails the library’s checks: meta.json: slots/),
    ).toBeInTheDocument();
  });

  it('opens a rotation: slots, fight, validation, review, source and action list', async () => {
    serve();
    render(<RotationLibrary />);
    const nahida = await card('Nahida Aggravate (Raiden)');
    await userEvent.click(
      within(nahida).getByRole('button', { name: 'Details' }),
    );
    const rows = await within(nahida).findAllByRole('row');
    expect(rows[1]).toHaveTextContent(
      'raiden (starts)Raiden ShogunOn-field DPS',
    );
    expect(nahida).toHaveTextContent(
      'enemy level 100, 10% resistance; about 18 s a rotation; burst waits filled with attacks.',
    );
    expect(nahida).toHaveTextContent(
      'Validated with gcsim v2.48.8 on 2026-10-05: 47,049 ± 1,007 team DPS over 72.6 s (1,000 iterations).',
    );
    expect(nahida).toHaveTextContent('Reviewed by the owner on 2026-10-05.');
    expect(within(nahida).getByRole('link', { name: 'link' })).toHaveAttribute(
      'href',
      'https://db.kqm.gg/db/kntc7TFbnPKp',
    );
    expect(nahida).toHaveTextContent('{{nahida}} skill, burst;');
  });

  it('sends a team it can field to Compare Teams, and not one it can’t', async () => {
    serve();
    render(<RotationLibrary />);
    const nahida = await card('Nahida Aggravate (Raiden)');
    await userEvent.click(
      within(nahida).getByRole('button', { name: 'Compare this team' }),
    );
    expect(useCompareRotation.getState().id).toBe('nahida-aggravate');
    const national = await card('Raiden National');
    await userEvent.click(
      within(national).getByRole('button', { name: 'Compare this team' }),
    );
    expect(useCompareRotation.getState().id).toBe('nahida-aggravate');
  });

  it('says when the library can’t be loaded', async () => {
    serve(null);
    render(<RotationLibrary />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t load the rotation library: no rotation at /rotations.',
    );
  });
});
