// src/poc3-jetpack_character_fsm/character-fsm/character.fsm.ts
import { BaseFsm, TransitionTable } from "../abstract/base-fsm";
import { StandAloneFsm, type StandAloneSubState } from "./character.fsm.stand-alone";
import { JetpackFsm, type JetpackSubState } from "./character.fsm.jetpack";

export type CharacterMainState = "StandAlone" | "EquippingJetpack" | "Jetpack";

export interface CharacterFsmDeps {
  hasFuel: () => boolean;
  onEnterEquippingJetpack: () => void;
  onEnterStandAlone: () => void;
  isGroundDetected: () => boolean;
  onEnterOnAir: () => void;
  /** Threading hacia JetpackFsmDeps, mismo criterio que isGroundDetected/onEnterOnAir hacia StandAloneFsmDeps. */
  isCruiseHeld: () => boolean;
}

export class CharacterFsm extends BaseFsm<CharacterMainState> {
  protected transitions: TransitionTable<CharacterMainState>;

  readonly standAloneSubFsm: StandAloneFsm;
  readonly jetpackSubFsm: JetpackFsm;

  private unequipRequested = false;

  constructor(private deps: CharacterFsmDeps) {
    super();
    this.state = "StandAlone";

    this.standAloneSubFsm = new StandAloneFsm({
      isGroundDetected: this.deps.isGroundDetected,
      onEnterOnAir: this.deps.onEnterOnAir,
    });
    this.jetpackSubFsm = new JetpackFsm({
      isCruiseHeld: this.deps.isCruiseHeld,
    });

    this.transitions = {
      StandAlone: {
        EquippingJetpack: true,
      },
      EquippingJetpack: {
        Jetpack: true,
      },
      Jetpack: {
        StandAlone: () => !this.deps.hasFuel() || this.unequipRequested,
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
  }

  requestEquipJetpack(): void {
    if (this.state === "StandAlone" && this.standAloneSubFsm.getState() === "OnAir") {
      this.setState("EquippingJetpack");
    }
  }

  notifyJetpackReady(): void {
    if (this.state === "EquippingJetpack") {
      this.setState("Jetpack");
    }
  }

  requestUnequipJetpack(): void {
    if (this.state === "Jetpack") {
      this.unequipRequested = true;
    }
  }

  getActiveSubState(): StandAloneSubState | JetpackSubState | "Loading" {
    if (this.state === "StandAlone") return this.standAloneSubFsm.getState();
    if (this.state === "Jetpack") return this.jetpackSubFsm.getState();
    return "Loading";
  }

  protected onEnter(state: CharacterMainState): void {
    if (state === "EquippingJetpack") this.deps.onEnterEquippingJetpack();
    if (state === "StandAlone") {
      this.deps.onEnterStandAlone();
      this.unequipRequested = false;
    }
  }

  protected onExit(_state: CharacterMainState): void {}

  dispose(): void {
    this.standAloneSubFsm.dispose();
    this.jetpackSubFsm.dispose();
  }
}