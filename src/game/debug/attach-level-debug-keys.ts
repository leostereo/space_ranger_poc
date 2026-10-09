import type { HotkeyService } from "../core/input/hotkey-service";
import type { LevelSession } from "../levels/level-session";

/**
 * Teclas de depuración del nivel (solo DEV): 1 = completar, 2 = fallar.
 * Sirven para recorrer los estados 4 -> 6 / 7 mientras no hay gameplay real.
 * Devuelve la función para desconectarlas.
 */
export function attachLevelDebugKeys(hotkeys: HotkeyService, session: LevelSession): () => void {
  const unsubscribers = [
    hotkeys.onHotkey("Digit1", () => session.current?.strategy?.forceOutcome("completed")),
    hotkeys.onHotkey("Digit2", () => session.current?.strategy?.forceOutcome("failed")),
  ];
  console.info("[debug] keys: 1 = complete the level, 2 = fail the level, Esc/P = pause");
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}
