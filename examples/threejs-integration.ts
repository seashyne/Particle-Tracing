/**
 * Three.js Integration Example for Particle-Tracing
 * Demonstrates how to take Particle-Tracing GPU buffers and render
 * animated streamlines and caustic sparkle points in Three.js.
 */

import {
  buildPhotonPointBuffers,
  buildStreamlineBuffers,
  extractStreamlines,
  runParticleTracing,
  type LightSource,
  type PhotonMap,
  type StreamlinePath
} from "../src/index.js";

// Three.js pseudo-types for standalone demonstration
interface ThreeBufferGeometry {
  setAttribute: (name: string, attr: unknown) => void;
  dispose: () => void;
}
interface ThreeMaterial {
  dispose: () => void;
}
interface ThreeScene {
  add: (obj: unknown) => void;
  remove: (obj: unknown) => void;
}

/**
 * Creates Three.js LineSegments and Points for Particle-Tracing visual flow.
 */
export const createParticleFlowVisuals = (
  particles: any[],
  photonMap: PhotonMap,
  THREE: any,
  scene: ThreeScene
) => {
  // 1. Extract streamlines and pack GPU buffers
  const streamlines: StreamlinePath[] = extractStreamlines(particles);
  const lineBuffers = buildStreamlineBuffers(streamlines);

  // 2. Create Three.js LineSegments
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.BufferAttribute(lineBuffers.positions, 3));
  lineGeometry.setAttribute("color", new THREE.BufferAttribute(lineBuffers.colors, 4));

  const lineMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  });

  const lineMesh = new THREE.LineSegments(lineGeometry, lineMaterial);
  lineMesh.renderOrder = 500;
  scene.add(lineMesh);

  // 3. Create caustic sparkle points
  const pointBuffers = buildPhotonPointBuffers(photonMap.photons);
  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute("position", new THREE.BufferAttribute(pointBuffers.positions, 3));
  pointGeometry.setAttribute("color", new THREE.BufferAttribute(pointBuffers.colors, 4));

  const pointMaterial = new THREE.PointsMaterial({
    size: 2.5,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false
  });

  const pointMesh = new THREE.Points(pointGeometry, pointMaterial);
  pointMesh.renderOrder = 501;
  scene.add(pointMesh);

  return {
    lineMesh,
    pointMesh,
    cleanup: () => {
      scene.remove(lineMesh);
      scene.remove(pointMesh);
      lineGeometry.dispose();
      lineMaterial.dispose();
      pointGeometry.dispose();
      pointMaterial.dispose();
    }
  };
};
