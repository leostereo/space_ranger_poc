import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { Tools } from "@babylonjs/core/Misc/tools";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { Nullable } from "@babylonjs/core/types";

import { CharacterInput } from "../../character.input";
import { CharacterFsm } from "../../character-fsm/character.fsm";
import { CombatRules } from "../../utils/combat-rules";

// ── Ajuste del apuntado vertical (pitch positivo = apunta hacia ARRIBA) ──
const AIM_MAX_PITCH = Tools.ToRadians(35); // límite que soporta el hueso
const AIM_PITCH_RATE = Tools.ToRadians(60); // rad/s a plena rampa
const AIM_PITCH_MIN_FACTOR = 0.2; // un toque corto arranca al 20% de esa velocidad
const AIM_PITCH_RAMP_SECONDS = 0.4; // tiempo sosteniendo W/S hasta la velocidad máxima

// Calibración (probar en el juego; si algo queda invertido, cambiar el signo o el eje):
const AIM_WEAPON_SIGN = -1; // rotation.x positivo mira hacia abajo en Babylon; con 1, pitch positivo sube el arma
const AIM_BONE_AXIS = Vector3.Right(); // eje LOCAL del hueso que levanta/baja el brazo (probar X, Y o Z)
const AIM_BONE_SIGN = 1;
const AIM_BONE_FACTOR = 1; // fracción del pitch que se le aplica al hueso

// Corrimiento del arma en X (eje lateral local de la cápsula) por radián de inclinación, con signo.
// Separado para arriba y abajo: se aplica sobre la posición base que ponen las FSM y crece con |pitch|.
const AIM_WEAPON_OFFSET_X_UP = 0.1;
const AIM_WEAPON_OFFSET_X_DOWN = 0.14;  //esta invertido
// Lo mismo en Z (avance local): al apuntar hacia abajo el arma necesita adelantarse o retrasarse un poco.
const AIM_WEAPON_OFFSET_Z_UP = 0.1;
const AIM_WEAPON_OFFSET_Z_DOWN = 0.05;  //esta invertido
const OFFSET_EPSILON = 1e-6;

type AimMode = "none" | "move" | "pitch";

/**
 * Busca el hueso entre los nodos que ANIMA un clip de ESTA instancia del personaje (los targets del
 * AnimationGroup clonado). Es el nodo exacto que mueve el clip, sin depender de la jerarquía ni de
 * si el nombre lleva prefijo, y sin riesgo de agarrar el de otra instancia con el mismo nombre.
 */
export function findAnimatedBone(group: AnimationGroup | undefined, nameSuffix: string): TransformNode | null {
    const targeted = group?.targetedAnimations.find((t) => (t.target as { name?: string } | null)?.name?.endsWith(nameSuffix));
    return (targeted?.target as TransformNode | undefined) ?? null;
}

export interface AimControllerDeps {
    scene: Scene;
    input: CharacterInput;
    fsm: CharacterFsm;
    combat: CombatRules;
    /** Padre del muzzle: al rotarlo, el arma y la dirección del proyectil giran juntos. */
    weaponRoot: TransformNode;
    muzzle: TransformNode;
    /** Hueso del modelo que se rota sobre el clip de apuntado (null = solo se inclina el arma). */
    // bone: TransformNode | null;
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
export class StandAloneAimController {
    private _pitch = 0;
    private _mode: AimMode = "none";
    private _heldSeconds = 0;
    private _lastDirection = 0;
    private _weaponTouched = false;
    private _appliedOffsetX = 0; // corrimiento en X que este controller tiene sumado al arma
    private _lastWrittenX = 0; // X que dejó escrito: si cambia por afuera, lo reescribió una FSM
    private _appliedOffsetZ = 0;
    private _lastWrittenZ = 0;
    private _afterAnimations: Nullable<Observer<Scene>>;
    private bone : TransformNode | null = null;

    constructor(private deps: AimControllerDeps) {

        this.bone = this.deps.scene.getTransformNodeByName("mixamorig:Spine");

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
            if (state.left || state.right) {
                // Strafe: no se puede inclinar y desplazarse a la vez. El ángulo vuelve a 0 y W/S no lo mueven.
                this._pitch = 0;
                this._heldSeconds = 0;
                this._lastDirection = 0;
            } else {
                this._updatePitch(state.forward, state.backward, dt);
            }
            state.forward = false;
            state.backward = false;
        }
        this._applyWeapon();
    }

    private _updatePitch(forward: boolean, backward: boolean, dt: number): void {

        const direction = (forward ? 1 : 0) - (backward ? 1 : 0); // W = abajo, S = arriba
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
        this._applyWeaponOffset();
        this._weaponTouched = true;
        // El disparo de este frame lee el world matrix del muzzle: que no esté desactualizado.
        weaponRoot.computeWorldMatrix(true);
        muzzle.computeWorldMatrix(true);
    }

    /**
     * Suma al X del arma un corrimiento proporcional a la inclinación, sin pisar la posición base:
     * las FSM escriben position.x absoluto al cambiar de estado, y ahí lo nuestro desaparece (se detecta
     * comparando con lo último que escribimos).
     */
    private _applyWeaponOffset(): void {
        const root = this.deps.weaponRoot;
        // Cada eje se revisa por separado contra lo último que escribimos.
        if (this._appliedOffsetX !== 0 && Math.abs(root.position.x - this._lastWrittenX) > OFFSET_EPSILON) {
            this._appliedOffsetX = 0;
        }
        if (this._appliedOffsetZ !== 0 && Math.abs(root.position.z - this._lastWrittenZ) > OFFSET_EPSILON) {
            this._appliedOffsetZ = 0;
        }
        const baseX = root.position.x - this._appliedOffsetX;
        const baseZ = root.position.z - this._appliedOffsetZ;

        const up = this._pitch >= 0;
        const magnitude = Math.abs(this._pitch);
        this._appliedOffsetX = (up ? AIM_WEAPON_OFFSET_X_UP : AIM_WEAPON_OFFSET_X_DOWN) * magnitude;
        this._appliedOffsetZ = (up ? AIM_WEAPON_OFFSET_Z_UP : AIM_WEAPON_OFFSET_Z_DOWN) * magnitude;

        root.position.x = baseX + this._appliedOffsetX;
        root.position.z = baseZ + this._appliedOffsetZ;
        this._lastWrittenX = root.position.x;
        this._lastWrittenZ = root.position.z;
    }

    private _applyBone(): void {
        // const { bone } = this.deps;
        if (!this.bone || this._pitch === 0 || !this.bone.rotationQuaternion || !this.deps.isAimClipPlaying()) return;

        const extra = Quaternion.RotationAxis(AIM_BONE_AXIS, AIM_BONE_SIGN * AIM_BONE_FACTOR * this._pitch);
        this.bone.rotationQuaternion = this.bone.rotationQuaternion.multiply(extra);
    }

    private _reset(): void {
        if (this._weaponTouched) {
            const root = this.deps.weaponRoot;
            root.rotation.x = 0;
            if (this._appliedOffsetX !== 0 && Math.abs(root.position.x - this._lastWrittenX) <= OFFSET_EPSILON) {
                root.position.x -= this._appliedOffsetX;
            }
            if (this._appliedOffsetZ !== 0 && Math.abs(root.position.z - this._lastWrittenZ) <= OFFSET_EPSILON) {
                root.position.z -= this._appliedOffsetZ;
            }
            this._appliedOffsetX = 0;
            this._appliedOffsetZ = 0;
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