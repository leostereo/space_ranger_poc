import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Curve3 } from "@babylonjs/core/Maths/math.path";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { DRONE_HOVER_HEIGHT } from "../../entities/enemies/drone/drone-model";
import type {
  EnemySpawn,
  LevelDefinition,
  ProceduralMapContext,
  ProceduralMapResult,
  SolidKind,
  StaticSolid,
} from "../level-definition";
import { createBoxPath } from "../procedural/box-path-builder";
import { createTrackMesh } from "../procedural/track-builder";

// --- Camino: spline Catmull-Rom por los puntos de control del diseño original ---
const PATH_SCALE_XZ = 0.4;
const PATH_SCALE_Y = 0.25; // subidas y bajadas más suaves para que sean transitables
const PATH_POINTS_PER_SEGMENT = 48; // más puntos = superficie más continua
const MIN_POINT_DISTANCE = 1e-3;

/** Puntos de control (x, y, z) del diseño original, antes de escalar. */
const CONTROL_POINTS: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [15, 5, 50], // giro suave a la derecha y subida
  [-20, -5, 100], // giro fuerte a la izquierda y bajada
  [25, 15, 150], // curva a la derecha y gran subida
  [0, 5, 200], // centrado de nuevo
  [-30, 0, 250], // desvío brusco a la izquierda
  [0, -5, 300], // vuelta al eje
  [0, 0, 350], // punto final
];

/** Quita puntos consecutivos repetidos: filas iguales generarían triángulos degenerados. */
const removeDuplicates = (points: Vector3[]): Vector3[] =>
  points.filter((point, index) => index === 0 || Vector3.Distance(point, points[index - 1]) > MIN_POINT_DISTANCE);

/** Centro de la superficie del camino. */
const PATH_POINTS: Vector3[] = removeDuplicates(
  Curve3.CreateCatmullRomSpline(
    CONTROL_POINTS.map(([x, y, z]) => new Vector3(x * PATH_SCALE_XZ, y * PATH_SCALE_Y, z * PATH_SCALE_XZ)),
    PATH_POINTS_PER_SEGMENT,
    false,
  ).getPoints(),
);

// --- Aspecto: materiales sólidos con luz y un poco de brillo propio para que no queden planos ---
const SOLID_GLOW = 0.25; // fracción del color que se emite
const SOLID_SPECULAR = new Color3(0.1, 0.1, 0.1);
const TRACK_COLOR = Color3.FromHexString("#2a7fd6");
const TUBE_COLOR = Color3.FromHexString("#0a7fa8");
const TUBE_ALPHA = 0.2; // translúcido: se ve el camino por dentro
const BOX_PATH_COLOR = Color3.FromHexString("#d9822b");
const BREAKABLE_COLOR = Color3.FromHexString("#c0392b"); // rojo: se podrá destruir
const FALLING_COLOR = Color3.FromHexString("#f1c40f"); // amarillo: caerá
const HUB_COLOR = Color3.FromHexString("#5a6270");

const createSolidMaterial = (scene: Scene, name: string, color: Color3): StandardMaterial => {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(SOLID_GLOW);
  material.specularColor = SOLID_SPECULAR;
  return material;
};

// --- Tubo: envuelve el camino; el camino es su piso ---
const TUBE_RADIUS = 5;
const TUBE_AXIS_OFFSET_Y = 3; // el eje del tubo queda sobre el camino
const TUBE_TESSELLATION = 16;
const TUBE_PATH_STEP = 2; // el tubo usa la mitad de los puntos del camino (menos triángulos)

// --- Piso: su ancho llega hasta la pared del tubo (y 15 cm adentro, para que no quede ranura) ---
const TRACK_WALL_OVERLAP = 0.15;
const TRACK_HALF_WIDTH = Math.sqrt(TUBE_RADIUS ** 2 - TUBE_AXIS_OFFSET_Y ** 2) + TRACK_WALL_OVERLAP;
const TRACK_THICKNESS = 0.4;

// --- Banco de pruebas: la misma curva armada solo con cajas, al costado del camino con tubo ---
const BOX_PATH_OFFSET_X = -34; // la curva se desvía entre −12 y +10: no se toca con el camino con tubo
const BOX_PATH_HALF_WIDTH = 4;
const BOX_PATH_THICKNESS = 0.4;
const BOX_PATH_SEGMENT_LENGTH = 3;
const BOX_PATH_RAIL_HEIGHT = 1.5;
const BOX_PATH_RAIL_THICKNESS = 0.3;

