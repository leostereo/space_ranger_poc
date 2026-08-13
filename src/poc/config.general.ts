export const generalConfig = {
  camera: {
    alpha: -Math.PI / 2.5,
    beta: Math.PI / 2.8,
    radius: 12,
    target: { x: 0, y: 1, z: 0 },
  },
  ground: {
    width: 150,
    depth: 150,
    thickness: 0.4,
    friction: 0.6,
    color: "#33383f",
  },
  board: {
    // Dimensiones placeholder del mesh de la patineta (a reemplazar por el modelo final)
    width: 0.6,
    height: 0.15,
    depth: 1.6,
    mass: 20,
    friction: 0.2,
    restitution: 0,
    color: "#00e5ff",
    emissiveColor: "#0a4a52",
    spawn: { x: 2, y: 5, z: 0 }, // offset horizontal para no tapar el gizmo/ejes en el centro
  },

  playerConfig: {
    initialLives: 5,
    height: 1.8,
    capsuleRadius: 0.4,
    aimHeightMultiplier: 0.5,
    capsuleBottomPoint: -0.5,
    capsuleCrouchTopPoint: 0.1,
    capsuleStandingTopPoint: 0.5,
    speedOnGround: 6.0,
    speedInAir: 8.0,
    jumpHeight: 3.5,
    gravity: -18,
    rotateSpeed: 2.0,
    rotateStepDeg: 1.0,
    rotateAccumulatorMaxSteps: 10,
    runMultiplier: 1.8,
    knockbackForce: 5.0,
    backwardsMultiplier: 0.3,
    player1: {
      positionTrackeableMeshName: 'player1_trackeable',
      name: 'player1',
      player1RaycastDetectableName: "player1_rayCast_detectable",
      player1CollisionDetectableName: "player1_colision_detectable",
      spawn: { x: 2, y:5, z: 0 }, // offset horizontal para no tapar el gizmo/ejes en el centro
    }
  }

};