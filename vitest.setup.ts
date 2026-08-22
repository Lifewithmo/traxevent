import '@testing-library/jest-dom'

// jsdom's built-in localStorage is unreliable under vitest's default (opaque)
// origin — some methods are missing from the prototype. Provide a minimal
// in-memory polyfill so components that read/write localStorage (sidebar
// collapse state, backlog chart open/closed, etc.) can be tested directly.
if (typeof window !== 'undefined' && (!window.localStorage || typeof window.localStorage.removeItem !== 'function')) {
  const store = new Map<string, string>()
  const localStorageMock: Storage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  })
}

// jsdom implements no CSSOM view module, so `window.matchMedia` is simply
// absent — any component that has to know its breakpoint in JS (an `inert`
// off-canvas drawer can't be media-queried in CSS) crashes on mount. Default to
// "no query matches", i.e. the desktop shape; a test that needs the mobile
// branch replaces this with its own stub.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string): MediaQueryList =>
      ({
        media: query,
        matches: false,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
    writable: true,
    configurable: true,
  })
}
