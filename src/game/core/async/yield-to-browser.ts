/** Si requestAnimationFrame no corre (pestaña oculta) se continúa igual pasado este tiempo. */
const FALLBACK_TIMEOUT_MS = 50;

/**
 * Cede el hilo al navegador para que pueda pintar (ej: actualizar una barra de progreso)
 * entre dos tareas pesadas y síncronas.
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    const hasAnimationFrames = typeof requestAnimationFrame === "function";
    if (hasAnimationFrames) {
      requestAnimationFrame(() => setTimeout(finish, 0));
    }
    setTimeout(finish, hasAnimationFrames ? FALLBACK_TIMEOUT_MS : 0);
  });
}
