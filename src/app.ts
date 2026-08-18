import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { AxesViewer } from "@babylonjs/core/Debug/axesViewer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import "@babylonjs/core/Physics/physicsEngineComponent";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";

import { templateConfig } from "./config/template-config";
import { getSceneRuntimeState } from "./playground/scene-runtime";
import { pocRegistry } from "./poc/poc-registry";
import type { Poc } from "./poc/types";
import { SceneSelector } from "./scene-selector/scene-selector";
import { AssetManager } from "./services/assets-manager"

class App {
  public engine: Engine | WebGPUEngine;
  public scene: Scene | null = null;

  private canvas: HTMLCanvasElement;
  private selector: SceneSelector;

  private activePoc: Poc | null = null;
  private renderLoopBound = false;
  private physicsEnabled = false; // 👈 nuevo: evita re-enablePhysics sobre la misma scene

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.id = "renderCanvas";
    document.body.appendChild(this.canvas);

    void this.bootstrap();
  }

  async bootstrap(): Promise<void> {
    this.engine = await this._createEngine();

    this.selector = new SceneSelector(
      pocRegistry,
      (id) => void this.loadPoc(id), // 👈 ya no pasa scene
      () => this.backToSelector(),
    );

    this._bindEvent();
    this._startRenderLoop();

    const latestPoc = pocRegistry[pocRegistry.length - 1];
    if (latestPoc) {
      void this.loadPoc(latestPoc.id);
    }
  }

  /** Descarta la escena actual (si hay) y arma una nueva para el POC seleccionado. */
async loadPoc(id: string): Promise<void> {
  const definition = pocRegistry.find((poc) => poc.id === id);
  if (!definition) {
    console.warn(`POC "${id}" no encontrado en el registro.`);
    return;
  }

  this._disposeCurrent();
  this.scene = null; // 👈 explícito: mientras esto sea null, el render loop no renderiza nada

  const scene = new Scene(this.engine);

  await AssetManager.cargarTodo(this.canvas, scene);

  const { default: PocClass } = await definition.load();
  const poc = new PocClass();

  if (templateConfig.features.physics) {
    await this._setPhysics(scene);
  }

  await poc.build(scene, this.canvas); // acá recién se asigna scene.activeCamera

  this._config(scene);

  this.activePoc = poc;
  this.scene = scene; // 👈 sólo ahora, con todo listo (cámara incluida), lo publicamos para el render loop
  this.selector.showBackButton();
}
  /** Vuelve a la pantalla de selección, descartando la escena del POC activo. */
  backToSelector(): void {
    this._disposeCurrent();
    this.selector.showMenu();
  }

  private _disposeCurrent(): void {
    this.activePoc?.dispose?.();
    this.activePoc = null;

    this.scene?.dispose();
    this.scene = null;
  }

  async _createEngine(): Promise<Engine | WebGPUEngine> {
    if (templateConfig.rendering.webgpuFirst && "gpu" in navigator) {
      try {
        const webgpu = new WebGPUEngine(this.canvas, {
          adaptToDeviceRatio: templateConfig.rendering.engine.adaptToDeviceRatio,
          antialias: templateConfig.rendering.engine.antialias,
        });
        await webgpu.initAsync();
        return webgpu;
      } catch (error) {
        console.warn("WebGPU initialization failed, falling back to WebGL2.", error);
      }
    }

    return new Engine(this.canvas, true, {
      powerPreference: templateConfig.rendering.engine.powerPreference,
      preserveDrawingBuffer: templateConfig.rendering.engine.preserveDrawingBuffer,
      stencil: templateConfig.rendering.engine.stencil,
      disableWebGL2Support: templateConfig.rendering.engine.disableWebGL2Support,
      adaptToDeviceRatio: templateConfig.rendering.engine.adaptToDeviceRatio,
    });
  }

  async _setPhysics(scene: Scene): Promise<void> {
    const gravity = new Vector3(0, -9.81, 0);
    const { default: HavokPhysics } = await import("@babylonjs/havok");
    const hk = await HavokPhysics();
    const plugin = new HavokPlugin(true, hk);
    if (!scene.enablePhysics(gravity, plugin)) {
      throw new Error("Failed to initialize the Havok physics engine.");
    }
  }

  _fps(): void {
    if (!templateConfig.debug.showFps) {
      return;
    }

    const dom = document.getElementById("display-fps");
    if (dom) {
      dom.innerHTML = `${this.engine.getFps().toFixed()} fps`;
    } else {
      const div = document.createElement("div");
      div.id = "display-fps";
      div.innerHTML = "0";
      document.body.appendChild(div);
    }
  }

  _config(scene: Scene): void {
    if (templateConfig.features.axesViewer) {
      const axesViewer = new AxesViewer(scene, 2);
      getSceneRuntimeState(scene).axesViewer = axesViewer;
    }
  }

  _bindEvent(): void {
    if (this.renderLoopBound) return;
    this.renderLoopBound = true;

    if (templateConfig.debug.inspectorInDevOnly && import.meta.env.DEV) {
      void Promise.all([import("@babylonjs/core/Debug/debugLayer"), import("@babylonjs/inspector")]).then(() => {
        window.addEventListener("keydown", (ev) => {
          // Shift+Ctrl+Alt+I
          if (ev.shiftKey && ev.ctrlKey && ev.altKey) {
            if (!this.scene) return;
            if (this.scene.debugLayer.isVisible()) {
              this.scene.debugLayer.hide();
            } else {
              this.scene.debugLayer.show();
            }
          }
        });
      });
    }

    window.addEventListener("resize", () => {
      this.engine.resize();
    });

    window.addEventListener("beforeunload", () => {
      this.activePoc?.dispose?.();
      this.scene?.dispose();
      this.engine.dispose();
    });
  }

  private _startRenderLoop(): void {
    this.engine.runRenderLoop(() => {
      this._fps();
      this.scene?.render();
    });
  }
}

new App();