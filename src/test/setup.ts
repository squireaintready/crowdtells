import '@testing-library/jest-dom';

// jsdom doesn't implement matchMedia; provide a default (desktop / no-match) stub
// so components that branch on it (DevelopingWidget, Controls) run their real
// logic in tests instead of silently hitting a try/catch. Individual tests can
// override window.matchMedia to simulate a phone.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
