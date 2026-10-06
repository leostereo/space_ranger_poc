/**
 * Valores COMPARTIDOS: se usan en más de un lugar o sirven de base para escalar otros
 * (ej: ENEMY_HEIGHT = gameConfig.player.height * 1.2).
 *
 * Los valores de comportamiento propios de una clase NO van acá: se declaran como
 * constantes al inicio del archivo que los usa (const WALKING_SPEED = 1.4;).
 */
export const gameConfig = {
  player: {
    // El modelo del personaje se escala a esta altura; de acá derivan cápsula, enemigos, etc.
    // (el POC tenía 1.8 comentado y 0.8 activo)
    height: 0.8,
  },
} as const;
