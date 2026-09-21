import { TransformNode } from "@babylonjs/core";
import { BaseFsm, TransitionTable } from "../../abstract/base-fsm";

export type OnGroundCrouchedSubState = "CrouchIdle" | "CrouchWalking" | "CrouchWalkingBackwards";

export interface OnGroundCrouchedFsmDeps {
  isForwardHeld: () => boolean;
  isBackwardHeld: () => boolean;
  weaponRoot: TransformNode; // NUEVO
}

const WEAPON_OFFSETS = {
  crouchIdle: { x: -0.08, y: -0.06, z: 0 },
  crouchWalking: { x: -0.08, y: 0, z: 0 },
  crouchWalkingBackwards: { x: -0.08, y: 0, z: 0 },
} as const;

export class OnGroundCrouchedFsm extends BaseFsm<OnGroundCrouchedSubState> {
  protected transitions: TransitionTable<OnGroundCrouchedSubState>;

  constructor(private deps: OnGroundCrouchedFsmDeps) {
    super();
    this.state = "CrouchIdle";
    this.transitions = {
      CrouchIdle: {
        CrouchWalking: () => this.deps.isForwardHeld() && !this.deps.isBackwardHeld(),
        CrouchWalkingBackwards: () => this.deps.isBackwardHeld() && !this.deps.isForwardHeld(),
      },
      CrouchWalking: {
        CrouchIdle: () => !this.deps.isForwardHeld(),
        CrouchWalkingBackwards: () => this.deps.isBackwardHeld() && !this.deps.isForwardHeld(),
      },
      CrouchWalkingBackwards: {
        CrouchIdle: () => !this.deps.isBackwardHeld(),
        CrouchWalking: () => this.deps.isForwardHeld() && !this.deps.isBackwardHeld(),
      },
    };
  }

  /** Fuerza vuelta a CrouchIdle — llamado por OnGroundFsm cada vez que se re-entra a Crouch. */
  resetToIdle(): void {
    this.state = "CrouchIdle";
  }

  private _applyWeaponOffset(offset: { x: number; y: number; z: number }): void {
    this.deps.weaponRoot?.position.set(offset.x, offset.y, offset.z);
  }

  protected onEnter(_state: OnGroundCrouchedSubState): void { // CAMBIADO
    if (this.state === "CrouchIdle") {
      this._applyWeaponOffset(WEAPON_OFFSETS.crouchIdle);
    }
    if (this.state === "CrouchWalking") {
      this._applyWeaponOffset(WEAPON_OFFSETS.crouchWalking);
    }
    if (this.state === "CrouchWalkingBackwards") {
      this._applyWeaponOffset(WEAPON_OFFSETS.crouchWalkingBackwards);
    }
  }
  protected onExit(_state: OnGroundCrouchedSubState): void { }
  dispose(): void { }
}