const fs = require('fs');
const path = require('path');

const files = {
  "character/InputController.ts": `import { Scene, KeyboardEventTypes } from "@babylonjs/core";

export class InputController {
  public adelante: boolean = false;
  public ctrl: boolean = false;

  constructor(scene: Scene) {
    scene.onKeyboardObservable.add((kbInfo) => {
      const pressed = kbInfo.type === KeyboardEventTypes.KEYDOWN;
      
      switch (kbInfo.event.key.toLowerCase()) {
        case "w":
        case "arrowup":
          this.adelante = pressed;
          break;
        case "control":
          this.ctrl = pressed;
          break;
      }
    });
  }
}`,

  "character/AnimacionController.ts": `import { Mesh } from "@babylonjs/core";

export class AnimacionController {
  constructor(mesh: Mesh) {
    console.log("AnimacionController inicializado para el mesh:", mesh.name);
  }

  public play(animName: string): void {
    console.log(\`[Animación] Reproduciendo: \${animName}\`);
  }
}`,

  "character/FisicaController.ts": `import { Mesh, Vector3 } from "@babylonjs/core";

export class FisicaController {
  constructor(mesh: Mesh) {
    console.log("FisicaController inicializado para el mesh:", mesh.name);
  }

  public obtenerVelocidad(): Vector3 {
    return Vector3.Zero();
  }
}`,

  "character/LocomotionStrategy.ts": `import { CharacterContext } from "./CharacterMain";
import { InputController } from "./InputController";

export interface LocomotionStrategy {
  readonly name: string;
  entrar(contexto: CharacterContext): void;
  actualizar(inputs: InputController, delta: number): void;
  salir(): void;
}`,

  "character/CharacterMain.ts": `import { Mesh, Vector3 } from "@babylonjs/core";
import { LocomotionStrategy } from "./LocomotionStrategy";
import { StandAloneStrategy } from "./StandAloneStrategy";
import { InputController } from "./InputController";
import { AnimacionController } from "./AnimacionController";
import { FisicaController } from "./FisicaController";

export interface CharacterContext {
  mesh: Mesh;
  velocidadActual: Vector3;
  alturaActual: number;
  estaEnElSuelo: boolean;
  animController: AnimacionController;
  fisicaController: FisicaController;
  characterMainRef: CharacterMain;
}

export class CharacterMain {
  private _contexto: CharacterContext;
  private _estrategiaActiva: LocomotionStrategy;

  constructor(
    mesh: Mesh,
    animController: AnimacionController,
    fisicaController: FisicaController
  ) {
    this._contexto = {
      mesh: mesh,
      velocidadActual: Vector3.Zero(),
      alturaActual: mesh.position.y,
      estaEnElSuelo: true,
      animController: animController,
      fisicaController: fisicaController,
      characterMainRef: this
    };

    this.cambiarEstrategia(new StandAloneStrategy(this._contexto));
  }

  public cambiarEstrategia(nuevaEstrategia: LocomotionStrategy): void {
    if (this._estrategiaActiva) {
      console.log(\`[Estrategia Global] Saliendo de: \${this._estrategiaActiva.name}\`);
      this._estrategiaActiva.salir();
    }

    this._estrategiaActiva = nuevaEstrategia;
    console.log(\`[Estrategia Global] Iniciando: \${this._estrategiaActiva.name}\`);
    this._estrategiaActiva.entrar(this._contexto);
  }

  public actualizar(inputs: InputController, delta: number): void {
    this._contexto.alturaActual = this._contexto.mesh.position.y;
    this._contexto.velocidadActual = this._contexto.fisicaController.obtenerVelocidad();

    if (this._estrategiaActiva) {
      this._estrategiaActiva.actualizar(inputs, delta);
    }
  }

  public get contexto(): CharacterContext {
    return this._contexto;
  }
}`,

  "character/StandAloneStrategy.ts": `import { LocomotionStrategy } from "./LocomotionStrategy";
import { CharacterContext } from "./CharacterMain";
import { InputController } from "./InputController";
import { PatinetaStrategy } from "./PatinetaStrategy";

export class StandAloneStrategy implements LocomotionStrategy {
  public readonly name = "StandAlone_APie";
  private _contexto: CharacterContext;
  private _subEstadoActivo: "reposo" | "onAir" = "onAir"; 

  constructor(contexto: CharacterContext) {
    this._contexto = contexto;
  }

  public entrar(contexto: CharacterContext): void {
    this._contexto = contexto;
    console.log("StandAlone: Personaje a pie inicializado.");
    this._contexto.animController.play("idle_a_pie");
  }

  public actualizar(inputs: InputController, delta: number): void {
    console.log(\`[StandAlone Loop] Altura: \${this._contexto.alturaActual.toFixed(2)} | SubEstado: \${this._subEstadoActivo}\`);

    if (this._subEstadoActivo === "onAir" && inputs.ctrl) {
      const nuevaEst = new PatinetaStrategy(this._contexto);
      this._contexto.characterMainRef.cambiarEstrategia(nuevaEst);
    }
  }

  public salir(): void {
    console.log("StandAlone: Limpiando referencias de a pie.");
  }
}`,

  "character/PatinetaStrategy.ts": `import { LocomotionStrategy } from "./LocomotionStrategy";
import { CharacterContext } from "./CharacterMain";
import { InputController } from "./InputController";

export class PatinetaStrategy implements LocomotionStrategy {
  public readonly name = "Modo_Patineta";
  private _contexto: CharacterContext;

  constructor(contexto: CharacterContext) {
    this._contexto = contexto;
  }

  public entrar(contexto: CharacterContext): void {
    this._contexto = contexto;
    console.log("🛹 ¡Patineta conectada con éxito!");
    this._contexto.animController.play("skate_ride");
  }

  public actualizar(inputs: InputController, delta: number): void {
    console.log("[Patineta Loop] Avanzando sobre ruedas... presione Ctrl no hace nada acá.");
  }

  public salir(): void {
    console.log("Patineta: Guardando la tabla.");
  }
}`
};

console.log("🚀 Iniciando la creación del esqueleto de Character...");

Object.entries(files).forEach(([filePath, content]) => {
  const absolutePath = path.join(process.cwd(), filePath);
  const dir = path.dirname(absolutePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(absolutePath, content, 'utf8');
  console.log(`✅ Creado: ${filePath}`);
});

console.log("\n🎉 ¡Todo listo! Se creó la carpeta 'character' con todos los archivos necesarios.");
