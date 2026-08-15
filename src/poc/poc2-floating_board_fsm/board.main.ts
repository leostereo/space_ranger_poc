// src/poc2-floating_board_fsm/board.base.ts
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Nullable } from "@babylonjs/core/types";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Poc } from "../types";
import { BoardController } from "./board.controller";
import { BoardHud } from "./board.hud";
import { BoardInput } from "./board.input";
import { board_character_builder, scene_builder } from "./utils/utils";
import { SkaterAnimator } from "./utils/skater.animator";
import { BoardFsm } from "./board-fsm/board.fsm";
import { generalConfig } from "../config.general";


export default class BoardBase implements Poc {

    private scene: Scene;
    
    private groundAggregates: PhysicsAggregate[];
    private boardMesh: Mesh;
    private boardAggregate: PhysicsAggregate;
    
    private fsm:BoardFsm;
    private input: BoardInput;
    private controller: BoardController;
    private hud: BoardHud;
    private skaterAnimator:SkaterAnimator;

    private beforePhysicsObserver: Nullable<Observer<Scene>> = null;
    private afterPhysicsObserver: Nullable<Observer<Scene>> = null;
    
    async build(scene: Scene): Promise<void> {
        
        this.scene = scene;
        this.groundAggregates = scene_builder(scene);

        const {boardMesh,boardAggregate} = board_character_builder(scene);
        this.boardMesh = boardMesh;
        this.boardAggregate = boardAggregate;
        this.input = new BoardInput();
        this.controller = new BoardController(this.scene, this.boardMesh, this.boardAggregate, this.input);
        this.skaterAnimator = new SkaterAnimator(scene,this.controller.fsm);
        this.bindObservables();

        this.hud = new BoardHud(this.controller.fsm);
        this.hud.mount();
    }

    private bindObservables(){
        this.beforePhysicsObserver = this.scene.onBeforePhysicsObservable.add(() => this.controller.update());
        this.afterPhysicsObserver = this.scene.onAfterPhysicsObservable.add(() => {
            this.skaterAnimator.update(); 
            this.controller.applyVisualRoll();
            this.controller.updateTelemetry();
            
            this.hud.updateTelemetry(
                this.controller.getVerticalVelocity(),
                this.controller.getVerticalAcceleration(),
                this.controller.getForwardSpeed() );
        });
    }

    //API PUBLIC

    dispose?(): void {
        this.scene?.onBeforePhysicsObservable.remove(this.beforePhysicsObserver);
        this.scene?.onAfterPhysicsObservable.remove(this.afterPhysicsObserver);
        this.hud?.dispose();
        this.controller?.dispose();
        this.input?.dispose();
        this.boardAggregate?.dispose();
        this.groundAggregates?.forEach((gAg)=>gAg.dispose());
        this.skaterAnimator.dispose();
    }

}