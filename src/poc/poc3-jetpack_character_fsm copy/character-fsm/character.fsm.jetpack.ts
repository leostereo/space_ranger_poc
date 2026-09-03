// src/poc3-jetpack_character_fsm/character-fsm/character.fsm.jetpack.ts
import { BaseFsm, TransitionTable } from "../abstract/base-fsm";

/**
 * B2 — Jetpack. Ahora con dos estados: `On` (hover + thrust + yaw puro) y `Cruising`
 * (Shift sostenido: drag forward + steering con roll/yaw derivado + pitch bidireccional).
 * `Idle`/`Thrusting`/`Floating` del diagrama original quedan pendientes — ver poc3.md.
 */
export type JetpackSubState = "On" | "Cruising";

export interface JetpackFsmDeps {
  isCruiseHeld: () => boolean;
}

export class JetpackFsm extends BaseFsm<JetpackSubState> {
  protected transitions: TransitionTable<JetpackSubState> = {
    On: {
      Cruising: () => this.deps.isCruiseHeld(),
    },
    Cruising: {
      On: () => !this.deps.isCruiseHeld(),
    },
  };

  constructor(private deps: JetpackFsmDeps) {
    super();
    this.state = "On";
  }

  protected onEnter(_state: JetpackSubState): void {}
  protected onExit(_state: JetpackSubState): void {}
  dispose(): void {}
}