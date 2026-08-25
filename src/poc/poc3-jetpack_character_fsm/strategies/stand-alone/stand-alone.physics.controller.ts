// src/poc3-jetpack_character_fsm/strategies/stand-alone/stand-alone.physics.controller.ts
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { generalConfig } from "@/poc/config.general";
import type { IPhysicsController } from "../contracts/iphysics-controller";
import type { CharacterInputState } from "../../character.input";

// TODO: mover a config.general.ts junto con el resto de TMP_CONFIG de utils.ts
const WALK_SPEED = 4; // m/s
const GROUND_FRICTION = 0.8; // mismo orden de magnitud que generalConfig.ground.friction en poc2
const GROUND_RESTITUTION = 0; // sin rebote al aterrizar, mismo criterio que ground/ramp en poc2
const GROUND_RAY_MARGIN = 0.15; // margen extra debajo de los pies para detectar contacto
const UPWARD_VELOCITY_THRESHOLD = 0.5; // m/s — por encima de esto se considera "despegando", no "apoyado" (tolera jitter cerca de 0)
const JUMP_IMPULSE = 6; // m/s de velocidad vertical instantánea, mismo orden que generalConfig.boost.impulse en poc2

/** Física de OnGround/OnAir: mover horizontal según WASD, detectar piso por raycast, saltar. */
export class StandAlonePhysicsController implements IPhysicsController {
  private _groundDetected = true; // arranca en true: al entrar a StandAlone se asume apoyado, se corrige en el primer tick si no lo está
  private _ray = new Ray(Vector3.Zero(), Vector3.Down(), 5);

  constructor(
    private scene: Scene,
    private characterAggregate: PhysicsAggregate,
    private getInput: () => CharacterInputState,
    initialGroundDetected: boolean,
  ) {
    this._groundDetected = initialGroundDetected;
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
    this._updateGroundDetection();

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

  /** Leído por character.base.ts para armar el dep isGroundDetected() de StandAloneFsm. */
  isGroundDetected(): boolean {
    return this._groundDetected;
  }

  /**
   * Aplica el impulso físico del salto. Llamado por character.base.ts vía
   * StandAloneFsmDeps.onEnterOnAir — dispara al ENTRAR a OnAir (frame de impulso de la
   * animación), no al presionar la tecla. Misma idea que _onEnterJumping() en poc2, pero
   * simplificada: en vez de aplicar un impulso escalado por masa (applyImpulse), fija
   * directo la velocidad vertical — evita tener que importar/duplicar la masa acá. Si más
   * adelante hace falta que el salto varíe según algo (ej. carga de un botón), ahí sí
   * conviene pasar a applyImpulse como poc2.
   */
  applyJumpImpulse(): void {
    const currentVelocity = this.characterAggregate.body.getLinearVelocity();
    this.characterAggregate.body.setLinearVelocity(
      new Vector3(currentVelocity.x, JUMP_IMPULSE, currentVelocity.z),
    );
  }

  /**
   * Raycast corto desde la posición del personaje hacia abajo, mismo patrón que
   * _updateGroundDetection() en poc2 (board.controller.ts) pero sin la lógica de hover:
   * acá sólo importa "¿toca el piso o no?", no una distancia objetivo.
   *
   * FIX: no alcanza con el raycast solo. Justo al saltar, applyJumpImpulse() cambia la
   * VELOCIDAD al instante, pero la POSICIÓN todavía no se movió ese mismo frame (Havok
   * recién integra la velocidad en el próximo paso de física) — el raycast seguía
   * detectando "piso" un frame más, y con física corriendo antes que la fsm (mismo frame),
   * OnAir volvía directo a OnGround antes de que se notara. Se exige además que la
   * velocidad vertical no esté yéndose hacia arriba — así el chequeo depende de física
   * real, no de un timer arbitrario que haya que ajustar si cambia JUMP_IMPULSE.
   */
  private _updateGroundDetection(): void {
    const capsuleHeight = generalConfig.playerConfig.height;
    const rayLength = capsuleHeight / 2 + GROUND_RAY_MARGIN;

    const origin = this.characterAggregate.transformNode.getAbsolutePosition();
    this._ray.origin.set(origin.x, origin.y, origin.z);
    this._ray.length = rayLength;

    const hit = this.scene.pickWithRay(
      this._ray,
      (mesh) => mesh.isPickable &&
        mesh !== this.characterAggregate.transformNode
        && mesh.name !== 'playerCapsule' 
    );

    const verticalVelocity = this.characterAggregate.body.getLinearVelocity().y;
    const isMovingUpward = verticalVelocity > UPWARD_VELOCITY_THRESHOLD;

    this._groundDetected = !!(hit && hit.hit) && !isMovingUpward;
  }

  dispose(): void {
    // No posee characterAggregate (es compartida, dueño: character.base.ts) — nada que liberar acá.
  }
}