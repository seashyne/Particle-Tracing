import { describe, expect, it } from "vitest";
import type { LightParticle } from "../src/core/types.js";
import { evaluateStreamlinePulses } from "../src/streamlines/streamlineAnimation.js";
import { buildPhotonPointBuffers, buildStreamlineBuffers } from "../src/streamlines/streamlineBuffers.js";
import {
  extractStreamlines,
  filterStreamlines,
  subdivideStreamline
} from "../src/streamlines/streamlineGenerator.js";

describe("Particle-Tracing Streamlines (ลายเส้นอนุภาคแสง)", () => {
  const mockParticles: LightParticle[] = [
    {
      id: 1,
      position: [0, 5, 0],
      direction: [0, -1, 0],
      power: [1, 0.8, 0.2],
      bounceCount: 2,
      hasSpecularBounce: true,
      trajectory: [
        [0, 5, 0],
        [0, 2, 0],
        [1, 0, 0]
      ]
    },
    {
      id: 2,
      position: [1, 5, 0],
      direction: [0, -1, 0],
      power: [0.2, 0.5, 1.0],
      bounceCount: 1,
      hasSpecularBounce: false,
      trajectory: [
        [1, 5, 0],
        [1, 0, 0]
      ]
    }
  ];

  it("extracts continuous streamline paths and calculates total length", () => {
    const streamlines = extractStreamlines(mockParticles);
    expect(streamlines.length).toBe(2);
    expect(streamlines[0].particleId).toBe(1);
    expect(streamlines[0].hasCaustic).toBe(true);
    expect(streamlines[0].totalLength).toBeGreaterThan(3.0);
  });

  it("subdivides and smooths streamline paths", () => {
    const points: [number, number, number][] = [
      [0, 0, 0],
      [0, 10, 0]
    ];
    const subdivided = subdivideStreamline(points, 2);
    expect(subdivided.length).toBe(3);
    expect(subdivided[1]).toEqual([0, 5, 0]);
  });

  it("filters streamlines by caustic flags or length", () => {
    const streamlines = extractStreamlines(mockParticles);
    const causticOnly = filterStreamlines(streamlines, { causticOnly: true });
    expect(causticOnly.length).toBe(1);
    expect(causticOnly[0].particleId).toBe(1);
  });

  it("packs streamline paths into flat GPU attribute buffers", () => {
    const streamlines = extractStreamlines(mockParticles);
    const buffers = buildStreamlineBuffers(streamlines);

    // Particle 1 has 2 segments, Particle 2 has 1 segment -> Total 3 segments
    expect(buffers.segmentCount).toBe(3);
    // 3 segments * 6 floats = 18 floats for positions
    expect(buffers.positions.length).toBe(18);
    // 3 segments * 8 floats = 24 floats for colors
    expect(buffers.colors.length).toBe(24);
    // 3 segments * 2 floats = 6 floats for progress
    expect(buffers.progress.length).toBe(6);
  });

  it("evaluates real-time photon pulses traveling along streamlines", () => {
    const streamlines = extractStreamlines(mockParticles);
    const pulses = evaluateStreamlinePulses(streamlines, 0.5, 2.0);
    expect(pulses.length).toBe(2);
    expect(pulses[0].position).toBeDefined();
    expect(pulses[0].color).toBeDefined();
    expect(pulses[0].alpha).toBeGreaterThan(0);
  });
});
