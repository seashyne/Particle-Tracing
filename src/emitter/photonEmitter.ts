import {
  createCoordinateSystem,
  hexToLinearRgb,
  kelvinToLinearRgb,
  sampleHemisphereCosine,
  sampleSphereUniform,
  vec3Normalize,
  vec3Scale
} from "../core/math.js";
import type { LightParticle, LightSource, Vector3Tuple } from "../core/types.js";

/**
 * Computes the spectral radiance of a light source in linear RGB Watts.
 */
export const getLightRadiance = (light: LightSource): Vector3Tuple => {
  const baseColor = hexToLinearRgb(light.color);
  if (light.colorTemperature && light.colorTemperature >= 1000) {
    const kelvinRgb = kelvinToLinearRgb(light.colorTemperature);
    return [
      baseColor[0] * kelvinRgb[0] * light.intensity,
      baseColor[1] * kelvinRgb[1] * light.intensity,
      baseColor[2] * kelvinRgb[2] * light.intensity
    ];
  }
  return vec3Scale(baseColor, light.intensity);
};

/**
 * Emits a discrete photon particle from a light source.
 */
export const emitPhoton = (
  light: LightSource,
  particleId: number,
  totalParticlesForLight: number
): LightParticle => {
  const baseRadiance = getLightRadiance(light);
  const fluxScale = 1.0 / Math.max(1, totalParticlesForLight);
  const power: Vector3Tuple = [
    baseRadiance[0] * fluxScale,
    baseRadiance[1] * fluxScale,
    baseRadiance[2] * fluxScale
  ];

  let origin: Vector3Tuple = [...light.position];
  let direction: Vector3Tuple = [0, -1, 0];

  const u1 = Math.random();
  const u2 = Math.random();

  if (light.kind === "point") {
    // Isotropic uniform sphere emission
    direction = sampleSphereUniform(u1, u2);
    origin = [...light.position];
  } else if (light.kind === "spot") {
    // Conical emission matching spot beam
    const outerAngleRad = ((light.spotAngle ?? 45) * Math.PI) / 180;
    const cosOuter = Math.cos(outerAngleRad);
    const cosAngle = 1.0 - u1 * (1.0 - cosOuter);
    const sinAngle = Math.sqrt(Math.max(0, 1.0 - cosAngle * cosAngle));
    const phi = 2.0 * Math.PI * u2;

    const normDir = vec3Normalize(light.direction);
    const { tangent, bitangent } = createCoordinateSystem(normDir);

    direction = vec3Normalize([
      tangent[0] * sinAngle * Math.cos(phi) + bitangent[0] * sinAngle * Math.sin(phi) + normDir[0] * cosAngle,
      tangent[1] * sinAngle * Math.cos(phi) + bitangent[1] * sinAngle * Math.sin(phi) + normDir[1] * cosAngle,
      tangent[2] * sinAngle * Math.cos(phi) + bitangent[2] * sinAngle * Math.sin(phi) + normDir[2] * cosAngle
    ]);
    origin = [...light.position];
  } else if (light.kind === "area") {
    // Diffuse emission across rectangular panel
    const areaW = light.areaSize ? light.areaSize[0] : 1.0;
    const areaH = light.areaSize ? light.areaSize[1] : 1.0;
    const offsetU = (u1 - 0.5) * areaW;
    const offsetV = (u2 - 0.5) * areaH;

    const normDir = vec3Normalize(light.direction);
    const { tangent, bitangent } = createCoordinateSystem(normDir);

    origin = [
      light.position[0] + tangent[0] * offsetU + bitangent[0] * offsetV,
      light.position[1] + tangent[1] * offsetU + bitangent[1] * offsetV,
      light.position[2] + tangent[2] * offsetU + bitangent[2] * offsetV
    ];

    direction = sampleHemisphereCosine(normDir, Math.random(), Math.random());
  } else if (light.kind === "sun") {
    // Parallel emission from a disk enclosing the scene
    const sunDir = vec3Normalize(light.direction);
    const { tangent, bitangent } = createCoordinateSystem(sunDir);

    const diskRadius = 8.0 * Math.sqrt(u1);
    const phi = 2.0 * Math.PI * u2;
    const diskX = diskRadius * Math.cos(phi);
    const diskY = diskRadius * Math.sin(phi);

    origin = [
      light.position[0] - sunDir[0] * 12.0 + tangent[0] * diskX + bitangent[0] * diskY,
      light.position[1] - sunDir[1] * 12.0 + tangent[1] * diskX + bitangent[1] * diskY,
      light.position[2] - sunDir[2] * 12.0 + tangent[2] * diskX + bitangent[2] * diskY
    ];
    direction = sunDir;
  }

  return {
    id: particleId,
    position: origin,
    direction,
    power,
    bounceCount: 0,
    hasSpecularBounce: false,
    trajectory: [origin]
  };
};
