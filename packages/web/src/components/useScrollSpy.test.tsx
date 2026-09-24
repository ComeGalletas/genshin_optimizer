import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useScrollSpy } from './useScrollSpy';

describe('useScrollSpy', () => {
  function Harness({ ids }: { ids: string[] }) {
    const active = useScrollSpy(ids);
    return <p data-testid="active">{active ?? 'none'}</p>;
  }

  it('drops a section from the "seen" set once it stops intersecting, and keeps the last active id if nothing else is', () => {
    type Cb = (entries: Partial<IntersectionObserverEntry>[]) => void;
    const callbacks: Cb[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: Cb) {
          callbacks.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    try {
      const a = document.createElement('section');
      a.id = 'sec-a';
      document.body.appendChild(a);

      render(<Harness ids={['sec-a']} />);
      const fire = (entries: Partial<IntersectionObserverEntry>[]) =>
        act(() => callbacks[callbacks.length - 1](entries));

      fire([{ isIntersecting: true, target: a }]);
      expect(screen.getByTestId('active')).toHaveTextContent('sec-a');

      // No longer intersecting: `seen` drops it (the `else` branch), and
      // since nothing else is intersecting either, the last answer sticks
      // rather than blanking out.
      fire([{ isIntersecting: false, target: a }]);
      expect(screen.getByTestId('active')).toHaveTextContent('sec-a');

      document.body.removeChild(a);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does nothing when no ids resolve to an element in the DOM', () => {
    render(<Harness ids={['does-not-exist']} />);
    expect(screen.getByTestId('active')).toHaveTextContent('none');
  });
});
