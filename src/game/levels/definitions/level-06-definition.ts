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

// =====================================================================================
// Nivel 6: recorrido lineal (plano / puente / túnel) para probar el hoverboard y el jetpack.
//
//  1 plano de salida             10 túnel recto con obstáculos
//  2 puente con sentinels        11 corte largo, cae mucho
//  3 puente libre                12 túnel con curvas, subidas y bajadas
//  4 puente cortado (salto)      13 corte largo, sube
//  5 puente libre                14 puente libre
//  6 plano: estáticos+cobertura  15 puente con sentinels
//  7 túnel con curvas            16 puente libre
//  8 corte del túnel (salto)     --- repetición ---
//  9 túnel recto con dummies     caída grande (solo con board) -> tramos 7 a 13 otra vez, más abajo
//                                subida grande (solo con jetpack) -> tramos 14 a 16 otra vez, más arriba
//                                17 plano de llegada
// =====================================================================================

// --- Medidas base ---
const PLAYER_HEIGHT = 0.8; // espejo de config.player.height: reemplazar por el import real
/** Caja unitaria: mitad del alto del Character = cápsula del Character agachado. */
const UNIT = PLAYER_HEIGHT / 2;
const JUMP_OBSTACLE_UNITS = 3; // 1,5 Characters de alto (antes 2 = 1 Character): se salta
const DODGE_OBSTACLE_UNITS = 4; // alto de 2 Characters: se esquiva
const COVER_UNITS = 3; // cobertura: 1,5 Characters de alto, el Character de pie queda tapado

// --- Aspecto ---
const SOLID_GLOW = 0.25; // fracción del color que se emite
const SOLID_SPECULAR = new Color3(0.1, 0.1, 0.1);
const TRACK_COLOR = Color3.FromHexString("#2a7fd6");
const TUBE_COLOR = Color3.FromHexString("#0a7fa8");
const TUBE_ALPHA = 0.2; // translúcido: se ve el camino por dentro
const BRIDGE_COLOR = Color3.FromHexString("#d9822b");
const BREAKABLE_COLOR = Color3.FromHexString("#c0392b"); // rojo: se podrá destruir
const FALLING_COLOR = Color3.FromHexString("#f1c40f"); // amarillo: caerá
const FLAT_COLOR = Color3.FromHexString("#5a6270");
const JUMP_COLOR = Color3.FromHexString("#27ae60"); // verde: se salta
const DODGE_COLOR = Color3.FromHexString("#8e44ad"); // violeta: se esquiva
const COVER_COLOR = Color3.FromHexString("#7f8c8d");

type BlockColor = "flat" | "jump" | "dodge" | "cover";
const BLOCK_COLORS: Record<BlockColor, Color3> = {
  flat: FLAT_COLOR,
  jump: JUMP_COLOR,
  dodge: DODGE_COLOR,
  cover: COVER_COLOR,
};

const createSolidMaterial = (scene: Scene, name: string, color: Color3): StandardMaterial => {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(SOLID_GLOW);
  material.specularColor = SOLID_SPECULAR;
  return material;
};

// --- Túnel ---
/**
 * Escala del ancho del túnel respecto del diseño base (radio 8, piso de ~13).
 * 1 = base, 1.5 = 50% más ancho. El alto escala igual para mantener la proporción.
 */
const TUBE_WIDTH_SCALE = 1.5;
const TUBE_RADIUS = 8 * TUBE_WIDTH_SCALE;
const TUBE_AXIS_OFFSET_Y = 4.8 * TUBE_WIDTH_SCALE; // el eje del tubo queda sobre el camino (misma proporción que antes)
const TUBE_TESSELLATION = 20;
const TUBE_PATH_STEP = 2; // el tubo usa la mitad de los puntos del camino (menos triángulos)
const TUBE_POINTS_PER_SEGMENT = 32;
const TRACK_WALL_OVERLAP = 0.15;
const TRACK_HALF_WIDTH = Math.sqrt(TUBE_RADIUS ** 2 - TUBE_AXIS_OFFSET_Y ** 2) + TRACK_WALL_OVERLAP;
const TRACK_WIDTH = TRACK_HALF_WIDTH * 2;
const TRACK_THICKNESS = 0.4;
const MIN_POINT_DISTANCE = 1e-3;
const HEADING_SPAN = 8; // puntos hacia atrás para estimar la dirección de salida de una curva

