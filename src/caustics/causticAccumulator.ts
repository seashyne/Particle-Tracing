import type { PhotonMap, Vector3Tuple } from "../core/types.js";
import { estimatePhotonIrradiance } from "../spatial/photonKdTree.js";

export interface CausticSurfaceSample {
  position: Vector3Tuple;
  normal: Vector3Tuple;
  albedo: Vector3Tuple;
}

export interface CausticEvaluationResult {
  irradiance: Vector3Tuple;
  radiance: Vector3Tuple;
}

/**
 * Evaluates caustic light contribution at a set of surface points.
 */
export const evaluateSurfaceCaustics = (
  photonMap: PhotonMap,
  samples: CausticSurfaceSample[],
  searchRadius = 0.2,
  maxPhotons = 50
): CausticEvaluationResult[] => {
  return samples.map((sample) => {
    const irradiance = estimatePhotonIrradiance(
      photonMap,
      sample.position,
      sample.normal,
      searchRadius,
      maxPhotons
    );

    // Reflected caustic radiance = Irradiance * (Albedo / PI)
    const radiance: Vector3Tuple = [
      (irradiance[0] * sample.albedo[0]) / Math.PI,
      (irradiance[1] * sample.albedo[1]) / Math.PI,
      (irradiance[2] * sample.albedo[2]) / Math.PI
    ];

    return { irradiance, radiance };
  });
};

export interface CausticBakeConfig {
  width: number;
  height: number;
  worldBounds: {
    min: [number, number]; // [xMin, zMin]
    max: [number, number]; // [xMax, zMax]
  };
  intensityScale?: number;
  searchRadius?: number;
  maxPhotons?: number;
}

/**
 * Bakes photon caustics into a 2D Float32Array RGBA texture buffer.
 */
export const bakeCausticsTexture = (
  photonMap: PhotonMap,
  config: CausticBakeConfig
): Float32Array => {
  const { width, height, worldBounds } = config;
  const intensity = config.intensityScale ?? 1.0;
  const searchRadius = config.searchRadius ?? 0.25;
  const maxPhotons = config.maxPhotons ?? 40;

  const buffer = new Float32Array(width * height * 4);
  const xSpan = worldBounds.max[0] - worldBounds.min[0];
  const zSpan = worldBounds.max[1] - worldBounds.min[1];
  const normal: Vector3Tuple = [0, 1, 0];

  // Sample grid
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const worldZ = worldBounds.min[1] + v * zSpan;

    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const worldX = worldBounds.min[0] + u * xSpan;

      const irr = estimatePhotonIrradiance(
        photonMap,
        [worldX, 0, worldZ],
        normal,
        searchRadius,
        maxPhotons
      );

      const offset = (y * width + x) * 4;
      buffer[offset] = irr[0] * intensity;
      buffer[offset + 1] = irr[1] * intensity;
      buffer[offset + 2] = irr[2] * intensity;
      buffer[offset + 3] = 1.0;
    }
  }

  return buffer;
};

