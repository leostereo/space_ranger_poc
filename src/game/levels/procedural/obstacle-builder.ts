// En src/game/levels/procedural/obstacle-builder.ts
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { PhysicsAggregate } from "@babylonjs/core";

export const PLAYER_HEIGHT = 0.8;
export const UNIT = PLAYER_HEIGHT / 2;

export type ObstacleKind = "jump" | "pillar" | "wall" | "breakable" | "cover";

const OBSTACLE_COLORS: Record<ObstacleKind, Color3> = {
  jump: Color3.FromHexString("#00e5ff"),      // Cian energético
  pillar: Color3.FromHexString("#334155"),    // Pizarra espacial
  wall: Color3.FromHexString("#1e293b"),      // Azul acero oscuro
  breakable: Color3.FromHexString("#ff6d00"), // Ámbar láser
  cover: Color3.FromHexString("#475569"),     // Gris titanio
};

export interface ObstacleOptions {
  readonly name: string;
  readonly position: Vector3;
  readonly headingY?: number;
  readonly widthUnits?: number;
  readonly depthUnits?: number;
  readonly hp?: number;
}

export interface BreakableMetadata {
  readonly kind: "breakable";
  hp: number;
  isDestroyed: boolean;
  destroy: (physicsAggregate?: PhysicsAggregate) => void;
}

const getObstacleMaterial = (scene: Scene, kind: ObstacleKind): StandardMaterial => {
  const matName = `shared-obstacle-mat-${kind}`;
  const existing = scene.getMaterialByName(matName) as StandardMaterial;
  if (existing) return existing;

  const color = OBSTACLE_COLORS[kind];
  const mat = new StandardMaterial(matName, scene);
  mat.diffuseColor = color;
  mat.emissiveColor = color.scale(0.35);
  mat.specularColor = new Color3(0.2, 0.2, 0.2);
  return mat;
};

const buildBaseBox = (
  scene: Scene,
  kind: ObstacleKind,
  opts: ObstacleOptions,
  size: Vector3
): Mesh => {
  const box = CreateBox(opts.name, { width: size.x, height: size.y, depth: size.z }, scene);
  box.position.set(opts.position.x, opts.position.y + size.y / 2, opts.position.z);
  box.rotation.y = opts.headingY ?? 0;
  box.material = getObstacleMaterial(scene, kind);
  box.checkCollisions = true;
  box.isPickable = true;
  return box;
};

export const createCoverBox = (scene: Scene, opts: ObstacleOptions): Mesh => {
  const width = (opts.widthUnits ?? 8) * UNIT;
  const depth = (opts.depthUnits ?? 3) * UNIT;
  return buildBaseBox(scene, "cover", opts, new Vector3(width, 3 * UNIT, depth));
};

export const createDodgePillar = (scene: Scene, opts: ObstacleOptions): Mesh => {
  const width = (opts.widthUnits ?? 4) * UNIT;
  const depth = (opts.depthUnits ?? 4) * UNIT;
  return buildBaseBox(scene, "pillar", opts, new Vector3(width, 4 * UNIT, depth));
};

export const createDodgeWall = (scene: Scene, opts: ObstacleOptions): Mesh => {
  const width = (opts.widthUnits ?? 15) * UNIT;
  const depth = (opts.depthUnits ?? 5) * UNIT;
  return buildBaseBox(scene, "wall", opts, new Vector3(width, 4 * UNIT, depth));
};

export const createJumpBar = (scene: Scene, opts: ObstacleOptions & { trackWidth: number }): Mesh => {
  return buildBaseBox(scene, "jump", opts, new Vector3(opts.trackWidth - 1.5, 3 * UNIT, 2));
};


