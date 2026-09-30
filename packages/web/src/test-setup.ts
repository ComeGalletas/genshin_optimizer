import '@testing-library/jest-dom';

// jsdom doesn't implement scrollIntoView; stub it so components that call it
// (e.g. the results-section auto-scroll in App.tsx) don't throw in tests.
Element.prototype.scrollIntoView = () => {};

// jsdom has no Pointer Capture API; vaul's drag handling calls it on pointerdown.
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;

// jsdom has no matchMedia; components branch on it (drawer direction, reduced
// motion). Default every query to "doesn't match" — i.e. the mobile/reduced
// baseline — and let individual tests override.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;

// No test reaches the network: the app probes the local server on start, and
// a developer's running `npm run server` must not change test results. A test
// that needs fetch stubs it with vi.stubGlobal, which restores this after.
globalThis.fetch = (async (input: RequestInfo | URL) => {
  throw new TypeError(`network disabled in tests: ${String(input)}`);
}) as typeof fetch;
