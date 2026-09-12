// src/poc3-jetpack_character_fsm/character-fsm/character.fsm.jetpack.ts
import { BaseFsm, TransitionTable } from "../abstract/base-fsm";

export type JetpackSubState = "On" | "Cruising" | "Shooting";

export interface JetpackFsmDeps {
  isCruiseHeld: () => boolean;
  isShootHeld: () => boolean;
  onEnterShooting: () => void; // NUEVO
  onExitShooting: () => void;  // NUEVO
}

export class JetpackFsm extends BaseFsm<JetpackSubState> {
  protected transitions: TransitionTable<JetpackSubState> = {
    On: {
      Cruising: () => this.deps.isCruiseHeld(),
      // Shift tiene prioridad: si está sostenido, ni siquiera se evalúa entrar a Shooting.
      Shooting: () => this.deps.isShootHeld() && !this.deps.isCruiseHeld(),
    },
    Cruising: {
      On: () => !this.deps.isCruiseHeld(),
      // Nota: no hay transición Cruising -> Shooting — mientras se cruisea, "/" se ignora.
    },
    Shooting: {
      On: () => !this.deps.isShootHeld() && !this.deps.isCruiseHeld(),
      // Si sueltan "/" pero agarran Shift en el mismo instante, salta directo a Cruising
      // en vez de pasar por On primero (evita un tick de latencia).
      Cruising: () => this.deps.isCruiseHeld(),
    },
  };

  constructor(private deps: JetpackFsmDeps) {
    super();
    this.state = "On";
  }

protected onEnter(state: JetpackSubState): void {
  if (state === "Shooting") this.deps.onEnterShooting();
}

protected onExit(state: JetpackSubState): void {
  if (state === "Shooting") this.deps.onExitShooting();
}
  dispose(): void {}
}