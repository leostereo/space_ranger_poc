// src/poc3-jetpack_character_fsm/strategies/jetpack/jetpack.physics.controller.ts
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { IPhysicsController } from "../contracts/iphysics-controller";
import type { CharacterInputState } from "../../character.input";

// TODO: mover a config.general.ts junto con el resto (ver TODO en utils.ts)
const THRUST_FORCE = 900; // Newtons, aplicado mientras `up` está sostenido
const MAX_FUEL = 5; // segundos de empuje continuo
const FUEL_DRAIN_RATE = 1; // unidades de combustible por segundo de empuje

/**
 * Física MÍNIMA de vuelo: empuje vertical mientras Space está sostenido, sin
 * horizontal/estabilización todavía (eso llega en el próximo incremento, junto con los
 * sub-estados Idle/Thrusting/Floating). El combustible vive acá porque es un detalle de
 * ESTA strategy — el padre (CharacterFsm) sólo conoce hasFuel() vía closure.
 */
export class JetpackPhysicsController implements IPhysicsController {
  private fuel = MAX_FUEL;

  constructor(
    private characterAggregate: PhysicsAggregate,
    private getInput: () => CharacterInputState,
  ) {}

  tick(dt: number): void {
    const { up } = this.getInput();
    if (!up || this.fuel <= 0) return;

    this.fuel = Math.max(0, this.fuel - dt * FUEL_DRAIN_RATE);

    this.characterAggregate.body.applyForce(
      new Vector3(0, THRUST_FORCE, 0),
      this.characterAggregate.transformNode.getAbsolutePosition(),
    );
  }

  /** Leído por character.base.ts para armar el dep hasFuel() de CharacterFsm. */
  hasFuel(): boolean {
    return this.fuel > 0;
  }

  dispose(): void {
    // No posee characterAggregate (compartida, dueño: character.base.ts) — nada que liberar acá todavía.
    // (jetpack.thruster.ts, cuando se implemente, sí va a tener recursos propios para liberar.)
  }
}
