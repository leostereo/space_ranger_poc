import { HtmlScreen } from "../ui/screens/html-screen";

/** Estado 8 — créditos finales. Placeholder. */
export class GameFinishedScreen extends HtmlScreen {
  constructor() {
    super(
      "game-finished",
      "screen--game-finished",
      `
        <p class="screen__title">Game completed</p>
        <div class="screen__logo">PLACE CREDITS HERE</div>
        <p class="screen__prompt">Press any key</p>
      `,
    );
  }
}
