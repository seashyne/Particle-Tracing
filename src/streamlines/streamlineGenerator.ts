import { vec3Distance, vec3Lerp } from "../core/math.js";
import type { LightParticle, StreamlinePath, Vector3Tuple } from "../core/types.js";

/**
 * Extracts continuous 3D streamline paths from traced light particles.
 */
export const extractStreamlines = (
  particles: LightParticle[]
): StreamlinePath[] => {
  const streamlines: StreamlinePath[] = [];

  for (const particle of particles) {
    if (particle.trajectory.length < 2) continue;

    let totalLength = 0;
    for (let i = 0; i < particle.trajectory.length - 1; i += 1) {
      totalLength += vec3Distance(particle.trajectory[i], particle.trajectory[i + 1]);
    }

    streamlines.push({
      particleId: particle.id,
      points: [...particle.trajectory],
      color: particle.power,
      hasCaustic: particle.hasSpecularBounce,
      totalLength
    });
  }

  return streamlines;
};

/**
 * Subdivides a streamline path using linear interpolation for high-fidelity rendering.
 */
export const subdivideStreamline = (
  points: Vector3Tuple[],
  segmentsPerStep = 2
): Vector3Tuple[] => {
  if (points.length < 2 || segmentsPerStep <= 1) return points;

  const result: Vector3Tuple[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    for (let s = 0; s < segmentsPerStep; s += 1) {
      result.push(vec3Lerp(p0, p1, s / segmentsPerStep));
    }
  }
  result.push(points[points.length - 1]);
  return result;
};

/**
 * Filters streamlines to keep only those exhibiting caustic refraction or minimum bounces.
 */
export const filterStreamlines = (
  streamlines: StreamlinePath[],
  options: { causticOnly?: boolean; minLength?: number; minBounces?: number } = {}
): StreamlinePath[] => {
  return streamlines.filter((s) => {
    if (options.causticOnly && !s.hasCaustic) return false;
    if (options.minLength !== undefined && s.totalLength < options.minLength) return false;
    if (options.minBounces !== undefined && s.points.length - 2 < options.minBounces) return false;
    return true;
  });
};
