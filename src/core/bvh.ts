import { intersectRayAABB, intersectRayTriangle } from "./intersections.js";
import type { AABB, Ray3D, RayHit, RayTriangle, Vector3Tuple } from "./types.js";

export interface BVHNode {
  bounds: AABB;
  left: BVHNode | null;
  right: BVHNode | null;
  triangles: RayTriangle[] | null;
}

export const computeTriangleAABB = (tri: RayTriangle): AABB => ({
  min: [
    Math.min(tri.v0[0], tri.v1[0], tri.v2[0]),
    Math.min(tri.v0[1], tri.v1[1], tri.v2[1]),
    Math.min(tri.v0[2], tri.v1[2], tri.v2[2])
  ],
  max: [
    Math.max(tri.v0[0], tri.v1[0], tri.v2[0]),
    Math.max(tri.v0[1], tri.v1[1], tri.v2[1]),
    Math.max(tri.v0[2], tri.v1[2], tri.v2[2])
  ]
});

export const unionAABB = (a: AABB, b: AABB): AABB => ({
  min: [
    Math.min(a.min[0], b.min[0]),
    Math.min(a.min[1], b.min[1]),
    Math.min(a.min[2], b.min[2])
  ],
  max: [
    Math.max(a.max[0], b.max[0]),
    Math.max(a.max[1], b.max[1]),
    Math.max(a.max[2], b.max[2])
  ]
});

const getCentroid = (tri: RayTriangle): Vector3Tuple => [
  (tri.v0[0] + tri.v1[0] + tri.v2[0]) / 3,
  (tri.v0[1] + tri.v1[1] + tri.v2[1]) / 3,
  (tri.v0[2] + tri.v1[2] + tri.v2[2]) / 3
];

/**
 * Builds a Bounding Volume Hierarchy using longest-axis centroid partitioning.
 */
export const buildBVH = (
  triangles: RayTriangle[],
  maxLeafSize = 4,
  depth = 0,
  maxDepth = 24
): BVHNode => {
  if (triangles.length === 0) {
    return {
      bounds: { min: [0, 0, 0], max: [0, 0, 0] },
      left: null,
      right: null,
      triangles: []
    };
  }

  let bounds = computeTriangleAABB(triangles[0]);
  for (let i = 1; i < triangles.length; i += 1) {
    bounds = unionAABB(bounds, computeTriangleAABB(triangles[i]));
  }

  if (triangles.length <= maxLeafSize || depth >= maxDepth) {
    return {
      bounds,
      left: null,
      right: null,
      triangles
    };
  }

  let cMin: Vector3Tuple = [...getCentroid(triangles[0])];
  let cMax: Vector3Tuple = [...cMin];
  for (let i = 1; i < triangles.length; i += 1) {
    const c = getCentroid(triangles[i]);
    cMin = [Math.min(cMin[0], c[0]), Math.min(cMin[1], c[1]), Math.min(cMin[2], c[2])];
    cMax = [Math.max(cMax[0], c[0]), Math.max(cMax[1], c[1]), Math.max(cMax[2], c[2])];
  }

  const extent = [cMax[0] - cMin[0], cMax[1] - cMin[1], cMax[2] - cMin[2]];
  let axis = 0;
  if (extent[1] > extent[0]) axis = 1;
  if (extent[2] > extent[axis]) axis = 2;

  if (extent[axis] < 1e-6) {
    return {
      bounds,
      left: null,
      right: null,
      triangles
    };
  }

  const mid = (cMin[axis] + cMax[axis]) * 0.5;
  const leftTris: RayTriangle[] = [];
  const rightTris: RayTriangle[] = [];

  for (let i = 0; i < triangles.length; i += 1) {
    const tri = triangles[i];
    const c = getCentroid(tri);
    if (c[axis] < mid) {
      leftTris.push(tri);
    } else {
      rightTris.push(tri);
    }
  }

  if (leftTris.length === 0 || rightTris.length === 0) {
    const half = Math.floor(triangles.length / 2);
    leftTris.length = 0;
    rightTris.length = 0;
    for (let i = 0; i < half; i += 1) leftTris.push(triangles[i]);
    for (let i = half; i < triangles.length; i += 1) rightTris.push(triangles[i]);
  }

  return {
    bounds,
    left: buildBVH(leftTris, maxLeafSize, depth + 1, maxDepth),
    right: buildBVH(rightTris, maxLeafSize, depth + 1, maxDepth),
    triangles: null
  };
};

/**
 * Traverses BVH to find the closest triangle intersection for a ray.
 */
export const traverseBVH = (
  ray: Ray3D,
  node: BVHNode,
  closestHit: RayHit
): boolean => {
  const boxHit = intersectRayAABB(ray, node.bounds);
  if (!boxHit.hit || boxHit.tNear > closestHit.distance) {
    return false;
  }

  let hitAny = false;

  if (node.triangles !== null) {
    for (let i = 0; i < node.triangles.length; i += 1) {
      const tri = node.triangles[i];
      const result = intersectRayTriangle(ray, tri);
      if (result && result.distance < closestHit.distance) {
        closestHit.hit = true;
        closestHit.distance = result.distance;
        closestHit.point = [
          ray.origin[0] + result.distance * ray.direction[0],
          ray.origin[1] + result.distance * ray.direction[1],
          ray.origin[2] + result.distance * ray.direction[2]
        ];
        closestHit.normal = result.normal;
        closestHit.uv = result.uv;
        closestHit.material = tri.material;
        closestHit.objectId = tri.objectId;
        closestHit.frontFace = result.frontFace;
        ray.tMax = result.distance;
        hitAny = true;
      }
    }
    return hitAny;
  }

  const leftHit = node.left ? intersectRayAABB(ray, node.left.bounds) : { hit: false, tNear: Infinity };
  const rightHit = node.right ? intersectRayAABB(ray, node.right.bounds) : { hit: false, tNear: Infinity };

  const first = leftHit.tNear <= rightHit.tNear ? node.left : node.right;
  const second = leftHit.tNear <= rightHit.tNear ? node.right : node.left;

  if (first && traverseBVH(ray, first, closestHit)) hitAny = true;
  if (second && traverseBVH(ray, second, closestHit)) hitAny = true;

  return hitAny;
};
