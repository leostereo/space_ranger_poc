import { FollowCamera } from "@babylonjs/core/Cameras/followCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

const CAMERA_NAME = "characterFollowCamera";
const INITIAL_POSITION = new Vector3(0, 5, 10);
const RADIUS = 10; // distancia horizontal hacia atrás
const HEIGHT_OFFSET = 4; // altura sobre el objetivo
const ROTATION_OFFSET_DEGREES = 180; // 180 = mira desde atrás; 0 = desde el frente
const CAMERA_ACCELERATION = 0.05; // 0 a 1: qué rápido alcanza al objetivo
const MAX_CAMERA_SPEED = 20;

/** Cámara de seguimiento del Character. No se activa sola: lo hace CharacterBase.activateCamera(). */
export function createCharacterFollowCamera(scene: Scene, target: AbstractMesh): FollowCamera {
  const camera = new FollowCamera(CAMERA_NAME, INITIAL_POSITION.clone(), scene);
  camera.radius = RADIUS;
  camera.heightOffset = HEIGHT_OFFSET;
  camera.rotationOffset = ROTATION_OFFSET_DEGREES;
  camera.cameraAcceleration = CAMERA_ACCELERATION;
  camera.maxCameraSpeed = MAX_CAMERA_SPEED;
  camera.lockedTarget = target;
  return camera;
}