import type {
  LightSource,
  ParticleTracingOptions,
  RayTriangle
} from "../core/types.js";
import { defaultOptions, runParticleTracing } from "../tracer/particleTracer.js";
import { buildBVH } from "../core/bvh.js";
import { PARTICLE_TRACING_WGSL } from "./particleTracingWgsl.js";

export interface WebGpuTraceResult {
  isGpuAccelerated: boolean;
  photonDeposits?: Float32Array;
  streamlinePositions?: Float32Array;
  streamlineColors?: Float32Array;
  streamlineProgress?: Float32Array;
  executionTimeMs: number;
  photonCount: number;
}

/**
 * Checks whether WebGPU is supported and available in the current runtime.
 */
export const isWebGpuSupported = async (): Promise<boolean> => {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    return false;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
};

/**
 * High-performance WebGPU coordinator for forward photon simulation.
 * Dispatches compute shaders across thousands of GPU cores with automatic CPU fallback.
 */
export class WebGpuPhotonTracer {
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;

  async initialize(customDevice?: GPUDevice): Promise<boolean> {
    if (customDevice) {
      this.device = customDevice;
    } else if (typeof navigator !== "undefined" && "gpu" in navigator) {
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: "high-performance"
      });
      if (adapter) {
        this.device = await adapter.requestDevice();
      }
    }

    if (!this.device) {
      return false;
    }

    const shaderModule = this.device.createShaderModule({
      label: "Particle-Tracing WGSL",
      code: PARTICLE_TRACING_WGSL
    });

    this.pipeline = await this.device.createComputePipelineAsync({
      label: "Particle-Tracing Pipeline",
      layout: "auto",
      compute: {
        module: shaderModule,
        entryPoint: "cs_main"
      }
    });

    return true;
  }

  /**
   * Executes forward photon tracing on the GPU if available, or falls back to CPU BVH.
   */
  async trace(
    lights: LightSource[],
    triangles: RayTriangle[],
    options?: Partial<ParticleTracingOptions>
  ): Promise<WebGpuTraceResult> {
    const opts = { ...defaultOptions, ...options };
    const t0 = performance.now();

    if (!this.device || !this.pipeline) {
      const initialized = await this.initialize();
      if (!initialized || !this.device || !this.pipeline) {
        return this.runCpuFallback(lights, triangles, opts, t0);
      }
    }

    try {
      const photonCount = opts.particleCount;
      const maxBounces = opts.maxBounces;
      const triangleCount = triangles.length;

      // 1. Pack Uniforms (32 bytes)
      const uniformData = new ArrayBuffer(32);
      const u32View = new Uint32Array(uniformData);
      const f32View = new Float32Array(uniformData);

      u32View[0] = photonCount;
      u32View[1] = triangleCount;
      u32View[2] = lights.length;
      u32View[3] = maxBounces;
      u32View[4] = Math.floor(Math.random() * 65536);
      u32View[5] = opts.enableDispersion ? 1 : 0;
      f32View[6] = opts.searchRadius;
      f32View[7] = 1.0;

      const uniformBuffer = this.device.createBuffer({
        size: uniformData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);

      // 2. Pack Lights (64 bytes per light)
      const lightData = new Float32Array(Math.max(1, lights.length) * 16);
      for (let i = 0; i < lights.length; i += 1) {
        const l = lights[i];
        const offset = i * 16;
        lightData[offset] = l.position[0];
        lightData[offset + 1] = l.position[1];
        lightData[offset + 2] = l.position[2];
        lightData[offset + 3] = 1.0;

        lightData[offset + 4] = l.direction[0];
        lightData[offset + 5] = l.direction[1];
        lightData[offset + 6] = l.direction[2];
        lightData[offset + 7] = 0.0;

        lightData[offset + 8] = 1.0;
        lightData[offset + 9] = 1.0;
        lightData[offset + 10] = 1.0;
        lightData[offset + 11] = 1.0;

        lightData[offset + 12] = l.intensity;
        lightData[offset + 13] = ((l.spotAngle ?? 30) * Math.PI) / 180;
        lightData[offset + 14] = l.kind === "spot" ? 2 : l.kind === "point" ? 1 : 0;
        lightData[offset + 15] = l.enabled ? 1.0 : 0.0;
      }

      const lightBuffer = this.device.createBuffer({
        size: Math.max(64, lightData.byteLength),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });
      this.device.queue.writeBuffer(lightBuffer, 0, lightData);

      // 3. Pack Triangles (112 bytes per triangle: 7 vec4s)
      const triData = new Float32Array(Math.max(1, triangleCount) * 28);
      for (let i = 0; i < triangleCount; i += 1) {
        const t = triangles[i];
        const offset = i * 28;

        // v0, v1, v2
        triData[offset] = t.v0[0]; triData[offset + 1] = t.v0[1]; triData[offset + 2] = t.v0[2]; triData[offset + 3] = 0;
        triData[offset + 4] = t.v1[0]; triData[offset + 5] = t.v1[1]; triData[offset + 6] = t.v1[2]; triData[offset + 7] = 0;
        triData[offset + 8] = t.v2[0]; triData[offset + 9] = t.v2[1]; triData[offset + 10] = t.v2[2]; triData[offset + 11] = 0;

        // n0, n1, n2
        triData[offset + 12] = t.n0[0]; triData[offset + 13] = t.n0[1]; triData[offset + 14] = t.n0[2]; triData[offset + 15] = 0;
        triData[offset + 16] = t.n1[0]; triData[offset + 17] = t.n1[1]; triData[offset + 18] = t.n1[2]; triData[offset + 19] = 0;
        triData[offset + 20] = t.n2[0]; triData[offset + 21] = t.n2[1]; triData[offset + 22] = t.n2[2]; triData[offset + 23] = 0;

        // material: x: ior, y: transmission, z: roughness, w: metalness
        triData[offset + 24] = t.material.ior ?? 1.5;
        triData[offset + 25] = t.material.transmission ?? 0.0;
        triData[offset + 26] = t.material.roughness ?? 0.5;
        triData[offset + 27] = t.material.metalness ?? 0.0;
      }

      const triBuffer = this.device.createBuffer({
        size: Math.max(112, triData.byteLength),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });
      this.device.queue.writeBuffer(triBuffer, 0, triData);

      // 4. Output Storage Buffers
      const depositBufferSize = photonCount * 48; // 3 vec4s per deposit
      const depositBuffer = this.device.createBuffer({
        size: depositBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
      });

      const totalStreamlineVertices = photonCount * maxBounces * 2;
      const streamlineBufferSize = totalStreamlineVertices * 32; // 2 vec4s per vertex (pos+progress, color)
      const streamlineBuffer = this.device.createBuffer({
        size: streamlineBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
      });

      // 5. Create BindGroup
      const bindGroup = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: { buffer: lightBuffer } },
          { binding: 2, resource: { buffer: triBuffer } },
          { binding: 3, resource: { buffer: depositBuffer } },
          { binding: 4, resource: { buffer: streamlineBuffer } }
        ]
      });

      // 6. Dispatch Compute Pass
      const commandEncoder = this.device.createCommandEncoder();
      const pass = commandEncoder.beginComputePass();
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, bindGroup);
      const workgroupCount = Math.ceil(photonCount / 64);
      pass.dispatchWorkgroups(workgroupCount);
      pass.end();

      // Readback Staging Buffer for Streamlines
      const readbackBuffer = this.device.createBuffer({
        size: streamlineBufferSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
      });
      commandEncoder.copyBufferToBuffer(streamlineBuffer, 0, readbackBuffer, 0, streamlineBufferSize);

      this.device.queue.submit([commandEncoder.finish()]);

      // Map readback
      await readbackBuffer.mapAsync(GPUMapMode.READ);
      const rawStreamlines = new Float32Array(readbackBuffer.getMappedRange().slice(0));
      readbackBuffer.unmap();

      // Unpack positions and colors
      const vertexCount = totalStreamlineVertices;
      const positions = new Float32Array(vertexCount * 3);
      const progress = new Float32Array(vertexCount);
      const colors = new Float32Array(vertexCount * 4);

      for (let v = 0; v < vertexCount; v += 1) {
        const base = v * 8;
        positions[v * 3] = rawStreamlines[base];
        positions[v * 3 + 1] = rawStreamlines[base + 1];
        positions[v * 3 + 2] = rawStreamlines[base + 2];
        progress[v] = rawStreamlines[base + 3];

        colors[v * 4] = rawStreamlines[base + 4];
        colors[v * 4 + 1] = rawStreamlines[base + 5];
        colors[v * 4 + 2] = rawStreamlines[base + 6];
        colors[v * 4 + 3] = rawStreamlines[base + 7];
      }

      const executionTime = performance.now() - t0;
      return {
        isGpuAccelerated: true,
        streamlinePositions: positions,
        streamlineColors: colors,
        streamlineProgress: progress,
        executionTimeMs: executionTime,
        photonCount
      };
    } catch {
      return this.runCpuFallback(lights, triangles, opts, t0);
    }
  }

  private runCpuFallback(
    lights: LightSource[],
    triangles: RayTriangle[],
    opts: ParticleTracingOptions,
    t0: number
  ): WebGpuTraceResult {
    const bvh = buildBVH(triangles);
    const result = runParticleTracing(lights, bvh, opts);
    return {
      isGpuAccelerated: false,
      executionTimeMs: performance.now() - t0,
      photonCount: result.photonMap.totalEmitted
    };
  }
}
