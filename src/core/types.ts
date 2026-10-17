export type Vector3Tuple = [number, number, number];
export type Vector2Tuple = [number, number];

/**
 * 3D Ray with precomputed inverse directions for fast branchless slab intersection.
 */
export interface Ray3D {
  origin: Vector3Tuple;
  direction: Vector3Tuple;
  invDirection: Vector3Tuple;
  tMin: number;
  tMax: number;
}

/**
 * Axis-Aligned Bounding Box (AABB) for spatial acceleration.
 */
export interface AABB {
  min: Vector3Tuple;
  max: Vector3Tuple;
}

/**
 * Physically Based Rendering (PBR) surface material properties.
 */
export interface SurfaceMaterial {
  color: string;
  metalness: number;
  roughness: number;
  transmission?: number; // 0 = opaque, 1 = optical glass
  ior?: number;          // Index of refraction (default 1.5)
  emissionColor?: string;
  opacity?: number;
}

/**
 * Geometric triangle with vertices, smooth normals, and texture coordinates.
 */
export interface RayTriangle {
  v0: Vector3Tuple;
  v1: Vector3Tuple;
  v2: Vector3Tuple;
  n0: Vector3Tuple;
  n1: Vector3Tuple;
  n2: Vector3Tuple;
  uv0: Vector2Tuple;
  uv1: Vector2Tuple;
  uv2: Vector2Tuple;
  material: SurfaceMaterial;
  objectId: string;
}

/**
 * Record of ray-geometry intersection.
 */
export interface RayHit {
  hit: boolean;
  distance: number;
  point: Vector3Tuple;
  normal: Vector3Tuple;
  uv: Vector2Tuple;
  material: SurfaceMaterial;
  objectId: string;
  frontFace: boolean;
}

/**
 * Supported light source types for photon emission.
 */
export type LightKind = "sun" | "point" | "spot" | "area";

/**
 * Emitter light source configuration.
 */
export interface LightSource {
  id: string;
  kind: LightKind;
  position: Vector3Tuple;
  direction: Vector3Tuple;
  color: string;
  /** Correlated color temperature in Kelvin (1,000K to 12,000K). */
  colorTemperature?: number;
  intensity: number;
  range: number;
  spotAngle?: number;
  spotSoftness?: number;
  /** Width and height in meters for rectangular area lights. */
  areaSize?: [number, number];
  enabled: boolean;
}

/**
 * An individual photon / particle traveling through 3D space.
 */
export interface LightParticle {
  id: number;
  position: Vector3Tuple;
  direction: Vector3Tuple;
  power: Vector3Tuple; // Flux in linear RGB Watts
  bounceCount: number;
  hasSpecularBounce: boolean;
  trajectory: Vector3Tuple[];
}

/**
 * Record of a photon deposited on a diffuse or glossy surface.
 */
export interface PhotonDeposit {
  position: Vector3Tuple;
  normal: Vector3Tuple;
  incidentDir: Vector3Tuple;
  power: Vector3Tuple;
  bounceCount: number;
  isCaustic: boolean;
  objectId: string;
}

/**
 * Configuration options for the Particle-Tracing engine.
 */
export interface ParticleTracingOptions {
  particleCount: number;
  maxBounces: number;
  causticOnly: boolean;
  searchRadius: number;
  maxGatherPhotons: number;
  recordTrajectories: boolean;
  maxVisualTrajectories: number;
  enableDispersion?: boolean;
}

/**
 * Node in the balanced 3D k-d tree.
 */
export interface PhotonKdNode {
  photon: PhotonDeposit;
  axis: number; // 0 = X, 1 = Y, 2 = Z
  left: PhotonKdNode | null;
  right: PhotonKdNode | null;
}

/**
 * Complete Photon Map with k-d tree and statistics.
 */
export interface PhotonMap {
  photons: PhotonDeposit[];
  root: PhotonKdNode | null;
  bounds: AABB;
  totalEmitted: number;
  causticCount: number;
  indirectCount: number;
}

/**
 * Individual line segment of a particle streamline.
 */
export interface StreamlineSegment {
  p0: Vector3Tuple;
  p1: Vector3Tuple;
  color: Vector3Tuple;
  alpha: number;
  bounceIndex: number;
  particleId: number;
}

/**
 * Continuous trajectory path composed of multiple bounce segments.
 */
export interface StreamlinePath {
  particleId: number;
  points: Vector3Tuple[];
  color: Vector3Tuple;
  hasCaustic: boolean;
  totalLength: number;
}

/**
 * Packed GPU attribute buffers for rendering streamlines.
 */
export interface StreamlineBuffers {
  /** Line vertex positions [x0, y0, z0, x1, y1, z1, ...] */
  positions: Float32Array;
  /** Line vertex colors [r0, g0, b0, a0, r1, g1, b1, a1, ...] */
  colors: Float32Array;
  /** Normalized progress along path [0..1] for pulse and dash shaders */
  progress: Float32Array;
  segmentCount: number;
}
