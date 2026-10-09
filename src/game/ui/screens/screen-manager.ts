import type { GameScreen } from "./game-screen";
import "./screens.css";

/**
 * Administra el ciclo de vida de las pantallas HTML: dueño del contenedor
 * overlay y garantiza que haya una sola pantalla activa a la vez.
 */
export class ScreenManager {
  private readonly root: HTMLDivElement;
  private active: GameScreen | null = null;

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement("div");
    this.root.id = "screen-root";
    this.root.className = "screen-root";
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  show(screen: GameScreen): void {
    this.active?.unmount();
    screen.mount(this.root);
    this.active = screen;
    this.root.hidden = false;
  }

  /** Oculta `screen` solo si sigue siendo la activa (evita pisar a la pantalla siguiente). */
  hide(screen: GameScreen): void {
    if (this.active !== screen) {
      return;
    }
    screen.unmount();
    this.active = null;
    this.root.hidden = true;
  }

  dispose(): void {
    this.active?.unmount();
    this.active = null;
    this.root.remove();
  }
}
