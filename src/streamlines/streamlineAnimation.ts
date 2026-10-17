import { vec3Distance, vec3Lerp } from "../core/math.js";
import type { StreamlinePath, Vector3Tuple } from "../core/types.js";

export interface AnimatedPhotonPulse {
  particleId: number;
  position: Vector3Tuple;
  color: Vector3Tuple;
  alpha: number;
}

/**
 * Samples the 3D position of photons traveling along streamlines at a given elapsed time.
 */
export const evaluateStreamlinePulses = (
  paths: StreamlinePath[],
  timeSeconds: number,
  speedMetersPerSecond = 5.0
): AnimatedPhotonPulse[] => {
  const pulses: AnimatedPhotonPulse[] = [];

  for (const path of paths) {
    if (path.points.length < 2 || path.totalLength <= 0) continue;

    // Cyclic distance along the trajectory
    const travelDist = (timeSeconds * speedMetersPerSecond + path.particleId * 0.3) % path.totalLength;

    let accumulated = 0;
    for (let i = 0; i < path.points.length - 1; i += 1) {
      const p0 = path.points[i];
      const p1 = path.points[i + 1];
      const segLen = vec3Distance(p0, p1);

      if (accumulated + segLen >= travelDist) {
        const segT = (travelDist - accumulated) / Math.max(1e-4, segLen);
        const pos = vec3Lerp(p0, p1, segT);
        const progress = travelDist / path.totalLength;

        pulses.push({
          particleId: path.particleId,
          position: pos,
          color: path.color,
          alpha: Math.max(0.2, 1.0 - progress * 0.6)
        });
        break;
      }

      accumulated += segLen;
    }
  }

  return pulses;
};
