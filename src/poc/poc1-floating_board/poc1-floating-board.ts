import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";

import type { Poc } from "../types";
import { FloatingBoardController } from "./floating-board-controller";
import { poc1Config } from "./config";

export default class FloatingBoardPoc implements Poc {
  private scene: Scene;
  private boardMesh: Mesh;
  private controller: FloatingBoardController;

  async build(engine: Engine | WebGPUEngine, canvas: HTMLCanvasElement): Promise<Scene> {
    this.scene = new Scene(engine);

    this._buildCamera(canvas);
    this._buildLights();
    this._buildGround();
    this.boardMesh = this._buildBoardPlaceholder();

    this.controller = new FloatingBoardController(this.scene, this.boardMesh);
    this.scene.onBeforeRenderObservable.add(() => this.controller.update());

    return this.scene;
  }

  dispose(): void {
    this.controller?.dispose();
  }

  private _buildCamera(canvas: HTMLCanvasElement): void {
    const { alpha, beta, radius, target } = poc1Config.camera;
    const camera = new ArcRotateCamera(
      "poc1-camera",
      alpha,
      beta,
      radius,
      new Vector3(target.x, target.y, target.z),
      this.scene,
    );
    camera.attachControl(canvas, true);
  }

  private _buildLights(): void {
    new HemisphericLight("poc1-light", new Vector3(0, 1, 0), this.scene);
  }

  private _buildGround(): void {
    const { width, height } = poc1Config.ground;
    MeshBuilder.CreateGround("poc1-ground", { width, height }, this.scene);
  }

  private _buildBoardPlaceholder(): Mesh {
    const { width, height, depth } = poc1Config.board;
    const board = MeshBuilder.CreateBox("poc1-board", { width, height, depth }, this.scene);
    board.position.y = 1;
    return board;
  }
}