import { type BVHNode, traverseBVH } from "../core/bvh.js";
import { createRay } from "../core/intersections.js";
import {
  hexToLinearRgb,
  sampleHemisphereCosine,
  vec3Add,
  vec3Multiply,
  vec3Normalize,
  vec3Reflect,
  vec3Refract,
  vec3Scale
} from "../core/math.js";
import type {
  LightParticle,
  LightSource,
  ParticleTracingOptions,
  PhotonDeposit,
  PhotonMap,
  RayHit,
  StreamlineSegment,
  Vector3Tuple
} from "../core/types.js";
import { emitPhoton } from "../emitter/photonEmitter.js";
import { buildPhotonKdTree } from "../spatial/photonKdTree.js";

export const defaultOptions: ParticleTracingOptions = {
  particleCount: 10000,
  maxBounces: 4,
  causticOnly: false,
  searchRadius: 0.25,
  maxGatherPhotons: 50,
  recordTrajectories: true,
  maxVisualTrajectories: 1000,
  enableDispersion: false
};

/**
 * Traces a single photon particle through the BVH scene.
 */
export const traceSinglePhoton = (
  particle: LightParticle,
  bvh: BVHNode,
  options: ParticleTracingOptions,
  deposits: PhotonDeposit[]
): void => {
  let currPos = particle.position;
  let currDir = particle.direction;
  let currPower = particle.power;
  let hasSpecular = particle.hasSpecularBounce;

  for (let bounce = 0; bounce < options.maxBounces; bounce += 1) {
    const ray = createRay(currPos, currDir, 0.001, Infinity);
    const hit: RayHit = {
      hit: false,
      distance: Infinity,
      point: [0, 0, 0],
      normal: [0, 1, 0],
      uv: [0, 0],
      material: { color: "#ffffff", metalness: 0, roughness: 1 },
      objectId: "",
      frontFace: true
    };

    if (!traverseBVH(ray, bvh, hit)) {
      if (options.recordTrajectories) {
        particle.trajectory.push(vec3Add(currPos, vec3Scale(currDir, 10.0)));
      }
      break;
    }

    if (options.recordTrajectories) {
      particle.trajectory.push([...hit.point]);
    }

    const material = hit.material;
    const transmission = material.transmission ?? 0;
    const metalness = material.metalness;
    const roughness = Math.max(0.001, material.roughness);
    const albedo = hexToLinearRgb(material.color);

    // Glass / Dielectric Refraction
    if (transmission > 0.05) {
      hasSpecular = true;
      let ior = material.ior ?? 1.5;
      if (options.enableDispersion) {
        // Chromatic dispersion for spectral rainbow caustics
        ior += (Math.random() - 0.5) * 0.04;
      }

      const etaRatio = hit.frontFace ? 1.0 / ior : ior;
      const unitIncident = vec3Normalize(currDir);
      const refracted = vec3Refract(unitIncident, hit.normal, etaRatio);

      if (refracted) {
        currDir = refracted;
        currPos = vec3Add(hit.point, vec3Scale(hit.normal, hit.frontFace ? -0.001 : 0.001));
        currPower = vec3Multiply(currPower, albedo);
      } else {
        // Total internal reflection (TIR)
        currDir = vec3Reflect(unitIncident, hit.normal);
        currPos = vec3Add(hit.point, vec3Scale(hit.normal, 0.001));
      }
      continue;
    }

    // Mirror / Specular Metal Reflection
    if (metalness > 0.6 && roughness < 0.25) {
      hasSpecular = true;
      currDir = vec3Reflect(vec3Normalize(currDir), hit.normal);
      currPos = vec3Add(hit.point, vec3Scale(hit.normal, 0.001));
      currPower = vec3Multiply(currPower, albedo);
      continue;
    }

    // Diffuse Surface Deposit
    const isCaustic = hasSpecular;
    if (!options.causticOnly || isCaustic) {
      deposits.push({
        position: [...hit.point],
        normal: [...hit.normal],
        incidentDir: [...currDir],
        power: [...currPower],
        bounceCount: bounce,
        isCaustic,
        objectId: hit.objectId
      });
    }

    // Russian Roulette termination
    const maxReflectance = Math.max(albedo[0], Math.max(albedo[1], albedo[2]));
    if (Math.random() > maxReflectance || bounce >= options.maxBounces - 1) {
      break;
    }

    currPower = vec3Scale(vec3Multiply(currPower, albedo), 1.0 / Math.max(0.01, maxReflectance));
    currDir = sampleHemisphereCosine(hit.normal, Math.random(), Math.random());
    currPos = vec3Add(hit.point, vec3Scale(hit.normal, 0.001));
  }
};

/**
 * Executes full particle light transport over a scene.
 */
export const runParticleTracing = (
  lights: LightSource[],
  bvh: BVHNode,
  userOptions: Partial<ParticleTracingOptions> = {}
): {
  photonMap: PhotonMap;
  particles: LightParticle[];
  segments: StreamlineSegment[];
} => {
  const options: ParticleTracingOptions = { ...defaultOptions, ...userOptions };
  const deposits: PhotonDeposit[] = [];
  const particles: LightParticle[] = [];
  const segments: StreamlineSegment[] = [];

  const activeLights = lights.filter((l) => l.enabled && l.intensity > 0);
  if (activeLights.length === 0) {
    return {
      photonMap: {
        photons: [],
        root: null,
        bounds: { min: [0, 0, 0], max: [0, 0, 0] },
        totalEmitted: 0,
        causticCount: 0,
        indirectCount: 0
      },
      particles: [],
      segments: []
    };
  }

  const particlesPerLight = Math.floor(options.particleCount / activeLights.length);
  let idCounter = 0;

  for (const light of activeLights) {
    for (let i = 0; i < particlesPerLight; i += 1) {
      const p = emitPhoton(light, idCounter++, particlesPerLight);
      traceSinglePhoton(p, bvh, options, deposits);

      if (
        options.recordTrajectories &&
        particles.length < options.maxVisualTrajectories &&
        p.trajectory.length > 1
      ) {
        for (let t = 0; t < p.trajectory.length - 1; t += 1) {
          segments.push({
            p0: p.trajectory[t],
            p1: p.trajectory[t + 1],
            color: p.power,
            alpha: Math.max(0.15, 1.0 - t * 0.25),
            bounceIndex: t,
            particleId: p.id
          });
        }
        particles.push(p);
      }
    }
  }

  let min: Vector3Tuple = [Infinity, Infinity, Infinity];
  let max: Vector3Tuple = [-Infinity, -Infinity, -Infinity];
  let causticCount = 0;
  let indirectCount = 0;

  for (let i = 0; i < deposits.length; i += 1) {
    const d = deposits[i];
    if (d.isCaustic) causticCount += 1;
    else indirectCount += 1;

    min = [Math.min(min[0], d.position[0]), Math.min(min[1], d.position[1]), Math.min(min[2], d.position[2])];
    max = [Math.max(max[0], d.position[0]), Math.max(max[1], d.position[1]), Math.max(max[2], d.position[2])];
  }

  if (deposits.length === 0) {
    min = [0, 0, 0];
    max = [0, 0, 0];
  }

  const root = buildPhotonKdTree([...deposits]);
  const photonMap: PhotonMap = {
    photons: deposits,
    root,
    bounds: { min, max },
    totalEmitted: idCounter,
    causticCount,
    indirectCount
  };

  return { photonMap, particles, segments };
};
