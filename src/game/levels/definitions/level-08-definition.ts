import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { LevelDefinition, ProceduralMapContext, ProceduralMapResult, StaticSolid, EnemySpawn } from "../level-definition";
import { buildLevelUnits } from "../level-builder";
import type { UnitData, ManagedUnitInstance } from "../unit-builder.types";
import { calculateParametricEndPosition } from "../builders/parametric-path.builder";

// 1. Configuración págana/lineal del nivel (Metadata)
export const LEVEL_08_LAYOUT: UnitData[] = [
    {
        id: "start_zone",
        kind: "spawn_platform",
        length: 24,
        distanceToEnable: 0,
        enabledDefault: true
    },
    {
        id: "pp_test_recto",
        kind: "parametric_path",
        length: 350, // Largo de referencia
        distanceToEnable: 360,
        enabledDefault: false,
        parametricConfig: {
            straightSegments: 50,   // 4 tramos de 25m = 100 metros totalmente rectos
            upSegments: 5,         // Sin subidas
            downSegments: 30,       // Sin bajadas
            curveRightSegments: 0, // Sin curvas a la derecha
            curveLeftSegments: 0,  // Sin curvas a la izquierda
            includeTunnel: true,  // Sin carcasa de tubo para tener vista despejada

            // 1 obstáculo de cada tipo para inspección visual:
            jumpCount: 0,          // 1 valla de salto (verde)
            dodgeCount: 0,         // 1 pilar central (violeta) + 1 pared lateral (violeta/gris)
            breakableCount: 0,      // 1 bloque destruible (rojo)
            unitBoxCount: 0,
            matrixWallGapCount: 2,        // 1 pared con hueco libre
            matrixWallBreakableCount: 3   // 1 pared con celda destruible

        }
    },
    {
        id: "bridge_zone_1",
        kind: "kamikaze_bridge",
        length: 160,
        distanceToEnable: 180,
        enabledDefault: false
    },
    {
        id: "speed_tunnel_procedural",
        kind: "parametric_path",
        length: 50, // Largo total base estimado
        distanceToEnable: 60,
        enabledDefault: false,
        parametricConfig: {
            straightSegments: 4,
            upSegments: 2,
            downSegments: 2,
            curveRightSegments: 2,
            curveLeftSegments: 2,
            // Obstáculos sembrados proceduralmente bajo reglas de seguridad
            dodgeCount: 6,
            jumpCount: 3,
            breakableCount: 5,
            unitBoxCount: 1,
            includeTunnel: false

        }
    },

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
    let currentPos = Vector3.Zero(); // 🟢 Ahora rastreamos X, Y y Z completos
    const forwardDirection = new Vector3(0, 0, 1);
    const droneHoverHeight = 4;
    const sentinelsPerBridge = 10;
    const dummyKamikazeDrone: EnemySpawn[] = [];

    const characterSpawn = new Vector3(0, 1, 10);

    LEVEL_08_LAYOUT.forEach((unit) => {

        if (unit.kind === "parametric_path" && unit.parametricConfig) {
            currentPos = calculateParametricEndPosition(currentPos, unit.length, unit.parametricConfig);
            return;
        }

        const actualLength = unit.kind === "empty_tunnel" ? unit.length * 10 : unit.length;

        if (unit.kind === "kamikaze_bridge") {
            for (let i = 0; i < sentinelsPerBridge; i++) {
                const fraction = (i + 1) / (sentinelsPerBridge + 1);
                const lateralPositions = [-3, 0, 3];
                const lateralOffset = lateralPositions[i % lateralPositions.length];

                // 🟢 Sumamos el desfase sobre el currentPos real (incluyendo X e Y heredados)
                const spawnPos = currentPos.add(new Vector3(
                    lateralOffset,
                    droneHoverHeight,
                    actualLength * fraction
                ));

                const centerVolume = spawnPos.add(new Vector3(0, 2, 0));

                dummyKamikazeDrone.push({
                    position: spawnPos,
                    forward: forwardDirection.scale(-1),
                    patrol: {
                        volume: {
                            kind: "box",
                            center: centerVolume,
                            size: new Vector3(8, 4, 10)
                        }
                    },
                    groupId: unit.id
                } as any);
            }
        }

        // Avanzamos el cursor lineal para bloques rectos
        currentPos = currentPos.add(forwardDirection.scale(actualLength));
    });

    return { characterSpawn, dummyKamikazeDrone };
};


// Ejecutamos la simulación estática de datos puros
const PRE_SPAWNS = createPreCalculatedSpawns();

// 4. El constructor procedural del mapa (Invocado por BabylonJS en tiempo de juego)

const buildLevel08Map = ({ scene }: ProceduralMapContext): ProceduralMapResult => {
    level08ManagedUnits = buildLevelUnits(scene, LEVEL_08_LAYOUT);

    const solids: StaticSolid[] = [];
    let groundMesh: Mesh | undefined;

    level08ManagedUnits.forEach(unit => {
        unit.meshes.forEach((mesh, index) => {
            // 1. La plataforma de salida es el ground base permanente del nivel
            if (unit.kind === "spawn_platform" && index === 0) {
                mesh.checkCollisions = true;
                groundMesh = mesh as Mesh;
                return;
            }

            // 2. La pista del parametric_path se registra como sólido poligonal ("mesh") individual
            if (mesh.name.includes("-track")) {
                mesh.checkCollisions = true;
                solids.push({ mesh: mesh as Mesh, shape: "mesh" });
                return;
            }

            // 3. El tubo envolvente (si está activo) también usa forma poligonal hueca
            if (mesh.name.includes("-tube")) {
                mesh.checkCollisions = true;
                solids.push({ mesh: mesh as Mesh, shape: "mesh" });
                return;
            }

            // 4. Obstáculos individuales y tablones/barandas del puente
            const isBreakable = mesh.name.includes("-breakable");
            solids.push({
                mesh: mesh as Mesh,
                shape: "box",
                ...(isBreakable ? { kind: "breakable" } : {})
            });
        });
    });

    if (!groundMesh) {
        throw new Error("[Level 08] Error fatal: No se pudo determinar la malla de suelo base.");
    }

    return {
        ground: groundMesh,
        groundShape: "box",
        solids,
        managedUnits: level08ManagedUnits
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
