import { MeshBuilder, PhysicsAggregate, PhysicsShapeType, Scene } from "@babylonjs/core";
import { Poc } from "../types";
import { AssetManager } from "@/services/assets-manager";

export default class poc5 implements  Poc { 

    public build(scene: Scene, canvas: HTMLCanvasElement): Promise<void> {
          const light = AssetManager.getLight("main", false, "light");
          light.setEnabled(true);
        
          // TODO: reemplazar por AssetManager.getMesh('ground-basic' | 'ground-grid', ...) cuando
          // _builGrounds() esté activo en AssetManager (hoy está comentado ahí).
          const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);
          const groundAggregate = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);

        return Promise.resolve();   
    }
}