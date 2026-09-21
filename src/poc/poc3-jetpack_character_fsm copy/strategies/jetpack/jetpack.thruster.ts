import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode"; // CAMBIADO
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import { AssetManager } from "@/services/assets-manager";

const DIRECTION = new Vector3(0, -1, 0);
const MIN_EMIT_RATE = 15;
const MAX_EMIT_RATE = 150;
const VERTICAL_SPEED_NORMALIZER = 8;
const THRUST_BOOST_MULTIPLIER = 1.6;

export class JetpackThruster {
  private leftEmitter: ParticleSystem;
  private rightEmitter: ParticleSystem;
  private _leftPosition = new Vector3(); // NUEVO
  private _rightPosition = new Vector3(); // NUEVO

  constructor(
    private scene: Scene,
    private characterMesh: AbstractMesh,
    private thrusterLeftNozzle: TransformNode, // CAMBIADO — guardado como campo
    private thrusterRightNozzle: TransformNode, // CAMBIADO
  ) {
    this.leftEmitter = this._createEmitter("jetpackThrusterLeft", this._leftPosition);
    this.rightEmitter = this._createEmitter("jetpackThrusterRight", this._rightPosition);
  }

  private _createEmitter(name: string, emitterPosition: Vector3): ParticleSystem { // CAMBIADO — vuelve a Vector3
    const ps = new ParticleSystem(name, 500, this.scene);
    ps.particleTexture = AssetManager.getTexture("flare");

    ps.minEmitBox = new Vector3(-0.03, 0, -0.03); // achicado — ya no hace falta compensar offset del root
    ps.maxEmitBox = new Vector3(0.03, 0, 0.03);

    ps.emitter = emitterPosition; // CAMBIADO — Vector3, actualizado cada frame en update()

    ps.color1 = new Color4(0.4, 0.7, 1.0, 1.0);
    ps.color2 = new Color4(0.15, 0.35, 1.0, 0.6);
    ps.colorDead = new Color4(0, 0, 0, 0);

    ps.minSize = 0.04;
    ps.maxSize = 0.15;
    ps.minLifeTime = 0.12;
    ps.maxLifeTime = 0.3;

    ps.emitRate = 0;
    ps.minEmitPower = 1.5;
    ps.maxEmitPower = 3;
    ps.updateSpeed = 0.01;

    ps.start();
    return ps;
  }

  update(isThrusting: boolean, verticalVelocity: number): void {
    // NUEVO — posición real del nozzle cada frame (sigue rotación/traslación del thrusterGroup)
    this._leftPosition.copyFrom(this.thrusterLeftNozzle.getAbsolutePosition());
    this._rightPosition.copyFrom(this.thrusterRightNozzle.getAbsolutePosition());

    const speedFactor = Math.min(Math.abs(verticalVelocity) / VERTICAL_SPEED_NORMALIZER, 1);
    let emitRate = MIN_EMIT_RATE + speedFactor * (MAX_EMIT_RATE - MIN_EMIT_RATE);
    if (isThrusting) emitRate *= THRUST_BOOST_MULTIPLIER;

    for (const ps of [this.leftEmitter, this.rightEmitter]) {
      Vector3.TransformNormalToRef(DIRECTION, this.characterMesh.getWorldMatrix(), ps.direction1);
      ps.direction2.copyFrom(ps.direction1);

      const spread = 0.06;
      ps.direction1.x -= spread;
      ps.direction1.z -= spread;
      ps.direction2.x += spread;
      ps.direction2.z += spread;

      ps.emitRate = emitRate;
    }
  }

  dispose(): void {
    this.leftEmitter.dispose(false);
    this.rightEmitter.dispose(false);
  }
}