/**
 * Una pantalla HTML del juego (splash, carga, pausa...).
 * Nota: no se llama `Screen` porque choca con el tipo global del DOM (window.screen).
 */
export interface GameScreen {
  readonly id: string;
  mount(container: HTMLElement): void;
  unmount(): void;
}
