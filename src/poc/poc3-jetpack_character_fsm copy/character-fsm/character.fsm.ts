import { BaseFsm, TransitionTable } from "../abstract/base-fsm";
import { StandAloneFsm, type StandAloneSubState } from "./character.fsm.stand-alone";
import { JetpackFsm, type JetpackSubState } from "./character.fsm.jetpack";
import { BoardFsm } from "./board-fsm/board.fsm";
import { OnGroundSubState } from "./character.fsm.stand-alone.on-ground";
import type { HoveringSubState } from "./board-fsm/board.fsm.hovering";
import type { FallingSubState } from "./board-fsm/board.fsm.falling";

export type CharacterMainState =
  | "StandAlone"
  | "EquippingJetpack"
  | "Jetpack"
  | "HoverBoard";

export interface CharacterFsmDeps {
  hasFuel: () => boolean;
  onEnterEquippingJetpack: () => void;
  onEnterStandAlone: () => void;
  isGroundDetected: () => boolean;
  isBoardGroundDetected: () => boolean; // ← nuevo, raycast propio del board
  onEnterOnAir: () => void;
  /** Threading hacia JetpackFsmDeps, mismo criterio que isGroundDetected/onEnterOnAir hacia StandAloneFsmDeps. */
  isCruiseHeld: () => boolean;
  /** Threading hacia OnGroundFsmDeps, mismo criterio que el resto. */
  isMoveHeld: () => boolean;
  isRunHeld: () => boolean;
  /** Se dispara al ENTRAR a EquippingBoard: por ahora, sólo console.log + auto-advance (ver character.base.ts). */
  onEnterHoverBoard: () => void;

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
      isGroundDetected: this.deps.isBoardGroundDetected,
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
        HoverBoard: true, // vía notifyBoardReady(), manual — mismo patrón que Jetpack
      },
      EquippingJetpack: {
        Jetpack: true,
      },
      Jetpack: {
        StandAlone: () => !this.deps.hasFuel() || this.unequipRequested,
      },
      HoverBoard: {
        StandAlone: true, // vía requestUnequipBoard(), manual — mismo criterio que requestUnequipJetpack
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

    // antes saltaba directo a "EquippingBoard"; ahora delega al bridge del sub-FSM,
    // que recién dispara el swap real cuando termina la animación.
    this.standAloneSubFsm.onGroundSubFsm.requestEquipHoverBoard();
  }

  /** Llamado por el AnimationEvent del clip de equip al llegar al frame clave — dispara el swap real. */
  notifyBoardReady(): void {
    if (this.state === "StandAlone") {
      this.setState("HoverBoard");
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

  requestUnequipBoard(): void {
    if (this.state === "HoverBoard") {
      this.setState("StandAlone");
    }
  }

  getActiveSubState(): StandAloneSubState | OnGroundSubState | JetpackSubState | HoveringSubState | FallingSubState | "Loading" {
    if (this.state === "StandAlone") return this.standAloneSubFsm.getActiveSubState();
    if (this.state === "Jetpack") return this.jetpackSubFsm.getState();
    if (this.state === "HoverBoard") return this.boardSubFsm.getActiveSubState();
    return "Loading";
  }

  /** Ruta completa de estados para debug/HUD — ej. ["StandAlone","OnGround","Running"],
   * ["HoverBoard","Falling","Dropping"], ["Jetpack","Cruising"]. */
  getStatePath(): string[] {
    if (this.state === "StandAlone") {
      const mid = this.standAloneSubFsm.getState(); // "OnGround" | "JumpImpulseStart" | "OnAir"
      if (mid === "OnGround") {
        return [this.state, mid, this.standAloneSubFsm.onGroundSubFsm.getState()];
      }
      return [this.state, mid];
    }

    if (this.state === "Jetpack") {
      return [this.state, this.jetpackSubFsm.getState()];
    }

    if (this.state === "HoverBoard") {
      const mid = this.boardSubFsm.getState(); // "Hovering" | "Falling"
      return [this.state, mid, this.boardSubFsm.getActiveSubState()];
    }

    return [this.state]; // EquippingJetpack u otro estado sin hijos
  }

  protected onEnter(state: CharacterMainState): void {
    if (state === "EquippingJetpack") this.deps.onEnterEquippingJetpack();
    if (state === "HoverBoard") this.deps.onEnterHoverBoard(); // ← reemplaza onEnterEquippingBoard
    if (state === "StandAlone") {
      this.deps.onEnterStandAlone();
      this.unequipRequested = false;
    }
  }

  protected onExit(_state: CharacterMainState): void { }

  dispose(): void {
    this.standAloneSubFsm.dispose();
    this.jetpackSubFsm.dispose();
    this.boardSubFsm.dispose();
  }
}
