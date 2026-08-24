// src/poc3-jetpack_character_fsm/strategies/jetpack/jetpack.physics.controller.ts
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { IPhysicsController } from "../contracts/iphysics-controller";
import type { CharacterInputState } from "../../character.input";

// TODO: mover a config.general.ts junto con el resto (ver TODO en utils.ts)
const CHARACTER_MASS = 70; // mismo valor que TMP_CONFIG.characterMass en utils.ts — duplicado a propósito, cada physics controller trae su propia config local (mismo criterio ya usado en stand-alone.physics.controller.ts)
const GRAVITY = 9.81;
const MAX_FUEL = 5; // segundos de empuje continuo (climb)
const FUEL_DRAIN_RATE = 1; // unidades de combustible por segundo de empuje

// Spring-damper del hover — mismo patrón que generalConfig.hover en poc2
// (_applyHoverForce), pero el "target height" acá es un Y absoluto en el mundo, no una
// distancia al suelo por raycast (no aplica para vuelo libre).
const HOVER_SPRING_STRENGTH = 20;
const HOVER_DAMPING = 8;
const HOVER_MAX_FORCE_FACTOR = 8; // mismo criterio de clamp que poc2 (mass * gravity * factor)
const THRUST_FORCE = 1400; // Newtons, aplicado ADEMÁS del hover mientras se sostiene Space (~5.7 m/s² extra con esta masa)

// Bob — mismo bobAmplitude/bobFrequency que generalConfig.hover en poc2. Sin esto el hover
// queda rígido, clavado en un punto; el seno le da la sensación de "flotando" real.
const BOB_AMPLITUDE = 0.15; // metros
const BOB_FREQUENCY = 0.5; // Hz

/**
 * Física de vuelo: hover estable en Y (spring-damper + compensación de gravedad + bob,
 * portado de _applyHoverForce() en poc2) + Space aplica una fuerza de empuje ADICIONAL
 * (no mueve el target del spring — eso tenía lag, se sentía "mushy"). Mientras empuja, el
 * target del hover sigue la posición actual, así al soltar Space el hover sostiene ahí en
 * vez de tironear de vuelta al punto viejo. Sin horizontal/estabilización todavía — eso
 * llega con los sub-estados Idle/Thrusting/Floating. El combustible vive acá porque es un
 * detalle de ESTA strategy — el padre (CharacterFsm) sólo conoce hasFuel() vía closure.
 */
export class JetpackPhysicsController implements IPhysicsController {
  private fuel = MAX_FUEL;
  // Altura objetivo en el mundo — arranca en la posición donde se activó el jetpack, y
  // sigue a la posición actual mientras se empuja (ver tick()).
  private hoverTargetHeight: number;
  // Acumulador para el bob sinusoidal — mismo rol que elapsedTime en poc2.
  private elapsedTime = 0;

  constructor(
    private characterAggregate: PhysicsAggregate,
    private getInput: () => CharacterInputState,
  ) {
    this.hoverTargetHeight = this.characterAggregate.transformNode.getAbsolutePosition().y;
  }

  tick(dt: number): void {
    this.elapsedTime += dt;

    const { up } = this.getInput();
    if (up && this.fuel > 0) {
      this.fuel = Math.max(0, this.fuel - dt * FUEL_DRAIN_RATE);
      this._applyThrust();
    }

    this._applyHoverForce();
  }

  /** Leído por character.base.ts para armar el dep hasFuel() de CharacterFsm. */
  hasFuel(): boolean {
    return this.fuel > 0;
  }

  /**
   * Fuerza de empuje directa, además del hover — esto es lo que hace que Space se sienta
   * como un impulso real en vez de un ajuste lento del punto de equilibrio. Actualiza
   * hoverTargetHeight a la posición actual en cada frame de empuje, para que el hover no
   * tire hacia el punto viejo apenas se suelta la tecla.
   */
  private _applyThrust(): void {
    this.characterAggregate.body.applyForce(
      new Vector3(0, THRUST_FORCE, 0),
      this.characterAggregate.transformNode.getAbsolutePosition(),
    );
    this.hoverTargetHeight = this.characterAggregate.transformNode.getAbsolutePosition().y;
  }

  /**
   * Mismo cálculo que _applyHoverForce() en poc2 (error * springStrength - velocidad *
   * damping, más compensación de gravedad, clamped), adaptado: `error` es contra un Y
   * absoluto del mundo (hoverTargetHeight + bob) en vez de una distancia al suelo por
   * raycast. El bob sinusoidal es lo que le da la sensación de "flotando" — sin él, el
   * hover queda rígido en un punto fijo.
   */
  private _applyHoverForce(): void {
    const currentY = this.characterAggregate.transformNode.getAbsolutePosition().y;
    const verticalVelocity = this.characterAggregate.body.getLinearVelocity().y;

    const angularFrequency = BOB_FREQUENCY * 2 * Math.PI;
    const dynamicTargetHeight = this.hoverTargetHeight + BOB_AMPLITUDE * Math.sin(this.elapsedTime * angularFrequency);

    const error = dynamicTargetHeight - currentY;
    let forceY = CHARACTER_MASS * (error * HOVER_SPRING_STRENGTH - verticalVelocity * HOVER_DAMPING);
    forceY += CHARACTER_MASS * GRAVITY; // compensación de gravedad, igual que poc2

    const maxForce = CHARACTER_MASS * GRAVITY * HOVER_MAX_FORCE_FACTOR;
    forceY = Math.max(-maxForce, Math.min(maxForce, forceY));

    this.characterAggregate.body.applyForce(
      new Vector3(0, forceY, 0),
      this.characterAggregate.transformNode.getAbsolutePosition(),
    );
  }

  dispose(): void {
    // No posee characterAggregate (compartida, dueño: character.base.ts) — nada que liberar acá todavía.
    // (jetpack.thruster.ts, cuando se implemente, sí va a tener recursos propios para liberar.)
  }
}