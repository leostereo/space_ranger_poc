export const generalConfig = {
  camera: {
    alpha: -Math.PI / 2.5,
    beta: Math.PI / 2.8,
    radius: 12,
    target: { x: 0, y: 1, z: 0 },
  },
  ground: {
    width: 30,
    depth: 60,
    thickness: 1,
    friction: 0.6,
    color: "#333333",
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
    spawn: { x: 2, y:5, z: 2 }, // offset horizontal para no tapar el gizmo/ejes en el centro
  },
  hover: {
    height: 1.2,
    springStrength: 60,
    damping: 20, // antes 8 (subamortiguado) — causaba oscilación sostenida, ver poc2.md
    bobAmplitude: 0.05,
    bobFrequency: 0.5,
    hoverEngagementFactor: 2.5, // antes no existía -> undefined -> NaN -> nunca salía de Hovering
  },
  groundCheck: {
    coyoteTime: 0.15,
  },
  movement: {
    maxRollAngle: 0.35, // radianes (~20°) — placeholder, ajustar jugando
    rollLerpSpeed: 6,
    yawFromRollFactor: 1.5,
    forwardForce: 150, // Newtons — placeholder, ajustar jugando
    brakingDragFactor: 0.5, // antes hardcodeado en _updateForwardForce (POC1)
    driftGripFactor: 1, // antes hardcodeado en _applyLateralFriction (POC1)
    maxPitchAngle: 45, // grados
    pitchLerpSpeed: 5,
    pitchDiveAcceleration: 12,
  },
  boost: {
    impulse: 6,
    gliderLiftImpulse: 6,
    gliderPitchKick: 20,
    gliderDecayFactor: 0.6,
    jumpSettleDuration: 0.3,
    gliderSettleDuration: 0.3,
  },
  testImpulse: {
    downwardVelocityKick: 3, // placeholder — simula el peso del personaje aterrizando sobre el board
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
      spawn: { x: -2, y:5, z: -2 }, // offset horizontal para no tapar el gizmo/ejes en el centro
    }
  }

};