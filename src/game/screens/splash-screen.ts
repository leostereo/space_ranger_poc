import { HtmlScreen } from "../ui/screens/html-screen";

/** Respeta el `base` de Vite: en GitHub Pages la app vive en /<repo>/, no en la raíz del dominio. */
const SPLASH_IMAGE_URL = `${import.meta.env.BASE_URL}images/splash.jpg`;
export class SplashScreen extends HtmlScreen {
  constructor() {
    super(
      "splash",
      "screen--splash",
      `
        <div class="screen__background-container">
          <img src="${SPLASH_IMAGE_URL}" alt="Space Ranger Splash" class="screen__background-img" />        </div>
        <div class="screen__content">
          <p class="screen__prompt">Press any key</p>
        </div>
      `,
    );
  }
}
