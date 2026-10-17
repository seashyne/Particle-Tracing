# Forward Particle Tracing Architecture

## 1. Mathematical Foundation

### 1.1 The Rendering Equation
Standard physically based rendering is formulated by Kajiya's Rendering Equation:

$$L_o(\mathbf{x}, \omega_o) = L_e(\mathbf{x}, \omega_o) + \int_{\Omega} f_r(\mathbf{x}, \omega_i, \omega_o) L_i(\mathbf{x}, \omega_i) (\omega_i \cdot \mathbf{n}) d\omega_i$$

Where:
- $L_o$: Outgoing radiance from surface point $\mathbf{x}$ in direction $\omega_o$.
- $L_e$: Directly emitted radiance.
- $f_r$: Bidirectional Reflectance Distribution Function (BRDF).
- $L_i$: Incident radiance from hemisphere direction $\omega_i$.
- $\mathbf{n}$: Surface normal at $\mathbf{x}$.

### 1.2 The SDS Singularity (Specular-Diffuse-Specular)
Standard backward path tracing (tracing from the camera into the scene) constructs light paths using next-event estimation (direct emitter sampling) and BSDF importance sampling:

$$\text{Camera} \rightarrow \text{Diffuse} \rightarrow \text{Specular} \rightarrow \text{Emitter}$$

When light undergoes refraction or reflection across a smooth curved surface ($S$) before arriving at a diffuse surface ($D$), backward path tracers face a zero-measure probability of sampling the tiny light source through the specular boundary without an infinite number of camera rays. This is known as the **SDS Caustic Problem**:

$$\text{Path: } E \rightarrow S \rightarrow \cdots \rightarrow S \rightarrow D \rightarrow \text{Camera}$$

Forward particle tracing resolves this singularity by inverting the simulation direction: particles (photons) carrying discrete radiant flux $\Phi_p$ are shot directly from emitters into the scene, refracted/reflected through specular dielectric interfaces ($S$), and deposited onto diffuse surfaces ($D$), where they are cached and reconstructed via spatial kernel density estimation.

---

## 2. Emission & Importance Sampling

Photons are emitted according to the emission profile of each light source:
- **Point Lights**: Uniform spherical sampling over the $4\pi$ steradian sphere.
- **Directional Lights**: Uniform planar disk sampling orthogonal to the emission vector.
- **Spot Lights**: Cosine-weighted cone distribution within the cutoff angle.
- **Area / Mesh Lights**: Surface area sampling weighted by the face area and cosine emission distribution:

$$p(\omega) = \frac{\cos \theta}{\pi}$$

The initial photon radiant flux $\Phi_{p,0}$ is allocated proportionally:

$$\Phi_{p,0} = \frac{\Phi_{\text{light}}}{N_{\text{emitted}}}$$

Where $N_{\text{emitted}}$ is the total number of photons simulated in the emission pass.

---

## 3. Surface Interactions & Russian Roulette

At each intersection with a scene surface, the particle determines its interaction mode based on the material's properties:
1. **Diffuse Reflection**: Uniform or cosine-weighted hemispherical scatter. Photons are stored in the spatial data structure (`PhotonKdTree`) upon diffuse impact.
2. **Specular Reflection**: Deterministic mirror reflection $\omega_r = \omega_i - 2(\omega_i \cdot \mathbf{n})\mathbf{n}$.
3. **Dielectric Refraction**: Snell's Law with Fresnel dielectric equations:
   $$R(\theta) = \frac{1}{2} \left( \left| \frac{\eta_1 \cos \theta_i - \eta_2 \cos \theta_t}{\eta_1 \cos \theta_i + \eta_2 \cos \theta_t} \right|^2 + \left| \frac{\eta_1 \cos \theta_t - \eta_2 \cos \theta_i}{\eta_1 \cos \theta_t + \eta_2 \cos \theta_i} \right|^2 \right)$$
   If $1 - \sin^2 \theta_t < 0$, Total Internal Reflection (TIR) occurs.

### Russian Roulette Termination
To prevent infinite bounce loops while preserving an unbiased expected value, photon paths with low radiant power are probabilistically terminated:

$$q = \max(0.05, 1 - \max(P_r, P_g, P_b))$$

If a random variable $\xi < q$, the photon is terminated. Otherwise, the photon survives and its power is boosted:

$$\Phi_{\text{new}} = \frac{\Phi_{\text{old}}}{1 - q}$$

This ensures that the energy estimator remains mathematically unbiased:

$$\mathbb{E}[\Phi_{\text{new}}] = (1 - q) \cdot \frac{\Phi_{\text{old}}}{1 - q} + q \cdot 0 = \Phi_{\text{old}}$$

---

## 4. Acceleration Structures

### 4.1 Surface BVH (Bounding Volume Hierarchy)
Geometric ray queries are accelerated using a SAH (Surface Area Heuristic) bounding volume hierarchy. Triangles and spheres are organized into an AABB tree, reducing ray intersection complexity from $O(N)$ to $O(\log N)$.

### 4.2 Photon k-d Tree
Stored photons are indexed in a 3D balanced k-d tree. The tree alternates splitting axes $(x, y, z)$ at the median point, enabling $O(k \log N)$ nearest-neighbor queries and bounded-radius range searches for radiance estimation.
