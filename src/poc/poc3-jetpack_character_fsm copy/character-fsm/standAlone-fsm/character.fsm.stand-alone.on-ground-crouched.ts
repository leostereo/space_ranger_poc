import { TransformNode } from "@babylonjs/core";
import { BaseFsm, TransitionTable } from "../../abstract/base-fsm";
import { SHIELD_OFFSETS, WEAPON_OFFSETS } from "../../character.base";

export type OnGroundCrouchedSubState = "CrouchIdle" | "CrouchWalking" | "CrouchWalkingBackwards";

export interface OnGroundCrouchedFsmDeps {
  isForwardHeld: () => boolean;
  isBackwardHeld: () => boolean;
  weaponRoot: TransformNode;
  shieldRoot: TransformNode; // NUEVO
}

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
    this._applyWeaponOffset(WEAPON_OFFSETS.crouchIdle);
    this._applyShieldOffset(SHIELD_OFFSETS.crouchIdle);
  }

  private _applyWeaponOffset(offset: { x: number; y: number; z: number }): void {
    this.deps.weaponRoot?.position.set(offset.x, offset.y, offset.z);
  }

  private _applyShieldOffset(offset: { x: number; y: number; z: number }): void {
    this.deps.shieldRoot?.position.set(offset.x, offset.y, offset.z);
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
    if (this.state === "CrouchIdle") {
      this._applyShieldOffset(SHIELD_OFFSETS.crouchIdle); // NUEVO — al volver de CrouchWalking*
    }
  }
  protected onExit(_state: OnGroundCrouchedSubState): void { }
  dispose(): void { }
}