/** La misma curva, desplazada. */
const BOX_PATH_POINTS: Vector3[] = PATH_POINTS.map((point) => point.add(new Vector3(BOX_PATH_OFFSET_X, 0, 0)));

/** Bloques especiales del camino de tablones (por índice de tablón): luego se podrán destruir o caerán. */
const classifyPlank = (index: number): SolidKind | undefined => {
  if (index % 12 === 6) {
    return "breakable";
  }
  if (index % 12 === 11) {
    return "falling";
  }
  return undefined;
};

// --- Plataforma de salida: de ahí se elige el camino (derecha: con tubo; izquierda: de tablones) ---
const HUB_WIDTH = 50;
const HUB_DEPTH = 16;
const HUB_THICKNESS = 0.4;
const HUB_CENTER_X = BOX_PATH_OFFSET_X / 2; // entre los dos caminos

// --- Enemigos sobre el camino de tablones (por fracción del recorrido: 0 = salida, 1 = meta) ---
const PATH_FRAME_SPAN = 4; // puntos a cada lado para estimar la dirección de avance
const SENTINEL_PATROL_RADIUS = 6;

interface PathFrame {
  readonly point: Vector3;
  /** Dirección de avance (horizontal). */
  readonly forward: Vector3;
  /** Hacia la derecha de quien avanza (horizontal). */
  readonly right: Vector3;
}

const boxPathFrame = (fraction: number): PathFrame => {
  const last = BOX_PATH_POINTS.length - 1;
  const index = Math.round(fraction * last);
  const ahead = BOX_PATH_POINTS[Math.min(index + PATH_FRAME_SPAN, last)];
  const behind = BOX_PATH_POINTS[Math.max(index - PATH_FRAME_SPAN, 0)];
  const forward = new Vector3(ahead.x - behind.x, 0, ahead.z - behind.z).normalize();
  return { point: BOX_PATH_POINTS[index], forward, right: new Vector3(forward.z, 0, -forward.x) };
};

/** Mirando hacia atrás: hacia quien viene por el camino. */
const facingBack = (frame: PathFrame): Vector3 => frame.forward.scale(-1);

const dummyAt = (fraction: number, lateral: number): EnemySpawn => {
  const frame = boxPathFrame(fraction);
  return { position: frame.point.add(frame.right.scale(lateral)) };
};

const staticDroneAt = (fraction: number, lateral: number, fireDelaySeconds: number): EnemySpawn => {
  const frame = boxPathFrame(fraction);
  return { position: frame.point.add(frame.right.scale(lateral)), forward: facingBack(frame), fireDelaySeconds };
};

/** Sentinel que patrulla una esfera a su altura de vuelo, centrada sobre el camino. */
const sentinelAt = (fraction: number, fireDelaySeconds: number): EnemySpawn => {
  const frame = boxPathFrame(fraction);
  const flightCenter = frame.point.add(new Vector3(0, DRONE_HOVER_HEIGHT, 0));
  return {
    position: frame.point,
    forward: facingBack(frame),
    fireDelaySeconds,
    patrol: {
      volume: { kind: "sphere", center: flightCenter, radius: SENTINEL_PATROL_RADIUS },
      plane: { point: flightCenter, normal: Vector3.Up() },
    },
  };
};

// --- Reglas ---
const SPAWN_HEIGHT_MARGIN = 1; // el personaje aparece sobre la plataforma y cae
const FALL_MARGIN = 15; // por debajo del punto más bajo de los caminos se da por caído

/** Metas: el último punto de cada camino. Llegar a cualquiera completa el nivel. */
export const LEVEL_06_GOALS: readonly Vector3[] = [
  PATH_POINTS[PATH_POINTS.length - 1],
  BOX_PATH_POINTS[BOX_PATH_POINTS.length - 1],
];
/** Altura por debajo de la cual el Character se considera caído. */
export const LEVEL_06_FALL_Y: number = Math.min(...PATH_POINTS.map((point) => point.y)) - FALL_MARGIN;

