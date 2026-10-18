import type { PhotonDeposit, StreamlineSegment } from "../core/types.js";

/**
 * Exports deposited photons to standard Stanford PLY (Polygon File Format) ASCII point cloud.
 * Compatible with Blender Cycles, CloudCompare, MeshLab, and Houdini point cloud renderers.
 */
export const exportPhotonsToPly = (photons: PhotonDeposit[]): string => {
  const count = photons.length;
  const header = [
    "ply",
    "format ascii 1.0",
    "comment Particle-Tracing Caustic Photon Cloud",
    `element vertex ${count}`,
    "property float x",
    "property float y",
    "property float z",
    "property float nx",
    "property float ny",
    "property float nz",
    "property uchar red",
    "property uchar green",
    "property uchar blue",
    "end_header"
  ].join("\n");

  const lines = photons.map((p) => {
    const x = p.position[0].toFixed(4);
    const y = p.position[1].toFixed(4);
    const z = p.position[2].toFixed(4);
    const nx = p.normal[0].toFixed(4);
    const ny = p.normal[1].toFixed(4);
    const nz = p.normal[2].toFixed(4);

    // Tone map photon power to 0-255 uchar
    const r = Math.min(255, Math.round(Math.min(1.0, p.power[0]) * 255));
    const g = Math.min(255, Math.round(Math.min(1.0, p.power[1]) * 255));
    const b = Math.min(255, Math.round(Math.min(1.0, p.power[2]) * 255));

    return `${x} ${y} ${z} ${nx} ${ny} ${nz} ${r} ${g} ${b}`;
  });

  return `${header}\n${lines.join("\n")}\n`;
};

/**
 * Exports photon streamline segments to Wavefront OBJ format as 3D polylines.
 * Instantly importable into Blender (`File > Import > Wavefront OBJ`), Maya, and 3ds Max.
 */
export const exportStreamlinesToObj = (segments: StreamlineSegment[]): string => {
  const header = [
    "# Particle-Tracing Streamlines Exporter",
    `# Total Segments: ${segments.length}`,
    "o Streamlines"
  ].join("\n");

  const vertices: string[] = [];
  const lines: string[] = [];

  segments.forEach((seg, index) => {
    const v1Index = index * 2 + 1;
    const v2Index = index * 2 + 2;

    const p0 = `${seg.p0[0].toFixed(4)} ${seg.p0[1].toFixed(4)} ${seg.p0[2].toFixed(4)}`;
    const p1 = `${seg.p1[0].toFixed(4)} ${seg.p1[1].toFixed(4)} ${seg.p1[2].toFixed(4)}`;

    // OBJ supports RGB vertex colors formatted after vertex positions (x y z r g b)
    const color = `${seg.color[0].toFixed(3)} ${seg.color[1].toFixed(3)} ${seg.color[2].toFixed(3)}`;

    vertices.push(`v ${p0} ${color}`);
    vertices.push(`v ${p1} ${color}`);
    lines.push(`l ${v1Index} ${v2Index}`);
  });

  return `${header}\n${vertices.join("\n")}\n${lines.join("\n")}\n`;
};

/**
 * Exports photons to standard CSV format for scientific, statistical, and photometric analysis.
 */
export const exportPhotonsToCsv = (photons: PhotonDeposit[]): string => {
  const header = "x,y,z,nx,ny,nz,power_r,power_g,power_b,bounce_count,is_caustic,object_id";
  const rows = photons.map((p) => [
    p.position[0].toFixed(5),
    p.position[1].toFixed(5),
    p.position[2].toFixed(5),
    p.normal[0].toFixed(4),
    p.normal[1].toFixed(4),
    p.normal[2].toFixed(4),
    p.power[0].toFixed(4),
    p.power[1].toFixed(4),
    p.power[2].toFixed(4),
    p.bounceCount,
    p.isCaustic ? 1 : 0,
    `"${p.objectId}"`
  ].join(","));

  return `${header}\n${rows.join("\n")}\n`;
};
