import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { LevelDefinition, ProceduralMapContext, ProceduralMapResult, StaticSolid, EnemySpawn } from "../level-definition";
import { buildLevelUnits } from "../level-builder";
import type { UnitData, ManagedUnitInstance } from "../unit-builder.types";
import { calculateParametricEndPosition } from "../builders/parametric-path.builder";
import { calculateRectangularTunnelEndPosition } from "../builders/parametric-tunnel.builder";

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
        id: "pp_stunel_curva_bajada",
        kind: "parametric_path",
        length: 250, // Largo de referencia
        distanceToEnable: 270,
        enabledDefault: false,
        parametricConfig: {
            straightSegments: 1,   // 4 tramos de 25m = 100 metros totalmente rectos
            upSegments: 0,         // Sin subidas
            downSegments: 2,       // Sin bajadas
            curveRightSegments: 1, // Sin curvas a la derecha
            curveLeftSegments: 1,  // Sin curvas a la izquierda
            includeTunnel: false,  // Sin carcasa de tubo para tener vista despejada
            jumpCount: 0,          // 1 valla de salto (verde)
            dodgeCount: 0,         // 1 pilar central (violeta) + 1 pared lateral (violeta/gris)
            breakableCount: 0,      // 1 bloque destruible (rojo)
            unitBoxCount: 0,
            matrixWallGapCount: 0,        // 1 pared con hueco libre
            matrixWallBreakableCount: 0   // 1 pared con celda destruible

        }
    },
    {
        id: "pp_recta_obstaculo_1",
        kind: "parametric_path",
        length: 250, // Largo de referencia
        distanceToEnable: 270,
        enabledDefault: false,
        parametricConfig: {
            straightSegments: 1,   // 4 tramos de 25m = 100 metros totalmente rectos
            upSegments: 0,         // Sin subidas
            downSegments: 0,       // Sin bajadas
            curveRightSegments: 0, // Sin curvas a la derecha
            curveLeftSegments: 0,  // Sin curvas a la izquierda
            includeTunnel: true,  // Sin carcasa de tubo para tener vista despejada
            jumpCount: 0,          // 1 valla de salto (verde)
            dodgeCount: 0,         // 1 pilar central (violeta) + 1 pared lateral (violeta/gris)
            breakableCount: 0,      // 1 bloque destruible (rojo)
            unitBoxCount: 0,
            matrixWallGapCount: 1,        // 1 pared con hueco libre
            matrixWallBreakableCount: 0   // 1 pared con celda destruible

        }
    },
    {
        id: "pp_recta_obstaculo_2",
        kind: "parametric_path",
        length: 250, // Largo de referencia
        distanceToEnable: 270,
        enabledDefault: false,
        parametricConfig: {
            straightSegments: 1,   // 4 tramos de 25m = 100 metros totalmente rectos
            upSegments: 0,         // Sin subidas
            downSegments: 0,       // Sin bajadas
            curveRightSegments: 0, // Sin curvas a la derecha
            curveLeftSegments: 0,  // Sin curvas a la izquierda
            includeTunnel: true,  // Sin carcasa de tubo para tener vista despejada
            jumpCount: 0,          // 1 valla de salto (verde)
            dodgeCount: 0,         // 1 pilar central (violeta) + 1 pared lateral (violeta/gris)
            breakableCount: 0,      // 1 bloque destruible (rojo)
            unitBoxCount: 0,
            matrixWallGapCount: 1,        // 1 pared con hueco libre
            matrixWallBreakableCount: 0   // 1 pared con celda destruible

        }
    },
    {
        id: "pp_recta_obstaculoDestruir_1",
        kind: "parametric_path",
        length: 250, // Largo de referencia
        distanceToEnable: 270,
        enabledDefault: false,
        parametricConfig: {
            straightSegments: 1,   // 4 tramos de 25m = 100 metros totalmente rectos
            upSegments: 0,         // Sin subidas
            downSegments: 0,       // Sin bajadas
            curveRightSegments: 0, // Sin curvas a la derecha
            curveLeftSegments: 0,  // Sin curvas a la izquierda
            includeTunnel: true,  // Sin carcasa de tubo para tener vista despejada
            jumpCount: 0,          // 1 valla de salto (verde)
            dodgeCount: 0,         // 1 pilar central (violeta) + 1 pared lateral (violeta/gris)
            breakableCount: 0,      // 1 bloque destruible (rojo)
            unitBoxCount: 0,
            matrixWallGapCount: 0,        // 1 pared con hueco libre
            matrixWallBreakableCount: 1   // 1 pared con celda destruible

        }
    },
    {
        id: "bridge_zone_1",
        kind: "kamikaze_bridge",
        length: 100,
        distanceToEnable: 110,
        enabledDefault: false
    },
    {
        id: "pp_bajada_curva_stunel",
        kind: "parametric_path",
        length: 250, // Largo de referencia
        distanceToEnable: 260,
        enabledDefault: false,
        parametricConfig: {
            straightSegments: 0,   // 4 tramos de 25m = 100 metros totalmente rectos
            upSegments: 0,         // Sin subidas
            downSegments: 5,       // Sin bajadas
            curveRightSegments: 2, // Sin curvas a la derecha
            curveLeftSegments: 0,  // Sin curvas a la izquierda
            includeTunnel: false,  // Sin carcasa de tubo para tener vista despejada
            jumpCount: 0,          // 1 valla de salto (verde)
            dodgeCount: 0,         // 1 pilar central (violeta) + 1 pared lateral (violeta/gris)
            breakableCount: 0,      // 1 bloque destruible (rojo)
            unitBoxCount: 0,
            matrixWallGapCount: 0,        // 1 pared con hueco libre
            matrixWallBreakableCount: 0   // 1 pared con celda destruible

        }
    },
    {
        id: "pt_solo_curva",
        kind: "parametric_tunnel",
        length: 250,
        distanceToEnable: 260,
        enabledDefault: false,
        tunnelConfig: {
            straightSegments: 3,
            upSegments: 0,
            downSegments: 0,
            curveRightSegments: 1,
            curveLeftSegments: 0,
            matrixWallGapCount: 0,
            matrixWallBreakableCount: 0,
            breakableHitsRequired: 0,
        }
    },
    {
        id: "pt_recto_obstaculo",
        kind: "parametric_tunnel",
        length: 350,
        distanceToEnable: 360,
        enabledDefault: false,
        tunnelConfig: {
            straightSegments: 10,
            upSegments: 0,
            downSegments: 0,
            curveRightSegments: 0,
            curveLeftSegments: 0,
            matrixWallGapCount: 1,
            matrixWallBreakableCount: 0,
            breakableHitsRequired: 0,
        }
    },
    {
        id: "pt_recto_obstaculo2",
        kind: "parametric_tunnel",
        length: 350,
        distanceToEnable: 360,
        enabledDefault: false,
        tunnelConfig: {
            straightSegments: 10,
            upSegments: 0,
            downSegments: 0,
            curveRightSegments: 0,
            curveLeftSegments: 0,
            matrixWallGapCount: 1,
            matrixWallBreakableCount: 0,
            breakableHitsRequired: 0,
        }
    },
    {
        id: "shooting_playground_1",
        kind: "shooting_playground",
        length: 150,
        distanceToEnable: 160,
        enabledDefault: false,
        playgroundConfig: {
            width: 50,
            groupingMin: 10,
            groupingMax: 25,
            breakablePercent: 0.25,
            freeResultingSpace: 0.9,
            staticDroneCount: 5,
        }
    },
    {
        id: "pp_curva_subida_corta_stunel",
        kind: "parametric_path",
        length: 250, // Largo de referencia
        distanceToEnable: 260,
        enabledDefault: false,
        parametricConfig: {
            straightSegments: 5,   // 4 tramos de 25m = 100 metros totalmente rectos
            upSegments: 10,         // Sin subidas
            downSegments: 0,       // Sin bajadas
            curveRightSegments: 5, // Sin curvas a la derecha
            curveLeftSegments: 0,  // Sin curvas a la izquierda
            includeTunnel: false,  // Sin carcasa de tubo para tener vista despejada
            jumpCount: 0,          // 1 valla de salto (verde)
            dodgeCount: 0,         // 1 pilar central (violeta) + 1 pared lateral (violeta/gris)
            breakableCount: 0,      // 1 bloque destruible (rojo)
            unitBoxCount: 0,
            matrixWallGapCount: 0,        // 1 pared con hueco libre
            matrixWallBreakableCount: 0   // 1 pared con celda destruible

        }
    },
    {
        id: "empty_tunnel1",
        kind: "empty_tunnel",
        length: 150,
        distanceToEnable: 200,
        enabledDefault: false
    },
    // {
    //     id: "empty_plat_1",
    //     kind: "empty_platform",
    //     length: 20,
    //     distanceToEnable: 60,
    //     enabledDefault: false,
    //     platformConfig: { width: 16 }
    // },
    // {
    //     id: "empty_plat_2",
    //     kind: "empty_platform",
    //     length: 20,
    //     distanceToEnable: 60,
    //     enabledDefault: false
    // },
    {
        id: "pp_recto_obstaculoDestruir",
        kind: "parametric_path",
        length: 450, // Largo de referencia
        distanceToEnable: 500,
        enabledDefault: false,
        parametricConfig: {
            straightSegments: 1,   // 4 tramos de 25m = 100 metros totalmente rectos
            upSegments: 0,         // Sin subidas
            downSegments: 0,       // Sin bajadas
            curveRightSegments: 0, // Sin curvas a la derecha
            curveLeftSegments: 0,  // Sin curvas a la izquierda
            includeTunnel: true,  // Sin carcasa de tubo para tener vista despejada
            jumpCount: 0,          // 1 valla de salto (verde)
            dodgeCount: 0,         // 1 pilar central (violeta) + 1 pared lateral (violeta/gris)
            breakableCount: 0,      // 1 bloque destruible (rojo)
            unitBoxCount: 0,
            matrixWallGapCount: 0,        // 1 pared con hueco libre
            matrixWallBreakableCount: 2   // 1 pared con celda destruible

        }
    },
    {
        id: "finish_zone",
        kind: "finish_platform",
        length: 24,
        distanceToEnable: 60,
        enabledDefault: false,
        platformConfig: { width: 18 }
    }
];

