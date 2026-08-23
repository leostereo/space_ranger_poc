// src/poc3-jetpack_character_fsm/strategies/stand-alone/stand-alone.physics.controller.ts
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { IPhysicsController } from "../contracts/iphysics-controller";
import type { CharacterInputState } from "../../character.input";

// TODO: mover a config.general.ts junto con el resto de TMP_CONFIG de utils.ts
const WALK_SPEED = 4; // m/s
const GROUND_FRICTION = 0.8; // mismo orden de magnitud que generalConfig.ground.friction en poc2
const GROUND_RESTITUTION = 0; // sin rebote al aterrizar, mismo criterio que ground/ramp en poc2

/** Física MÍNIMA de OnGround: mover horizontal según WASD sobre la capsule compartida. Sin salto todavía. */
export class StandAlonePhysicsController implements IPhysicsController {
  constructor(
    private characterAggregate: PhysicsAggregate,
    private getInput: () => CharacterInputState,
  ) {
    this._setupFallAndLanding();
  }

  /**
   * Portado del mismo criterio que boardAggregate en poc2 (board_character_builder):
   * - setGravityFactor(1): la cápsula ya cae por gravedad — nunca se tocaba explícitamente
   *   en poc3 hasta ahora, y poc2 SÍ lo hace explícito para el board, así que se asume
   *   necesario acá también (Havok no garantiza 1 por defecto sin setearlo).
   * - inertia.x/z = 0: evita que la cápsula se vuelque por torque al tocar el suelo,
   *   mismo fix que boardAggregate. Sin esto, un capsule rígido puede caer de costado.
   * - friction/restitution: evita que quede deslizando o rebotando en vez de "quedar
   *   apoyado". ⚠️ No tengo 100% de certeza de que `.material` sea mutable post-creación
   *   en la versión de Havok que estás usando — si no tiene efecto, la alternativa más
   *   segura es pasar { friction, restitution } en las OPTIONS del PhysicsAggregate al
   *   crearlo en utils.ts (character_builder), en vez de mutarlo acá después.
   */
  private _setupFallAndLanding(): void {
    this.characterAggregate.body.setGravityFactor(1);

    const massProperties = this.characterAggregate.body.getMassProperties();
    if (massProperties.inertia) {
      massProperties.inertia.x = 0;
      massProperties.inertia.z = 0;
      this.characterAggregate.body.setMassProperties(massProperties);
    }

    if (this.characterAggregate.material) {
      this.characterAggregate.material.friction = GROUND_FRICTION;
      this.characterAggregate.material.restitution = GROUND_RESTITUTION;
    }
  }

  tick(_dt: number): void {
    const { forward, backward, left, right } = this.getInput();

    const dir = new Vector3(
      (right ? 1 : 0) - (left ? 1 : 0),
      0,
      (forward ? 1 : 0) - (backward ? 1 : 0),
    );

    if (dir.lengthSquared() === 0) return;

    dir.normalize();
    const currentVelocity = this.characterAggregate.body.getLinearVelocity();
    this.characterAggregate.body.setLinearVelocity(
      new Vector3(dir.x * WALK_SPEED, currentVelocity.y, dir.z * WALK_SPEED),
    );
  }

  dispose(): void {
    // No posee characterAggregate (es compartida, dueño: character.base.ts) — nada que liberar acá.
  }
}