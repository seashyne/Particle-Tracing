import { vec3Distance } from "../core/math.js";
import type { PhotonDeposit, StreamlineBuffers, StreamlinePath } from "../core/types.js";

export interface PhotonPointBuffers {
  positions: Float32Array;
  colors: Float32Array;
  count: number;
}

/**
 * Packs streamline paths into high-performance Float32Array buffers ready for WebGPU or Three.js.
 */
export const buildStreamlineBuffers = (
  paths: StreamlinePath[]
): StreamlineBuffers => {
  let totalSegments = 0;
  for (const p of paths) {
    if (p.points.length >= 2) {
      totalSegments += p.points.length - 1;
    }
  }

  const positions = new Float32Array(totalSegments * 6);
  const colors = new Float32Array(totalSegments * 8);
  const progress = new Float32Array(totalSegments * 2);

  let segIndex = 0;

  for (const path of paths) {
    if (path.points.length < 2) continue;

    let accumulatedDist = 0;
    const totalDist = Math.max(1e-4, path.totalLength);

    for (let i = 0; i < path.points.length - 1; i += 1) {
      const p0 = path.points[i];
      const p1 = path.points[i + 1];
      const segLen = vec3Distance(p0, p1);

      const uStart = accumulatedDist / totalDist;
      accumulatedDist += segLen;
      const uEnd = accumulatedDist / totalDist;

      const posOffset = segIndex * 6;
      const colOffset = segIndex * 8;
      const progOffset = segIndex * 2;

      // Positions
      positions[posOffset] = p0[0];
      positions[posOffset + 1] = p0[1];
      positions[posOffset + 2] = p0[2];
      positions[posOffset + 3] = p1[0];
      positions[posOffset + 4] = p1[1];
      positions[posOffset + 5] = p1[2];

      // Colors with distance attenuation
      const r = Math.min(1.0, Math.max(0.05, path.color[0] * 5.0));
      const g = Math.min(1.0, Math.max(0.05, path.color[1] * 5.0));
      const b = Math.min(1.0, Math.max(0.05, path.color[2] * 5.0));

      const alphaStart = Math.max(0.2, 1.0 - uStart * 0.7);
      const alphaEnd = Math.max(0.1, 1.0 - uEnd * 0.7);

      colors[colOffset] = r;
      colors[colOffset + 1] = g;
      colors[colOffset + 2] = b;
      colors[colOffset + 3] = alphaStart;

      colors[colOffset + 4] = r * 0.85;
      colors[colOffset + 5] = g * 0.85;
      colors[colOffset + 6] = b * 0.85;
      colors[colOffset + 7] = alphaEnd;

      // Progress along path (0.0 at light emission, 1.0 at final hit)
      progress[progOffset] = uStart;
      progress[progOffset + 1] = uEnd;

      segIndex += 1;
    }
  }

  return { positions, colors, progress, segmentCount: totalSegments };
};

/**
 * Packs deposited photon hits into point sparkle buffers.
 */
export const buildPhotonPointBuffers = (
  photons: PhotonDeposit[],
  maxPoints = 20000
): PhotonPointBuffers => {
  const count = Math.min(photons.length, maxPoints);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);

  for (let i = 0; i < count; i += 1) {
    const p = photons[i];
    const posOffset = i * 3;
    const colOffset = i * 4;

    positions[posOffset] = p.position[0];
    positions[posOffset + 1] = p.position[1];
    positions[posOffset + 2] = p.position[2];

    if (p.isCaustic) {
      // Crisp cyan-gold sparkle highlight for caustic hits
      colors[colOffset] = 0.35;
      colors[colOffset + 1] = 0.95;
      colors[colOffset + 2] = 1.0;
      colors[colOffset + 3] = 0.95;
    } else {
      colors[colOffset] = Math.min(1.0, p.power[0] * 8);
      colors[colOffset + 1] = Math.min(1.0, p.power[1] * 8);
      colors[colOffset + 2] = Math.min(1.0, p.power[2] * 8);
      colors[colOffset + 3] = 0.55;
    }
  }

  return { positions, colors, count };
};
