// src/poc2-floating_board_fsm/board.hud.ts
import type { BoardFsm } from "./board-fsm/board.fsm";

/**
 * HUD de debug: muestra "Estado > Sub-estado" actual, suscripto a onStateChange
 * de la FSM padre y de la sub-FSM activa — sin polling.
 */
export class BoardHud {
  private container: HTMLDivElement | null = null;

  constructor(private fsm: BoardFsm) {}

  mount(): void {
    this.container = document.createElement("div");
    this.container.id = "poc2-board-hud";
    Object.assign(this.container.style, {
      position: "fixed",
      top: "12px",
      right: "12px",
      padding: "6px 12px",
      background: "rgba(0, 0, 0, 0.6)",
      color: "#0f0",
      fontFamily: "monospace",
      fontSize: "14px",
      borderRadius: "4px",
      zIndex: "1000",
      pointerEvents: "none",
    });
    document.body.appendChild(this.container);

    this.fsm.onStateChange(() => this._render());
    this.fsm.hoveringSubFsm.onStateChange(() => this._render());
    this.fsm.fallingSubFsm.onStateChange(() => this._render());

    this._render(); // primer render inicial, antes del primer cambio de estado
  }

  private _render(): void {
    if (!this.container) return;
    this.container.textContent = `${this.fsm.getState()} > ${this.fsm.getActiveSubState()}`;
  }

  dispose(): void {
    this.container?.remove();
    this.container = null;
  }
}