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
