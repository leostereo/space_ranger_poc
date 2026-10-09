import { HtmlScreen } from "../ui/screens/html-screen";

/** Estado 6 — Derrota. Placeholder. */
export class GameOverScreen extends HtmlScreen {
  constructor() {
    super(
      "game-over",
      "screen--game-over",
      `
        <p class="screen__title">Game over</p>
        <p class="screen__prompt">Press any key to retry</p>
      `,
    );
  }
}
