import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GameText } from './GameText';

describe('GameText', () => {
  it('shows the game’s highlighted terms in bold', () => {
    const { container } = render(<GameText text="Gain **Bond of Life** now" />);
    expect(container.textContent).toBe('Gain Bond of Life now');
    expect(container.querySelector('strong')?.textContent).toBe('Bond of Life');
  });

  // QA c1: genshin-db has empty markers (Nicole, Odette).
  it('drops empty markers instead of showing asterisks', () => {
    const { container } = render(<GameText text="the **** effect" />);
    expect(container.textContent).toBe('the  effect');
    expect(container.querySelector('strong')).toBeNull();
  });
});
