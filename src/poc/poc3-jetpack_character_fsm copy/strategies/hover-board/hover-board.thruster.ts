// src/poc4-.../strategies/hover-board/hover-board.thruster.ts
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { AssetManager } from "@/services/assets-manager";

// Portado de board.thruster.ts (POC2) — constantes locales en vez de generalConfig.thruster,
// mismos valores que tenía la sección thruster de POC2.
const BACK_OFFSET = -0.6;
const HEIGHT_OFFSET = -0.05;
const DIRECTION = new Vector3(0, 0, -1);
const MIN_EMIT_RATE = 10;
const MAX_EMIT_RATE = 100;
const SPEED_NORMALIZER = 25;

export class HoverBoardThruster {
  private particleSystem: ParticleSystem;
  private _emitterPosition = new Vector3();

  constructor(
    private scene: Scene,
    private boardMesh: Mesh,
  ) {
    this.particleSystem = new ParticleSystem("hoverBoardThruster", 500, scene);
    this.particleSystem.particleTexture = AssetManager.getTexture("flare");

    this.particleSystem.minEmitBox = new Vector3(-0.15, -0.15, 0);
    this.particleSystem.maxEmitBox = new Vector3(0.15, 0.15, 0);

    this.particleSystem.emitter = this._emitterPosition;

    this.particleSystem.color1 = new Color4(0.3, 0.6, 1.0, 1.0);
    this.particleSystem.color2 = new Color4(0.1, 0.3, 1.0, 0.6);
    this.particleSystem.colorDead = new Color4(0, 0, 0, 0);

    this.particleSystem.minSize = 0.05;
    this.particleSystem.maxSize = 0.2;
    this.particleSystem.minLifeTime = 0.15;
    this.particleSystem.maxLifeTime = 0.35;

    this.particleSystem.emitRate = 0;
    this.particleSystem.minEmitPower = 1.5;
    this.particleSystem.maxEmitPower = 3;
    this.particleSystem.updateSpeed = 0.01;

    this.particleSystem.start();
  }

  update(isAccelerating: boolean, forwardSpeed: number): void {
    Vector3.TransformCoordinatesToRef(
      new Vector3(0, HEIGHT_OFFSET, BACK_OFFSET),
      this.boardMesh.getWorldMatrix(),
      this._emitterPosition,
    );

    if (!isAccelerating) {
      this.particleSystem.emitRate = 0;
      return;
    }

    Vector3.TransformNormalToRef(DIRECTION, this.boardMesh.getWorldMatrix(), this.particleSystem.direction1);
    this.particleSystem.direction2.copyFrom(this.particleSystem.direction1);

    const spread = 0.08;
    this.particleSystem.direction1.x -= spread;
    this.particleSystem.direction1.y -= spread * 0.5;
    this.particleSystem.direction2.x += spread;
    this.particleSystem.direction2.y += spread * 0.5;

    const speedFactor = Math.min(Math.abs(forwardSpeed) / SPEED_NORMALIZER, 1);
    this.particleSystem.emitRate = MIN_EMIT_RATE + speedFactor * (MAX_EMIT_RATE - MIN_EMIT_RATE);
  }

  dispose(): void {
    this.particleSystem.dispose(false); // CAMBIADO — no disponer la textura "flare" compartida
  }
}