import { describe, expect, it } from "vitest";
import { PARTICLE_TRACING_WGSL } from "../src/gpu/particleTracingWgsl.js";
import { isWebGpuSupported, WebGpuPhotonTracer } from "../src/gpu/webgpuPhotonTracer.js";
import type { LightSource, RayTriangle } from "../src/core/types.js";

describe("WebGPU Acceleration & WGSL Compute Shader", () => {
  it("defines complete WGSL compute shader with valid entrypoint and structs", () => {
    expect(PARTICLE_TRACING_WGSL).toContain("struct SimParams");
    expect(PARTICLE_TRACING_WGSL).toContain("struct LightSource");
    expect(PARTICLE_TRACING_WGSL).toContain("struct GpuTriangle");
    expect(PARTICLE_TRACING_WGSL).toContain("struct GpuPhotonDeposit");
    expect(PARTICLE_TRACING_WGSL).toContain("fn cs_main");
    expect(PARTICLE_TRACING_WGSL).toContain("@compute @workgroup_size(64)");
  });

  it("safely probes WebGPU availability without throwing in headless environments", async () => {
    const supported = await isWebGpuSupported();
    expect(typeof supported).toBe("boolean");
  });

  it("gracefully falls back to CPU forward particle tracing when GPU is unavailable", async () => {
    const tracer = new WebGpuPhotonTracer();

    const light: LightSource = {
      id: "spot_test",
      kind: "spot",
      position: [0, 5, 0],
      direction: [0, -1, 0],
      color: "#ffffff",
      intensity: 5.0,
      range: 20,
      spotAngle: 30,
      enabled: true
    };

    const tri: RayTriangle = {
      v0: [-1, 0, -1],
      v1: [1, 0, -1],
      v2: [0, 0, 1],
      n0: [0, 1, 0],
      n1: [0, 1, 0],
      n2: [0, 1, 0],
      uv0: [0, 0],
      uv1: [1, 0],
      uv2: [0.5, 1],
      material: { color: "#ffffff", metalness: 0, roughness: 1 },
      objectId: "floor"
    };

    const result = await tracer.trace([light], [tri], { particleCount: 100 });
    expect(result).toBeDefined();
    expect(result.photonCount).toBe(100);
    expect(result.executionTimeMs).toBeGreaterThan(0);
  });
});
