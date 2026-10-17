# Particle-Tracing API Reference

Complete TypeScript API documentation for the `particle-tracing` engine.

---

## 1. ParticleTracer

The primary execution coordinator for forward particle simulation.

```typescript
import { ParticleTracer, Scene, TracerConfig, SimulationResult } from 'particle-tracing';

const tracer = new ParticleTracer(config?: TracerConfig);
const result = tracer.trace(scene: Scene, photonCount: number): SimulationResult;
```

### Configuration Options (`TracerConfig`)

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `maxBounces` | `number` | `8` | Maximum number of specular/diffuse bounces per photon path. |
| `minBounces` | `number` | `1` | Minimum bounces required before Russian roulette termination kicks in. |
| `russianRouletteProb` | `number` | `0.1` | Base termination probability for low-power photons. |
| `recordStreamlines` | `boolean` | `false` | When true, full 3D point trajectory paths are retained for streamline visualization. |
| `enableDispersion` | `boolean` | `false` | When true, photons are split into physical wavelengths across refractive boundaries. |

### Simulation Result (`SimulationResult`)

```typescript
export interface SimulationResult {
  storedPhotons: Photon[];          // Photons deposited on diffuse surfaces
  streamlines?: Streamline[];       // Extracted path trajectories (if recordStreamlines is true)
  stats: {
    emittedCount: number;
    absorbedCount: number;
    traversalTimeMs: number;
    buildKdTreeTimeMs: number;
  };
}
```

---

## 2. PhotonKdTree

High-performance spatial acceleration structure for nearest-neighbor photon queries and kernel density radiance estimation.

```typescript
import { PhotonKdTree } from 'particle-tracing';

const kdTree = new PhotonKdTree();
kdTree.build(photons: Photon[]): void;

// Radiance estimation at surface hit point
const radiance = kdTree.estimateRadiance(
  position: Vector3,
  normal: Vector3,
  radius: number,
  maxPhotons: number,
  kernel?: 'epanechnikov' | 'cone' | 'constant'
): RGB;
```

### Methods

- `build(photons: Photon[]): void`  
  Constructs a balanced 3D k-d tree from a flat array of photons using median splitting.
- `findWithinRadius(position: Vector3, radius: number): Photon[]`  
  Returns all photons whose Euclidean distance from `position` is less than or equal to `radius`.
- `findKNearest(position: Vector3, k: number, maxRadius?: number): PhotonDistance[]`  
  Finds the $k$ closest photons, optionally bounded by a maximum search horizon.
- `estimateRadiance(...)`  
  Applies kernel density estimation and normal compatibility validation to compute incident caustic radiance.

---

## 3. Streamlines (Flow Lines Visualizer)

Converts photon path segments into GPU-ready line geometry buffers.

### `StreamlineGenerator`

```typescript
import { StreamlineGenerator } from 'particle-tracing';

const generator = new StreamlineGenerator();

// Extract streamlines from raw simulation result
const streamlines = generator.extract(paths: PhotonPath[], options?: {
  minBounces?: number;
  minEnergy?: number;
  onlyCaustics?: boolean;
});

// Smooth trajectories using Catmull-Rom spline subdivision
const smoothLines = generator.subdivide(streamlines, { subdivisionsPerSegment: 4 });
```

### `StreamlineBufferBuilder`

Packs streamline collections into contiguous typed arrays ready for single-draw WebGL / WebGPU uploads.

```typescript
import { StreamlineBufferBuilder, StreamlineBuffer } from 'particle-tracing';

const builder = new StreamlineBufferBuilder();
const buffer: StreamlineBuffer = builder.build(streamlines);

// buffer.positions: Float32Array [x0, y0, z0, ...]
// buffer.colors: Float32Array [r0, g0, b0, ...]
// buffer.progress: Float32Array [0.0, ..., 1.0] (for shader dash/pulse animation)
// buffer.indices: Uint32Array [0, 1, 1, 2, ...]
```

---

## 4. CausticAccumulator

Renders or bakes 3D surface photon density into 2D float image textures.

```typescript
import { CausticAccumulator } from 'particle-tracing';

const accumulator = new CausticAccumulator({
  width: 1024,
  height: 1024,
  worldBounds: {
    min: { x: -10, y: 0, z: -10 },
    max: { x: 10, y: 0, z: 10 }
  },
  intensityScale: 1.0,
  blurRadius: 1.5,
});

const float32Buffer = accumulator.bakeFromKdTree(kdTree);
```

---

## 5. Core Geometry & Scene Types

### `Vector3`
```typescript
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}
```

### `Material`
```typescript
export interface Material {
  id: string;
  type: 'diffuse' | 'specular' | 'dielectric';
  albedo: RGB;
  ior?: number;              // Index of refraction (default: 1.5 for glass, 1.33 for water)
  dispersion?: number;       // Cauchy dispersion factor B (default: 0.0)
  roughness?: number;        // Surface microfacet roughness
}
```

### `Scene`
```typescript
export interface Scene {
  lights: LightSource[];
  spheres: Sphere[];
  triangles: Triangle[];
}
```