// --- Obstáculos dentro del túnel: se dimensionan a partir del ancho del piso ---
/** Ancho (en unidades) de la barra de salto: casi todo el piso, con una luz de 0.4 a cada lado. */
const JUMP_BAR_WIDTH_UNITS = Math.floor((TRACK_WIDTH - 0.8) / UNIT);
/** Fracción del ancho del piso que cubre una pared de esquivar; el resto es el hueco. */
const DODGE_WALL_COVER = 0.6;
/** Posición lateral de dummies y pilares, como fracción de la mitad del ancho del piso. */
const DUMMY_LATERAL = 0.3 * TRACK_HALF_WIDTH;
const PILLAR_LATERAL = 0.4 * TRACK_HALF_WIDTH;

// --- Obstáculos del túnel recto: las posiciones base se multiplican por esta escala (distancia entre ellos x10) ---
const OBSTACLE_SPACING_SCALE = 10;
const OBSTACLE_TUBE_BASE_LENGTH = 100;
const obstacleAt = (baseForward: number): number => baseForward * OBSTACLE_SPACING_SCALE;

// --- Dummy targets del túnel recto ---
const DUMMY_COUNT = 6;
const DUMMY_SPACING = 20; // distancia entre dummies (antes 10)
const DUMMY_TUBE_LENGTH = DUMMY_SPACING * (DUMMY_COUNT + 1);

// --- Puente de tablones ---
const BRIDGE_HALF_WIDTH = 5;
const BRIDGE_THICKNESS = 0.4;
const BRIDGE_SEGMENT_LENGTH = 3;
const BRIDGE_RAIL_HEIGHT = 1.5;
const BRIDGE_RAIL_THICKNESS = 0.3;
const BRIDGE_POINT_SPACING = 0.5;

// --- Planos (salida, llegada, zona con cobertura) ---
const FLAT_THICKNESS = 0.4;
const FLAT_WIDTH = 30;

// --- Interrupciones: distancia de avance y diferencia de altura. TODAS son para ajustar jugando. ---
/** Corte del puente que se salva a pie (reducido a la mitad: era 8). */
const BRIDGE_JUMP_GAP_DISTANCE = 4;
const BRIDGE_JUMP_GAP = { distance: BRIDGE_JUMP_GAP_DISTANCE, dy: 0 };
const TUBE_JUMP_GAP = { distance: 12, dy: 0 };
/**
 * Las separaciones largas entre túneles y puentes se multiplican por esta escala (solo la distancia
 * de avance; la diferencia de altura no cambia). El salto a pie del túnel y el del puente no se escalan.
 */
const LONG_GAP_DISTANCE_SCALE = 10;
const longGap = (distance: number, dy: number): { distance: number; dy: number } => ({
  distance: distance * LONG_GAP_DISTANCE_SCALE,
  dy,
});
const TUBE_DROP_GAP = longGap(20, -10);
const TUBE_RISE_GAP = longGap(16, 4);
/** Antes de repetir los túneles: solo se baja cayendo con el board. */
const REPEAT_DROP_GAP = longGap(20, -25);
/** Antes de repetir los puentes: solo se llega con jetpack. */
const JETPACK_RISE_GAP = longGap(14, 25);

/**
 * Curvas del túnel, en coordenadas locales [avance, lateral (+ = derecha), altura].
 * Separación de 28 entre puntos y lateral máximo de ±6/7: el radio de giro sale
 * ~2-3 veces más abierto que el del diseño anterior (20 de separación, lateral de 8 a 14).
 * Empiezan y terminan en recta para que los tramos encadenen sin quiebres.
 */
