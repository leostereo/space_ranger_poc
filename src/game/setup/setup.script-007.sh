#!/usr/bin/env bash
# setup.script-007 — Modelo de datos del nivel y persistencia del progreso.
# Ejecutar parado en /src:   bash game/setup/setup.script-007.sh
#
# Qué hace (solo crea archivos nuevos; no modifica ninguno existente ni cambia el flujo del juego):
#   core/storage/safe-storage.ts        StorageLike + createSafeStorage (localStorage con respaldo en memoria)
#   levels/level-definition.ts          LevelDefinition (datos ESTÁTICOS: mapa, spawns, oleadas, navegación)
#   levels/level-progress.ts            LevelProgress (lo ÚNICO que se persiste)
#   levels/level-repository.ts          LevelRepository: getNextPending / markCompleted / reset
#   levels/definitions/level-01-...ts   Nivel 1 (mapa "Batalla del Pilar"; spawns y brief son TODO)
#   levels/level-definitions.ts         LEVEL_DEFINITIONS (lista de todos los niveles)
set -euo pipefail

if [[ "$(basename "$PWD")" != "src" ]]; then
  echo "Error: ejecutá este script parado en la carpeta src (actual: $PWD)" >&2
  exit 1
fi

BOOT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ ! -f "$BOOT_DIR/_lib.sh" ]]; then
  echo "Error: falta $BOOT_DIR/_lib.sh (lo crea setup.script-001.sh)" >&2
  exit 1
fi
# shellcheck source=_lib.sh
source "$BOOT_DIR/_lib.sh"

setup_begin "$0"
setup_requires "setup.script-006.sh"

echo "-- archivos nuevos"

write_file "game/core/storage/safe-storage.ts" <<'EOF'
/** Subconjunto de Web Storage que usamos: así se puede inyectar uno falso en pruebas. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PROBE_KEY = "__storage_probe__";

/** Storage en memoria: se pierde al recargar. Sirve de respaldo y para pruebas. */
export function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

/**
 * Devuelve localStorage si se puede usar; si no (modo privado, cuota, sin DOM), uno en memoria.
 * Nunca lanza: el juego tiene que poder arrancar aunque no se pueda persistir.
 */
export function createSafeStorage(): StorageLike {
  try {
    window.localStorage.setItem(PROBE_KEY, "1");
    window.localStorage.removeItem(PROBE_KEY);
    return window.localStorage;
  } catch {
    console.warn("[createSafeStorage] localStorage is not available; progress will not persist");
    return createMemoryStorage();
  }
}
EOF

write_file "game/levels/level-definition.ts" <<'EOF'
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";

/** Tipos de enemigo que un nivel puede pedir. */
export type EnemyType = "drone";

export interface WaveDefinition {
  /** Número de oleada (1, 2, 3...). */
  readonly wave: number;
  readonly enemyType: EnemyType;
  readonly quantity: number;
  /** Segundos desde el inicio de la oleada hasta que aparecen. */
  readonly delaySeconds: number;
}

export interface LevelSpawns {
  readonly character: Vector3;
  readonly enemies: readonly Vector3[];
  readonly items: readonly Vector3[];
  readonly other: readonly Vector3[];
}

/** Datos para pathfinding terrestre. Los enemigos voladores no lo necesitan. */
export interface LevelNavigation {
  readonly navmeshFile?: string;
  readonly waypoints?: readonly Vector3[];
}

/** Cómo se reconoce una malla del GLB del mapa: por fragmento del nombre o por expresión regular. */
export type MapMeshMatcher = { readonly includes: string } | { readonly pattern: RegExp };

export type MapMeshRole = "buildings" | "trees" | "roads" | "greenAreas" | "waterways";

/** Un grupo de mallas del mapa que se fusiona en una sola (menos draw calls). */
export interface MapMeshGroup {
  readonly role: MapMeshRole;
  /** Nombre con el que queda la malla fusionada. */
  readonly name: string;
  readonly match: MapMeshMatcher;
  readonly allow32BitIndices: boolean;
}

