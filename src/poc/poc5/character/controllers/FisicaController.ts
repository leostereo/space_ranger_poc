import { Vector3, PhysicsAggregate, Scene, Ray } from "@babylonjs/core";
import { InputController } from "./InputController";

const WALK_SPEED = 4; // m/s
const RUN_SPEED = 7; // m/s
const TURN_SPEED = Math.PI; // rad/s (~180°/s)
const GROUND_FRICTION = 0.8;
const GROUND_RESTITUTION = 0;
const GROUND_RAY_MARGIN = 0.15;
const UPWARD_VELOCITY_THRESHOLD = 0.5;

export class FisicaController {
  private _groundDetected = true;
  private _ray = new Ray(Vector3.Zero(), Vector3.Down(), 5);
  private _scene: Scene;
  private _characterAggregate: PhysicsAggregate;

  constructor(scene: Scene, characterAggregate: PhysicsAggregate, initialGroundDetected: boolean = true) {
    this._scene = scene;
    this._characterAggregate = characterAggregate;
    this._groundDetected = initialGroundDetected;

    this._setupFallAndLanding();
  }

  private _setupFallAndLanding(): void {
    this._characterAggregate.body.setGravityFactor(1);

    const massProperties = this._characterAggregate.body.getMassProperties();
    if (massProperties.inertia) {
      massProperties.inertia.x = 0;
      massProperties.inertia.z = 0;
      this._characterAggregate.body.setMassProperties(massProperties);
    }

    if (this._characterAggregate.material) {
      this._characterAggregate.material.friction = GROUND_FRICTION;
      this._characterAggregate.material.restitution = GROUND_RESTITUTION;
    }
  }

  /**
   * Corre en cada frame integrado al loop principal.
   * Procesa la rotación, el desplazamiento y el raycast del suelo.
   */
  // Buscá el método actualizarFisica dentro de FisicaController.ts y dejalo así:
  public actualizarFisica(inputs: InputController, delta: number): void {
    this._updateGroundDetection();

    // Conectamos el hardware real con tu lógica de producción nativa
    const left = inputs.izquierda;
    const right = inputs.derecha;
    const backward = inputs.atras;
    const cruise = false; // Podríamos mapear Shift aquí más adelante para correr

    // Tu lógica nativa de Havok procesa todo de forma automática
    this._applyTurn(left, right);
    this._applyMove(inputs.adelante, backward, cruise);
  }


  private _applyTurn(left: boolean, right: boolean): void {
    const turnDir = (right ? 1 : 0) - (left ? 1 : 0);
    this._characterAggregate.body.setAngularVelocity(new Vector3(0, turnDir * TURN_SPEED, 0));
  }

  private _applyMove(forward: boolean, backward: boolean, cruise: boolean): void {
    const currentVelocity = this._characterAggregate.body.getLinearVelocity();

    if (!forward && !backward) {
      this._characterAggregate.body.setLinearVelocity(new Vector3(0, currentVelocity.y, 0));
      return;
    }

    const dirSign = (forward ? 1 : 0) - (backward ? 1 : 0);

    // Obtenemos hacia dónde mira el nodo de transformación de la cápsula física
    const facing = this._characterAggregate.transformNode.forward.scale(dirSign);
    const speed = cruise ? RUN_SPEED : WALK_SPEED;

    this._characterAggregate.body.setLinearVelocity(
      new Vector3(facing.x * speed, currentVelocity.y, facing.z * speed),
    );
  }

  /**
   * El impulso real de salto vertical de tu producción
   */
  public aplicarImpulsoVertical(fuerza: number): void {
    const currentVelocity = this._characterAggregate.body.getLinearVelocity();
    this._characterAggregate.body.setLinearVelocity(
      new Vector3(currentVelocity.x, fuerza, currentVelocity.z),
    );
  }

  /**
   * FSM lee directamente el resultado del PickWithRay real
   */
  public estaEnElSuelo(): boolean {
    return this._groundDetected;
  }

  public obtenerVelocidad(): Vector3 {
    return this._characterAggregate.body.getLinearVelocity();
  }

  private _updateGroundDetection(): void {
    // Si no tenés configurado generalConfig, podés hardcodear una altura base de cápsula (ej: 2 metros)
    const capsuleHeight = 2.0;
    const rayLength = capsuleHeight / 2 + GROUND_RAY_MARGIN;

    const origin = this._characterAggregate.transformNode.getAbsolutePosition();
    this._ray.origin.set(origin.x, origin.y, origin.z);
    this._ray.length = rayLength;

    const hit = this._scene.pickWithRay(
      this._ray,
      (mesh) => mesh.isPickable &&
        mesh !== this._characterAggregate.transformNode &&
        mesh.name !== 'playerCapsule' &&
        mesh.name !== 'character-capsule'
    );

    const verticalVelocity = this._characterAggregate.body.getLinearVelocity().y;
    const isMovingUpward = verticalVelocity > UPWARD_VELOCITY_THRESHOLD;

    this._groundDetected = !!(hit && hit.hit) && !isMovingUpward;
  }
}
