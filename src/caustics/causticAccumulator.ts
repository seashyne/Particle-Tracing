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
