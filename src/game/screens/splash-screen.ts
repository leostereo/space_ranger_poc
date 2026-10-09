import { HtmlScreen } from "../ui/screens/html-screen";

export class SplashScreen extends HtmlScreen {
  constructor() {
    super(
      "splash",
      "screen--splash",
      `
        <div class="screen__background-container">
          <img src="/images/splash.jpg" alt="Space Ranger Splash" class="screen__background-img" />
        </div>
        <div class="screen__content">
          <p class="screen__prompt">Press any key</p>
        </div>
      `,
    );
  }
}
