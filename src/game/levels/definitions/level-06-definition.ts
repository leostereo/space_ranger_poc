import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Curve3 } from "@babylonjs/core/Maths/math.path";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";

import type { LevelDefinition, ProceduralMapContext, ProceduralMapResult } from "../level-definition";
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

// --- Tubo: envuelve el camino; el camino es su piso ---
const TUBE_RADIUS = 5;
const TUBE_AXIS_OFFSET_Y = 3; // el eje del tubo queda sobre el camino
const TUBE_TESSELLATION = 16;
const TUBE_PATH_STEP = 2; // el tubo usa la mitad de los puntos del camino (menos triángulos)
const TUBE_ALPHA = 0.15;
const TUBE_COLOR = Color3.FromHexString("#0a7fa8");

// --- Piso: su ancho llega hasta la pared del tubo (y 15 cm adentro, para que no quede ranura) ---
const TRACK_WALL_OVERLAP = 0.15;
const TRACK_HALF_WIDTH = Math.sqrt(TUBE_RADIUS ** 2 - TUBE_AXIS_OFFSET_Y ** 2) + TRACK_WALL_OVERLAP;
const TRACK_THICKNESS = 0.4;
const TRACK_COLOR = Color3.FromHexString("#0099ff"); // azul neón
const TRACK_WIREFRAME = true; // efecto rejilla

// --- Reglas ---
const SPAWN_POINT_INDEX = 8; // unos metros adelante del inicio, para no aparecer sobre el borde del piso
const SPAWN_HEIGHT_MARGIN = 1; // el personaje aparece sobre el camino y cae
const FALL_MARGIN = 15; // por debajo del punto más bajo del camino se da por caído

/** Meta: el último punto del camino. */
export const LEVEL_06_PATH_END: Vector3 = PATH_POINTS[PATH_POINTS.length - 1];
/** Altura por debajo de la cual el Character se considera caído. */
export const LEVEL_06_FALL_Y: number = Math.min(...PATH_POINTS.map((point) => point.y)) - FALL_MARGIN;

/** Construye el mapa del nivel 6: el piso curvo (suelo) y el tubo (sólido), ambos con física de malla. */
const buildLevel06Map = ({ scene }: ProceduralMapContext): ProceduralMapResult => {
  const track = createTrackMesh(scene, "level06-track", PATH_POINTS, {
    halfWidth: TRACK_HALF_WIDTH,
    thickness: TRACK_THICKNESS,
  });
  const trackMaterial = new StandardMaterial("level06-track-material", scene);
  trackMaterial.diffuseColor = Color3.Black();
  trackMaterial.specularColor = Color3.Black();
  trackMaterial.emissiveColor = TRACK_COLOR;
  trackMaterial.wireframe = TRACK_WIREFRAME;
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
  const tubeMaterial = new StandardMaterial("level06-tube-material", scene);
  tubeMaterial.diffuseColor = Color3.Black();
  tubeMaterial.specularColor = Color3.Black();
  tubeMaterial.emissiveColor = TUBE_COLOR;
  tubeMaterial.alpha = TUBE_ALPHA;
  tubeMaterial.backFaceCulling = false;
  tube.material = tubeMaterial;

  // Los materiales se liberan con las mallas: el LevelScope las libera con disposeMaterialAndTextures.
  return { ground: track, groundShape: "mesh", solids: [{ mesh: tube, shape: "mesh" }] };
};

export const level06Definition: LevelDefinition = {
  id: "level-06",
  order: 6,
  brief: "Reach the end of the tube.",
  maps: [{ kind: "procedural", build: buildLevel06Map }],
  spawns: {
    character: PATH_POINTS[SPAWN_POINT_INDEX].add(new Vector3(0, SPAWN_HEIGHT_MARGIN, 0)),
    enemies: {},
    items: [],
    other: [],
  },
  waves: [],
};