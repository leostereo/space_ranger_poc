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
        { id: "empty_tunnel1", kind: "empty_tunnel", length: 10, distanceToEnable: 0, enabledDefault: true }, 
    { 
        id: "pp_test_recto", 
        kind: "parametric_path", 
        length: 100, // Largo de referencia
        distanceToEnable: 120, 
        enabledDefault: true,
        parametricConfig: {
            segmentLength: 25,
            straightSegments: 4,   // 4 tramos de 25m = 100 metros totalmente rectos
            upSegments: 0,         // Sin subidas
            downSegments: 0,       // Sin bajadas
            curveRightSegments: 0, // Sin curvas a la derecha
            curveLeftSegments: 0,  // Sin curvas a la izquierda
            includeTunnel: false,  // Sin carcasa de tubo para tener vista despejada
            
            // 1 obstáculo de cada tipo para inspección visual:
            jumpCount: 1,          // 1 valla de salto (verde)
            dodgeCount: 2,         // 1 pilar central (violeta) + 1 pared lateral (violeta/gris)
            breakableCount: 1      // 1 bloque destruible (rojo)
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
        length: 200, // Largo total base estimado
        distanceToEnable: 250, 
        enabledDefault: false,
        parametricConfig: {
            segmentLength: 25,
            straightSegments: 4,
            upSegments: 2,
            downSegments: 2,
            curveRightSegments: 2,
            curveLeftSegments: 2,
            // Obstáculos sembrados proceduralmente bajo reglas de seguridad
            dodgeCount: 6,
            jumpCount: 3,
            breakableCount: 5,
            includeTunnel:false
            
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
            // 🟢 Avanza el cursor 3D al punto exacto donde termina la curva/subida
            currentPos = calculateParametricEndPosition(currentPos, unit.parametricConfig);
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
  // Construye las mallas físicas en runtime de forma secuencial
  level08ManagedUnits = buildLevelUnits(scene, LEVEL_08_LAYOUT);

  const solids: StaticSolid[] = [];
  const floorsToMerge: Mesh[] = []; // 🟢 Lote para acumular todas las mallas que serán "suelo útil"

level08ManagedUnits.forEach(unit => {
  // 🟢 FIX: Si la unidad nace apagada por culling, no la metemos en los sólidos físicos estáticos del mapa
  if (!unit.enabledDefault) {
    return;
  }

  unit.meshes.forEach((mesh, index) => {
    if (mesh.name.includes("-tube")) {
      mesh.checkCollisions = false;
      return; 
    }
    if (mesh.name.includes("-track") || (unit.kind === "spawn_platform" && index === 0)) {
      mesh.checkCollisions = true;
      floorsToMerge.push(mesh as Mesh);
      return;
    }
    solids.push({ mesh: mesh, shape: "box" });
  });
});

  // 3. FUSIÓN DINÁMICA DE SUELOS DE PUNTA A PUNTA
  if (floorsToMerge.length === 0) {
    throw new Error("[Level 08] Error fatal: No se encontraron mallas para conformar el suelo base.");
  }

  // Combinamos la plataforma inicial y la pista paramétrica en una única entidad 'ground' continua
  const groundMesh = Mesh.MergeMeshes(floorsToMerge, true, true, undefined, false, true);
  if (!groundMesh) {
    throw new Error("[Level 08] Error fatal: Falló la fusión de mallas de suelo (MergeMeshes).");
  }
  
  groundMesh.name = "level08-unified-ground";
  groundMesh.checkCollisions = true;

  // 🟢 RETORNO REFACTOREADO Y UNIFICADO CON SOPORTE COMPLETO:
  return { 
    ground: groundMesh,     // Ahora el ground contiene la plataforma Y la pista curva junta
    groundShape: "mesh",    // Mantiene colisión poligonal milimétrica para la patineta
    solids,                 // Obstáculos limpios e independientes
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