/** Construye el mapa del nivel 6: camino con tubo (malla), camino de tablones (cajas) y plataforma de salida. */
const buildLevel06Map = ({ scene }: ProceduralMapContext): ProceduralMapResult => {
  // Camino curvo continuo.
  const track = createTrackMesh(scene, "level06-track", PATH_POINTS, {
    halfWidth: TRACK_HALF_WIDTH,
    thickness: TRACK_THICKNESS,
  });
  const trackMaterial = createSolidMaterial(scene, "level06-track-material", TRACK_COLOR);
  trackMaterial.backFaceCulling = false; // si alguna cara quedara invertida, no desaparece
  trackMaterial.twoSidedLighting = true;
  track.material = trackMaterial;

  const tubePath = PATH_POINTS.filter((_, index) => index % TUBE_PATH_STEP === 0 || index === PATH_POINTS.length - 1).map(
    (point) => new Vector3(point.x, point.y + TUBE_AXIS_OFFSET_Y, point.z),
  );
  const tube = CreateTube(
    "level06-tube",
    {
      path: tubePath,
      radius: TUBE_RADIUS,
      tessellation: TUBE_TESSELLATION,
      sideOrientation: Mesh.DOUBLESIDE, // el personaje queda del lado interno
      updatable: false,
    },
    scene,
  );
  const tubeMaterial = createSolidMaterial(scene, "level06-tube-material", TUBE_COLOR);
  tubeMaterial.alpha = TUBE_ALPHA;
  tubeMaterial.backFaceCulling = false;
  tube.material = tubeMaterial;

  // Camino de tablones: la misma curva, solo con cajas.
  const boxPath = createBoxPath(
    scene,
    "level06-box-path",
    BOX_PATH_POINTS,
    {
      normal: createSolidMaterial(scene, "level06-box-material", BOX_PATH_COLOR),
      breakable: createSolidMaterial(scene, "level06-breakable-material", BREAKABLE_COLOR),
      falling: createSolidMaterial(scene, "level06-falling-material", FALLING_COLOR),
    },
    {
      halfWidth: BOX_PATH_HALF_WIDTH,
      thickness: BOX_PATH_THICKNESS,
      segmentLength: BOX_PATH_SEGMENT_LENGTH,
      railHeight: BOX_PATH_RAIL_HEIGHT,
      railThickness: BOX_PATH_RAIL_THICKNESS,
      classify: classifyPlank,
    },
  );

  // Plataforma de salida: cara superior en y = 0, pegada al inicio de los dos caminos (z = 0).
  const hub = CreateBox("level06-hub", { width: HUB_WIDTH, height: HUB_THICKNESS, depth: HUB_DEPTH }, scene);
  hub.position.set(HUB_CENTER_X, -HUB_THICKNESS / 2, -HUB_DEPTH / 2);
  hub.material = createSolidMaterial(scene, "level06-hub-material", HUB_COLOR);

  const solids: StaticSolid[] = [
    { mesh: tube, shape: "mesh" },
    { mesh: hub, shape: "box" },
    ...boxPath.planks.map((plank): StaticSolid => ({
      mesh: plank.mesh,
      shape: "box",
      ...(plank.kind ? { kind: plank.kind } : {}),
    })),
    ...boxPath.rails.map((mesh): StaticSolid => ({ mesh, shape: "box" })),
  ];

  // Los materiales se liberan con las mallas: el LevelScope las libera con disposeMaterialAndTextures.
  return { ground: track, groundShape: "mesh", solids };
};

export const level06Definition: LevelDefinition = {
  id: "level-06",
  order: 6,
  brief: "Reach the end of either path.",
  maps: [{ kind: "procedural", build: buildLevel06Map }],
  spawns: {
    character: new Vector3(HUB_CENTER_X, SPAWN_HEIGHT_MARGIN, -HUB_DEPTH / 2),
    enemies: {
      dummyTarget: [dummyAt(0.1, 2), dummyAt(0.2, -2), dummyAt(0.3, 2)],
      staticDrone: [staticDroneAt(0.38, 0, 0), staticDroneAt(0.62, 1.5, 1), staticDroneAt(0.85, -1.5, 2)],
      sentinelDrone: [sentinelAt(0.48, 0.5), sentinelAt(0.74, 1.5)],
    },
    items: [],
    other: [],
  },
  waves: [],
};