// src/game/levels/procedural/obstacle-builder.ts
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { Scene } from "@babylonjs/core/scene";
import type { AssetRegistry } from "../../assets/asset-registry"; // Ajustar ruta relativa si hace falta

export const PLAYER_HEIGHT = 0.8;
export const UNIT = PLAYER_HEIGHT / 2;
export type ObstacleKind = "unit" | "jump" | "pillar" | "wall" | "breakable" | "cover";

// 🟢 Paleta unificada: gris oscuro para todos los sólidos y tono más claro para destruibles
const SOLID_OBSTACLE_COLOR = Color3.FromHexString("#1e3a8a");     // Azul marino profundo (sólidos)
const BREAKABLE_OBSTACLE_COLOR = Color3.FromHexString("#3b82f6"); // Azul acero brillante (destruible)
const SOLID_EDGE_COLOR = new Color4(0.22, 0.74, 0.97, 0.9);     // Celeste eléctrico (#38bdf8)
const BREAKABLE_EDGE_COLOR = new Color4(0.93, 0.96, 1.0, 1.0);  // Blanco hielo brillante
const GRAY_SOLID_COLOR = Color3.FromHexString("#334155");     // Gris grafito medio
const GRAY_BREAKABLE_COLOR = Color3.FromHexString("#94a3b8"); // Gris acero claro
const GRAY_EDGE_COLOR = new Color4(0.8, 0.85, 0.9, 0.85);     // Borde gris claro


export interface TunnelMatrixWallOptions {
  readonly name: string;
  readonly position: Vector3;    // Centro del suelo en ese punto de la curva
  readonly headingY?: number;    // Rotación tangencial del túnel
  readonly totalWidth: number;   // Ancho total a cubrir (ej: TRACK_WIDTH + margen)
  readonly totalHeight: number;  // Alto total desde el piso hasta el techo del tubo
  readonly depth?: number;       // Espesor del muro en Z (por defecto 2m)
  readonly mode: "gap" | "breakable"; // Variante 1: hueco libre | Variante 2: bloque destruible
  readonly hitsRequired?: number;
  readonly targetSlotIndex?: number;
  readonly theme?: "blue" | "gray";
}

