/**
 * WGSL WebGPU Compute Shader for Massively Parallel Forward Particle-Tracing.
 * Implements GPU-side Monte Carlo photon emission, Möller-Trumbore ray-triangle
 * intersections, Snell's law dielectric refraction, and deposit accumulation.
 */
export const PARTICLE_TRACING_WGSL = /* wgsl */ `
struct SimParams {
  photonCount: u32,
  triangleCount: u32,
  lightCount: u32,
  maxBounces: u32,
  seed: u32,
  enableDispersion: u32,
  searchRadius: f32,
  intensityScale: f32,
};

struct LightSource {
  position: vec4<f32>,
  direction: vec4<f32>,
  color: vec4<f32>,
  params: vec4<f32>, // x: intensity, y: coneAngle, z: kind (0=sun, 1=point, 2=spot), w: enabled
};

struct GpuTriangle {
  v0: vec4<f32>,
  v1: vec4<f32>,
  v2: vec4<f32>,
  n0: vec4<f32>,
  n1: vec4<f32>,
  n2: vec4<f32>,
  material: vec4<f32>, // x: ior, y: transmission, z: roughness, w: metalness
};

struct GpuPhotonDeposit {
  position: vec4<f32>,
  normal: vec4<f32>,
  power: vec4<f32>, // rgb + caustic flag (1.0 = caustic)
};

struct GpuStreamlineVertex {
  position: vec4<f32>, // xyz + progress
  color: vec4<f32>,    // rgba
};

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read> lights: array<LightSource>;
@group(0) @binding(2) var<storage, read> triangles: array<GpuTriangle>;
@group(0) @binding(3) var<storage, read_write> photonDeposits: array<GpuPhotonDeposit>;
@group(0) @binding(4) var<storage, read_write> streamlineVertices: array<GpuStreamlineVertex>;

// High-speed PCG Hash Random Number Generator
fn pcg_hash(input: u32) -> u32 {
  var state = input * 747796405u + 2891336453u;
  var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn rand_float(seed: ptr<function, u32>) -> f32 {
  *seed = pcg_hash(*seed);
  return f32(*seed) / 4294967295.0;
}

// Möller-Trumbore Ray-Triangle Intersection
struct HitResult {
  hit: bool,
  t: f32,
  point: vec3<f32>,
  normal: vec3<f32>,
  triIndex: u32,
};

fn intersect_triangle(
  ro: vec3<f32>,
  rd: vec3<f32>,
  tri: GpuTriangle,
  tMin: f32,
  tMax: f32
) -> HitResult {
  var res: HitResult;
  res.hit = false;

  let edge1 = tri.v1.xyz - tri.v0.xyz;
  let edge2 = tri.v2.xyz - tri.v0.xyz;
  let pvec = cross(rd, edge2);
  let det = dot(edge1, pvec);

  if (abs(det) < 1e-6) {
    return res;
  }

  let invDet = 1.0 / det;
  let tvec = ro - tri.v0.xyz;
  let u = dot(tvec, pvec) * invDet;

  if (u < 0.0 || u > 1.0) {
    return res;
  }

  let qvec = cross(tvec, edge1);
  let v = dot(rd, qvec) * invDet;

  if (v < 0.0 || (u + v) > 1.0) {
    return res;
  }

  let t = dot(edge2, qvec) * invDet;
  if (t < tMin || t > tMax) {
    return res;
  }

  res.hit = true;
  res.t = t;
  res.point = ro + rd * t;

  // Interpolated smooth normal
  let w = 1.0 - u - v;
  let n = normalize(tri.n0.xyz * w + tri.n1.xyz * u + tri.n2.xyz * v);
  res.normal = n;

  return res;
}

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let index = global_id.x;
  if (index >= params.photonCount || params.lightCount == 0u) {
    return;
  }

  var seed = index + params.seed * 1973u;

  // 1. Emit Photon from Light
  let light = lights[0];
  var ro = light.position.xyz;
  var rd = light.direction.xyz;

  // Jitter direction within light cone
  let r1 = rand_float(&seed);
  let r2 = rand_float(&seed);
  let coneAngle = light.params.y;
  let cosTheta = 1.0 - r1 * (1.0 - cos(coneAngle));
  let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
  let phi = r2 * 6.28318530718;

  // Tangent coordinate frame
  var up = vec3<f32>(0.0, 1.0, 0.0);
  if (abs(rd.y) > 0.99) {
    up = vec3<f32>(1.0, 0.0, 0.0);
  }
  let tangent = normalize(cross(up, rd));
  let bitangent = cross(rd, tangent);

  rd = normalize(tangent * (sinTheta * cos(phi)) + bitangent * (sinTheta * sin(phi)) + rd * cosTheta);

  var power = light.color.rgb * (light.params.x / f32(params.photonCount));
  var isCaustic = false;

  // 2. Multi-Bounce Transport Simulation
  for (var bounce = 0u; bounce < params.maxBounces; bounce = bounce + 1u) {
    var closestHit: HitResult;
    closestHit.hit = false;
    closestHit.t = 1e30;

    for (var i = 0u; i < params.triangleCount; i = i + 1u) {
      let hit = intersect_triangle(ro, rd, triangles[i], 0.001, closestHit.t);
      if (hit.hit) {
        closestHit = hit;
        closestHit.triIndex = i;
      }
    }

    if (!closestHit.hit) {
      break;
    }

    let hitTri = triangles[closestHit.triIndex];
    let mat = hitTri.material; // x: ior, y: transmission, z: roughness, w: metalness

    // Record Streamline Segment (pair of vertices)
    let streamlineIdx = (index * params.maxBounces + bounce) * 2u;
    let uStart = f32(bounce) / f32(params.maxBounces);
    let uEnd = f32(bounce + 1u) / f32(params.maxBounces);

    streamlineVertices[streamlineIdx].position = vec4<f32>(ro, uStart);
    streamlineVertices[streamlineIdx].color = vec4<f32>(power, 1.0);

    streamlineVertices[streamlineIdx + 1u].position = vec4<f32>(closestHit.point, uEnd);
    streamlineVertices[streamlineIdx + 1u].color = vec4<f32>(power, 1.0);

    // Dielectric Glass Refraction
    if (mat.y > 0.5) {
      isCaustic = true;
      var normal = closestHit.normal;
      var eta = 1.0 / mat.x;

      if (dot(rd, normal) > 0.0) {
        normal = -normal;
        eta = mat.x;
      }

      let cosI = dot(-rd, normal);
      let sinT2 = eta * eta * (1.0 - cosI * cosI);

      if (sinT2 > 1.0) {
        // Total Internal Reflection (TIR)
        rd = reflect(rd, normal);
        ro = closestHit.point + normal * 0.002;
      } else {
        // Snell's Refraction
        let cosT = sqrt(1.0 - sinT2);
        rd = normalize(rd * eta + normal * (eta * cosI - cosT));
        ro = closestHit.point - normal * 0.002;
      }
      power = power * 0.98;
    } else {
      // Diffuse Surface Deposit
      photonDeposits[index].position = vec4<f32>(closestHit.point, 1.0);
      photonDeposits[index].normal = vec4<f32>(closestHit.normal, 0.0);
      var causticFlag = 0.0;
      if (isCaustic) {
        causticFlag = 1.0;
      }
      photonDeposits[index].power = vec4<f32>(power, causticFlag);
      break;
    }
  }
}
`;
