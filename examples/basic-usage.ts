/**
 * Basic Usage Example for Particle-Tracing
 * Demonstrates:
 * 1. Setting up a scene with light and glass geometry
 * 2. Emitting and tracing 10,000 photons
 * 3. Extracting 3D streamlines
 * 4. Querying surface caustics
 */

import {
  buildBVH,
  evaluateSurfaceCaustics,
  extractStreamlines,
  runParticleTracing,
  type LightSource,
  type RayTriangle
} from "../src/index.js";

// 1. Create a light source with Kelvin temperature
const spotLight: LightSource = {
  id: "spot1",
  kind: "spot",
  position: [0, 5, 0],
  direction: [0, -1, 0],
  color: "#ffffff",
  colorTemperature: 5500, // 5500K Direct Sunlight
  intensity: 10.0,
  range: 15,
  spotAngle: 35,
  spotSoftness: 0.2,
  enabled: true
};

// 2. Define a glass triangle in the path of the beam
const glassTriangle: RayTriangle = {
  v0: [-1, 2, -1],
  v1: [1, 2, -1],
  v2: [0, 2, 1],
  n0: [0, 1, 0],
  n1: [0, 1, 0],
  n2: [0, 1, 0],
  uv0: [0, 0],
  uv1: [1, 0],
  uv2: [0.5, 1],
  material: {
    color: "#ffffff",
    metalness: 0,
    roughness: 0,
    transmission: 1.0, // Optical glass
    ior: 1.5           // Crown glass
  },
  objectId: "prism"
};

// 3. Build spatial BVH
const bvh = buildBVH([glassTriangle]);

// 4. Run Particle-Tracing
const result = runParticleTracing([spotLight], bvh, {
  particleCount: 5000,
  maxBounces: 4,
  causticOnly: false,
  recordTrajectories: true
});

console.log("Particle-Tracing Complete:");
console.log(`- Total Emitted: ${result.photonMap.totalEmitted}`);
console.log(`- Caustic Deposits: ${result.photonMap.causticCount}`);
console.log(`- Indirect Deposits: ${result.photonMap.indirectCount}`);

// 5. Extract continuous streamlines
const streamlines = extractStreamlines(result.particles);
console.log(`- Streamline Paths: ${streamlines.length}`);

// 6. Evaluate surface caustics on the floor
const caustics = evaluateSurfaceCaustics(
  result.photonMap,
  [{ position: [0, 0, 0], normal: [0, 1, 0], albedo: [0.8, 0.8, 0.8] }],
  0.3
);
console.log("Floor Irradiance:", caustics[0].irradiance);
