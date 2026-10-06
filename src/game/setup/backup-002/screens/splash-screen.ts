import { HtmlScreen } from "../../ui/screens/html-screen";

export class SplashScreen extends HtmlScreen {
  constructor() {
    super(
      "splash",
      "screen--splash",
      `
        <div class="screen__logo">PLACE LOGO HERE</div>
        <p class="screen__prompt">Press any key</p>
      `,
    );
  }
}
