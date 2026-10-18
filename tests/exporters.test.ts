import { describe, expect, it } from "vitest";
import {
  exportPhotonsToCsv,
  exportPhotonsToPly,
  exportStreamlinesToObj
} from "../src/exporters/pointCloudExporter";
import { computeSpectralIor, wavelengthToRgb } from "../src/tracer/dispersion";
import type { PhotonDeposit, StreamlineSegment } from "../src/core/types";

describe("Particle-Tracing Exporters & Spectral Dispersion", () => {
  it("exports deposited photons to valid Stanford PLY format with header and elements", () => {
    const mockPhotons: PhotonDeposit[] = [
      {
        position: [1.0, 2.5, -3.2],
        normal: [0, 1, 0],
        incidentDir: [0, -1, 0],
        power: [1.0, 0.5, 0.2],
        bounceCount: 2,
        isCaustic: true,
        objectId: "obj-glass-sphere"
      },
      {
        position: [-0.5, 0.0, 1.8],
        normal: [0, 1, 0],
        incidentDir: [0.5, -0.8, 0.2],
        power: [0.8, 0.8, 0.8],
        bounceCount: 1,
        isCaustic: false,
        objectId: "obj-floor"
      }
    ];

    const ply = exportPhotonsToPly(mockPhotons);

    expect(ply).toContain("ply\nformat ascii 1.0");
    expect(ply).toContain("element vertex 2");
    expect(ply).toContain("property float x");
    expect(ply).toContain("property uchar red");
    expect(ply).toContain("end_header");
    expect(ply).toContain("1.0000 2.5000 -3.2000");
    expect(ply).toContain("255 128 51");
  });

  it("exports streamline segments to standard Wavefront OBJ polylines with colors", () => {
    const mockSegments: StreamlineSegment[] = [
      {
        p0: [0, 5, 0],
        p1: [0, 2, 0],
        color: [1, 0.9, 0.2],
        alpha: 0.9,
        bounceIndex: 0,
        particleId: 1
      },
      {
        p0: [0, 2, 0],
        p1: [1.5, 0, 0.5],
        color: [0.3, 0.8, 1],
        alpha: 0.85,
        bounceIndex: 1,
        particleId: 1
      }
    ];

    const obj = exportStreamlinesToObj(mockSegments);

    expect(obj).toContain("# Particle-Tracing Streamlines Exporter");
    expect(obj).toContain("o Streamlines");
    expect(obj).toContain("v 0.0000 5.0000 0.0000 1.000 0.900 0.200");
    expect(obj).toContain("l 1 2");
    expect(obj).toContain("l 3 4");
  });

  it("exports photons to CSV format with headers and floating coordinates", () => {
    const mockPhotons: PhotonDeposit[] = [
      {
        position: [2.12345, 0.0, 5.67891],
        normal: [0, 1, 0],
        incidentDir: [0, -1, 0],
        power: [0.95, 0.2, 0.1],
        bounceCount: 3,
        isCaustic: true,
        objectId: "wine-glass"
      }
    ];

    const csv = exportPhotonsToCsv(mockPhotons);

    expect(csv).toContain("x,y,z,nx,ny,nz,power_r,power_g,power_b,bounce_count,is_caustic,object_id");
    expect(csv).toContain("2.12345,0.00000,5.67891");
    expect(csv).toContain('"wine-glass"');
  });

  it("calculates wavelength dispersion Cauchy index showing red < green < blue refraction", () => {
    const baseIor = 1.5;
    const nRed = computeSpectralIor(baseIor, 650); // Red
    const nGreen = computeSpectralIor(baseIor, 532); // Green
    const nBlue = computeSpectralIor(baseIor, 450); // Blue

    // Physical law: shorter wavelength (blue) has higher refractive index than red
    expect(nBlue).toBeGreaterThan(nGreen);
    expect(nGreen).toBeGreaterThan(nRed);
    expect(nRed).toBeGreaterThan(1.48);
    expect(nBlue).toBeLessThan(1.55);
  });

  it("converts visible wavelengths to realistic CIE RGB components", () => {
    const redRgb = wavelengthToRgb(680);
    expect(redRgb[0]).toBeGreaterThan(0.7);
    expect(redRgb[1]).toBeLessThan(0.1);

    const greenRgb = wavelengthToRgb(530);
    expect(greenRgb[1]).toBeGreaterThan(0.7);
    expect(greenRgb[0]).toBeLessThan(0.3);

    const blueRgb = wavelengthToRgb(460);
    expect(blueRgb[2]).toBeGreaterThan(0.7);
    expect(blueRgb[0]).toBeLessThan(0.1);
  });
});
