import { DebugHud } from "./debug-hud";
import type { TypedEventEmitter } from "../core/events/typed-event-emitter";
import type { GameFsmEventMap } from "../fsm/game-fsm-events";

const formatTime = (at: number): string => `[${(at / 1000).toFixed(2)}s]`;

/** Conecta los eventos de la GameFsm con el DebugHud. Devuelve la función para desconectar. */
export function attachGameDebugHud(events: TypedEventEmitter<GameFsmEventMap>): () => void {
  const hud = new DebugHud();
  hud.setValue("fsm.state", "-");
  hud.setValue("fsm.target", "-");

  const unsubscribers = [
    events.on("transitionStarted", ({ from, to, at }) => {
      hud.setValue("fsm.target", to);
      hud.log(`${formatTime(at)} start  ${from ?? "(none)"} -> ${to}`);
    }),
    events.on("stateExited", ({ id, at }) => {
      hud.setValue("fsm.state", "-");
      hud.log(`${formatTime(at)} exit   ${id}`);
    }),
    events.on("stateEntered", ({ id, enterDurationMs, at }) => {
      hud.setValue("fsm.state", id);
      hud.log(`${formatTime(at)} enter  ${id} (${enterDurationMs.toFixed(0)} ms)`);
    }),
    events.on("transitionCancelled", ({ to, reason, at }) => {
      hud.log(`${formatTime(at)} cancel ${to} (${reason})`);
    }),
    events.on("transitionFailed", ({ to, error, at }) => {
      hud.log(`${formatTime(at)} FAIL   ${to}: ${String(error)}`);
    }),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    hud.dispose();
  };
}
