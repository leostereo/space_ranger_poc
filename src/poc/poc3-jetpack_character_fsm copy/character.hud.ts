// src/poc3-jetpack_character_fsm/character.hud.ts
import type { CharacterFsm } from "./character-fsm/character.fsm";

/**
 * HUD MÍNIMO: sólo "Estado > Sub-estado" vía onStateChange (suscripto a la fsm raíz y a
 * las dos sub-fsm), igual criterio que board.hud.ts. Telemetría (velocidad, combustible)
 * queda para cuando la física de Jetpack tenga algo real que mostrar — en ese momento se
 * agrega updateTelemetry(), empujado explícitamente una vez por frame desde
 * character.base.ts, mismo patrón que poc2 (no polling, no observable continuo).
 */
export class CharacterHud {
  private container: HTMLDivElement | null = null;
  private stateLine: HTMLDivElement | null = null;

  constructor(private fsm: CharacterFsm) { }

  mount(): void {
    this.container = document.createElement("div");
    this.container.id = "poc3-character-hud";
    Object.assign(this.container.style, {
      position: "fixed",
      top: "32px",
      right: "12px",
      padding: "6px 12px",
      background: "rgba(0, 0, 0, 0.6)",
      color: "#0ff",
      fontFamily: "monospace",
      fontSize: "14px",
      borderRadius: "4px",
      zIndex: "1000",
      pointerEvents: "none",
      textAlign: "right",
    });

    this.stateLine = document.createElement("div");
    this.container.appendChild(this.stateLine);
    document.body.appendChild(this.container);

    this.fsm.onStateChange(() => this._renderState());
    this.fsm.standAloneSubFsm.onStateChange(() => this._renderState());
    this.fsm.standAloneSubFsm.onGroundSubFsm.onStateChange(() => this._renderState()); // ← nuevo
    this.fsm.jetpackSubFsm.onStateChange(() => this._renderState());

    this._renderState();
  }

  private _renderState(): void {
    if (!this.stateLine) return;
    this.stateLine.textContent = `${this.fsm.getState()} > ${this.fsm.getActiveSubState()}`;
  }

  dispose(): void {
    this.container?.remove();
    this.container = null;
    this.stateLine = null;
  }
}
