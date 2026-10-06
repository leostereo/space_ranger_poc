import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

import type { LevelScope } from "./level-scope";

const FALLBACK_RADIUS = 100; // si no se pudo medir el nivel
const CAMERA_ALPHA = -Math.PI / 2;
const CAMERA_BETA = Math.PI / 3;
const CAMERA_DISTANCE_FACTOR = 0.9; // distancia inicial, en múltiplos del tamaño del nivel
const MIN_Z_FACTOR = 0.001;
const MAX_Z_FACTOR = 10;
const WHEEL_DELTA_PERCENTAGE = 0.01; // el zoom con la rueda es proporcional a la distancia
const PANNING_SENSIBILITY_BASE = 1000; // se divide por el tamaño: niveles grandes se desplazan más rápido

export interface LevelViewer {
  readonly camera: ArcRotateCamera;
  readonly light: HemisphericLight;
  dispose(): void;
}

/**
 * PLACEHOLDER hasta el estado 3B: una cámara orbital y una luz para poder VER el nivel cargado.
 * Se reemplaza por la cámara del personaje. Se mide el nivel y la cámara se encuadra sola.
 */
export function createLevelViewer(scene: Scene, canvas: HTMLCanvasElement, scope: LevelScope): LevelViewer {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const mesh of scope.root.getChildMeshes(false)) {
    if (mesh.getTotalVertices() === 0) {
      continue;
    }
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    min.minimizeInPlace(box.minimumWorld);
    max.maximizeInPlace(box.maximumWorld);
  }

  const measured = Number.isFinite(min.x);
  const center = measured ? Vector3.Center(min, max) : Vector3.Zero();
  const size = measured ? max.subtract(min) : new Vector3(FALLBACK_RADIUS, FALLBACK_RADIUS, FALLBACK_RADIUS);
  const extent = Math.max(size.x, size.y, size.z);

  const camera = new ArcRotateCamera(
    "level-viewer-camera",
    CAMERA_ALPHA,
    CAMERA_BETA,
    extent * CAMERA_DISTANCE_FACTOR,
    center,
    scene,
  );
  camera.minZ = Math.max(0.01, extent * MIN_Z_FACTOR);
  camera.maxZ = extent * MAX_Z_FACTOR;
  camera.wheelDeltaPercentage = WHEEL_DELTA_PERCENTAGE;
  camera.panningSensibility = Math.max(0.01, PANNING_SENSIBILITY_BASE / extent);
  camera.attachControl(canvas, true);
  scene.activeCamera = camera;

  const light = new HemisphericLight("level-viewer-light", Vector3.Up(), scene);

  scope.register(camera);
  scope.register(light);

  return {
    camera,
    light,
    dispose: () => {
      camera.dispose();
      light.dispose();
    },
  };
}
