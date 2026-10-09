/**
 * HUD de debug (DOM, arriba a la derecha). Solo debe instanciarse en DEV.
 * Tiene valores clave/valor y un log circular. Renderiza como máximo una vez por frame.
 */
export class DebugHud {
  private readonly root: HTMLDivElement;
  private readonly values = new Map<string, string>();
  private readonly logLines: string[] = [];
  private renderScheduled = false;

  constructor(private readonly maxLogLines = 12) {
    this.root = document.createElement("div");
    this.root.id = "debug-hud";
    Object.assign(this.root.style, {
      position: "fixed",
      top: "8px",
      right: "8px",
      zIndex: "1000",
      minWidth: "260px",
      maxWidth: "40vw",
      padding: "6px 8px",
      background: "rgba(0, 0, 0, 0.65)",
      color: "#7CFC7C",
      font: "12px/1.4 monospace",
      whiteSpace: "pre",
      overflow: "hidden",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.root);
  }

  setValue(key: string, value: string): void {
    this.values.set(key, value);
    this.scheduleRender();
  }

  log(message: string): void {
    this.logLines.push(message);
    if (this.logLines.length > this.maxLogLines) {
      this.logLines.shift();
    }
    this.scheduleRender();
  }

  dispose(): void {
    this.root.remove();
    this.values.clear();
    this.logLines.length = 0;
  }

  private scheduleRender(): void {
    if (this.renderScheduled) {
      return;
    }
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      const valueLines = [...this.values].map(([key, value]) => `${key}: ${value}`);
      this.root.textContent = [...valueLines, "-----", ...this.logLines].join("\n");
    });
  }
}
