import type { GameScreen } from "./game-screen";

/** Base para pantallas armadas con HTML estático. `innerHtml` debe ser contenido propio, nunca input del usuario. */
export abstract class HtmlScreen implements GameScreen {
  protected readonly element: HTMLElement;

  protected constructor(
    readonly id: string,
    modifierClass: string,
    innerHtml: string,
  ) {
    this.element = document.createElement("section");
    this.element.className = `screen ${modifierClass}`;
    this.element.dataset.screen = id;
    this.element.innerHTML = innerHtml;
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.element);
  }

  unmount(): void {
    this.element.remove();
  }
}
