import { BaseFsm, TransitionTable } from "../abstract/base-fsm";
import { StandAloneFsm, type StandAloneSubState } from "./character.fsm.stand-alone";
import { JetpackFsm, type JetpackSubState } from "./character.fsm.jetpack";
import { BoardFsm } from "./board-fsm/board.fsm";
import { OnGroundSubState } from "./character.fsm.stand-alone.on-ground";

export type CharacterMainState =
  | "StandAlone"
  | "EquippingJetpack"
  | "Jetpack"
  | "EquippingBoard"
  | "HoverBoard";

export interface CharacterFsmDeps {
  hasFuel: () => boolean;
  onEnterEquippingJetpack: () => void;
  onEnterStandAlone: () => void;
  isGroundDetected: () => boolean;
  onEnterOnAir: () => void;
  /** Threading hacia JetpackFsmDeps, mismo criterio que isGroundDetected/onEnterOnAir hacia StandAloneFsmDeps. */
  isCruiseHeld: () => boolean;
  /** Threading hacia OnGroundFsmDeps, mismo criterio que el resto. */
  isMoveHeld: () => boolean;
  isRunHeld: () => boolean;
  /** Se dispara al ENTRAR a EquippingBoard: por ahora, sólo console.log + auto-advance (ver character.base.ts). */
  onEnterEquippingBoard: () => void;

  // --------------------------------------------------------------
  // Threading hacia BoardFsmDeps. TEMPORAL: stubbeados en character.base.ts
  // hasta que se porte la física real del board (board.physics.controller.ts)
  // desde POC2. No representan comportamiento real todavía.
  // --------------------------------------------------------------
  groundLostElapsed: () => number;
  coyoteTime: number;
  onEnterHovering: () => void;
  onEnterFalling: () => void;
  isJumpSettled: () => boolean;
  onEnterJumping: () => void;
  getForwardSpeed: () => number;
  isForwardHeld: () => boolean;
  isPitchDownHeld: () => boolean;
  isBoostSettled: () => boolean;
  onEnterDiving: () => void;
  onEnterGliderBoost: () => void;
}

export class CharacterFsm extends BaseFsm<CharacterMainState> {
  protected transitions: TransitionTable<CharacterMainState>;

  readonly standAloneSubFsm: StandAloneFsm;
  readonly jetpackSubFsm: JetpackFsm;
  readonly boardSubFsm: BoardFsm;

  private unequipRequested = false;

  constructor(private deps: CharacterFsmDeps) {
    super();
    this.state = "StandAlone";

    this.standAloneSubFsm = new StandAloneFsm({
      isGroundDetected: this.deps.isGroundDetected,
      onEnterOnAir: this.deps.onEnterOnAir,
      isMoveHeld: this.deps.isMoveHeld,
      isRunHeld: this.deps.isRunHeld,
    });
    this.jetpackSubFsm = new JetpackFsm({
      isCruiseHeld: this.deps.isCruiseHeld,
    });
    this.boardSubFsm = new BoardFsm({
      isGroundDetected: this.deps.isGroundDetected,
      groundLostElapsed: this.deps.groundLostElapsed,
      coyoteTime: this.deps.coyoteTime,
      onEnterHovering: this.deps.onEnterHovering,
      onEnterFalling: this.deps.onEnterFalling,
      isJumpSettled: this.deps.isJumpSettled,
      onEnterJumping: this.deps.onEnterJumping,
      getForwardSpeed: this.deps.getForwardSpeed,
      isForwardHeld: this.deps.isForwardHeld,
      isPitchDownHeld: this.deps.isPitchDownHeld,
      isBoostSettled: this.deps.isBoostSettled,
      onEnterDiving: this.deps.onEnterDiving,
      onEnterGliderBoost: this.deps.onEnterGliderBoost,
    });

    this.transitions = {
      StandAlone: {
        EquippingJetpack: true,
        EquippingBoard: true,
      },
      EquippingJetpack: {
        Jetpack: true,
      },
      Jetpack: {
        StandAlone: () => !this.deps.hasFuel() || this.unequipRequested,
      },
      EquippingBoard: {
        HoverBoard: true, // vía notifyBoardReady(), manual — mismo patrón que notifyJetpackReady()
      },
      HoverBoard: {
        // placeholder: sin salida todavía, se define junto con el strategy real de hoverboard
      },
    };
  }

  public override tick(): void {
    super.tick();

    if (this.state === "StandAlone") {
      this.standAloneSubFsm.tick();
    } else if (this.state === "Jetpack") {
      this.jetpackSubFsm.tick();
    } else if (this.state === "HoverBoard") {
      this.boardSubFsm.tick();
    }
  }

  /**
   * Único punto de entrada para el input de "equipar" (Ctrl). Decide internamente si
   * corresponde equipar jetpack, board, o ninguno — el input controller no sabe nada
   * de esta lógica, sólo pide "equipment" en general.
   */
  requestEquipment(): void {
    if (this.state !== "StandAlone") return;

    if (this.standAloneSubFsm.getState() === "OnAir") {
      this.setState("EquippingJetpack");
      return;
    }

    if (
      this.standAloneSubFsm.getState() === "OnGround" &&
      this.standAloneSubFsm.onGroundSubFsm.getState() === "Running"
    ) {
      this.setState("EquippingBoard");
      return;
    }
    // ni OnAir ni OnGround+Running: no pasa nada
  }

  notifyJetpackReady(): void {
    if (this.state === "EquippingJetpack") {
      this.setState("Jetpack");
    }
  }

  /** Llamado al terminar la animación puente + crear el board + hacer el parenting. */
  notifyBoardReady(): void {
    if (this.state === "EquippingBoard") {
      this.setState("HoverBoard");
    }
  }

  requestUnequipJetpack(): void {
    if (this.state === "Jetpack") {
      this.unequipRequested = true;
    }
  }

getActiveSubState(): StandAloneSubState | OnGroundSubState | JetpackSubState | "Loading" {
  if (this.state === "StandAlone") return this.standAloneSubFsm.getActiveSubState();
  if (this.state === "Jetpack") return this.jetpackSubFsm.getState();
  return "Loading";
}
  protected onEnter(state: CharacterMainState): void {
    if (state === "EquippingJetpack") this.deps.onEnterEquippingJetpack();
    if (state === "EquippingBoard") this.deps.onEnterEquippingBoard();
    if (state === "StandAlone") {
      this.deps.onEnterStandAlone();
      this.unequipRequested = false;
    }
  }

  protected onExit(_state: CharacterMainState): void {}

  dispose(): void {
    this.standAloneSubFsm.dispose();
    this.jetpackSubFsm.dispose();
    this.boardSubFsm.dispose();
  }
}
