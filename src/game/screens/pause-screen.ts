import { HtmlScreen } from "../ui/screens/html-screen";

/** Estado 5 — Pausa: muestra el brief (objetivo) de la misión actual. */
export class PauseScreen extends HtmlScreen {
  private readonly brief: HTMLElement;

  constructor() {
    super(
      "pause",
      "screen--pause",
      `
        <p class="screen__title">Paused</p>
        <p class="screen__brief"></p>
        <p class="screen__prompt">Press Esc to resume</p>
      `,
    );
    const brief = this.element.querySelector<HTMLElement>(".screen__brief");
    if (!brief) {
      throw new Error("[PauseScreen] the template is missing the brief element");
    }
    this.brief = brief;
  }

  setBrief(text: string): void {
    this.brief.textContent = text;
  }
}
