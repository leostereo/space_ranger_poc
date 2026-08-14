// src/poc2-floating_board_fsm/board.base.ts
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Poc } from "../types";
import { BoardController } from "./board.controller";
import { BoardHud } from "./board.hud";
import { BoardInput } from "./board.input";
import { board_character_builder, scene_builder } from "./utils/utils";


export default class BoardBase implements Poc {

    private scene: Scene;
    
    private groundAggregate: PhysicsAggregate;
    private boardMesh: Mesh;
    private boardAggregate: PhysicsAggregate;
    
    private input: BoardInput;
    private controller: BoardController;
    private hud: BoardHud;
    
    async build(scene: Scene): Promise<void> {
        
        this.scene = scene;
        this.groundAggregate = scene_builder(scene);

        const {boardMesh,boardAggregate} = board_character_builder(scene);
        this.boardMesh = boardMesh;
        this.boardAggregate = boardAggregate;

        this.input = new BoardInput();
        this.controller = new BoardController(this.scene, this.boardMesh, this.boardAggregate, this.input);
        this.bindObservables();

        this.hud = new BoardHud(this.controller.fsm);
        this.hud.mount();
    }

    private bindObservables(){
        this.scene.onBeforePhysicsObservable.add(() => this.controller.update());
    }

    //API PUBLIC

    dispose?(): void {
        this.hud?.dispose();
        this.controller?.dispose();
        this.input?.dispose();
        this.boardAggregate?.dispose();
        this.groundAggregate?.dispose();
    }

}