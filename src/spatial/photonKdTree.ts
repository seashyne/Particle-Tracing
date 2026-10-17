import { vec3Distance, vec3Dot } from "../core/math.js";
import type { PhotonDeposit, PhotonKdNode, PhotonMap, Vector3Tuple } from "../core/types.js";

/**
 * Builds a balanced 3D k-d tree from photon deposits.
 */
export const buildPhotonKdTree = (
  photons: PhotonDeposit[],
  depth = 0
): PhotonKdNode | null => {
  if (photons.length === 0) return null;

  const axis = depth % 3; // 0 = X, 1 = Y, 2 = Z
  photons.sort((a, b) => a.position[axis] - b.position[axis]);

  const medianIndex = Math.floor(photons.length / 2);
  const medianPhoton = photons[medianIndex];

  return {
    photon: medianPhoton,
    axis,
    left: buildPhotonKdTree(photons.slice(0, medianIndex), depth + 1),
    right: buildPhotonKdTree(photons.slice(medianIndex + 1), depth + 1)
  };
};

/**
 * Gathers photons within a search radius whose normal aligns with the query point.
 */
export const gatherNearbyPhotons = (
  node: PhotonKdNode | null,
  queryPos: Vector3Tuple,
  queryNormal: Vector3Tuple,
  radius: number,
  maxPhotons: number,
  gathered: PhotonDeposit[]
): void => {
  if (!node || gathered.length >= maxPhotons) return;

  const dist = vec3Distance(queryPos, node.photon.position);
  if (dist <= radius) {
    const normalDot = vec3Dot(queryNormal, node.photon.normal);
    if (normalDot > 0.4) {
      gathered.push(node.photon);
    }
  }

  const axis = node.axis;
  const delta = queryPos[axis] - node.photon.position[axis];

  const firstChild = delta < 0 ? node.left : node.right;
  const secondChild = delta < 0 ? node.right : node.left;

  gatherNearbyPhotons(firstChild, queryPos, queryNormal, radius, maxPhotons, gathered);

  if (Math.abs(delta) < radius && gathered.length < maxPhotons) {
    gatherNearbyPhotons(secondChild, queryPos, queryNormal, radius, maxPhotons, gathered);
  }
};

/**
 * Evaluates surface irradiance at a point using Epanechnikov kernel density estimation:
 * K(r, R) = 3 / (pi * R^2) * (1 - (r / R)^2)
 */
export const estimatePhotonIrradiance = (
  map: PhotonMap,
  queryPos: Vector3Tuple,
  queryNormal: Vector3Tuple,
  searchRadius: number,
  maxPhotons = 50
): Vector3Tuple => {
  if (!map.root || map.photons.length === 0) {
    return [0, 0, 0];
  }

  const gathered: PhotonDeposit[] = [];
  gatherNearbyPhotons(map.root, queryPos, queryNormal, searchRadius, maxPhotons, gathered);

  if (gathered.length === 0) {
    return [0, 0, 0];
  }

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;

  const r2 = searchRadius * searchRadius;
  const areaScale = 3.0 / (Math.PI * r2);

  for (let i = 0; i < gathered.length; i += 1) {
    const photon = gathered[i];
    const d = vec3Distance(queryPos, photon.position);
    const weight = Math.max(0, 1.0 - (d * d) / r2);

    totalR += photon.power[0] * weight;
    totalG += photon.power[1] * weight;
    totalB += photon.power[2] * weight;
  }

  return [
    totalR * areaScale,
    totalG * areaScale,
    totalB * areaScale
  ];
};