// 2. Contenedores de Runtime que usará la Strategy (inicialmente vacíos)
export let level08ManagedUnits: ManagedUnitInstance[] = [];

// 3. Simulación de datos estáticos pura (Igual que hacía LAYOUT en tu Nivel 6)
// Almacena las posiciones de los enemigos para que la FSM/Registro de niveles los lea al inicio
interface Level08PreCalculatedSpawns {
    readonly characterSpawn: Vector3;
    readonly dummyKamikazeDrone: EnemySpawn[];
    readonly staticDrone: EnemySpawn[];
}

const createPreCalculatedSpawns = (): Level08PreCalculatedSpawns => {
    let currentPos = Vector3.Zero(); // 🟢 Ahora rastreamos X, Y y Z completos
    const forwardDirection = new Vector3(0, 0, 1);
    const droneHoverHeight = 4;
    const sentinelsPerBridge = 10;
    const dummyKamikazeDrone: EnemySpawn[] = [];
    const staticDrone: EnemySpawn[] = [];

    const characterSpawn = new Vector3(0, 1, 10);

    LEVEL_08_LAYOUT.forEach((unit) => {

        const actualLength = unit.length;

        if (unit.kind === "parametric_path" && unit.parametricConfig) {
            currentPos = calculateParametricEndPosition(currentPos, unit.length, unit.parametricConfig);
            return;
        }

        if (unit.kind === "parametric_tunnel" && unit.tunnelConfig) {
            currentPos = calculateRectangularTunnelEndPosition(currentPos, unit.length, unit.tunnelConfig);
            return;
        }

        // const actualLength = unit.kind === "empty_tunnel" ? unit.length * 10 : unit.length;

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

        if (unit.kind === "shooting_playground" && unit.playgroundConfig) {
            const { width, staticDroneCount } = unit.playgroundConfig;

            // Márgenes de seguridad para que no queden en el borde del vacío ni pegados a la entrada
            const lateralMargin = 1.5;
            const entrySafeMargin = 4.0; // Primeros 4m libres para que el jugador pueda entrar
            const exitMargin = 1.5;

            const minX = currentPos.x - (width * 0.5) + lateralMargin;
            const maxX = currentPos.x + (width * 0.5) - lateralMargin;
            const minZ = currentPos.z + entrySafeMargin;
            const maxZ = currentPos.z + actualLength - exitMargin;

            // Nacen a +5m (por encima de la pila máxima de 3 bloques) para que el raycast los baje a la superficie exacta
            const initialProbeY = currentPos.y + 5.0;
            const minSeparation = 2.5; // Evita que dos drones nazcan encimados
            const placedPositions: Vector3[] = [];

            for (let i = 0; i < staticDroneCount; i++) {
                let candidatePos = new Vector3(currentPos.x, initialProbeY, (minZ + maxZ) * 0.5);

                // Hasta 20 intentos para encontrar un punto que respete la distancia mínima con otros drones
                for (let attempt = 0; attempt < 20; attempt++) {
                    const randX = minX + Math.random() * Math.max(0.1, maxX - minX);
                    const randZ = minZ + Math.random() * Math.max(0.1, maxZ - minZ);
                    const testPos = new Vector3(randX, initialProbeY, randZ);

                    const tooClose = placedPositions.some(
                        (existing) => Vector3.DistanceSquared(existing, testPos) < minSeparation * minSeparation
                    );

                    if (!tooClose) {
                        candidatePos = testPos;
                        break;
                    }
                }

                placedPositions.push(candidatePos);

                staticDrone.push({
                    position: candidatePos,
                    forward: forwardDirection.scale(-1),
                    fireDelaySeconds: 0.4 + i * 0.35,
                    groupId: unit.id,
                } as any);
            }
        }


        // Avanzamos el cursor lineal para bloques rectos
        currentPos = currentPos.add(forwardDirection.scale(actualLength));
    });

    return { characterSpawn, dummyKamikazeDrone, staticDrone };
};


// Ejecutamos la simulación estática de datos puros
const PRE_SPAWNS = createPreCalculatedSpawns();

// 4. El constructor procedural del mapa (Invocado por BabylonJS en tiempo de juego)

// 4. El constructor procedural del mapa (Invocado por BabylonJS en tiempo de juego)
const buildLevel08Map = ({ scene, registry }: ProceduralMapContext): ProceduralMapResult => {
    level08ManagedUnits = buildLevelUnits(scene, LEVEL_08_LAYOUT, registry);

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

            // 4. Obstáculos individuales, piso de shooting_playground y tablones/barandas
            // Todo lo que venga de shooting_playground (-floor, -cover, -breakable) entra acá como "box"
            const isBreakable = mesh.name.includes("-breakable");
            mesh.checkCollisions = true;
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
            staticDrone: PRE_SPAWNS.staticDrone,
            dummyKamikazeDrone: PRE_SPAWNS.dummyKamikazeDrone, // Datos estáticos puros y listos
        },
        items: [],
        other: [],
    },
    waves: [],
};
