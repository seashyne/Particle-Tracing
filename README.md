# Particle-Tracing

Physically based forward particle and photon tracing engine with real-time streamline visualization ("ลายเส้น") for Three.js, WebGPU, and Node.js.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8%2B-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-Vitest%20Passed-green.svg)](tests/)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen.svg)](https://seashyne.github.io/Particle-Tracing/)
[![CI](https://github.com/seashyne/Particle-Tracing/actions/workflows/ci.yml/badge.svg)](https://github.com/seashyne/Particle-Tracing/actions/workflows/ci.yml)

---

## Overview

Standard backward path tracers trace rays backwards from the camera into the scene. While efficient for diffuse and direct lighting, backward path tracing struggles with **Specular-Diffuse-Specular (SDS) light paths**—such as light passing through a glass of water, reflecting off a metal ring, or focusing through a gemstone. In backward path tracing, finding these focused light paths has an infinitesimal probability without tracing billions of camera rays.

**Particle-Tracing** inverts this process:
1. **Forward Light Transport**: Photons carrying discrete radiant flux are shot directly from light sources into the scene.
2. **Specular Interaction & Refraction**: Photons bounce off mirrors and refract through glass or water using Snell's Law and Fresnel equations.
3. **Photon Map Accumulation**: Photons deposited on diffuse surfaces are indexed in a balanced 3D k-d tree and reconstructed using Epanechnikov kernel density estimation.
4. **Streamline Visualization (ลายเส้น)**: Every photon path can be extracted into continuous geometric lines, subdivided with Catmull-Rom splines, and packed into single-draw-call GPU buffers with progress attributes for animated pulse/dash shaders.

---

## Key Features

- **Forward Photon Transport**: Solves caustic singularities and focused light patterns that standard path tracers miss.
- **Streamline Trajectory System (ระบบลายเส้น)**: Extracts photon flight paths into GPU line segment buffers with normalized progress attributes ($0.0 \le p \le 1.0$) for animated laser, caustic, or particle flow effects.
- **Balanced 3D k-d Tree**: Fast median-split spatial indexing enabling $O(k \log N)$ nearest-neighbor queries and bounded-radius radiance estimation.
- **Epanechnikov Kernel Filtering**: MSE-optimal non-parametric density estimation for clean, noise-free caustics.
- **Normal & Boundary Validation**: Eliminates caustic energy bleed through thin geometric walls or opposite-facing surfaces.
- **Chromatic Dispersion**: Cauchy dispersion model splits white light into spectral wavelength packets (rainbow prisms).
- **Caustic Texture Baking**: Bakes 3D surface photon density into 2D float textures for seamless integration into real-time rasterizers and game engines.
- **WebGPU WGSL Compute Acceleration**: Massively parallel GPU compute shader kernel (`src/gpu/particleTracingWgsl.ts`) simulating 100,000+ photons with zero CPU overhead and automatic fallback.
- **Zero External Dependencies**: Pure TypeScript core with zero npm runtime dependencies.
- **100% Permissive MIT License**: Zero copyleft contamination, enterprise and commercially safe.

---

## Documentation

Detailed technical documentation and guides are organized in the [Docs/](Docs/) directory:

- [Streamlines & Flow Lines Guide (Docs/STREAMLINES.md)](Docs/STREAMLINES.md) - Deep dive into extracting photon trajectories, Catmull-Rom spline smoothing, GPU attribute interleaving, and animated pulse shaders for Three.js and WebGPU.
- [Forward Tracing Architecture (Docs/ARCHITECTURE.md)](Docs/ARCHITECTURE.md) - Forward light transport theory, Russian roulette termination, and solving the SDS singularity.
- [Caustics & Density Estimation (Docs/CAUSTICS.md)](Docs/CAUSTICS.md) - Photon mapping, k-d tree radius estimation, Epanechnikov vs Cone filtering, normal validation, and chromatic dispersion.
- [API Reference (Docs/API.md)](Docs/API.md) - Complete TypeScript API documentation and type signatures.

---

## Installation

```bash
npm install particle-tracing
```

Or clone the repository:

```bash
git clone https://github.com/seashyne/Particle-Tracing.git
cd Particle-Tracing
npm install
npm test
```

---

## Interactive Web Demo

Experience real-time forward photon transport, chromatic dispersion, and particle streamlines directly in your browser:

- **Live URL**: [https://seashyne.github.io/Particle-Tracing/](https://seashyne.github.io/Particle-Tracing/)
- **Local Dev Server**:
  ```bash
  npm run dev
  ```

### Demo Features
- **Glass Lens Caustics**: Interactive refractive sphere focusing light into high-intensity floor caustics.
- **Prism Chromatic Dispersion**: Equilateral triangular glass prism separating incident photons into wavelength bands (Red, Green, Blue).
- **Curved Mirror Focus**: Spherical reflector demonstrating specular convergence.
- **Live Streamline Controls**: Adjust pulse speed, glow intensity, tail length, and Catmull-Rom spline smoothing in real time.
- **Caustic Floor Map**: 2D density accumulation texture updating dynamically as you change simulation parameters.

---

## Quickstart

### 1. Basic Photon Tracing & Caustic Estimation

```typescript
import {
  ParticleTracer,
  PhotonKdTree,
  Scene,
  Vector3
} from 'particle-tracing';

// 1. Setup Scene
const scene: Scene = {
  lights: [
    {
      id: 'point_light_1',
      type: 'point',
      position: { x: 0, y: 5, z: 0 },
      color: { r: 100, g: 100, b: 100 },
      intensity: 100,
    }
  ],
  spheres: [
    {
      id: 'glass_lens',
      center: { x: 0, y: 2, z: 0 },
      radius: 1.0,
      material: {
        id: 'glass',
        type: 'dielectric',
        albedo: { r: 1, g: 1, b: 1 },
        ior: 1.5, // Glass index of refraction
      }
    }
  ],
  triangles: [] // Optional mesh geometry
};

// 2. Run Forward Particle Simulation
const tracer = new ParticleTracer({
  maxBounces: 6,
  recordStreamlines: true, // Record particle lines
});

const result = tracer.trace(scene, 50000);
console.log(`Deposited ${result.storedPhotons.length} photons onto diffuse surfaces.`);

// 3. Build Spatial Acceleration Tree
const kdTree = new PhotonKdTree();
kdTree.build(result.storedPhotons);

// 4. Query Caustic Radiance at any surface point
const queryPoint: Vector3 = { x: 0.1, y: 0.0, z: 0.1 };
const surfaceNormal: Vector3 = { x: 0.0, y: 1.0, z: 0.0 };

const causticRadiance = kdTree.estimateRadiance(
  queryPoint,
  surfaceNormal,
  0.25, // Search radius
  100,  // Max photons to gather
  'epanechnikov' // Optimal filter
);

console.log('Estimated Caustic RGB:', causticRadiance);
```

---

## Streamlines Visualization (ระบบลายเส้น)

To render the recorded particle paths in Three.js with flowing light animations:

```typescript
import * as THREE from 'three';
import {
  StreamlineGenerator,
  StreamlineBufferBuilder
} from 'particle-tracing';

// 1. Extract and smooth streamlines
const generator = new StreamlineGenerator();
const lines = generator.extract(result.streamlines, {
  minBounces: 1,
  minEnergy: 0.01
});

const smoothLines = generator.subdivide(lines, { subdivisionsPerSegment: 3 });

// 2. Build GPU binary buffer
const builder = new StreamlineBufferBuilder();
const buffer = builder.build(smoothLines);

// 3. Create Three.js LineSegments Mesh
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(buffer.positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(buffer.colors, 3));
geometry.setAttribute('progress', new THREE.BufferAttribute(buffer.progress, 1));
geometry.setIndex(new THREE.BufferAttribute(buffer.indices, 1));

const material = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0.0 },
    uSpeed: { value: 0.8 },
    uTailLength: { value: 0.25 },
    uGlowIntensity: { value: 2.5 }
  },
  vertexShader: `
    attribute float progress;
    varying vec3 vColor;
    varying float vProgress;
    void main() {
      vColor = color;
      vProgress = progress;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uSpeed;
    uniform float uTailLength;
    uniform float uGlowIntensity;
    varying vec3 vColor;
    varying float vProgress;

    void main() {
      float head = fract(uTime * uSpeed);
      float dist = head - vProgress;
      if (dist < 0.0) dist += 1.0;

      float intensity = 0.0;
      if (dist < uTailLength) {
        float norm = dist / uTailLength;
        intensity = pow(1.0 - norm, 2.0) * uGlowIntensity;
      }

      vec3 col = vColor * (0.15 + intensity);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});

const streamlineMesh = new THREE.LineSegments(geometry, material);
scene.add(streamlineMesh);
```

For full shader details and WebGPU WGSL implementations, see [Docs/STREAMLINES.md](Docs/STREAMLINES.md).

---

## Project Structure

```
Particle-Tracing/
├── Docs/
│   ├── ARCHITECTURE.md      # Forward light transport & math
│   ├── CAUSTICS.md          # Density estimation & kernels
│   ├── STREAMLINES.md       # Particle flow lines (ลายเส้น) & GPU shaders
│   └── API.md               # API reference
├── src/
│   ├── caustics/            # 2D Caustic baking & accumulation
│   ├── core/                # Math, types, BVH, intersection routines
│   ├── emitter/             # Photon emitter & light source sampling
│   ├── spatial/             # Balanced 3D k-d tree
│   ├── streamlines/         # Trajectory extraction & GPU buffers
│   ├── tracer/              # Forward particle tracer & Russian roulette
│   └── index.ts             # Public export barrel
├── examples/
│   ├── basic-usage.ts       # Headless forward simulation example
│   └── threejs-integration.ts # Three.js streamline & caustics integration
├── tests/
│   ├── core.test.ts         # Math and geometric intersection tests
│   ├── tracer.test.ts       # Forward tracer and k-d tree tests
│   └── streamlines.test.ts  # Streamlines and buffer builder tests
├── LICENSE                  # MIT License
├── package.json
└── tsconfig.json
```

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

100% commercially permissive. Safe for integration in closed-source proprietary software, commercial applications, and academic research with zero copyleft risk.
