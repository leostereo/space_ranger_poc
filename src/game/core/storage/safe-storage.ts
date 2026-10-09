/** Subconjunto de Web Storage que usamos: así se puede inyectar uno falso en pruebas. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PROBE_KEY = "__storage_probe__";

/** Storage en memoria: se pierde al recargar. Sirve de respaldo y para pruebas. */
export function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

/**
 * Devuelve localStorage si se puede usar; si no (modo privado, cuota, sin DOM), uno en memoria.
 * Nunca lanza: el juego tiene que poder arrancar aunque no se pueda persistir.
 */
export function createSafeStorage(): StorageLike {
  try {
    window.localStorage.setItem(PROBE_KEY, "1");
    window.localStorage.removeItem(PROBE_KEY);
    return window.localStorage;
  } catch {
    console.warn("[createSafeStorage] localStorage is not available; progress will not persist");
    return createMemoryStorage();
  }
}