type Control = readonly [number, number, number];
const CURVES_A: readonly Control[] = [
  [0, 0, 0], [12, 0, 0], [40, 6, 3], [68, -6, -2], [96, 7, 4], [124, -4, -3], [152, 0, 0], [164, 0, 0],
];
const CURVES_B: readonly Control[] = [
  [0, 0, 0], [12, 0, 0], [40, -6, -3], [68, 6, -5], [96, -6, -2], [124, 5, -6], [152, 0, -4], [164, 0, -4],
];
const CURVES_C: readonly Control[] = [
  [0, 0, 0], [12, 0, 0], [40, 6, 4], [68, -7, 6], [96, 7, 3], [124, -5, 7], [152, 0, 5], [164, 0, 5],
];
const straightControls = (length: number): readonly Control[] => [
  [0, 0, 0],
  [length / 3, 0, 0],
  [(2 * length) / 3, 0, 0],
  [length, 0, 0],
];

// --- Reglas ---
const SPAWN_HEIGHT_MARGIN = 1; // el personaje aparece sobre el plano y cae
const FALL_MARGIN = 15; // por debajo del punto más bajo del recorrido se da por caído
const SENTINEL_PATROL_RADIUS = 7;
const SENTINELS_PER_BRIDGE = 10;

// =====================================================================================
// Layout: datos puros (sin escena). Se calcula una vez; el mapa y los spawns salen de acá.
// =====================================================================================

interface Frame {
  readonly origin: Vector3;
  /** Giro sobre Y: 0 mira hacia +Z. */
  readonly heading: number;
}

interface Gap {
  readonly distance: number;
  readonly dy: number;
}

const forwardOf = (heading: number): Vector3 => new Vector3(Math.sin(heading), 0, Math.cos(heading));
const rightOf = (heading: number): Vector3 => new Vector3(Math.cos(heading), 0, -Math.sin(heading));

/** Punto en coordenadas locales de un tramo: avance, lateral (+ = derecha) y altura. */
const localPoint = (frame: Frame, forward: number, lateral: number, up = 0): Vector3 =>
  frame.origin
    .add(forwardOf(frame.heading).scale(forward))
    .add(rightOf(frame.heading).scale(lateral))
    .add(new Vector3(0, up, 0));

/** Quita puntos consecutivos repetidos: filas iguales generarían triángulos degenerados. */
const removeDuplicates = (points: Vector3[]): Vector3[] =>
  points.filter((point, index) => index === 0 || Vector3.Distance(point, points[index - 1]) > MIN_POINT_DISTANCE);

type PlankMode = "none" | "breakable" | "falling";

interface BlockPiece {
  readonly name: string;
  readonly center: Vector3;
  /** Ancho (X local), alto, largo (Z local). */
  readonly size: Vector3;
  readonly heading: number;
  readonly color: BlockColor;
}
interface BridgePiece {
  readonly name: string;
  readonly points: Vector3[];
  readonly plankMode: PlankMode;
}
interface TubePiece {
  readonly name: string;
  readonly points: Vector3[];
}

interface Level06Layout {
  readonly blocks: BlockPiece[];
  readonly bridges: BridgePiece[];
  readonly tubes: TubePiece[];
  readonly characterSpawn: Vector3;
  readonly enemies: {
    readonly dummyTarget: EnemySpawn[];
    readonly staticDrone: EnemySpawn[];
    readonly dummyKamikazeDrone: EnemySpawn[];
  };
  readonly goal: Vector3;
  readonly lowestY: number;
}

