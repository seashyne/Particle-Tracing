// Core types and mathematical operations
export * from "./core/types.js";
export * from "./core/math.js";
export * from "./core/intersections.js";
export * from "./core/bvh.js";

// Emitter
export * from "./emitter/photonEmitter.js";

// Forward Tracer
export * from "./tracer/particleTracer.js";

// Spatial Acceleration & Density Estimation
export * from "./spatial/photonKdTree.js";

// Streamlines & Particle Flow (ลายเส้นอนุภาคแสง)
export * from "./streamlines/streamlineGenerator.js";
export * from "./streamlines/streamlineBuffers.js";
export * from "./streamlines/streamlineAnimation.js";

// Caustic Evaluation
export * from "./caustics/causticAccumulator.js";

// WebGPU Compute Acceleration (Massively Parallel GPU Photon Tracing)
export * from "./gpu/particleTracingWgsl.js";
export * from "./gpu/webgpuPhotonTracer.js";

import type { BVHNode } from "./core/bvh.js";
import type {
  LightParticle,
  LightSource,
  ParticleTracingOptions,
  PhotonDeposit,
  PhotonMap,
  StreamlineBuffers,
  StreamlinePath,
  Vector3Tuple
} from "./core/types.js";
import { defaultOptions, runParticleTracing } from "./tracer/particleTracer.js";
import { buildPhotonKdTree, estimatePhotonIrradiance } from "./spatial/photonKdTree.js";
import {
  extractStreamlines,
  filterStreamlines,
  subdivideStreamline
} from "./streamlines/streamlineGenerator.js";
import { buildStreamlineBuffers } from "./streamlines/streamlineBuffers.js";
import {
  bakeCausticsTexture,
  CausticBakeConfig,
  CausticSurfaceSample,
  evaluateSurfaceCaustics
} from "./caustics/causticAccumulator.js";

/**
 * Object-oriented facade for running forward photon and particle tracing simulations.
 */
export class ParticleTracer {
  private options: ParticleTracingOptions;

  constructor(options?: Partial<ParticleTracingOptions>) {
    this.options = { ...defaultOptions, ...options };
  }

  trace(lights: LightSource[], bvh: BVHNode, options?: Partial<ParticleTracingOptions>) {
    return runParticleTracing(lights, bvh, { ...this.options, ...options });
  }
}

/**
 * Object-oriented facade for balanced 3D k-d tree photon queries.
 */
export class PhotonKdTree {
  private map: PhotonMap | null = null;

  build(photons: PhotonDeposit[], totalEmitted = photons.length): PhotonMap {
    const root = buildPhotonKdTree([...photons]);
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    let causticCount = 0;
    let indirectCount = 0;

    for (const p of photons) {
      minX = Math.min(minX, p.position[0]);
      minY = Math.min(minY, p.position[1]);
      minZ = Math.min(minZ, p.position[2]);
      maxX = Math.max(maxX, p.position[0]);
      maxY = Math.max(maxY, p.position[1]);
      maxZ = Math.max(maxZ, p.position[2]);
      if (p.isCaustic) causticCount += 1;
      else indirectCount += 1;
    }

    const map: PhotonMap = {
      photons,
      root,
      bounds: {
        min: [
          minX === Infinity ? 0 : minX,
          minY === Infinity ? 0 : minY,
          minZ === Infinity ? 0 : minZ
        ],
        max: [
          maxX === -Infinity ? 0 : maxX,
          maxY === -Infinity ? 0 : maxY,
          maxZ === -Infinity ? 0 : maxZ
        ]
      },
      totalEmitted,
      causticCount,
      indirectCount
    };

    this.map = map;
    return map;
  }

  estimateRadiance(
    pos: Vector3Tuple,
    normal: Vector3Tuple,
    radius = 0.25,
    maxPhotons = 50
  ): Vector3Tuple {
    if (!this.map) return [0, 0, 0];
    return estimatePhotonIrradiance(this.map, pos, normal, radius, maxPhotons);
  }

  getPhotonMap(): PhotonMap | null {
    return this.map;
  }
}

/**
 * Object-oriented facade for extracting and smoothing particle streamlines (ลายเส้น).
 */
export class StreamlineGenerator {
  extract(particles: LightParticle[]): StreamlinePath[] {
    return extractStreamlines(particles);
  }

  filter(
    paths: StreamlinePath[],
    options?: { minBounces?: number; causticOnly?: boolean; minLength?: number }
  ): StreamlinePath[] {
    return filterStreamlines(paths, options);
  }

  subdivide(paths: StreamlinePath[], divisions = 2): StreamlinePath[] {
    return paths.map((p) => ({
      ...p,
      points: subdivideStreamline(p.points, divisions)
    }));
  }
}

/**
 * Object-oriented facade for packing streamline trajectories into GPU typed arrays.
 */
export class StreamlineBufferBuilder {
  build(paths: StreamlinePath[]): StreamlineBuffers {
    return buildStreamlineBuffers(paths);
  }
}

/**
 * Object-oriented facade for evaluating and baking surface caustics.
 */
export class CausticAccumulator {
  bake(photonMap: PhotonMap, config: CausticBakeConfig): Float32Array {
    return bakeCausticsTexture(photonMap, config);
  }

  evaluate(
    photonMap: PhotonMap,
    samples: CausticSurfaceSample[],
    radius = 0.2,
    maxPhotons = 50
  ) {
    return evaluateSurfaceCaustics(photonMap, samples, radius, maxPhotons);
  }
}

