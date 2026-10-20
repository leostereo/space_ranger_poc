import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { Tools } from "@babylonjs/core/Misc/tools";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { Nullable } from "@babylonjs/core/types";

import type { CharacterFsm } from "../character-fsm/character.fsm";
import type { CharacterInput } from "../character.input";
import type { CombatRules } from "./combat-rules";

// ── Ajuste del apuntado vertical (pitch positivo = apunta hacia ARRIBA) ──
const AIM_MAX_PITCH = Tools.ToRadians(40); // límite que soporta el hueso
const AIM_PITCH_RATE = Tools.ToRadians(60); // rad/s a plena rampa
const AIM_PITCH_MIN_FACTOR = 0.2; // un toque corto arranca al 20% de esa velocidad
const AIM_PITCH_RAMP_SECONDS = 0.4; // tiempo sosteniendo W/S hasta la velocidad máxima

// Calibración (probar en el juego; si algo queda invertido, cambiar el signo o el eje):
const AIM_WEAPON_SIGN = 1; // rotation.x positivo mira hacia abajo en Babylon; con 1, pitch positivo sube el arma
const AIM_BONE_AXIS = Vector3.Right(); // eje LOCAL del hueso que levanta/baja el brazo (probar X, Y o Z)
const AIM_BONE_SIGN = 1;
const AIM_BONE_FACTOR = 1; // fracción del pitch que se le aplica al hueso

type AimMode = "none" | "move" | "pitch";

export interface AimControllerDeps {
  scene: Scene;
  input: CharacterInput;
  fsm: CharacterFsm;
  combat: CombatRules;
  /** Padre del muzzle: al rotarlo, el arma y la dirección del proyectil giran juntos. */
  weaponRoot: TransformNode;
  muzzle: TransformNode;
  /** Hueso del modelo que se rota sobre el clip de apuntado (null = solo se inclina el arma). */
  bone: TransformNode | null;
  /** true mientras suena un clip de apuntado sobre el que corresponde rotar el hueso. */
  isAimClipPlaying: () => boolean;
}

/**
 * Apuntado vertical en StandAlone. Dueño único del ángulo: el hueso, el arma y el proyectil leen de acá.
 *
 * Regla de orden (se decide al empezar a apuntar):
 *  - W/S ya apretadas -> modo "move": el personaje se mueve disparando en línea recta (ángulo 0).
 *    Cuando se sueltan W y S, el modo pasa a "pitch".
 *  - Sin W/S -> modo "pitch": W inclina hacia abajo y S hacia arriba (palanca de avión); el personaje no se desplaza.
 * Al dejar de apuntar el ángulo vuelve a 0 de golpe (el arma se oculta y el clip cambia en ese mismo frame).
 *
 * En modo "pitch" pone forward/backward en false sobre `input.current` (se rehace cada frame desde el hub),
 * así la FSM y la física no ven W/S y no caminan. Por eso `update()` tiene que correr después de
 * `input.update()` y antes de las strategies.
 */
export class AimController {
  private _pitch = 0;
  private _mode: AimMode = "none";
  private _heldSeconds = 0;
  private _lastDirection = 0;
  private _weaponTouched = false;
  private _afterAnimations: Nullable<Observer<Scene>>;

  constructor(private deps: AimControllerDeps) {
    if (!deps.muzzle.isDescendantOf(deps.weaponRoot)) {
      console.warn("AimController: el muzzle no cuelga de weaponRoot; el proyectil no seguirá la inclinación del arma.");
    }
    // El hueso se pisa DESPUÉS de evaluar las animaciones, o el clip lo sobreescribe en cada frame.
    this._afterAnimations = deps.scene.onAfterAnimationsObservable.add(() => this._applyBone());
  }

  /** Ángulo actual en radianes (positivo = arriba). */
  get pitch(): number {
    return this._pitch;
  }

  update(dt: number): void {
    const { input, fsm, combat } = this.deps;
    const state = input.current;
    const aiming = fsm.getState() === "StandAlone" && combat.isAiming();

    if (!aiming) {
      this._reset();
      return;
    }

    if (this._mode === "none") {
      this._mode = state.forward || state.backward ? "move" : "pitch";
    } else if (this._mode === "move" && !state.forward && !state.backward) {
      this._mode = "pitch";
    }

    if (this._mode === "pitch") {
      this._updatePitch(state.forward, state.backward, dt);
      state.forward = false;
      state.backward = false;
    }
    this._applyWeapon();
  }

  private _updatePitch(forward: boolean, backward: boolean, dt: number): void {
    const direction = (backward ? 1 : 0) - (forward ? 1 : 0); // S = arriba, W = abajo
    if (direction === 0 || direction !== this._lastDirection) {
      this._heldSeconds = 0;
    }
    this._lastDirection = direction;

    if (direction !== 0) {
      this._heldSeconds += dt;
      const ramp = Math.min(this._heldSeconds / AIM_PITCH_RAMP_SECONDS, 1);
      const rate = Scalar.Lerp(AIM_PITCH_RATE * AIM_PITCH_MIN_FACTOR, AIM_PITCH_RATE, ramp);
      this._pitch = Scalar.Clamp(this._pitch + direction * rate * dt, -AIM_MAX_PITCH, AIM_MAX_PITCH);
    }
  }

  /** Inclina el arma; el muzzle es hijo, así que el forward del proyectil sale ya inclinado. */
  private _applyWeapon(): void {
    const { weaponRoot, muzzle } = this.deps;
    weaponRoot.rotation.x = -this._pitch * AIM_WEAPON_SIGN;
    this._weaponTouched = true;
    // El disparo de este frame lee el world matrix del muzzle: que no esté desactualizado.
    weaponRoot.computeWorldMatrix(true);
    muzzle.computeWorldMatrix(true);
  }

  private _applyBone(): void {
    const { bone } = this.deps;
    if (!bone || this._pitch === 0 || !bone.rotationQuaternion || !this.deps.isAimClipPlaying()) return;

    const extra = Quaternion.RotationAxis(AIM_BONE_AXIS, AIM_BONE_SIGN * AIM_BONE_FACTOR * this._pitch);
    bone.rotationQuaternion = bone.rotationQuaternion.multiply(extra);
  }

  private _reset(): void {
    if (this._weaponTouched) {
      this.deps.weaponRoot.rotation.x = 0;
      this._weaponTouched = false;
    }
    this._mode = "none";
    this._pitch = 0;
    this._heldSeconds = 0;
    this._lastDirection = 0;
  }

  dispose(): void {
    this.deps.scene.onAfterAnimationsObservable.remove(this._afterAnimations);
    this._afterAnimations = null;
    this._reset();
  }
}