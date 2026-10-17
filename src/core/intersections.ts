import { vec3Cross, vec3Dot, vec3Length, vec3Normalize, vec3Sub } from "./math.js";
import type { AABB, Ray3D, RayTriangle, Vector2Tuple, Vector3Tuple } from "./types.js";

/**
 * Creates a normalized Ray3D with precomputed inverse directions for fast slab traversal.
 */
export const createRay = (
  origin: Vector3Tuple,
  direction: Vector3Tuple,
  tMin = 0.0001,
  tMax = Infinity
): Ray3D => {
  const normDir = vec3Normalize(direction);
  const safeDiv = (d: number): number => (Math.abs(d) < 1e-9 ? (d < 0 ? -1e9 : 1e9) : 1 / d);
  return {
    origin,
    direction: normDir,
    invDirection: [safeDiv(normDir[0]), safeDiv(normDir[1]), safeDiv(normDir[2])],
    tMin,
    tMax
  };
};

/**
 * Branchless slab intersection test for Axis-Aligned Bounding Boxes (AABB).
 */
export const intersectRayAABB = (
  ray: Ray3D,
  box: AABB
): { hit: boolean; tNear: number; tFar: number } => {
  const tx1 = (box.min[0] - ray.origin[0]) * ray.invDirection[0];
  const tx2 = (box.max[0] - ray.origin[0]) * ray.invDirection[0];
  let tmin = Math.min(tx1, tx2);
  let tmax = Math.max(tx1, tx2);

  const ty1 = (box.min[1] - ray.origin[1]) * ray.invDirection[1];
  const ty2 = (box.max[1] - ray.origin[1]) * ray.invDirection[1];
  tmin = Math.max(tmin, Math.min(ty1, ty2));
  tmax = Math.min(tmax, Math.max(ty1, ty2));

  const tz1 = (box.min[2] - ray.origin[2]) * ray.invDirection[2];
  const tz2 = (box.max[2] - ray.origin[2]) * ray.invDirection[2];
  tmin = Math.max(tmin, Math.min(tz1, tz2));
  tmax = Math.min(tmax, Math.max(tz1, tz2));

  const hit = tmax >= Math.max(tmin, ray.tMin) && tmin <= ray.tMax;
  return { hit, tNear: tmin, tFar: tmax };
};

/**
 * Analytical ray-sphere intersection.
 */
export const intersectRaySphere = (
  ray: Ray3D,
  center: Vector3Tuple,
  radius: number
): { hit: boolean; distance: number; normal: Vector3Tuple; frontFace: boolean } | null => {
  const oc = vec3Sub(ray.origin, center);
  const a = vec3Dot(ray.direction, ray.direction);
  const halfB = vec3Dot(oc, ray.direction);
  const c = vec3Dot(oc, oc) - radius * radius;
  const discriminant = halfB * halfB - a * c;

  if (discriminant < 0) return null;

  const sqrtd = Math.sqrt(discriminant);
  let root = (-halfB - sqrtd) / a;
  if (root < ray.tMin || root > ray.tMax) {
    root = (-halfB + sqrtd) / a;
    if (root < ray.tMin || root > ray.tMax) {
      return null;
    }
  }

  const hitPoint: Vector3Tuple = [
    ray.origin[0] + root * ray.direction[0],
    ray.origin[1] + root * ray.direction[1],
    ray.origin[2] + root * ray.direction[2]
  ];
  const outwardNormal = vec3Normalize([
    (hitPoint[0] - center[0]) / radius,
    (hitPoint[1] - center[1]) / radius,
    (hitPoint[2] - center[2]) / radius
  ]);
  const frontFace = vec3Dot(ray.direction, outwardNormal) < 0;
  const normal: Vector3Tuple = frontFace
    ? outwardNormal
    : [-outwardNormal[0], -outwardNormal[1], -outwardNormal[2]];

  return { hit: true, distance: root, normal, frontFace };
};

/**
 * Möller-Trumbore ray-triangle intersection.
 */
export const intersectRayTriangle = (
  ray: Ray3D,
  triangle: RayTriangle
): {
  hit: boolean;
  distance: number;
  normal: Vector3Tuple;
  uv: Vector2Tuple;
  frontFace: boolean;
} | null => {
  const edge1 = vec3Sub(triangle.v1, triangle.v0);
  const edge2 = vec3Sub(triangle.v2, triangle.v0);
  const pvec = vec3Cross(ray.direction, edge2);
  const det = vec3Dot(edge1, pvec);

  if (Math.abs(det) < 1e-9) return null;

  const invDet = 1.0 / det;
  const tvec = vec3Sub(ray.origin, triangle.v0);
  const u = vec3Dot(tvec, pvec) * invDet;
  if (u < 0.0 || u > 1.0) return null;

  const qvec = vec3Cross(tvec, edge1);
  const v = vec3Dot(ray.direction, qvec) * invDet;
  if (v < 0.0 || u + v > 1.0) return null;

  const t = vec3Dot(edge2, qvec) * invDet;
  if (t < ray.tMin || t > ray.tMax) return null;

  const w = 1.0 - u - v;
  const interpolatedNormal = vec3Normalize([
    w * triangle.n0[0] + u * triangle.n1[0] + v * triangle.n2[0],
    w * triangle.n0[1] + u * triangle.n1[1] + v * triangle.n2[1],
    w * triangle.n0[2] + u * triangle.n1[2] + v * triangle.n2[2]
  ]);

  const geomNormal = vec3Length(interpolatedNormal) > 0.1
    ? interpolatedNormal
    : vec3Normalize(vec3Cross(edge1, edge2));

  const frontFace = vec3Dot(ray.direction, geomNormal) < 0;
  const normal: Vector3Tuple = frontFace
    ? geomNormal
    : [-geomNormal[0], -geomNormal[1], -geomNormal[2]];

  const uv: Vector2Tuple = [
    w * triangle.uv0[0] + u * triangle.uv1[0] + v * triangle.uv2[0],
    w * triangle.uv0[1] + u * triangle.uv1[1] + v * triangle.uv2[1]
  ];

  return { hit: true, distance: t, normal, uv, frontFace };
};

/**
 * Analytical ray-plane intersection.
 */
export const intersectRayPlane = (
  ray: Ray3D,
  pointOnPlane: Vector3Tuple,
  normal: Vector3Tuple
): { hit: boolean; distance: number; frontFace: boolean } | null => {
  const denom = vec3Dot(normal, ray.direction);
  if (Math.abs(denom) < 1e-9) return null;

  const p0l0 = vec3Sub(pointOnPlane, ray.origin);
  const t = vec3Dot(p0l0, normal) / denom;
  if (t < ray.tMin || t > ray.tMax) return null;

  const frontFace = denom < 0;
  return { hit: true, distance: t, frontFace };
};
