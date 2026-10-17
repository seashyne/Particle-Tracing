# Streamline Visualization System (Particle Flow Lines)

## 1. Overview

The streamline system in Particle-Tracing extracts, filters, and formats photon transport paths into continuous line trajectories ("ลายเส้น"). In addition to quantitative radiance and caustic density estimation, physical forward tracing generates geometric paths representing the physical history of photons as they travel from emitters through specular, refractive, and scattering media.

Rendering these paths as GPU-accelerated streamlines serves multiple production purposes:
- **Optical Debugging**: Visually verify caustic convergence, reflection/refraction Snell angles, total internal reflection (TIR), and chromatic dispersion paths.
- **Cinematic Stylization**: Produce light flow animations, laser trajectory visualizations, glowing caustics paths, and vector field streamlines.
- **Scientific Visualization**: Display particle velocity fields, energy decay, and scattering density in participating media.

---

## 2. Architecture & Pipeline

The streamline generation pipeline operates in four decoupled stages:

```
+-------------------+      +-----------------------+      +-------------------------+      +--------------------+
|   Photon Path     | ---> |  StreamlineGenerator  | ---> | StreamlineBufferBuilder | ---> | GPU Line Renderer  |
| (Recorded Bounces)|      |  (Filter & Subdivide) |      | (Interleaved Attributes)|      | (Three.js / WebGPU)|
+-------------------+      +-----------------------+      +-------------------------+      +--------------------+
```

1. **Path Recording**: During forward ray traversal, `ParticleTracer` records each bounce segment when `recordStreamlines: true`.
2. **Filtering & Extraction**: `StreamlineGenerator` extracts paths by bounce count, minimum total energy, or interaction type (e.g., only paths that underwent refraction).
3. **Subdivision & Smoothing**: Linear segments are optionally subdivided via Catmull-Rom or Bezier interpolation for curved trajectory rendering.
4. **GPU Buffer Packing**: `StreamlineBufferBuilder` packs vertices, colors, normalized path lengths (0.0 to 1.0), and index arrays for single-draw-call rendering.

---

## 3. Data Structures

### 3.1 StreamlinePoint
Each vertex along a streamline retains geometric and optical state:

```typescript
export interface StreamlinePoint {
  position: Vector3;       // World-space coordinates (x, y, z)
  color: RGB;              // Color / power at this specific vertex
  time: number;            // Flight time (path distance / speed of light)
  distanceAlongPath: number;// Cumulative Euclidean distance from origin
  mediumIor: number;       // Index of refraction of surrounding medium
}
```

### 3.2 Streamline
A complete particle trajectory:

```typescript
export interface Streamline {
  id: number;
  points: StreamlinePoint[];
  totalLength: number;
  bounces: number;
  wavelengthNm?: number;   // For chromatic dispersion visualization
  hasCausticInteraction: boolean;
}
```

### 3.3 StreamlineBuffer
The contiguous binary representation ready for GPU upload:

```typescript
export interface StreamlineBuffer {
  positions: Float32Array;  // [x0, y0, z0, x1, y1, z1, ...]
  colors: Float32Array;     // [r0, g0, b0, r1, g1, b1, ...]
  progress: Float32Array;   // [0.0, ..., 1.0] normalized coordinate per line
  indices: Uint32Array;     // Segment indices [0, 1, 1, 2, ...]
  vertexCount: number;
  segmentCount: number;
}
```

---

## 4. Subdivisions & Smooth Curves

Raw photon paths consist of discrete line segments between collision points. When visualizing curved trajectories (e.g., graded-index optics, gravitational lensing, or stylized particle trails), `subdivideStreamline` performs Catmull-Rom spline interpolation:

Given four control points $P_0, P_1, P_2, P_3$ and interpolation factor $t \in [0, 1]$:

$$P(t) = 0.5 \cdot \left( (2 P_1) + (-P_0 + P_2) t + (2 P_0 - 5 P_1 + 4 P_2 - P_3) t^2 + (-P_0 + 3 P_1 - 3 P_2 + P_3) t^3 \right)$$

Interpolation smoothly blends colors, timestamps, and normalized path progress along the curve.

---

## 5. GPU Rendering Integration

### 5.1 Three.js LineSegments Shader

To render tens of thousands of streamlines in a single draw call with flowing light pulses, use a custom `ShaderMaterial` binding `position`, `color`, and `progress`:

```typescript
import * as THREE from 'three';
import { StreamlineBuffer } from 'particle-tracing';

export function createStreamlineMesh(buffer: StreamlineBuffer): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.BufferAttribute(buffer.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(buffer.colors, 3));
  geometry.setAttribute('progress', new THREE.BufferAttribute(buffer.progress, 1));
  geometry.setIndex(new THREE.BufferAttribute(buffer.indices, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uSpeed: { value: 0.5 },
      uTailLength: { value: 0.2 },
      uGlowIntensity: { value: 2.0 },
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
        // Calculate animated pulse head
        float head = fract(uTime * uSpeed);
        float dist = head - vProgress;
        if (dist < 0.0) dist += 1.0;

        // Exponential tail falloff
        float intensity = 0.0;
        if (dist < uTailLength) {
          float normDist = dist / uTailLength;
          intensity = pow(1.0 - normDist, 2.0) * uGlowIntensity;
        }

        // Ambient faint baseline path
        float ambient = 0.12;
        vec3 finalColor = vColor * (ambient + intensity);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  return new THREE.LineSegments(geometry, material);
}
```

### 5.2 WebGPU WGSL Implementation

In WebGPU pipelines, streamline attributes are bound via `GPUVertexBufferLayout`:

```wgsl
struct Uniforms {
  modelViewProjectionMatrix: mat4x4<f32>,
  time: f32,
  speed: f32,
  tailLength: f32,
  glowIntensity: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) color: vec3<f32>,
  @location(2) progress: f32,
};

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) color: vec3<f32>,
  @location(1) progress: f32,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.clipPosition = uniforms.modelViewProjectionMatrix * vec4<f32>(in.position, 1.0);
  out.color = in.color;
  out.progress = in.progress;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let head = fract(uniforms.time * uniforms.speed);
  var dist = head - in.progress;
  if (dist < 0.0) {
    dist = dist + 1.0;
  }

  var intensity: f32 = 0.0;
  if (dist < uniforms.tailLength) {
    let norm = dist / uniforms.tailLength;
    intensity = (1.0 - norm) * (1.0 - norm) * uniforms.glowIntensity;
  }

  let finalColor = in.color * (0.15 + intensity);
  return vec4<f32>(finalColor, 1.0);
}
```

---

## 6. Performance & Memory Guidelines

1. **Draw Call Batching**: Always pack all active streamlines into one unified `StreamlineBuffer` (single `LineSegments` object) rather than creating individual `Line` objects per particle.
2. **Progress Normalization**: The normalized progress attribute ($0.0 \le p \le 1.0$) eliminates the need to update geometry buffers on the CPU every frame. Animation is driven entirely in the fragment/vertex shader via `uTime`.
3. **Decimation**: For scenes with over 100,000 photons, use `StreamlineGenerator.filter()` to extract representative samples (e.g., top 5% highest energy or only refractive paths) to keep GPU vertex memory under 20 MB.
