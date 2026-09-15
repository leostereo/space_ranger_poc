import { TransformNode } from "@babylonjs/core";
import { BaseFsm, TransitionTable } from "../abstract/base-fsm";

export type OnGroundSubState =
  | "Idle"
  | "Walking"
  | "WalkingBackwards"
  | "Running"
  | "ShootingStrafeLeft"
  | "ShootingStrafeRight"
  | "EquippingHoverBoardStart"
  | "LandingSoft"
  | "LandingRoll"
  | "LandingCrash";

export interface OnGroundFsmDeps {
  isForwardHeld: () => boolean;
  isBackwardHeld: () => boolean;
  isRunHeld: () => boolean;
  isLeftHeld: () => boolean;   // NUEVO
  isRightHeld: () => boolean;  // NUEVO
  isAimingHeld: () => boolean; // NUEVO — mismo booleano que ya controla el arma/disparo
  /** m/s, negativo = cayendo. Leído sólo en notifyLanding(). */
  getVerticalSpeed: () => number;
  /** Magnitud XZ, m/s. Leído sólo en notifyLanding(). */
  getHorizontalSpeed: () => number;
  onEnterLandingRoll: () => void;
  onExitLandingRoll: () => void;
  weaponRoot: TransformNode;
}

const LANDING_CRASH_VERTICAL_THRESHOLD = -10; // m/s
const LANDING_ROLL_RATIO_THRESHOLD = 3; // horizontal:vertical
const WEAPON_OFFSETS = {
  standAlone: { x: -0.08, y: 0.2, z: 0 },
  strafe_right: { x: -0.08, y: 0.08, z: 0.2 },
  strafe_left: { x: -0.12, y: 0.08, z: 0.2 },
} as const;

export class OnGroundFsm extends BaseFsm<OnGroundSubState> {
  protected transitions: TransitionTable<OnGroundSubState>;
  // private weaponRoot:TransformNode;

  constructor(private deps: OnGroundFsmDeps) {
    super();
    this.state = "Idle";

    this.transitions = {
      Idle: {
        Walking: () => this.deps.isForwardHeld() && !this.deps.isBackwardHeld(),
        WalkingBackwards: () => this.deps.isBackwardHeld() && !this.deps.isForwardHeld(),
        // NUEVO — sólo puede entrar desde Idle: _canStrafe() ya exige !forward && !backward.
        ShootingStrafeLeft: () => this._canStrafe() && this.deps.isLeftHeld() && !this.deps.isRightHeld(),
        ShootingStrafeRight: () => this._canStrafe() && this.deps.isRightHeld() && !this.deps.isLeftHeld(),
        LandingSoft: true,
        LandingRoll: true,
        LandingCrash: true,
      },
      Walking: {
        Idle: () => !this.deps.isForwardHeld(),
        Running: () => this.deps.isForwardHeld() && this.deps.isRunHeld(),
        WalkingBackwards: () => this.deps.isBackwardHeld() && !this.deps.isForwardHeld(),
        LandingSoft: true,
        LandingRoll: true,
        LandingCrash: true,
      },
      WalkingBackwards: {
        Idle: () => !this.deps.isBackwardHeld(),
        Walking: () => this.deps.isForwardHeld() && !this.deps.isBackwardHeld(),
        LandingSoft: true,
        LandingRoll: true,
        LandingCrash: true,
      },
      Running: {
        Idle: () => !this.deps.isForwardHeld(),
        Walking: () => this.deps.isForwardHeld() && !this.deps.isRunHeld(),
        WalkingBackwards: () => this.deps.isBackwardHeld() && !this.deps.isForwardHeld(),
        EquippingHoverBoardStart: true,
        LandingSoft: true,
        LandingRoll: true,
        LandingCrash: true,
      },
      EquippingHoverBoardStart: {
        Idle: true,
      },
      LandingSoft: { Idle: true },
      LandingRoll: { Idle: true },
      LandingCrash: { Idle: true },

      ShootingStrafeLeft: {
        Idle: () => !this.deps.isAimingHeld() || !this.deps.isLeftHeld() || this.deps.isForwardHeld() || this.deps.isBackwardHeld(),
        ShootingStrafeRight: () => this._canStrafe() && this.deps.isRightHeld() && !this.deps.isLeftHeld(),
        LandingSoft: true,
        LandingRoll: true,
        LandingCrash: true,
      },
      ShootingStrafeRight: {
        Idle: () => !this.deps.isAimingHeld() || !this.deps.isRightHeld() || this.deps.isForwardHeld() || this.deps.isBackwardHeld(),
        ShootingStrafeLeft: () => this._canStrafe() && this.deps.isLeftHeld() && !this.deps.isRightHeld(),
        LandingSoft: true,
        LandingRoll: true,
        LandingCrash: true,
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
    console.log(verticalSpeed)
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

  private _canStrafe(): boolean {
    return this.deps.isAimingHeld() && !this.deps.isForwardHeld() && !this.deps.isBackwardHeld();
  }

  private _applyWeaponOffset(offset: { x: number; y: number; z: number }): void {
    this.deps.weaponRoot?.position.set(offset.x, offset.y, offset.z);
  }
  protected onEnter(_state: OnGroundSubState): void {
    this._applyWeaponOffset(WEAPON_OFFSETS.standAlone)
    if (this.state === 'ShootingStrafeLeft') {
      console.log('enter left')
      this._applyWeaponOffset(WEAPON_OFFSETS.strafe_left)
    }
    if (this.state === 'ShootingStrafeRight') {
      this._applyWeaponOffset(WEAPON_OFFSETS.strafe_right)
    }
  }
  protected onExit(_state: OnGroundSubState): void {}
  dispose(): void { }
}