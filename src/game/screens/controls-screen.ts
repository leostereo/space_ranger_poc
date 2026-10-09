import { HtmlScreen } from "../ui/screens/html-screen";

/**
 * Estado 2b — overlay con el mapeo de teclas.
 * Recibe la imagen ya descargada por el AssetLoader, así no hay parpadeo ni URL duplicada.
 */
export class ControlsScreen extends HtmlScreen {
  constructor(keymapImage: HTMLImageElement) {
    super(
      "controls",
      "screen--controls",
      `
        <p class="screen__title">Controls</p>
        <div class="screen__keymap-slot"></div>
        <p class="screen__prompt">Press any key to continue</p>
      `,
    );
    const slot = this.element.querySelector(".screen__keymap-slot");
    if (!slot) {
      throw new Error("[ControlsScreen] the template is missing the keymap slot");
    }
    keymapImage.className = "screen__keymap";
    keymapImage.alt = "Keyboard and mouse controls";
    keymapImage.decoding = "async";
    slot.replaceWith(keymapImage);
  }
}
