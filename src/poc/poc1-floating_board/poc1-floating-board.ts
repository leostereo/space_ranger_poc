import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";

import type { Poc } from "../types";
import { poc1Config } from "./config";
import { FloatingBoardController } from "./floating-board-controller";

export default class FloatingBoardPoc implements Poc {
  private scene: Scene;

  private groundMesh: Mesh;
  private groundAggregate: PhysicsAggregate;

  private boardMesh: Mesh;
  private boardAggregate: PhysicsAggregate;

  private controller: FloatingBoardController;

  async build(scene: Scene, canvas: HTMLCanvasElement): Promise<void> {
    this.scene = scene;

    this._buildCamera(canvas);
    this._buildLights();
    this._buildGround();
    this._buildBoard();

    this.controller = new FloatingBoardController(this.scene, this.boardMesh, this.boardAggregate);
    this.scene.onBeforePhysicsObservable.add(() => this.controller.update());
  }

  dispose(): void {
    this.controller?.dispose();
    this.boardAggregate?.dispose();
    this.groundAggregate?.dispose();
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
    const { width, depth, thickness, friction, color } = poc1Config.ground;
    this.groundMesh = MeshBuilder.CreateBox("poc1-ground", { width, depth, height: thickness }, this.scene);
    this.groundMesh.position.y = -thickness / 2;

    const material = new StandardMaterial("poc1-ground-material", this.scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.specularColor = Color3.Black(); // sin brillo especular, look opaco/mate
    this.groundMesh.material = material;

    this.groundAggregate = new PhysicsAggregate(
      this.groundMesh,
      PhysicsShapeType.BOX,
      { mass: 0, friction, restitution: 0 },
      this.scene,
    );
  }

  private _buildBoard(): void {
    const { width, height, depth, mass, friction, restitution, color, emissiveColor, spawn } = poc1Config.board;
    this.boardMesh = MeshBuilder.CreateBox("poc1-board", { width, height, depth }, this.scene);
    this.boardMesh.position.set(spawn.x, 10, spawn.z);

    const material = new StandardMaterial("poc1-board-material", this.scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.emissiveColor = Color3.FromHexString(emissiveColor); // leve brillo propio, look sci-fi
    this.boardMesh.material = material;

    this.boardAggregate = new PhysicsAggregate(
      this.boardMesh,
      PhysicsShapeType.BOX,
      { mass, friction, restitution },
      this.scene,
    );
  }
}