const createLayout = (): Level06Layout => {
  const blocks: BlockPiece[] = [];
  const bridges: BridgePiece[] = [];
  const tubes: TubePiece[] = [];
  const enemies = {
    dummyTarget: [] as EnemySpawn[],
    staticDrone: [] as EnemySpawn[],
    dummyKamikazeDrone: [] as EnemySpawn[],
  };

  // Cursor: dónde termina el último tramo y hacia dónde mira.
  let position = Vector3.Zero();
  let heading = 0;
  const here = (): Frame => ({ origin: position.clone(), heading });

  const advance = (distance: number, dy = 0): void => {
    position = position.add(forwardOf(heading).scale(distance)).add(new Vector3(0, dy, 0));
  };
  const gap = ({ distance, dy }: Gap): void => advance(distance, dy);

  // --- Piezas ---
  const addBlock = (name: string, frame: Frame, forward: number, lateral: number, size: Vector3, floorUp: number, color: BlockColor): void => {
    blocks.push({ name, center: localPoint(frame, forward, lateral, floorUp + size.y / 2), size, heading: frame.heading, color });
  };

  /** Plano: su cara superior queda a la altura del cursor. */
  const addFlat = (name: string, length: number): Frame => {
    const frame = here();
    addBlock(name, frame, length / 2, 0, new Vector3(FLAT_WIDTH, FLAT_THICKNESS, length), -FLAT_THICKNESS, "flat");
    advance(length);
    return frame;
  };

  const addBridge = (name: string, length: number, plankMode: PlankMode): Frame => {
    const frame = here();
    const count = Math.ceil(length / BRIDGE_POINT_SPACING);
    const points = Array.from({ length: count + 1 }, (_, i) => localPoint(frame, (i / count) * length, 0));
    bridges.push({ name, points, plankMode });
    advance(length);
    return frame;
  };

  const addTube = (name: string, controls: readonly Control[]): Frame => {
    const frame = here();
    const spline = Curve3.CreateCatmullRomSpline(
      controls.map(([forward, lateral, up]) => localPoint(frame, forward, lateral, up)),
      TUBE_POINTS_PER_SEGMENT,
      false,
    ).getPoints();
    const points = removeDuplicates(spline);
    tubes.push({ name, points });
    const last = points[points.length - 1];
    const behind = points[Math.max(points.length - 1 - HEADING_SPAN, 0)];
    heading = Math.atan2(last.x - behind.x, last.z - behind.z);
    position = last.clone();
    return frame;
  };

  // --- Obstáculos hechos de cajas unitarias (medidas en unidades) ---
  const addObstacle = (
    name: string,
    frame: Frame,
    forward: number,
    lateral: number,
    widthUnits: number,
    heightUnits: number,
    depthUnits: number,
    color: BlockColor,
  ): void =>
    addBlock(name, frame, forward, lateral, new Vector3(widthUnits * UNIT, heightUnits * UNIT, depthUnits * UNIT), 0, color);

  const jumpBar = (name: string, frame: Frame, forward: number, lateral = 0, widthUnits = JUMP_BAR_WIDTH_UNITS): void =>
    addObstacle(name, frame, forward, lateral, widthUnits, JUMP_OBSTACLE_UNITS, 2, "jump");
  const dodgePillar = (name: string, frame: Frame, forward: number, lateral: number): void =>
    addObstacle(name, frame, forward, lateral, 4, DODGE_OBSTACLE_UNITS, 4, "dodge");
  /** Pared de 2 Characters de alto pegada a un borde del piso; el hueco queda del lado opuesto a `side`. */
  const dodgeWall = (name: string, frame: Frame, forward: number, side: -1 | 1): void => {
    const widthUnits = Math.round((TRACK_WIDTH * DODGE_WALL_COVER) / UNIT);
    const wallWidth = widthUnits * UNIT;
    addObstacle(name, frame, forward, side * (TRACK_HALF_WIDTH - wallWidth / 2), widthUnits, DODGE_OBSTACLE_UNITS, 2, "dodge");
  };
  const coverBox = (name: string, frame: Frame, forward: number, lateral: number, widthUnits: number, depthUnits: number): void =>
    addObstacle(name, frame, forward, lateral, widthUnits, COVER_UNITS, depthUnits, "cover");

  // --- Enemigos ---
  const dummyAt = (frame: Frame, forward: number, lateral: number): void => {
    enemies.dummyTarget.push({ position: localPoint(frame, forward, lateral) });
  };
  const staticDroneAt = (frame: Frame, forward: number, lateral: number, fireDelaySeconds: number): void => {
    enemies.staticDrone.push({
      position: localPoint(frame, forward, lateral),
      forward: forwardOf(frame.heading).scale(-1), // mirando hacia quien viene
      fireDelaySeconds,
    });
  };

  /** Dummy Kamikaze que patrulla un volumen en caja sobre el puente antes de atacar. */
  const kamikazeAt = (frame: Frame, forward: number, lateralOffset: number): void => {
    // El punto de spawn se desfasa lateralmente para que no arranquen todos en fila
    const point = localPoint(frame, forward, lateralOffset);

    // Elevamos el centro del volumen de patrulla en Y para que la caja no interséquela con el suelo
    // DRONE_HOVER_HEIGHT suele ser ~4. Con un size.y de 4, el piso de la caja queda 2 metros arriba del puente.
    const flightCenter = point.add(new Vector3(0, DRONE_HOVER_HEIGHT + 2, 0));

    enemies.dummyKamikazeDrone.push({
      position: point.add(new Vector3(0, DRONE_HOVER_HEIGHT, 0)), // Spawnearlos ya flotando
      forward: forwardOf(frame.heading).scale(-1),
      patrol: {
        volume: {
          kind: "box",
          center: flightCenter,
          size: new Vector3(8, 4, 10) // Ajustado: más estrecho y alto para evitar colisiones con el piso
        },
      },
    });
  };

  const guardedBridge = (name: string, length: number): void => {
    const frame = addBridge(name, length, "none");
    for (let i = 0; i < SENTINELS_PER_BRIDGE; i += 1) {
      const fraction = (i + 1) / (SENTINELS_PER_BRIDGE + 1);

      // Alterna posiciones laterales (-3: Izquierda, 0: Centro, 3: Derecha) para espaciarlos en 3D
      const lateralPositions = [-3, 0, 3];
      const lateralOffset = lateralPositions[i % lateralPositions.length];

      kamikazeAt(frame, length * fraction, lateralOffset);
    }
  };

  // --- Secciones repetibles. `suffix` mantiene únicos los nombres de las mallas. ---

  /** Tramos 7 a 13: curvas, corte de salto, dummies, curvas, obstáculos, caída, curvas y `exitGap`. */
  const tubeSection = (suffix: string, exitGap: Gap): void => {
    addTube(`level06-tube-curves-a${suffix}`, CURVES_A);
    gap(TUBE_JUMP_GAP);

    const dummiesFrame = addTube(`level06-tube-dummies${suffix}`, straightControls(DUMMY_TUBE_LENGTH));
    for (let i = 0; i < DUMMY_COUNT; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      dummyAt(dummiesFrame, DUMMY_SPACING * (i + 1), side * DUMMY_LATERAL);
    }

    addTube(`level06-tube-curves-b${suffix}`, CURVES_B);

    // Obstáculos: saltar (verde) y esquivar (violeta).
    const obstaclesFrame = addTube(
      `level06-tube-obstacles${suffix}`,
      straightControls(obstacleAt(OBSTACLE_TUBE_BASE_LENGTH)),
    );
    jumpBar(`level06-jump-1${suffix}`, obstaclesFrame, obstacleAt(10));
    jumpBar(`level06-jump-2${suffix}`, obstaclesFrame, obstacleAt(20));
    jumpBar(`level06-jump-3${suffix}`, obstaclesFrame, obstacleAt(24));
    dodgePillar(`level06-pillar-1${suffix}`, obstaclesFrame, obstacleAt(38), -PILLAR_LATERAL);
    dodgePillar(`level06-pillar-2${suffix}`, obstaclesFrame, obstacleAt(46), PILLAR_LATERAL);
    dodgePillar(`level06-pillar-3${suffix}`, obstaclesFrame, obstacleAt(54), 0);
    dodgeWall(`level06-wall-1${suffix}`, obstaclesFrame, obstacleAt(68), -1);
    dodgeWall(`level06-wall-2${suffix}`, obstaclesFrame, obstacleAt(80), 1);

    gap(TUBE_DROP_GAP);
    addTube(`level06-tube-curves-c${suffix}`, CURVES_C);
    gap(exitGap);
  };

  /** Tramos 14 a 16: puente libre, puente con sentinels, puente libre. */
  const bridgeSection = (suffix: string): void => {
    addBridge(`level06-bridge-free-c${suffix}`, 40, "breakable");
    guardedBridge(`level06-bridge-guarded-b${suffix}`, 60);
    addBridge(`level06-bridge-free-d${suffix}`, 40, "falling");
  };

  // ===== Secuencia =====
  // 1 - Plano de salida
  const startFrame = addFlat("level06-start", 24);
  const characterSpawn = localPoint(startFrame, 10, 0, SPAWN_HEIGHT_MARGIN);

  // 2 - Puente custodiado, 3 - puente libre
  guardedBridge("level06-bridge-guarded-a", 60);
  addBridge("level06-bridge-free-a", 40, "breakable");

  // 4 - Puente interrumpido para probar el salto
  addBridge("level06-bridge-jump-1", 30, "none");
  gap(BRIDGE_JUMP_GAP);
  addBridge("level06-bridge-jump-2", 30, "none");

  // 5 - Puente libre
  addBridge("level06-bridge-free-b", 40, "falling");

  // 6 - Plano con drones estáticos y cajas para cubrirse
  const coverFrame = addFlat("level06-cover-area", 50);
  coverBox("level06-cover-1", coverFrame, 12, -8, 8, 3);
  coverBox("level06-cover-2", coverFrame, 12, 8, 8, 3);
  coverBox("level06-cover-3", coverFrame, 22, 0, 12, 3);
  coverBox("level06-cover-4", coverFrame, 32, -9, 6, 4);
  coverBox("level06-cover-5", coverFrame, 32, 9, 6, 4);
  staticDroneAt(coverFrame, 44, -10, 0);
  staticDroneAt(coverFrame, 44, -3.5, 1);
  staticDroneAt(coverFrame, 44, 3.5, 2);
  staticDroneAt(coverFrame, 44, 10, 3);

  // 7 a 13 - Túneles; 14 a 16 - puentes
  tubeSection("", TUBE_RISE_GAP);
  bridgeSection("");

  // Repetición: se baja cayendo con el board a los túneles...
  gap(REPEAT_DROP_GAP);
  tubeSection("-2", JETPACK_RISE_GAP);
  // ...y se sube con jetpack a los puentes.
  bridgeSection("-2");

  // 17 - Plano de llegada
  const endFrame = addFlat("level06-end", 24);
  const goal = localPoint(endFrame, 12, 0);

  // Punto más bajo de todo el recorrido (para el piso de caída).
  const allY = [
    ...tubes.flatMap((tube) => tube.points.map((point) => point.y)),
    ...bridges.flatMap((bridge) => bridge.points.map((point) => point.y)),
    ...blocks.map((block) => block.center.y - block.size.y / 2),
  ];
  const lowestY = allY.reduce((lowest, y) => Math.min(lowest, y), Infinity);

  return { blocks, bridges, tubes, characterSpawn, enemies, goal, lowestY };
};

