import { Tools, Vector3 } from "@babylonjs/core";

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
    width: 0.3,
    height: 0.1,
    depth: 1.2,
    mass: 20,
    friction: 0.2,
    restitution: 0,
    color: "#00e5ff",
    emissiveColor: "#0a4a52",
    spawn: { x: 2, y: 5, z: 2 }, // offset horizontal para no tapar el gizmo/ejes en el centro
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
    rollSpeedRange: {
      min: 0,  // por debajo de esto, se usa maxRollAngle completo
      max: 30, // por encima de esto, se usa minRollAngle completo (podés alinearlo con tus umbrales de cruising)
    },
    rollAngleAtLowSpeed: Tools.ToRadians(35),  // giro cerrado, velocidad baja
    rollAngleAtHighSpeed: Tools.ToRadians(12), // giro amplio, velocidad alta
    rollLerpSpeed: 6,
    yawFromRollFactor: 1.5,
    forwardForce: 150, // Newtons — placeholder, ajustar jugando
    brakingDragFactor: 0.5, // antes hardcodeado en _updateForwardForce (POC1)
    driftGripFactor: 1, // antes hardcodeado en _applyLateralFriction (POC1)
    maxPitchAngle: 45, // grados
    pitchLerpSpeed: 5,
    pitchDiveAcceleration: 12,
    surfaceAlignLerpSpeed: 6, // qué tan rápido el board "cae" en el ángulo de la rampa; ajustá a gusto
  },
  boost: {
    impulse: 10,
    gliderLiftImpulse: 6,
    gliderPitchKick: 20,
    gliderDecayFactor: 0.6,
    jumpSettleDuration: 0.3,
    gliderSettleDuration: 0.3,
  },
  testImpulse: {
    downwardVelocityKick: 3, // placeholder — simula el peso del personaje aterrizando sobre el board
  },
  cruising: {
    speedThresholds: {
      idleToFast: 10,
      fastToIdle: 8,      // hysteresis
      fastToVeryFast: 25,
      veryFastToFast: 22, // hysteresis
    },
  },
  ramp: {
    width: 20,       // podés reusar generalConfig.ground.width si querés el mismo ancho
    length: 25,       // largo de la rampa (medido sobre su propia pendiente)
    thickness: 1,      // igual que generalConfig.ground.thickness, o distinto si preferís
    angleDeg: 30,
    baseZ: 150,        // dónde arranca (el extremo bajo) dentro de "ground-alta" (spans z: -200 a 200)
  },
  thruster: {
    backOffset: -0.6,     // en espacio LOCAL del board, hacia atrás (ajustar signo/eje según tu modelo)
    heightOffset: -0.05,   // levemente arriba de la superficie del board
    direction: new Vector3(0, 0, -1), // dirección local "hacia atrás" (mismo eje que backOffset)
    minEmitRate: 10,
    maxEmitRate: 100,
    speedNormalizer: 25,  // alineado con tu umbral fastToVeryFast, así a esa velocidad ya es intensidad máxima
  },
  playerConfig: {
    initialLives: 5,
    // height: 1.8,
    height: 0.8,
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
      spawn: { x: -2, y: 5, z: -2 }, // offset horizontal para no tapar el gizmo/ejes en el centro
    }
  }

};