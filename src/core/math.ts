import type { Vector3Tuple } from "./types.js";

export const vec3Add = (a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2]
];

export const vec3Sub = (a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2]
];

export const vec3Scale = (v: Vector3Tuple, s: number): Vector3Tuple => [
  v[0] * s,
  v[1] * s,
  v[2] * s
];

export const vec3Multiply = (a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple => [
  a[0] * b[0],
  a[1] * b[1],
  a[2] * b[2]
];

export const vec3Dot = (a: Vector3Tuple, b: Vector3Tuple): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const vec3Cross = (a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

export const vec3LengthSq = (v: Vector3Tuple): number =>
  v[0] * v[0] + v[1] * v[1] + v[2] * v[2];

export const vec3Length = (v: Vector3Tuple): number => Math.hypot(...v);

export const vec3Normalize = (v: Vector3Tuple): Vector3Tuple => {
  const len = Math.hypot(...v) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
};

export const vec3Distance = (a: Vector3Tuple, b: Vector3Tuple): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export const vec3Lerp = (a: Vector3Tuple, b: Vector3Tuple, t: number): Vector3Tuple => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];

/**
 * Computes specular reflection: r = v - 2 * (v . n) * n
 */
export const vec3Reflect = (v: Vector3Tuple, n: Vector3Tuple): Vector3Tuple => {
  const factor = 2 * vec3Dot(v, n);
  return [v[0] - factor * n[0], v[1] - factor * n[1], v[2] - factor * n[2]];
};

/**
 * Computes dielectric refraction vector using Snell's Law.
 * Returns null if total internal reflection (TIR) occurs.
 */
export const vec3Refract = (
  unitIncident: Vector3Tuple,
  unitNormal: Vector3Tuple,
  etaRatio: number
): Vector3Tuple | null => {
  const cosTheta = Math.min(1.0, -vec3Dot(unitIncident, unitNormal));
  const rOutPerp = vec3Scale(
    vec3Add(unitIncident, vec3Scale(unitNormal, cosTheta)),
    etaRatio
  );
  const perpLengthSq = vec3LengthSq(rOutPerp);
  if (perpLengthSq > 1.0) {
    return null; // Total internal reflection
  }
  const rOutParallel = vec3Scale(unitNormal, -Math.sqrt(Math.max(0, 1.0 - perpLengthSq)));
  return vec3Add(rOutPerp, rOutParallel);
};

/**
 * Fresnel-Schlick approximation for reflectance.
 */
export const fresnelSchlick = (cosTheta: number, f0: Vector3Tuple): Vector3Tuple => {
  const clamped = Math.max(0, Math.min(1, cosTheta));
  const factor = Math.pow(1.0 - clamped, 5);
  return [
    f0[0] + (1.0 - f0[0]) * factor,
    f0[1] + (1.0 - f0[1]) * factor,
    f0[2] + (1.0 - f0[2]) * factor
  ];
};

/**
 * Constructs an orthonormal tangent space basis from a unit normal.
 */
export const createCoordinateSystem = (
  normal: Vector3Tuple
): { tangent: Vector3Tuple; bitangent: Vector3Tuple } => {
  const sign = Math.sign(normal[2]) || 1;
  const a = -1.0 / (sign + normal[2]);
  const b = normal[0] * normal[1] * a;
  const tangent: Vector3Tuple = [1.0 + sign * normal[0] * normal[0] * a, sign * b, -sign * normal[0]];
  const bitangent: Vector3Tuple = [b, sign + normal[1] * normal[1] * a, -normal[1]];
  return { tangent, bitangent };
};

/**
 * Uniformly samples a unit direction on the sphere.
 */
export const sampleSphereUniform = (u1: number, u2: number): Vector3Tuple => {
  const z = 1.0 - 2.0 * u1;
  const r = Math.sqrt(Math.max(0, 1.0 - z * z));
  const phi = 2.0 * Math.PI * u2;
  return [r * Math.cos(phi), r * Math.sin(phi), z];
};

/**
 * Cosine-weighted hemisphere sampling for diffuse scattering.
 */
export const sampleHemisphereCosine = (
  normal: Vector3Tuple,
  u1: number,
  u2: number
): Vector3Tuple => {
  const r = Math.sqrt(u1);
  const theta = 2.0 * Math.PI * u2;
  const x = r * Math.cos(theta);
  const y = r * Math.sin(theta);
  const z = Math.sqrt(Math.max(0, 1.0 - u1));

  const { tangent, bitangent } = createCoordinateSystem(normal);
  return [
    tangent[0] * x + bitangent[0] * y + normal[0] * z,
    tangent[1] * x + bitangent[1] * y + normal[1] * z,
    tangent[2] * x + bitangent[2] * y + normal[2] * z
  ];
};

/**
 * Converts Planckian blackbody Kelvin temperature (1,000K - 12,000K) to linear RGB.
 * Based on Tanner Helland / Planckian locus approximation.
 */
export const kelvinToLinearRgb = (kelvin: number): Vector3Tuple => {
  const temp = Math.max(1000, Math.min(12000, kelvin)) / 100;
  let r = 0;
  let g = 0;
  let b = 0;

  // Red channel
  if (temp <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
  }

  // Green channel
  if (temp <= 66) {
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  }

  // Blue channel
  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  }

  const clamp = (v: number) => Math.max(0, Math.min(255, v)) / 255;
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  return [toLinear(clamp(r)), toLinear(clamp(g)), toLinear(clamp(b))];
};

/**
 * Converts hex color (#rrggbb) to linear RGB.
 */
export const hexToLinearRgb = (hex: string): Vector3Tuple => {
  const cleaned = hex.replace("#", "");
  const num = parseInt(cleaned.length === 3 ? cleaned.split("").map((c) => c + c).join("") : cleaned, 16);
  if (isNaN(num)) return [1, 1, 1];
  const sR = ((num >> 16) & 255) / 255;
  const sG = ((num >> 8) & 255) / 255;
  const sB = (num & 255) / 255;
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [toLinear(sR), toLinear(sG), toLinear(sB)];
};