const attachBreakableBehavior = (
  scene: Scene,
  mesh: Mesh,
  hitsRequired = 3
): void => {
  const metadata: BreakableMetadata = {
    kind: "breakable",
    hitsRemaining: Math.max(1, hitsRequired),
    isDestroyed: false,
    destroy: (physicsAggregate?: PhysicsAggregate) => {
      if (physicsAggregate) {
        physicsAggregate.dispose();
      }
      shatterMeshIntoFragments(scene, mesh, 8, 1.2);
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

export const createTunnelMatrixWall = (
  scene: Scene,
  registry: AssetRegistry,
  opts: TunnelMatrixWallOptions
): Mesh[] => {
  const meshes: Mesh[] = [];
  const cols = 3;
  const rows = 3;

  const cellWidth = opts.totalWidth / cols;
  const cellHeight = opts.totalHeight / rows;
  
  // 🟢 El bloque destruible conserva la profundidad base (ej: 2m)
  // y los bloques sólidos de la pared tienen el triple de profundidad (ej: 6m)
  const breakableDepth = opts.depth ?? 2.0;
  const solidWallDepth = breakableDepth * 3;
  const headingY = opts.headingY ?? 0;

  const rightVector = new Vector3(Math.cos(headingY), 0, -Math.sin(headingY)).normalize();
  const targetSlotIndex = opts.targetSlotIndex ?? Math.floor(Math.random() * (cols * rows));

  for (let row = 0; row < rows; row++) {
    const rowFromBottom = rows - 1 - row;
    const baseFloorY = opts.position.y + rowFromBottom * cellHeight;

    for (let col = 0; col < cols; col++) {
      const slotIndex = row * cols + col;
      const lateralOffset = (col - 1) * cellWidth;

      const cellFloorPos = opts.position
        .add(rightVector.scale(lateralOffset))
        .add(new Vector3(0, baseFloorY - opts.position.y, 0));

      const cellName = `${opts.name}-cell-${slotIndex + 1}`;

      if (slotIndex === targetSlotIndex) {
        if (opts.mode === "gap") {
          continue;
        } else {
          // Bloque destruible con profundidad 1x
          const breakableMesh = buildBaseBox(
            scene,
            registry,
            "breakable",
            { name: cellName, position: cellFloorPos, headingY },
            new Vector3(cellWidth, cellHeight, breakableDepth)
          );

          attachBreakableBehavior(scene, breakableMesh, opts.hitsRequired ?? 3);
          meshes.push(breakableMesh);
          continue;
        }
      }

      // Pared sólida con profundidad 3x
      const solidWallCell = buildBaseBox(
        scene,
        registry,
        "wall",
        { name: cellName, position: cellFloorPos, headingY },
        new Vector3(cellWidth, cellHeight, solidWallDepth)
      );
      meshes.push(solidWallCell);
    }
  }

  return meshes;
};

export interface ObstacleOptions {
  readonly name: string;
  readonly position: Vector3;
  readonly headingY?: number;
  readonly widthUnits?: number;
  readonly depthUnits?: number;
  readonly hitsRequired?: number;
  readonly isBreakable?: boolean; // Permite que cualquier forma sea destruible
  readonly vertical?: boolean;    // Permite colocar el bloque "parado"
}

export interface BreakableMetadata {
  readonly kind: "breakable";
  /** Disparos restantes antes de destruirse */
  hitsRemaining: number;
  isDestroyed: boolean;
  destroy: (physicsAggregate?: PhysicsAggregate) => void;
}

const buildBaseBox = (
  scene: Scene,
  registry: AssetRegistry,
  kind: ObstacleKind,
  opts: ObstacleOptions,
  size: Vector3
): Mesh => {
  const box = CreateBox(opts.name, { width: size.x, height: size.y, depth: size.z }, scene);
  box.position.set(opts.position.x, opts.position.y + size.y / 2, opts.position.z);
  box.rotation.y = opts.headingY ?? 0;

  // Consumo directo y tipado desde AssetRegistry
  box.material = registry.getMaterial(
    kind === "breakable" ? "breakable-obstacle" : "solid-obstacle"
  );

  box.checkCollisions = true;
  box.isPickable = true;

  box.enableEdgesRendering();
  box.edgesWidth = kind === "breakable" ? 3.5 : 2.5;
  box.edgesColor = kind === "breakable" ? BREAKABLE_EDGE_COLOR : SOLID_EDGE_COLOR;

  return box;
};

export const createUnitBox = (scene: Scene, registry: AssetRegistry, opts: ObstacleOptions): Mesh => {
  return buildBaseBox(scene, registry, "unit", opts, new Vector3(UNIT, UNIT, UNIT));
};

export const createCoverBox = (scene: Scene, registry: AssetRegistry, opts: ObstacleOptions): Mesh => {
  const width = (opts.widthUnits ?? 8) * UNIT;
  const depth = (opts.depthUnits ?? 3) * UNIT;
  return buildBaseBox(scene, registry, "cover", opts, new Vector3(width, 3 * UNIT, depth));
};

export const createDodgePillar = (scene: Scene, registry: AssetRegistry, opts: ObstacleOptions): Mesh => {
  const width = (opts.widthUnits ?? 4) * UNIT;
  const depth = (opts.depthUnits ?? 4) * UNIT;
  return buildBaseBox(scene, registry, "pillar", opts, new Vector3(width, 4 * UNIT, depth));
};

export const createDodgeWall = (scene: Scene, registry: AssetRegistry, opts: ObstacleOptions): Mesh => {
  const width = (opts.widthUnits ?? 15) * UNIT;
  const depth = (opts.depthUnits ?? 5) * UNIT;
  return buildBaseBox(scene, registry, "wall", opts, new Vector3(width, 4 * UNIT, depth));
};

export const createJumpBar = (
  scene: Scene,
  registry: AssetRegistry,
  opts: ObstacleOptions & { trackWidth: number }
): Mesh => {
  return buildBaseBox(scene, registry, "jump", opts, new Vector3(opts.trackWidth - 1.5, 3 * UNIT, 2));
};

export const createBreakableBox = (scene: Scene, registry: AssetRegistry, opts: ObstacleOptions): Mesh => {
  const width = (opts.widthUnits ?? 4) * UNIT;
  const depth = (opts.depthUnits ?? 4) * UNIT;
  const mesh = buildBaseBox(scene, registry, "breakable", opts, new Vector3(width, 3 * UNIT, depth));

  attachBreakableBehavior(scene, mesh, opts.hitsRequired ?? 3);
  return mesh;
};


/////////

type DebugBlockRole = "low-cover" | "high-platform" | "step-block" | "breakable";


/** Cobertura táctica: horizontal (0.54m alto) o parada/vertical (2.8m alto) */
export const createLowCoverBox = (scene: Scene, registry: AssetRegistry, opts: ObstacleOptions): Mesh => {
  const span = (opts.widthUnits ?? 7) * UNIT;      // 2.8m
  const thickness = 1.35 * UNIT;                   // 0.54m
  const depth = (opts.depthUnits ?? 2) * UNIT;     // 0.8m

  const size = opts.vertical
    ? new Vector3(thickness, span, depth)          // Parado como pilar/muro angosto
    : new Vector3(span, thickness, depth);         // Acostado como parapeto bajo

  const kind: ObstacleKind = opts.isBreakable ? "breakable" : "cover";
  const mesh = buildBaseBox(scene, registry, kind, opts, size);

  if (opts.isBreakable) {
    attachBreakableBehavior(scene, mesh, opts.hitsRequired ?? 3);
  }
  return mesh;
};

/** Plataforma elevada amplia (o muro alto si va parada) */
export const createHighPlatform = (scene: Scene, registry: AssetRegistry, opts: ObstacleOptions): Mesh => {
  const width = (opts.widthUnits ?? 9) * UNIT;     // 3.6m
  const height = 3.5 * UNIT;                       // 1.4m
  const depth = (opts.depthUnits ?? 9) * UNIT;     // 3.6m

  const size = opts.vertical
    ? new Vector3(height, width, depth)            // Parado como monolito alto
    : new Vector3(width, height, depth);

  const kind: ObstacleKind = opts.isBreakable ? "breakable" : "wall";
  const mesh = buildBaseBox(scene, registry, kind, opts, size);

  if (opts.isBreakable) {
    attachBreakableBehavior(scene, mesh, opts.hitsRequired ?? 3);
  }
  return mesh;
};

/** Escalón / bloque medio */
export const createStepBlock = (scene: Scene, registry: AssetRegistry, opts: ObstacleOptions): Mesh => {
  const width = (opts.widthUnits ?? 4) * UNIT;     // 1.6m
  const height = 1.75 * UNIT;                      // 0.70m
  const depth = (opts.depthUnits ?? 4) * UNIT;     // 1.6m

  const size = opts.vertical
    ? new Vector3(height, width, depth)
    : new Vector3(width, height, depth);

  const kind: ObstacleKind = opts.isBreakable ? "breakable" : "cover";
  const mesh = buildBaseBox(scene, registry, kind, opts, size);

  if (opts.isBreakable) {
    attachBreakableBehavior(scene, mesh, opts.hitsRequired ?? 3);
  }
  return mesh;
};