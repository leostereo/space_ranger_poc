import type { PocDefinition } from "../poc/types";
import "./scene-selector.css";

export class SceneSelector {
  private root: HTMLDivElement;
  private menuEl: HTMLDivElement;
  private backButtonEl: HTMLButtonElement;

  constructor(
    private pocs: PocDefinition[],
    private onSelect: (id: string) => void,
    private onBack: () => void,
  ) {
    this.root = document.createElement("div");
    this.root.id = "scene-selector";

    this.menuEl = this._buildMenu();
    this.backButtonEl = this._buildBackButton();

    this.root.appendChild(this.menuEl);
    this.root.appendChild(this.backButtonEl);
    document.body.appendChild(this.root);

    this.showMenu();
  }

  /** Muestra el listado de POCs y oculta el botón de volver. */
  showMenu(): void {
    this.menuEl.style.display = "flex";
    this.backButtonEl.style.display = "none";
  }

  /** Oculta el listado y muestra el botón de volver (se llama cuando un POC ya está activo). */
  showBackButton(): void {
    this.menuEl.style.display = "none";
    this.backButtonEl.style.display = "block";
  }

  private _buildMenu(): HTMLDivElement {
    const menu = document.createElement("div");
    menu.id = "scene-selector-menu";

    const title = document.createElement("h1");
    title.textContent = "Space Ranger — POC Selector";
    menu.appendChild(title);

    for (const poc of this.pocs) {
      const card = document.createElement("button");
      card.className = "poc-card";
      card.type = "button";

      const label = document.createElement("span");
      label.className = "poc-card-label";
      label.textContent = poc.label;
      card.appendChild(label);

      if (poc.description) {
        const desc = document.createElement("span");
        desc.className = "poc-card-description";
        desc.textContent = poc.description;
        card.appendChild(desc);
      }

      card.addEventListener("click", () => this.onSelect(poc.id));
      menu.appendChild(card);
    }

    return menu;
  }

  private _buildBackButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.id = "scene-selector-back";
    button.type = "button";
    button.textContent = "\u2190 Volver al selector";
    button.style.display = "none";
    button.addEventListener("click", () => this.onBack());
    return button;
  }
}