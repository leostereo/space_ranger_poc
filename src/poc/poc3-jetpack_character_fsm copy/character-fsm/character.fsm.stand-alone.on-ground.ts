import { BaseFsm, TransitionTable } from "../abstract/base-fsm";

export type OnGroundSubState =
  | "Idle"
  | "Walking"
  | "Running"
  | "EquippingHoverBoardStart"
  | "LandingSoft"
  | "LandingRoll"
  | "LandingCrash";

export interface OnGroundFsmDeps {
  isMoveHeld: () => boolean;
  isRunHeld: () => boolean;
  /** m/s, negativo = cayendo. Leído sólo en notifyLanding(). */
  getVerticalSpeed: () => number;
  /** Magnitud XZ, m/s. Leído sólo en notifyLanding(). */
  getHorizontalSpeed: () => number;
  onEnterLandingRoll: () => void;
  onExitLandingRoll: () => void;
}

const LANDING_CRASH_VERTICAL_THRESHOLD = -10; // m/s
const LANDING_ROLL_RATIO_THRESHOLD = 3; // horizontal:vertical

export class OnGroundFsm extends BaseFsm<OnGroundSubState> {
  protected transitions: TransitionTable<OnGroundSubState>;

  constructor(private deps: OnGroundFsmDeps) {
    super();
    this.state = "Idle";

    this.transitions = {
      Idle: {
        Walking: () => this.deps.isMoveHeld(),
        LandingSoft: true,
        LandingRoll: true,
        LandingCrash: true,
      },
      Walking: {
        Idle: () => !this.deps.isMoveHeld(),
        Running: () => this.deps.isMoveHeld() && this.deps.isRunHeld(),
        LandingSoft: true,
        LandingRoll: true,
        LandingCrash: true,
      },
      Running: {
        Idle: () => !this.deps.isMoveHeld(),
        Walking: () => this.deps.isMoveHeld() && !this.deps.isRunHeld(),
        EquippingHoverBoardStart: true,
        LandingSoft: true,
        LandingRoll: true,
        LandingCrash: true,
      },
      // Bridge — nunca sale sola en tick(), sólo vía notifyEquipAnimationFrame(),
      // mismo patrón que JumpImpulseStart -> OnAir en StandAloneFsm.
      EquippingHoverBoardStart: {
        Idle: true, // destino irrelevante en la práctica: el sub-FSM entero se destruye
        // al hacer el swap de strategy a HoverBoard.
      },
      // Los 3 se fuerzan vía notifyLanding(), sin importar en cuál de
      // Idle/Walking/Running/EquippingHoverBoardStart haya quedado "congelado"
      // el sub-FSM mientras StandAloneFsm estaba en OnAir (onGroundSubFsm no
      // tickea durante OnAir, así que su .state queda frozen tal cual estaba).
      LandingSoft: {
        Idle: true, // vía notifyLandingAnimationComplete()
      },
      LandingRoll: {
        Idle: true,
      },
      LandingCrash: {
        Idle: true,
      },
    };
  }

  /** Único punto de entrada — sólo tiene efecto si estás en Running. */
  requestEquipHoverBoard(): void {
    if (this.state === "Running") {
      this.setState("EquippingHoverBoardStart");
    }
  }

  /** Llamado por el AnimationEvent del clip "jump_on_board" al llegar al frame clave. */
  notifyEquipAnimationFrame(): void {
    if (this.state === "EquippingHoverBoardStart") {
      this.setState("Idle");
    }
  }

  /**
   * Llamado por StandAloneFsm.onEnter() al entrar a OnGround viniendo de OnAir.
   * Decide a cuál de los 3 landing states forzar según la velocidad al tocar el suelo.
   */
notifyLanding(): void {
  // Evita reprocesar el landing si ya estamos en medio de uno — un rebote físico
  // puede volver a disparar OnAir->OnGround mientras la animación anterior todavía
  // está en curso, y sin este guard se reinicia el roll o se corrompe el estado.
  if (
    this.state === "LandingSoft" ||
    this.state === "LandingRoll" ||
    this.state === "LandingCrash"
  ) {
    return;
  }

  const verticalSpeed = this.deps.getVerticalSpeed();
  const horizontalSpeed = this.deps.getHorizontalSpeed();

  const isFastVerticalFall = verticalSpeed <= LANDING_CRASH_VERTICAL_THRESHOLD;
  const ratio = horizontalSpeed / Math.max(Math.abs(verticalSpeed), 0.001);
  const isFastHorizontal = ratio > LANDING_ROLL_RATIO_THRESHOLD;

  if (isFastVerticalFall) {
    this.setState("LandingCrash");
  } else if (isFastHorizontal) {
    this.deps.onEnterLandingRoll();
    this.setState("LandingRoll");
  } else {
    this.setState("LandingSoft");
  }
}

  /** Llamado por el AnimationEvent del clip de landing correspondiente, al llegar al frame final. */
  notifyLandingAnimationComplete(): void {
    if (this.state === "LandingRoll") {
      this.deps.onExitLandingRoll();
    }
    if (
      this.state === "LandingSoft" ||
      this.state === "LandingRoll" ||
      this.state === "LandingCrash"
    ) {
      this.setState("Idle");
    }
  }

  protected onEnter(_state: OnGroundSubState): void { }
  protected onExit(_state: OnGroundSubState): void { }
  dispose(): void { }
}