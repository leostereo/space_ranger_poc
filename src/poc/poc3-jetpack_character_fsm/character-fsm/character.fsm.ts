// src/poc3-jetpack_character_fsm/character-fsm/character.fsm.ts
import { BaseFsm, TransitionTable } from "../abstract/base-fsm";
import { JetpackFsm, JetpackSubState } from "./character.fsm.jetpack";
import { StandAloneFsm, type StandAloneSubState } from "./character.fsm.stand-alone";

export type CharacterMainState = "StandAlone" | "EquippingJetpack" | "Jetpack";

export interface CharacterFsmDeps {
  /** Vive en el padre, igual criterio que isGroundDetected/groundLostElapsed en BoardFsmDeps. */
  hasFuel: () => boolean;
  /** Dispara el build() async de la strategy de Jetpack en character.base.ts. */
  onEnterEquippingJetpack: () => void;
  /** Dispara el swap de vuelta a la strategy de StandAlone en character.base.ts. */
  onEnterStandAlone: () => void;
}

/**
 * Raíz: decide entre StandAlone / EquippingJetpack (puente) / Jetpack.
 * HoverSkate (poc2) se integra en poc4 como tercera rama de este mismo padre.
 */
export class CharacterFsm extends BaseFsm<CharacterMainState> {
  protected transitions: TransitionTable<CharacterMainState>;

  readonly standAloneSubFsm: StandAloneFsm;
  readonly jetpackSubFsm: JetpackFsm;

  constructor(private deps: CharacterFsmDeps) {
    super();
    this.state = "StandAlone"; // estado inicial: asignado directo, no vía setState

    this.standAloneSubFsm = new StandAloneFsm();
    this.jetpackSubFsm = new JetpackFsm();

    this.transitions = {
      StandAlone: {
        EquippingJetpack: true, // vía requestEquipJetpack()
      },
      EquippingJetpack: {
        // Estado puente: nunca se auto-dispara en tick() (mismo patrón que
        // JumpImpulseStart -> Jumping en poc2). Sólo sale vía notifyJetpackReady(),
        // llamado por character.base.ts cuando termina el build() async de la strategy.
        Jetpack: true,
      },
      Jetpack: {
        StandAlone: () => !this.deps.hasFuel(), // guard automático, mismo criterio que coyote time
      },
    };
  }

  public override tick(): void {
    super.tick();

    if (this.state === "StandAlone") {
      this.standAloneSubFsm.tick();
    } else if (this.state === "Jetpack") {
      this.jetpackSubFsm.tick();
    }
    // EquippingJetpack: sin sub-fsm activa todavía, sólo espera notifyJetpackReady().
  }

  /** Único punto de entrada de input: el input controller de la strategy activa llama esto, no setState(). */
  requestEquipJetpack(): void {
    if (this.state === "StandAlone") {
      this.setState("EquippingJetpack");
    }
  }

  /** Llamado por character.base.ts, no por ningún controller de input. */
  notifyJetpackReady(): void {
    if (this.state === "EquippingJetpack") {
      this.setState("Jetpack");
    }
  }

  /** Para el HUD: evita que tenga que conocer standAloneSubFsm/jetpackSubFsm por separado. */
  getActiveSubState(): StandAloneSubState | JetpackSubState | "Loading" {
    if (this.state === "StandAlone") return this.standAloneSubFsm.getState();
    if (this.state === "Jetpack") return this.jetpackSubFsm.getState();
    return "Loading";
  }

  protected onEnter(state: CharacterMainState): void {
    if (state === "EquippingJetpack") this.deps.onEnterEquippingJetpack();
    if (state === "StandAlone") this.deps.onEnterStandAlone();
  }

  protected onExit(_state: CharacterMainState): void {
    // sin side-effects por ahora
  }

  dispose(): void {
    this.standAloneSubFsm.dispose();
    this.jetpackSubFsm.dispose();
  }
}