export interface MapDefinition {
  readonly modelRootUrl: string;
  readonly modelFile: string;
  /** Se aplica ANTES de fusionar, para que las mallas calculen bien sus coordenadas. */
  readonly rootPosition: Vector3;
  readonly rootRotationXDeg: number;
  readonly groups: readonly MapMeshGroup[];
  /** El suelo no se fusiona: queda como malla independiente (lo usa el hoverboard). */
  readonly ground: { readonly name: string; readonly match: MapMeshMatcher };
}

/** Datos ESTÁTICOS de un nivel: viven en el código y se versionan con él. */
export interface LevelDefinition {
  readonly id: string;
  /** Orden secuencial: el nivel pendiente de menor `order` es el siguiente. */
  readonly order: number;
  /** Objetivo del nivel (se muestra en la pausa). */
  readonly brief: string;
  readonly map: MapDefinition;
  readonly spawns: LevelSpawns;
  readonly waves: readonly WaveDefinition[];
  readonly navigation?: LevelNavigation;
}
EOF

write_file "game/levels/level-progress.ts" <<'EOF'
export type LevelStatus = "pending" | "completed";

/** Lo ÚNICO que se persiste de un nivel. */
export interface LevelProgress {
  readonly levelId: string;
  readonly status: LevelStatus;
}
EOF

write_file "game/levels/level-repository.ts" <<'EOF'
import type { StorageLike } from "../core/storage/safe-storage";
import type { LevelDefinition } from "./level-definition";
import type { LevelProgress, LevelStatus } from "./level-progress";

/** Clave de persistencia. Si cambia el formato guardado, subir la versión. */
const PROGRESS_STORAGE_KEY = "game.level-progress.v1";

interface StoredProgress {
  readonly version: 1;
  readonly completedLevelIds: readonly string[];
}

/**
 * Acceso al progreso persistido de los niveles. Es la única clase que conoce el medio
 * de persistencia: el resto del juego pregunta por el próximo nivel y marca completados.
 */
export class LevelRepository {
  private readonly levels: readonly LevelDefinition[]; // ordenados por `order`
  private readonly completed: Set<string>;

  constructor(
    definitions: readonly LevelDefinition[],
    private readonly storage: StorageLike,
  ) {
    this.levels = LevelRepository.validateAndSort(definitions);
    this.completed = this.load();
  }

  /** El nivel pendiente de menor `order`, o null si ya se completaron todos. */
  getNextPending(): LevelDefinition | null {
    return this.levels.find((level) => !this.completed.has(level.id)) ?? null;
  }

  getStatus(levelId: string): LevelStatus {
    this.requireKnown(levelId);
    return this.completed.has(levelId) ? "completed" : "pending";
  }

  getAll(): readonly LevelProgress[] {
    return this.levels.map((level) => ({ levelId: level.id, status: this.getStatus(level.id) }));
  }

  /** Idempotente: marcar dos veces el mismo nivel no cambia nada. */
  markCompleted(levelId: string): void {
    this.requireKnown(levelId);
    if (this.completed.has(levelId)) {
      return;
    }
    this.completed.add(levelId);
    this.save();
  }

  /** Borra todo el progreso (estado 8: juego completado). */
  reset(): void {
    this.completed.clear();
    try {
      this.storage.removeItem(PROGRESS_STORAGE_KEY);
    } catch (error) {
      console.warn("[LevelRepository] could not clear the saved progress", error);
    }
  }

  private requireKnown(levelId: string): void {
    if (!this.levels.some((level) => level.id === levelId)) {
      throw new Error(`[LevelRepository] unknown level "${levelId}"`);
    }
  }

