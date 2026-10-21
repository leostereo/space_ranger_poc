import "@babylonjs/core/Meshes/Builders/boxBuilder";

import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import type { SkyboxDefinition } from "./level-definition";

// Babylon exige este orden para las caras del cubo.
const FACE_SUFFIXES = ["_px", "_py", "_pz", "_nx", "_ny", "_nz"] as const;

export class Skybox {
  private constructor(
    private readonly mesh: Mesh,
    private readonly material: StandardMaterial,
    private readonly texture: CubeTexture,
  ) {}

  static async create(scene: Scene, definition: SkyboxDefinition): Promise<Skybox> {
    const extension = definition.extension ?? "png";
    const files = FACE_SUFFIXES.map((suffix) => `${definition.basePath}${suffix}.${extension}`);

    const texture = await new Promise<CubeTexture>((resolve, reject) => {
      const cube = new CubeTexture(
        definition.basePath, scene, null, false, files,
        () => resolve(cube),
        (message) => {
          cube.dispose();
          reject(new Error(`[Skybox] could not load ${definition.basePath}: ${message ?? "unknown error"}`));
        },
      );
    });
    texture.coordinatesMode = Texture.SKYBOX_MODE;

    const material = new StandardMaterial("skybox-material", scene);
    material.backFaceCulling = false;
    material.disableLighting = true;
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.reflectionTexture = texture;
    material.fogEnabled = false;

    const mesh = MeshBuilder.CreateBox("skybox", { size: definition.size ?? 1000 }, scene);
    mesh.material = material;
    mesh.infiniteDistance = true;   // acompaña a la cámara: nunca te acercás al borde
    mesh.ignoreCameraMaxZ = true;   // no se recorta por el far plane
    mesh.isPickable = false;        // que no lo agarren raycasts (disparos, hoverboard)
    mesh.rotation.y = ((definition.rotationYDeg ?? 0) * Math.PI) / 180;

    return new Skybox(mesh, material, texture);
  }

  dispose(): void {
    this.mesh.dispose();
    this.material.dispose(); // no libera la textura por defecto
    this.texture.dispose();
  }
}