const shatterMeshIntoFragments = (
  scene: Scene,
  sourceMesh: Mesh,
  fragmentCount = 8,
  durationSeconds = 1.2
): void => {
  const bounds = sourceMesh.getBoundingInfo().boundingBox;
  const size = bounds.extendSizeWorld.scale(2);
  const center = bounds.centerWorld.clone();
  const floorY = center.y - size.y / 2;
  const material = sourceMesh.material;

  // Tamaño aproximado de cada pedazo
  const fragSize = new Vector3(size.x / 2, size.y / 2, size.z / 2);

  interface Fragment {
    mesh: Mesh;
    velocity: Vector3;
    angularVelocity: Vector3;
  }

  const fragments: Fragment[] = [];

  for (let i = 0; i < fragmentCount; i++) {
    const frag = CreateBox(
      `${sourceMesh.name}-frag-${i}`,
      { width: fragSize.x, height: fragSize.y, depth: fragSize.z },
      scene
    );

    // Desfase inicial dentro del volumen de la caja original
    const offsetX = ((i % 2) - 0.5) * fragSize.x;
    const offsetY = ((Math.floor(i / 2) % 2) - 0.5) * fragSize.y;
    const offsetZ = (Math.floor(i / 4) - 0.5) * fragSize.z;

    frag.position.set(center.x + offsetX, center.y + offsetY, center.z + offsetZ);
    frag.rotation.copyFrom(sourceMesh.rotation);
    frag.material = material;
    frag.isPickable = false;
    frag.checkCollisions = false;

    // Impulso explosivo hacia afuera y arriba
    const velocity = new Vector3(
      (Math.random() - 0.5) * 8,
      2 + Math.random() * 5,
      (Math.random() - 0.5) * 8
    );

    const angularVelocity = new Vector3(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10
    );

    fragments.push({ mesh: frag, velocity, angularVelocity });
  }

  let elapsed = 0;
  const gravity = -22;

  // Loop ligero ligado al render de la escena que anima y limpia todo al terminar
  const observer = scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    elapsed += dt;

    if (elapsed >= durationSeconds) {
      scene.onBeforeRenderObservable.remove(observer);
      fragments.forEach((f) => f.mesh.dispose());
      return;
    }

    const lifeRatio = 1 - elapsed / durationSeconds; // De 1 a 0 para ir achicando los pedazos

    for (const f of fragments) {
      // Aplicar gravedad y movimiento
      f.velocity.y += gravity * dt;
      f.mesh.position.addInPlace(f.velocity.scale(dt));

      // Rotación en el aire
      f.mesh.rotation.addInPlace(f.angularVelocity.scale(dt));

      // Rebote simple contra el nivel del suelo del obstáculo
      const minY = floorY + (fragSize.y * lifeRatio) / 2;
      if (f.mesh.position.y < minY) {
        f.mesh.position.y = minY;
        f.velocity.y = Math.abs(f.velocity.y) * 0.35; // Rebote amortiguado
        f.velocity.x *= 0.7;
        f.velocity.z *= 0.7;
      }

      // Escala decreciente antes de desaparecer
      f.mesh.scaling.setAll(Math.max(0.01, lifeRatio));
    }
  });
};


export const createBreakableBox = (scene: Scene, opts: ObstacleOptions): Mesh => {
  const width = (opts.widthUnits ?? 4) * UNIT;
  const depth = (opts.depthUnits ?? 4) * UNIT;
  const mesh = buildBaseBox(scene, "breakable", opts, new Vector3(width, 4 * UNIT, depth));

  const metadata: BreakableMetadata = {
    kind: "breakable",
    hp: opts.hp ?? 3,
    isDestroyed: false,
    destroy: (physicsAggregate?: PhysicsAggregate) => {
      // 1. Liberamos el cuerpo físico de Havok al instante para no frenar la patineta
      if (physicsAggregate) {
        physicsAggregate.dispose();
      }

      // 2. Generamos los 8 fragmentos cayendo
      shatterMeshIntoFragments(scene, mesh, 8, 1.2);

      // 3. Ocultamos y eliminamos la caja original
      mesh.isPickable = false;
      mesh.checkCollisions = false;
      mesh.setEnabled(false);
      mesh.dispose();
    },
  };

  mesh.metadata = {
    ...mesh.metadata,
    ...metadata,
  };

  return mesh;
};
