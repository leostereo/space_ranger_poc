export type LevelStatus = "pending" | "completed";

/** Lo ÚNICO que se persiste de un nivel. */
export interface LevelProgress {
  readonly levelId: string;
  readonly status: LevelStatus;
}