const LAYOUT = createLayout();

/** Meta: el centro del plano de llegada. */
export const LEVEL_06_GOALS: readonly Vector3[] = [LAYOUT.goal];
/** Altura por debajo de la cual el Character se considera caído. */
export const LEVEL_06_FALL_Y: number = LAYOUT.lowestY - FALL_MARGIN;

// =====================================================================================
// Mapa: arma las mallas a partir del layout.
// =====================================================================================

const planksClassifier =
  (mode: PlankMode) =>
    (index: number): SolidKind | undefined =>
      mode !== "none" && index % 12 === 6 ? mode : undefined;

const buildLevel06Map = ({ scene }: ProceduralMapContext): ProceduralMapResult => {
  const solids: StaticSolid[] = [];

  // Pisos de los túneles: un solo camino continuo (malla) que hace de `ground`.
  const trackMaterial = createSolidMaterial(scene, "level06-track-material", TRACK_COLOR);
  trackMaterial.backFaceCulling = false; // si alguna cara quedara invertida, no desaparece
  trackMaterial.twoSidedLighting = true;
  const floors = LAYOUT.tubes.map((tube) => {
    const floor = createTrackMesh(scene, `${tube.name}-track`, tube.points, {
      halfWidth: TRACK_HALF_WIDTH,
      thickness: TRACK_THICKNESS,
    });
    floor.material = trackMaterial;
    return floor;
  });
  const ground = Mesh.MergeMeshes(floors, true, true);
  if (!ground) {
    throw new Error("level-06: no se pudo unir los pisos de los túneles");
  }
  ground.name = "level06-track";
  ground.material = trackMaterial;

  // Túneles: envuelven el camino; el camino es su piso.
  for (const tube of LAYOUT.tubes) {
    const tubePath = tube.points
      .filter((_, index) => index % TUBE_PATH_STEP === 0 || index === tube.points.length - 1)
      .map((point) => new Vector3(point.x, point.y + TUBE_AXIS_OFFSET_Y, point.z));
    const mesh = CreateTube(
      tube.name,
      {
        path: tubePath,
        radius: TUBE_RADIUS,
        tessellation: TUBE_TESSELLATION,
        sideOrientation: Mesh.DOUBLESIDE, // el personaje queda del lado interno
        updatable: false,
      },
      scene,
    );
    const material = createSolidMaterial(scene, `${tube.name}-material`, TUBE_COLOR);
    material.alpha = TUBE_ALPHA;
    material.backFaceCulling = false;
    mesh.material = material;
    solids.push({ mesh, shape: "mesh" });
  }

  // Puentes de tablones.
  for (const bridge of LAYOUT.bridges) {
    const boxPath = createBoxPath(
      scene,
      bridge.name,
      bridge.points,
      {
        normal: createSolidMaterial(scene, `${bridge.name}-box-material`, BRIDGE_COLOR),
        breakable: createSolidMaterial(scene, `${bridge.name}-breakable-material`, BREAKABLE_COLOR),
        falling: createSolidMaterial(scene, `${bridge.name}-falling-material`, FALLING_COLOR),
      },
      {
        halfWidth: BRIDGE_HALF_WIDTH,
        thickness: BRIDGE_THICKNESS,
        segmentLength: BRIDGE_SEGMENT_LENGTH,
        railHeight: BRIDGE_RAIL_HEIGHT,
        railThickness: BRIDGE_RAIL_THICKNESS,
        classify: planksClassifier(bridge.plankMode),
      },
    );
    solids.push(
      ...boxPath.planks.map((plank): StaticSolid => ({
        mesh: plank.mesh,
        shape: "box",
        ...(plank.kind ? { kind: plank.kind } : {}),
      })),
      ...boxPath.rails.map((mesh): StaticSolid => ({ mesh, shape: "box" })),
    );
  }

  // Planos y obstáculos de cajas.
  for (const block of LAYOUT.blocks) {
    const mesh = CreateBox(block.name, { width: block.size.x, height: block.size.y, depth: block.size.z }, scene);
    mesh.position.copyFrom(block.center);
    mesh.rotation.y = block.heading;
    mesh.material = createSolidMaterial(scene, `${block.name}-material`, BLOCK_COLORS[block.color]);
    solids.push({ mesh, shape: "box" });
  }

  // Los materiales se liberan con las mallas: el LevelScope las libera con disposeMaterialAndTextures.
  return { ground, groundShape: "mesh", solids };
};

export const level06Definition: LevelDefinition = {
  id: "level-06",
  order: 6,
  brief: "Reach the end of the course.",
  skybox: { basePath: "images/skybox/space" },
  maps: [{ kind: "procedural", build: buildLevel06Map }],
  spawns: {
    character: LAYOUT.characterSpawn,
    enemies: {
      dummyTarget: LAYOUT.enemies.dummyTarget,
      staticDrone: LAYOUT.enemies.staticDrone,
      dummyKamikazeDrone: LAYOUT.enemies.dummyKamikazeDrone,
    },
    items: [],
    other: [],
  },
  waves: [],
};