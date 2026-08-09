import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { poc1Config } from "./config";

/**
 * Controller de física del board flotante.
 *
 * Paso 1 (listo): mesh + PhysicsAggregate (Havok) armado en FloatingBoardPoc.
 * Paso 2 (listo): levitación en idle. La gravedad actúa normalmente (caída libre)
 *   mientras el board esté por encima de la altura de hover objetivo; recién al
 *   cruzarla hacia abajo se cancela la gravedad y se engancha el spring-damper
 *   que lo sostiene oscilando (seno) alrededor de esa altura (poc1Config.hover).
 * Paso 3 (próximo): fuerzas de movimiento por input + estado Falling.
 */
export class FloatingBoardController {
  private elapsedTime = 0;
  private isHovering = false;

  constructor(
    private scene: Scene,
    private boardMesh: Mesh,
    private boardAggregate: PhysicsAggregate,
  ) {}

  /** Se llama en cada frame (scene.onBeforePhysicsObservable), antes de que Havok resuelva el paso. */
  update(): void {
    const dt = this.scene.getEngine().getDeltaTime() / 1000;
    this.elapsedTime += dt;

    this._updateHover();
  }

  private _updateHover(): void {
    const { height, springStrength, damping, bobAmplitude, bobFrequency } = poc1Config.hover;
    const mass = poc1Config.board.mass;

    const angularFrequency = bobFrequency * 2 * Math.PI;
    const targetHeight = height + bobAmplitude * Math.sin(this.elapsedTime * angularFrequency);
    const currentHeight = this.boardMesh.position.y;

    // Por encima del objetivo: cae libre (gravedad normal). Al cruzarlo hacia abajo, se engancha el hover.
    const shouldHover = currentHeight <= targetHeight;

    if (shouldHover !== this.isHovering) {
      this.isHovering = shouldHover;
      this.boardAggregate.body.setGravityFactor(shouldHover ? 0 : 1);
    }

    if (!this.isHovering) {
      return;
    }

    const verticalVelocity = this.boardAggregate.body.getLinearVelocity().y;
    const error = targetHeight - currentHeight;
    const springForce = mass * (error * springStrength - verticalVelocity * damping);

    this.boardAggregate.body.applyForce(new Vector3(0, springForce, 0), this.boardMesh.getAbsolutePosition());
  }

  dispose(): void {
    // Nada que liberar por ahora (sin observables propios todavía).
  }
}