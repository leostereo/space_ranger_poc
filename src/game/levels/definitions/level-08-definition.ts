import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { LevelDefinition, ProceduralMapContext, ProceduralMapResult, StaticSolid, EnemySpawn } from "../level-definition";
import { buildLevelUnits } from "../level-builder";
import type { UnitData, ManagedUnitInstance } from "../unit-builder.types";

// 1. Configuración págana/lineal del nivel (Metadata)
export const LEVEL_08_LAYOUT: UnitData[] = [
    { id: "start_zone", kind: "spawn_platform", length: 24, distanceToEnable: 0, enabledDefault: true },
    { id: "empty_tunnel1", kind: "empty_tunnel", length: 60, distanceToEnable: 45, enabledDefault: true }, // 🟢 Conector intermedio
    { id: "bridge_zone_1", kind: "kamikaze_bridge", length: 60, distanceToEnable: 45, enabledDefault: false }
];

// 2. Contenedores de Runtime que usará la Strategy (inicialmente vacíos)
export let level08ManagedUnits: ManagedUnitInstance[] = [];

// 3. Simulación de datos estáticos pura (Igual que hacía LAYOUT en tu Nivel 6)
// Almacena las posiciones de los enemigos para que la FSM/Registro de niveles los lea al inicio
interface Level08PreCalculatedSpawns {
    readonly characterSpawn: Vector3;
    readonly dummyKamikazeDrone: EnemySpawn[];
}

const createPreCalculatedSpawns = (): Level08PreCalculatedSpawns => {
    let currentZ = 0;
    const forwardDirection = new Vector3(0, 0, 1);
    const droneHoverHeight = 4;
    const sentinelsPerBridge = 10;
    const dummyKamikazeDrone: EnemySpawn[] = [];

    // Posición inicial del jugador en el centro de la plataforma de spawn
    const characterSpawn = new Vector3(0, 1, 10);

    LEVEL_08_LAYOUT.forEach((unit) => {

        const actualLength = unit.kind === "empty_tunnel" ? unit.length * 10 : unit.length;
        if (unit.kind === "kamikaze_bridge") {
            for (let i = 0; i < sentinelsPerBridge; i++) {
                const fraction = (i + 1) / (sentinelsPerBridge + 1);
                const lateralPositions = [-3, 0, 3];
                const lateralOffset = lateralPositions[i % lateralPositions.length];

                const enemyZ = currentZ + (actualLength * fraction);
                const position = new Vector3(lateralOffset, droneHoverHeight, enemyZ);
                const centerVolume = new Vector3(lateralOffset, droneHoverHeight + 2, enemyZ);

                dummyKamikazeDrone.push({
                    position,
                    forward: forwardDirection.scale(-1),
                    patrol: {
                        volume: {
                            kind: "box",
                            center: centerVolume,
                            size: new Vector3(8, 4, 10)
                        }
                    }
                });
            }
        }
        currentZ += actualLength;
    });

    return { characterSpawn, dummyKamikazeDrone };
};

// Ejecutamos la simulación estática de datos puros
const PRE_SPAWNS = createPreCalculatedSpawns();

// 4. El constructor procedural del mapa (Invocado por BabylonJS en tiempo de juego)
const buildLevel08Map = ({ scene }: ProceduralMapContext): ProceduralMapResult => {
    // Construye las mallas físicas en runtime
  level08ManagedUnits = buildLevelUnits(scene, LEVEL_08_LAYOUT);

  const solids: StaticSolid[] = [];

  level08ManagedUnits.forEach(unit => {
      unit.meshes.forEach(mesh => {
      if (mesh.name.includes("-tube")) {
          mesh.checkCollisions = false;
        return; 
      }
        solids.push({ mesh: mesh, shape: "box" });
    });
  });

  const groundMesh = level08ManagedUnits[0]?.meshes[0];
  if (!groundMesh) {
    throw new Error("[Level 08] Error fatal: No se pudo determinar la malla de suelo base.");
  }

    // 🟢 RETORNO REFACTOREADO DINÁMICAMENTE:
  return { 
    ground: groundMesh, 
    groundShape: "mesh", 
      solids,
      managedUnits: level08ManagedUnits // 👈 Lo metemos de forma nativa en el mapa cargado
  };
};

// 5. Definición final limpia y apta para tu Registro de Niveles
export const level08Definition: LevelDefinition = {
    id: "level-08",
    order: 8,
    brief: "Prueba simple de optimización por proximidad.",
    skybox: { basePath: "images/skybox/space1/space" },
    maps: [{ kind: "procedural", build: buildLevel08Map }],
    spawns: {
        character: PRE_SPAWNS.characterSpawn,
        enemies: {
            dummyTarget: [],
            staticDrone: [],
            dummyKamikazeDrone: PRE_SPAWNS.dummyKamikazeDrone, // Datos estáticos puros y listos
        },
        items: [],
        other: [],
    },
    waves: [],
};