  /** Lee lo guardado. Un dato corrupto o con niveles que ya no existen se descarta sin romper el arranque. */
  private load(): Set<string> {
    try {
      const raw = this.storage.getItem(PROGRESS_STORAGE_KEY);
      if (raw === null) {
        return new Set();
      }
      const parsed: unknown = JSON.parse(raw);
      if (!LevelRepository.isStoredProgress(parsed)) {
        console.warn("[LevelRepository] saved progress has an unexpected format; ignoring it");
        return new Set();
      }
      const known = new Set(this.levels.map((level) => level.id));
      return new Set(parsed.completedLevelIds.filter((id) => known.has(id)));
    } catch (error) {
      console.warn("[LevelRepository] could not read the saved progress; starting from scratch", error);
      return new Set();
    }
  }

  /** Si no se puede guardar (cuota, modo privado) el progreso sigue vivo en memoria durante la sesión. */
  private save(): void {
    const data: StoredProgress = { version: 1, completedLevelIds: [...this.completed] };
    try {
      this.storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn("[LevelRepository] could not save the progress; it will last only this session", error);
    }
  }

  private static isStoredProgress(value: unknown): value is StoredProgress {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const candidate = value as { version?: unknown; completedLevelIds?: unknown };
    return (
      candidate.version === 1 &&
      Array.isArray(candidate.completedLevelIds) &&
      candidate.completedLevelIds.every((id) => typeof id === "string")
    );
  }

  private static validateAndSort(definitions: readonly LevelDefinition[]): readonly LevelDefinition[] {
    const ids = new Set<string>();
    const orders = new Set<number>();
    for (const level of definitions) {
      if (ids.has(level.id)) {
        throw new Error(`[LevelRepository] duplicated level id "${level.id}"`);
      }
      if (orders.has(level.order)) {
        throw new Error(`[LevelRepository] duplicated level order ${level.order} ("${level.id}")`);
      }
      ids.add(level.id);
      orders.add(level.order);
    }
    return [...definitions].sort((a, b) => a.order - b.order);
  }
}
EOF

write_file "game/levels/definitions/level-01-definition.ts" <<'EOF'
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { LevelDefinition } from "../level-definition";

/**
 * Nivel 1 — mapa "Batalla del Pilar".
 * Los datos del mapa vienen del AssetManager del POC. Lo marcado TODO son placeholders:
 * hay que reemplazarlos por los valores reales del juego.
 */
export const level01Definition: LevelDefinition = {
  id: "level-01",
  order: 1,
  brief: "TODO: objetivo del nivel",
  map: {
    modelRootUrl: "maps/",
    modelFile: "topoexport_3D_modeling_batallaDelPilar.glb",
    rootPosition: new Vector3(0, -900, -100),
    rootRotationXDeg: 90,
    groups: [
      { role: "buildings", name: "merged-buildings", match: { includes: "TPX_Buildings" }, allow32BitIndices: true },
      { role: "trees", name: "merged-trees", match: { pattern: /^node\d+/i }, allow32BitIndices: false },
      { role: "roads", name: "merged-roads", match: { includes: "TPX_RoadsOutlines" }, allow32BitIndices: true },
      { role: "greenAreas", name: "merged-green-areas", match: { includes: "TPX_GreenAreas" }, allow32BitIndices: true },
      { role: "waterways", name: "merged-waterways", match: { includes: "TPX_Waterways" }, allow32BitIndices: true },
    ],
    ground: { name: "ground", match: { includes: "TPX_Ground" } },
  },
  spawns: {
    character: new Vector3(0, 0, 0), // TODO: coordenadas reales sobre el mapa
    enemies: [], // TODO
    items: [],
    other: [],
  },
  // Placeholder según la idea de hordas de 15 drones.
  waves: [{ wave: 1, enemyType: "drone", quantity: 15, delaySeconds: 0 }],
};
EOF

write_file "game/levels/level-definitions.ts" <<'EOF'
import { level01Definition } from "./definitions/level-01-definition";
import type { LevelDefinition } from "./level-definition";

/** Todos los niveles del juego. Para agregar uno: crear su definición y sumarla acá. */
export const LEVEL_DEFINITIONS: readonly LevelDefinition[] = [level01Definition];
EOF

# game/levels/definitions ya tiene un archivo real: el .gitkeep de 002 sobra
rm -f game/levels/definitions/.gitkeep

setup_end