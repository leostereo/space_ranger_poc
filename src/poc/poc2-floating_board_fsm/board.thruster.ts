// src/poc2-floating_board_fsm/board.thruster.ts
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { generalConfig } from "../config.general";
import { AssetManager } from "@/services/assets-manager";

export class BoardThruster {
    private particleSystem: ParticleSystem;
    private _emitterPosition = new Vector3();

    constructor(
        private scene: Scene,
        private boardMesh: Mesh,
    ) {
        this.particleSystem = new ParticleSystem("boardThruster", 500, scene);
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
        const { backOffset, heightOffset, minEmitRate, maxEmitRate, speedNormalizer, direction } =
            generalConfig.thruster;

        Vector3.TransformCoordinatesToRef(
            new Vector3(0, heightOffset, backOffset),
            this.boardMesh.getWorldMatrix(),
            this._emitterPosition,
        );

        if (!isAccelerating) {
            this.particleSystem.emitRate = 0;
            return;
        }

        Vector3.TransformNormalToRef(direction, this.boardMesh.getWorldMatrix(), this.particleSystem.direction1);
        this.particleSystem.direction2.copyFrom(this.particleSystem.direction1);

        // Pequeño cono de apertura en vez de un hilo perfecto
        const spread = 0.08; // ajustá este valor: más chico = más hilo, más grande = más nube
        this.particleSystem.direction1.x -= spread;
        this.particleSystem.direction1.y -= spread * 0.5;
        this.particleSystem.direction2.x += spread;
        this.particleSystem.direction2.y += spread * 0.5;

        const speedFactor = Math.min(Math.abs(forwardSpeed) / speedNormalizer, 1);
        this.particleSystem.emitRate = minEmitRate + speedFactor * (maxEmitRate - minEmitRate);
    }

    dispose(): void {
        this.particleSystem.dispose();
    }
}