import { HtmlScreen } from "../ui/screens/html-screen";

export class LoadingScreen extends HtmlScreen {
  private readonly progress: HTMLElement;
  private readonly status: HTMLElement;

  constructor() {
    super(
      "loading",
      "screen--loading",
      `
        <p class="screen__title">Loading</p>
        <div class="screen__progress"><div class="screen__progress-bar"></div></div>
        <p class="screen__status" role="status"></p>
      `,
    );
    const progress = this.element.querySelector<HTMLElement>(".screen__progress");
    const status = this.element.querySelector<HTMLElement>(".screen__status");
    if (!progress || !status) {
      throw new Error("[LoadingScreen] the template is missing elements");
    }
    this.progress = progress;
    this.status = status;
  }

  /** `fraction` entre 0 y 1; `null` vuelve a la barra indeterminada. */
  setProgress(fraction: number | null): void {
    if (fraction === null) {
      this.progress.classList.remove("screen__progress--determinate");
      this.progress.style.removeProperty("--progress");
      return;
    }
    const clamped = Math.min(1, Math.max(0, fraction));
    this.progress.classList.add("screen__progress--determinate");
    this.progress.style.setProperty("--progress", String(clamped));
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }
}
