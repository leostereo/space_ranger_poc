import { HtmlScreen } from "../../ui/screens/html-screen";

export class LoadingScreen extends HtmlScreen {
  constructor() {
    super(
      "loading",
      "screen--loading",
      `
        <p class="screen__title">Loading</p>
        <div class="screen__progress"><div class="screen__progress-bar"></div></div>
      `,
    );
  }
}
