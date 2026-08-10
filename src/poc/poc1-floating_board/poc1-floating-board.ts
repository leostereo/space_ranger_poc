import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";

import type { Poc } from "../types";
import { poc1Config } from "./config";
import { FloatingBoardController } from "./floating-board-controller";
import { BoardInput } from "./board-input";
import { FollowCamera } from "@babylonjs/core/Cameras/followCamera";
import { Tools } from "@babylonjs/core/Misc/tools";



export default class FloatingBoardPoc implements Poc {
  private scene: Scene;

  private groundMesh: Mesh;
  private groundAggregate: PhysicsAggregate;

  private boardMesh: Mesh;
  private boardAggregate: PhysicsAggregate;

  private input: BoardInput;
  private controller: FloatingBoardController;

  async build(scene: Scene, canvas: HTMLCanvasElement): Promise<void> {
    this.scene = scene;

    this._buildLights();
    this._buildGround();
    this._buildBoard();
    // this._buildArcCamera(canvas);
    this._buildFollowCamera();
    // this._buildNoseMarker();

    this.input = new BoardInput();
    this.controller = new FloatingBoardController(this.scene, this.boardMesh, this.boardAggregate, this.input);
    this.scene.onBeforePhysicsObservable.add(() => this.controller.update());
    this.scene.onAfterPhysicsObservable.add(() => this.controller.applyVisualRoll());
  }

  dispose(): void {
    this.controller?.dispose();
    this.input?.dispose();
    this.boardAggregate?.dispose();
    this.groundAggregate?.dispose();
  }

  private _buildArcCamera(canvas: HTMLCanvasElement): void {
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

    private _buildFollowCamera(){

      const camera = new FollowCamera("boardCamera", new Vector3(0, 5, 10), this.scene);
      camera.lockedTarget = this.boardMesh;
      camera.radius = 6;          // Distancia horizontal (hacia atrás) en unidades de Babylon
      camera.heightOffset = 2.0;  // Altura vertical por encima de la patineta
      camera.rotationOffset = 180;// 180 grados para que mire exactamente desde atrás (0 la miraría de frente)
  
      // 4. Configurar la elasticidad/suavidad del seguimiento
      camera.cameraAcceleration = 0.05; // Velocidad de aceleración para alcanzar al objetivo (0.0 a 1.0)
      camera.maxCameraSpeed = 20;       // Velocidad máxima permitida para la cámara
     
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

    // 1. Crear el material Sci-Fi con brillo propio
    const material = new StandardMaterial("poc1-board-material", this.scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.emissiveColor = Color3.FromHexString(emissiveColor);
    material.specularColor = new Color3(0.2, 0.2, 0.2);

    // 2. Crear la esfera deformada (Óvalo Elipsoide)
    // Mapeamos los ejes para que coincidan con la orientación del vehículo:
    // - diameterX: Ancho de la tabla (width)
    // - diameterY: Grosor/Altura de la tabla (height -> bien delgado)
    // - diameterZ: Largo de la tabla (depth -> el eje más estirado)
    this.boardMesh = MeshBuilder.CreateSphere("poc1-board", {
      diameterX: width,   // Eje menor horizontal (ancho)
      diameterY: height,  // Eje menor vertical (espesor chato)
      diameterZ: depth,   // Eje mayor (largo que define el frente y atrás)
      segments: 32        // Superficie curva muy suave
    }, this.scene);

    // Posicionar en el punto de spawn configurado
    this.boardMesh.position.set(spawn.x, poc1Config.hover.height, spawn.z);
    this.boardMesh.material = material;



    // =========================================================================
    // PIEZA 2: LA COLA (Óvalo Perpendicular Cruzado)
    // =========================================================================
    // Definimos sus dimensiones en base a tus reglas:
    const tailDiameterX = depth / 4; // El ancho de la cola es la mitad del largo de la tabla
    const tailDiameterY = height;    // Mismo espesor para que encajen al ras
    const tailDiameterZ = width;     // El eje principal es del mismo largo que el ancho del cuerpo

    const tailMesh = MeshBuilder.CreateSphere("board-tail", {
      diameterX: tailDiameterX,
      diameterY: tailDiameterY,
      diameterZ: tailDiameterZ,
      segments: 32
    }, this.scene);

    tailMesh.material = material;
    tailMesh.parent = this.boardMesh; // Emparentamos al cuerpo raíz para Havok

    // Posicionamos la cola en el extremo trasero de la patineta (Z negativo)
    // La elevamos levemente en Y (ej: height * 0.4) para darle el look de alerón elevado
    tailMesh.position.set(0, height * 0.4, -(depth / 2));

    // Rotamos la cola:
    // - 90 grados en Y para cruzarla de lado a lado (perpendicular al cuerpo principal)
    // - 20 grados en X para darle inclinación hacia arriba estilo kicktail
    tailMesh.rotation.set(Tools.ToRadians(20), 0, 0);



    // 3. Física ultra-eficiente con Havok
    // Dado que es un solo óvalo convexo sin huecos, CONVEX_HULL generará una 
    // malla de colisión perfecta y ultra rápida que envuelve el elipsoide de forma exacta.
    this.boardAggregate = new PhysicsAggregate(
      this.boardMesh,
      PhysicsShapeType.CONVEX_HULL,
      { mass, friction, restitution },
      this.scene,
    );
  }

  private _buildNoseMarker(): void {
    const { depth } = poc1Config.board;

    const nose = MeshBuilder.CreateBox("poc1-board-nose", { width: 0.15, height: 0.08, depth: 0.15 }, this.scene);
    nose.parent = this.boardMesh; // hijo del board: sigue su posición/rotación sin tocar física
    nose.position.set(0, 0.05, depth / 2 + 0.05);

    const material = new StandardMaterial("poc1-board-nose-material", this.scene);
    material.diffuseColor = Color3.White();
    material.emissiveColor = Color3.White();
    material.specularColor = Color3.Black();
    nose.material = material;
  }
}