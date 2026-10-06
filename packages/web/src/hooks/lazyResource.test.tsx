import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { lazyResource } from './lazyResource';

function Show({ r }: { r: { useValue: () => unknown } }) {
  const v = r.useValue();
  return <p>{v === null ? 'loading' : String(v)}</p>;
}

describe('lazyResource', () => {
  it('loads once, the first time it is asked, for every reader', async () => {
    const load = vi.fn(() => Promise.resolve('names'));
    const r = lazyResource(load);
    expect(load).not.toHaveBeenCalled();
    render(
      <>
        <Show r={r} />
        <Show r={r} />
      </>,
    );
    expect(await screen.findAllByText('names')).toHaveLength(2);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('says a load failed, and the next reader tries again', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('details');
    const r = lazyResource(load);
    const first = render(<Show r={r} />);
    expect(await screen.findByText('failed')).toBeInTheDocument();
    first.unmount();
    render(<Show r={r} />);
    expect(await screen.findByText('details')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('takes a value from a test as if loaded', async () => {
    const load = vi.fn(() => new Promise<string>(() => {}));
    const r = lazyResource(load);
    r.setForTests('fixed');
    render(<Show r={r} />);
    expect(screen.getByText('fixed')).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });
});
