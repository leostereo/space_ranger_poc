import { HtmlScreen } from "../ui/screens/html-screen";

/** Estado 7 — Victoria. Placeholder. */
export class LevelClearedScreen extends HtmlScreen {
  constructor() {
    super(
      "level-cleared",
      "screen--level-cleared",
      `
        <p class="screen__title">Level cleared</p>
        <p class="screen__prompt">Press any key to continue</p>
      `,
    );
  }
}
