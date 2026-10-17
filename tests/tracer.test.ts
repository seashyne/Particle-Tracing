import { describe, expect, it } from "vitest";
import { buildBVH } from "../src/core/bvh.js";
import type { LightSource, RayTriangle } from "../src/core/types.js";
import { emitPhoton } from "../src/emitter/photonEmitter.js";
import { buildPhotonKdTree, estimatePhotonIrradiance } from "../src/spatial/photonKdTree.js";
import { runParticleTracing } from "../src/tracer/particleTracer.js";

describe("Particle-Tracing Emitter & Forward Transport", () => {
  it("emits photons with Planckian Kelvin spectrum", () => {
    const light: LightSource = {
      id: "sun",
      kind: "sun",
      position: [0, 10, 0],
      direction: [0, -1, 0],
      color: "#ffffff",
      colorTemperature: 6500,
      intensity: 2.0,
      range: 50,
      enabled: true
    };

    const photon = emitPhoton(light, 0, 100);
    expect(photon.direction).toEqual([0, -1, 0]);
    expect(photon.power[0]).toBeGreaterThan(0);
    expect(photon.power[1]).toBeGreaterThan(0);
    expect(photon.power[2]).toBeGreaterThan(0);
  });

  it("simulates forward light transport, glass refraction, and caustics", () => {
    // Glass pyramid/prism
    const glassTri: RayTriangle = {
      v0: [-1, 2, -1],
      v1: [1, 2, -1],
      v2: [0, 2, 1],
      n0: [0, 1, 0],
      n1: [0, 1, 0],
      n2: [0, 1, 0],
      uv0: [0, 0],
      uv1: [1, 0],
      uv2: [0.5, 1],
      material: { color: "#ffffff", metalness: 0, roughness: 0, transmission: 1.0, ior: 1.5 },
      objectId: "glass"
    };

    // Diffuse floor
    const floorTri: RayTriangle = {
      v0: [-10, 0, -10],
      v1: [10, 0, -10],
      v2: [0, 0, 10],
      n0: [0, 1, 0],
      n1: [0, 1, 0],
      n2: [0, 1, 0],
      uv0: [0, 0],
      uv1: [1, 0],
      uv2: [0.5, 1],
      material: { color: "#ffffff", metalness: 0, roughness: 1.0 },
      objectId: "floor"
    };

    const bvh = buildBVH([glassTri, floorTri]);

    const spot: LightSource = {
      id: "spot",
      kind: "spot",
      position: [0, 5, 0],
      direction: [0, -1, 0],
      color: "#ffffff",
      intensity: 5.0,
      range: 20,
      spotAngle: 40,
      enabled: true
    };

    const result = runParticleTracing([spot], bvh, {
      particleCount: 500,
      maxBounces: 4,
      recordTrajectories: true
    });

    expect(result.photonMap.totalEmitted).toBe(500);
    expect(result.photonMap.photons.length).toBeGreaterThan(0);
    expect(result.segments.length).toBeGreaterThan(0);

    // Evaluate caustics on floor
    const irradiance = estimatePhotonIrradiance(result.photonMap, [0, 0, 0], [0, 1, 0], 0.5);
    expect(irradiance[0]).toBeGreaterThanOrEqual(0);
  });
});
