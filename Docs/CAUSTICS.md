# Caustic Reconstruction & Density Estimation

## 1. What are Caustics?

Caustics are luminous optical patterns formed when light rays are concentrated through specular reflection (reflective caustics, e.g., the bright ring inside a wedding band) or dielectric refraction (refractive caustics, e.g., wavy light patterns on the bottom of a swimming pool or rainbow fringes beneath a glass prism).

Standard path tracing cannot efficiently capture these paths because the probability of randomly hitting the tiny light source after one or more specular deflections is vanishingly small. Particle tracing solves this by depositing energy packets directly where light converges.

---

## 2. Radiance Estimation from Stored Photons

At a shading query point $\mathbf{x}$ with surface normal $\mathbf{n}$, the reflected radiance due to stored caustic photons is estimated by gathering all photons within an interaction radius $r$:

$$L_r(\mathbf{x}, \omega_o) \approx \sum_{p=1}^k f_r(\mathbf{x}, \omega_{p,i}, \omega_o) \frac{\Delta \Phi_p(\omega_{p,i}) K\left(\frac{\|\mathbf{x} - \mathbf{x}_p\|}{r}\right)}{\pi r^2}$$

Where:
- $k$: Number of photons found within radius $r$.
- $\Delta \Phi_p$: Radiant flux carried by photon $p$.
- $f_r$: BRDF evaluated at the query point.
- $K(u)$: Kernel filter function providing smooth spatial decay.

### 2.1 Kernel Filtering Comparison

`Particle-Tracing` supports multiple kernel filter types:

| Kernel | Formula $K(u)$ for $u = d/r \le 1$ | Smoothness | Computation Cost |
| :--- | :--- | :--- | :--- |
| **Constant (Box)** | $1.0$ | Discontinuous edges | Lowest |
| **Cone Filter** | $1 - u$ | $C^0$ Continuous | Moderate |
| **Epanechnikov** | $\frac{2}{\pi} (1 - u^2)$ | $C^1$ Continuous (MSE Optimal) | Optimal |
| **Gaussian** | $\frac{\alpha}{\pi} \frac{1 - e^{-\beta u^2 / 2}}{1 - e^{-\beta}}$ | Extremely smooth | Highest |

By default, the engine employs the **Epanechnikov kernel**, which minimizes mean squared error in non-parametric spatial density estimation.

---

## 3. Surface Normal & Boundary Validation

A naive 3D Euclidean sphere query risks gathering photons that struck the opposite side of a thin wall, or photons on adjacent perpendicular surfaces.

To prevent energy leakage:
1. **Normal Compatibility Test**: Photons are rejected if the angle between the query surface normal $\mathbf{n}_{\text{query}}$ and the photon's recorded surface normal $\mathbf{n}_p$ exceeds a threshold:
   $$\mathbf{n}_{\text{query}} \cdot \mathbf{n}_p \ge \cos(\theta_{\text{max}}) \quad (\text{typically } \cos(45^\circ) \approx 0.707)$$
2. **Tangent Plane Projection**: Photons are projected onto the local tangent plane at $\mathbf{x}$ before applying the 2D surface area factor $\pi r^2$.

---

## 4. Chromatic Dispersion

When light transitions into a dispersive medium (such as diamond, glass, or water), different wavelengths experience distinct indices of refraction according to Cauchy's equation:

$$\eta(\lambda) = A + \frac{B}{\lambda^2}$$

`Particle-Tracing` supports chromatic photon emission:
- When enabled, rays carrying white radiant flux are decomposed into spectral wavelength bands (e.g., Red 650 nm, Green 532 nm, Blue 450 nm).
- Each wavelength is refracted at its exact physical angle $\theta_t = \arcsin\left(\frac{\eta_1}{\eta_2(\lambda)} \sin \theta_i\right)$.
- When focused on a receiving diffuse surface, the spatially separated photons reconstruct physical rainbow caustic fringes.

---

## 5. Caustic Texture Accumulation (Baking)

For integration with real-time web engines (Three.js, Babylon.js, PlayCanvas, or custom WebGPU renderers), `CausticAccumulator` bakes 3D photon hits into a 2D float texture:

```typescript
import { CausticAccumulator, PhotonKdTree } from 'particle-tracing';

const accumulator = new CausticAccumulator({
  width: 1024,
  height: 1024,
  worldBounds: {
    min: { x: -5, y: 0, z: -5 },
    max: { x: 5, y: 0, z: 5 }
  },
  blurRadius: 2.0,
  intensityScale: 1.5,
});

// Accumulate photons directly into a Float32Array image buffer
const textureBuffer = accumulator.bakeFromKdTree(photonKdTree);

// textureBuffer can be uploaded directly to WebGL/WebGPU as an RGBA32F texture
```
