// src/poc2-floating_board_fsm/board.hud.ts
import type { BoardFsm } from "./board-fsm/board.fsm";

/**
 * HUD de debug: "Estado > Sub-estado" (suscripto a onStateChange, sólo en transiciones)
 * + una línea de telemetría (velocidad/aceleración vertical) que se actualiza cada frame,
 * ya que esos valores cambian constantemente y no sólo en cambios de estado.
 */
export class BoardHud {
  private container: HTMLDivElement | null = null;
  private stateLine: HTMLDivElement | null = null;
  private telemetryLine: HTMLDivElement | null = null;

  constructor(private fsm: BoardFsm) {}

  mount(): void {
    this.container = document.createElement("div");
    this.container.id = "poc2-board-hud";
    Object.assign(this.container.style, {
      position: "fixed",
      top: "32px",
      right: "12px",
      padding: "6px 12px",
      background: "rgba(0, 0, 0, 0.6)",
      color: "#0f0",
      fontFamily: "monospace",
      fontSize: "14px",
      borderRadius: "4px",
      zIndex: "1000",
      pointerEvents: "none",
      textAlign: "right",
    });

    this.stateLine = document.createElement("div");

    this.telemetryLine = document.createElement("div");
    Object.assign(this.telemetryLine.style, {
      fontSize: "12px",
      color: "#0c0",
      marginTop: "2px",
    });

    this.container.appendChild(this.stateLine);
    this.container.appendChild(this.telemetryLine);
    document.body.appendChild(this.container);

    this.fsm.onStateChange(() => this._renderState());
    this.fsm.hoveringSubFsm.onStateChange(() => this._renderState());
    this.fsm.fallingSubFsm.onStateChange(() => this._renderState());

    this._renderState(); // primer render inicial, antes del primer cambio de estado
    this.updateTelemetry(0, 0, 0);
  }

  /** Llamar una vez por frame — a diferencia del estado, esto no espera a un cambio. */
  updateTelemetry(
    verticalVelocity: number,
    verticalAcceleration: number,
    forwardSpeed: number // ✨ Agregamos el tercer parámetro aquí
  ): void {
    if (!this.telemetryLine) return;

   // Formateamos los números para que queden alineados y legibles en el HUD
   const vY = verticalVelocity.toFixed(2);
   const aY = verticalAcceleration.toFixed(2);
   const fSpeed = forwardSpeed.toFixed(2);

   // Pintamos la telemetría completa incluyendo el avance (fSpeed)
   this.telemetryLine.textContent = `fSpeed: ${fSpeed} m/s  |  vY: ${vY} m/s  |  aY: ${aY} m/s²`;
  }

  private _renderState(): void {
    if (!this.stateLine) return;
    this.stateLine.textContent = `${this.fsm.getState()} > ${this.fsm.getActiveSubState()}`;
  }

  dispose(): void {
    this.container?.remove();
    this.container = null;
    this.stateLine = null;
    this.telemetryLine = null;
  }
}