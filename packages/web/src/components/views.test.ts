import { describe, it, expect, afterEach } from 'vitest';
import { goTo, hrefOf, viewOf } from './views';

afterEach(() => window.history.pushState({}, '', '/'));

describe('view addresses (TODO 9.3)', () => {
  it('reads a view from the address, a comparison link as Simulate, and nothing else', () => {
    expect(viewOf('#/plan')).toBe('plan');
    expect(viewOf('#plan')).toBe('plan');
    expect(viewOf('#/start')).toBe('start');
    expect(viewOf('#c=eJzz')).toBe('simulate');
    expect(viewOf('')).toBeNull();
    expect(viewOf('#content')).toBeNull();
    expect(viewOf('#/nowhere')).toBeNull();
    expect(hrefOf('imports')).toBe('#/imports');
  });

  it('opens a view by its address, leaving a comparison link behind', () => {
    goTo('teams');
    expect(window.location.hash).toBe('#/teams');
    goTo('teams');
    expect(window.location.hash).toBe('#/teams');
    window.history.pushState({}, '', '/#c=abc');
    goTo('simulate');
    expect(window.location.hash).toBe('#/simulate');
  });
});
