import { beforeEach } from 'vitest'

/** This jsdom build ships no Storage, so give tests a minimal in-memory one. */
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() { return store.size },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
    clear: () => { store.clear() },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
}

beforeEach(() => localStorage.clear())
