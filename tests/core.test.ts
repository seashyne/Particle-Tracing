import { describe, expect, it } from "vitest";
import { buildBVH, traverseBVH } from "../src/core/bvh.js";
import {
  createRay,
  intersectRayAABB,
  intersectRayPlane,
  intersectRaySphere,
  intersectRayTriangle
} from "../src/core/intersections.js";
import {
  fresnelSchlick,
  kelvinToLinearRgb,
  vec3Add,
  vec3Cross,
  vec3Dot,
  vec3Length,
  vec3Normalize,
  vec3Reflect,
  vec3Refract,
  vec3Scale,
  vec3Sub
} from "../src/core/math.js";
import type { AABB, RayHit, RayTriangle } from "../src/core/types.js";

describe("Particle-Tracing Core Math", () => {
  it("computes basic vector arithmetic", () => {
    expect(vec3Add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
    expect(vec3Sub([5, 7, 9], [1, 2, 3])).toEqual([4, 5, 6]);
    expect(vec3Scale([2, 3, 4], 2)).toEqual([4, 6, 8]);
    expect(vec3Dot([1, 0, 0], [0, 1, 0])).toBe(0);
    expect(vec3Cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(vec3Length([3, 4, 0])).toBe(5);
  });

  it("calculates specular reflection", () => {
    const v: [number, number, number] = [1, -1, 0];
    const n: [number, number, number] = [0, 1, 0];
    const r = vec3Reflect(v, n);
    expect(r[0]).toBeCloseTo(1);
    expect(r[1]).toBeCloseTo(1);
    expect(r[2]).toBeCloseTo(0);
  });

  it("calculates Snell's law refraction and detects total internal reflection", () => {
    const incident: [number, number, number] = [0, -1, 0];
    const normal: [number, number, number] = [0, 1, 0];
    const refracted = vec3Refract(incident, normal, 1.0 / 1.5);
    expect(refracted).not.toBeNull();
    if (refracted) {
      expect(refracted[1]).toBeCloseTo(-1);
    }

    const grazing = vec3Normalize([1, -0.1, 0]);
    const tir = vec3Refract(grazing, normal, 1.5 / 1.0);
    expect(tir).toBeNull();
  });

  it("converts Kelvin temperature to linear RGB", () => {
    const warmTungsten = kelvinToLinearRgb(2700);
    expect(warmTungsten[0]).toBeGreaterThan(warmTungsten[2]); // Warmer red > blue

    const daylight = kelvinToLinearRgb(6500);
    expect(daylight[0]).toBeGreaterThan(0.5);
    expect(daylight[2]).toBeGreaterThan(0.5);
  });
});

describe("Particle-Tracing Primitive Intersections", () => {
  it("intersects Ray-AABB with slab method", () => {
    const ray = createRay([0, 0, -5], [0, 0, 1]);
    const box: AABB = { min: [-1, -1, -1], max: [1, 1, 1] };
    const hit = intersectRayAABB(ray, box);
    expect(hit.hit).toBe(true);
    expect(hit.tNear).toBeCloseTo(4);
    expect(hit.tFar).toBeCloseTo(6);
  });

  it("intersects Ray-Sphere analytically", () => {
    const ray = createRay([0, 0, -5], [0, 0, 1]);
    const hit = intersectRaySphere(ray, [0, 0, 0], 1.0);
    expect(hit).not.toBeNull();
    if (hit) {
      expect(hit.hit).toBe(true);
      expect(hit.distance).toBeCloseTo(4.0);
    }
  });

  it("intersects Ray-Triangle with Möller-Trumbore", () => {
    const tri: RayTriangle = {
      v0: [-1, -1, 0],
      v1: [1, -1, 0],
      v2: [0, 1, 0],
      n0: [0, 0, 1],
      n1: [0, 0, 1],
      n2: [0, 0, 1],
      uv0: [0, 0],
      uv1: [1, 0],
      uv2: [0.5, 1],
      material: { color: "#ffffff", metalness: 0, roughness: 1 },
      objectId: "tri1"
    };

    const frontRay = createRay([0, 0, 5], [0, 0, -1]);
    const hit = intersectRayTriangle(frontRay, tri);
    expect(hit).not.toBeNull();
    if (hit) {
      expect(hit.hit).toBe(true);
      expect(hit.distance).toBeCloseTo(5.0);
      expect(hit.frontFace).toBe(true);
    }
  });
});

describe("Particle-Tracing BVH", () => {
  it("builds and traverses BVH correctly", () => {
    const triangles: RayTriangle[] = [
      {
        v0: [-2, -1, 0], v1: [0, -1, 0], v2: [-1, 1, 0],
        n0: [0, 0, 1], n1: [0, 0, 1], n2: [0, 0, 1],
        uv0: [0, 0], uv1: [1, 0], uv2: [0.5, 1],
        material: { color: "#ff0000", metalness: 0, roughness: 1 },
        objectId: "left"
      },
      {
        v0: [0, -1, 0], v1: [2, -1, 0], v2: [1, 1, 0],
        n0: [0, 0, 1], n1: [0, 0, 1], n2: [0, 0, 1],
        uv0: [0, 0], uv1: [1, 0], uv2: [0.5, 1],
        material: { color: "#00ff00", metalness: 0, roughness: 1 },
        objectId: "right"
      }
    ];

    const bvh = buildBVH(triangles);
    const ray = createRay([1, 0, 5], [0, 0, -1]);
    const closestHit: RayHit = {
      hit: false,
      distance: Infinity,
      point: [0, 0, 0],
      normal: [0, 1, 0],
      uv: [0, 0],
      material: triangles[0].material,
      objectId: "",
      frontFace: true
    };

    const hit = traverseBVH(ray, bvh, closestHit);
    expect(hit).toBe(true);
    expect(closestHit.objectId).toBe("right");
    expect(closestHit.distance).toBeCloseTo(5.0);
  });
});
