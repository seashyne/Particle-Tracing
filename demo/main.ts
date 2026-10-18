import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  buildBVH,
  runParticleTracing,
  extractStreamlines,
  subdivideStreamline,
  buildStreamlineBuffers,
  bakeCausticsTexture,
  type BVHNode,
  type LightSource,
  type RayTriangle,
  type StreamlinePath,
  type SurfaceMaterial,
  type Vector3Tuple
} from '../src/index.ts';

interface AppState {
  sceneType: 'lens' | 'prism' | 'mirror';
  photonCount: number;
  enableDispersion: boolean;
  bakeCaustics: boolean;
  showStreamlines: boolean;
  pulseSpeed: number;
  glowIntensity: number;
  tailLength: number;
  enableSmoothing: boolean;
}

const state: AppState = {
  sceneType: 'lens',
  photonCount: 20000,
  enableDispersion: false,
  bakeCaustics: true,
  showStreamlines: true,
  pulseSpeed: 0.8,
  glowIntensity: 2.5,
  tailLength: 0.25,
  enableSmoothing: true,
};

// Three.js Scene Variables
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let clock: THREE.Clock;

// Scene Object Groups
let objectGroup: THREE.Group;
let streamlineMesh: THREE.LineSegments | null = null;
let streamlineMaterial: THREE.ShaderMaterial | null = null;
let causticPlane: THREE.Mesh | null = null;
let causticCanvas: HTMLCanvasElement;
let causticTexture: THREE.CanvasTexture | null = null;

// UI References
const labelPhotonCount = document.getElementById('label-photon-count') as HTMLElement;
const labelSpeed = document.getElementById('label-speed') as HTMLElement;
const labelGlow = document.getElementById('label-glow') as HTMLElement;
const labelTail = document.getElementById('label-tail') as HTMLElement;
const telemetryText = document.getElementById('telemetry-text') as HTMLElement;
const statusDot = document.querySelector('.status-dot') as HTMLElement;

function init() {
  const container = document.getElementById('canvas-container')!;
  clock = new THREE.Clock();

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090a0f);
  scene.fog = new THREE.FogExp2(0x090a0f, 0.035);

  // Camera
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 3.8, 6.8);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // OrbitControls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.target.set(0, 1.2, 0);

  // Floor & Lighting
  createFloor();

  objectGroup = new THREE.Group();
  scene.add(objectGroup);

  // Canvas for Caustic Texture Baking
  causticCanvas = document.createElement('canvas');
  causticCanvas.width = 256;
  causticCanvas.height = 256;

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(5, 12, 6);
  scene.add(dirLight);

  setupUI();
  window.addEventListener('resize', onWindowResize);

  runSimulation();
  animate();
}

function createFloor() {
  const floorGeo = new THREE.PlaneGeometry(16, 16);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x0c0e14,
    roughness: 0.85,
    metalness: 0.1,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  scene.add(floor);

  const grid = new THREE.GridHelper(16, 32, 0x1f2937, 0x111827);
  grid.position.y = 0.005;
  scene.add(grid);

  const causticGeo = new THREE.PlaneGeometry(8, 8);
  const causticMat = new THREE.MeshBasicMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.95,
  });
  causticPlane = new THREE.Mesh(causticGeo, causticMat);
  causticPlane.rotation.x = -Math.PI / 2;
  causticPlane.position.y = 0.01;
  scene.add(causticPlane);
}

/**
 * Creates triangle mesh data for a sphere to build BVH for optical simulation.
 */
function createSphereTriangles(
  center: Vector3Tuple,
  radius: number,
  latSegments = 12,
  lonSegments = 16,
  material: SurfaceMaterial,
  objectId: string
): RayTriangle[] {
  const triangles: RayTriangle[] = [];

  for (let lat = 0; lat < latSegments; lat += 1) {
    const theta1 = (lat * Math.PI) / latSegments;
    const theta2 = ((lat + 1) * Math.PI) / latSegments;

    for (let lon = 0; lon < lonSegments; lon += 1) {
      const phi1 = (lon * 2 * Math.PI) / lonSegments;
      const phi2 = ((lon + 1) * 2 * Math.PI) / lonSegments;

      const p0: Vector3Tuple = [
        center[0] + radius * Math.sin(theta1) * Math.cos(phi1),
        center[1] + radius * Math.cos(theta1),
        center[2] + radius * Math.sin(theta1) * Math.sin(phi1),
      ];
      const p1: Vector3Tuple = [
        center[0] + radius * Math.sin(theta2) * Math.cos(phi1),
        center[1] + radius * Math.cos(theta2),
        center[2] + radius * Math.sin(theta2) * Math.sin(phi1),
      ];
      const p2: Vector3Tuple = [
        center[0] + radius * Math.sin(theta2) * Math.cos(phi2),
        center[1] + radius * Math.cos(theta2),
        center[2] + radius * Math.sin(theta2) * Math.sin(phi2),
      ];
      const p3: Vector3Tuple = [
        center[0] + radius * Math.sin(theta1) * Math.cos(phi2),
        center[1] + radius * Math.cos(theta1),
        center[2] + radius * Math.sin(theta1) * Math.sin(phi2),
      ];

      // Normals
      const n0: Vector3Tuple = [(p0[0] - center[0]) / radius, (p0[1] - center[1]) / radius, (p0[2] - center[2]) / radius];
      const n1: Vector3Tuple = [(p1[0] - center[0]) / radius, (p1[1] - center[1]) / radius, (p1[2] - center[2]) / radius];
      const n2: Vector3Tuple = [(p2[0] - center[0]) / radius, (p2[1] - center[1]) / radius, (p2[2] - center[2]) / radius];
      const n3: Vector3Tuple = [(p3[0] - center[0]) / radius, (p3[1] - center[1]) / radius, (p3[2] - center[2]) / radius];

      if (lat !== 0) {
        triangles.push({
          v0: p0, v1: p1, v2: p2,
          n0, n1, n2,
          uv0: [0, 0], uv1: [0, 1], uv2: [1, 1],
          material, objectId
        });
      }
      if (lat !== latSegments - 1) {
        triangles.push({
          v0: p0, v1: p2, v2: p3,
          n0, n1: n2, n2: n3,
          uv0: [0, 0], uv1: [1, 1], uv2: [1, 0],
          material, objectId
        });
      }
    }
  }

  return triangles;
}

/**
 * Creates triangle mesh data for a triangular glass prism.
 */
function createPrismTriangles(
  center: Vector3Tuple,
  width: number,
  height: number,
  depth: number,
  material: SurfaceMaterial,
  objectId: string
): RayTriangle[] {
  const triangles: RayTriangle[] = [];
  const halfD = depth / 2;
  const halfW = width / 2;

  // Front & Back triangle vertices
  const p0: Vector3Tuple = [center[0] - halfW, center[1] - height / 2, center[2] - halfD];
  const p1: Vector3Tuple = [center[0] + halfW, center[1] - height / 2, center[2] - halfD];
  const p2: Vector3Tuple = [center[0], center[1] + height / 2, center[2] - halfD];

  const q0: Vector3Tuple = [center[0] - halfW, center[1] - height / 2, center[2] + halfD];
  const q1: Vector3Tuple = [center[0] + halfW, center[1] - height / 2, center[2] + halfD];
  const q2: Vector3Tuple = [center[0], center[1] + height / 2, center[2] + halfD];

  // Front Cap
  triangles.push({
    v0: p0, v1: p1, v2: p2,
    n0: [0, 0, -1], n1: [0, 0, -1], n2: [0, 0, -1],
    uv0: [0, 0], uv1: [1, 0], uv2: [0.5, 1],
    material, objectId
  });

  // Back Cap
  triangles.push({
    v0: q1, v1: q0, v2: q2,
    n0: [0, 0, 1], n1: [0, 0, 1], n2: [0, 0, 1],
    uv0: [1, 0], uv1: [0, 0], uv2: [0.5, 1],
    material, objectId
  });

  // Left Face (p0 -> p2 -> q2 -> q0)
  triangles.push({
    v0: p0, v1: p2, v2: q0,
    n0: [-1, 0.5, 0], n1: [-1, 0.5, 0], n2: [-1, 0.5, 0],
    uv0: [0, 0], uv1: [1, 0], uv2: [0, 1],
    material, objectId
  });
  triangles.push({
    v0: q0, v1: p2, v2: q2,
    n0: [-1, 0.5, 0], n1: [-1, 0.5, 0], n2: [-1, 0.5, 0],
    uv0: [0, 1], uv1: [1, 0], uv2: [1, 1],
    material, objectId
  });

  // Right Face (p2 -> p1 -> q1 -> q2)
  triangles.push({
    v0: p2, v1: p1, v2: q2,
    n0: [1, 0.5, 0], n1: [1, 0.5, 0], n2: [1, 0.5, 0],
    uv0: [0, 0], uv1: [1, 0], uv2: [0, 1],
    material, objectId
  });
  triangles.push({
    v0: q2, v1: p1, v2: q1,
    n0: [1, 0.5, 0], n1: [1, 0.5, 0], n2: [1, 0.5, 0],
    uv0: [0, 1], uv1: [1, 0], uv2: [1, 1],
    material, objectId
  });

  // Bottom Face (p1 -> p0 -> q0 -> q1)
  triangles.push({
    v0: p1, v1: p0, v2: q1,
    n0: [0, -1, 0], n1: [0, -1, 0], n2: [0, -1, 0],
    uv0: [0, 0], uv1: [1, 0], uv2: [0, 1],
    material, objectId
  });
  triangles.push({
    v0: q1, v1: p0, v2: q0,
    n0: [0, -1, 0], n1: [0, -1, 0], n2: [0, -1, 0],
    uv0: [0, 1], uv1: [1, 0], uv2: [1, 1],
    material, objectId
  });

  return triangles;
}

function buildSceneGeometry(): {
  triangles: RayTriangle[];
  lights: LightSource[];
  threeMeshes: THREE.Object3D[];
} {
  const triangles: RayTriangle[] = [];
  const lights: LightSource[] = [];
  const threeMeshes: THREE.Object3D[] = [];

  // Floor receiver
  const floorMat: SurfaceMaterial = { color: '#ffffff', metalness: 0, roughness: 1.0 };
  triangles.push(
    {
      v0: [-8, 0, -8], v1: [8, 0, -8], v2: [8, 0, 8],
      n0: [0, 1, 0], n1: [0, 1, 0], n2: [0, 1, 0],
      uv0: [0, 0], uv1: [1, 0], uv2: [1, 1],
      material: floorMat, objectId: 'floor'
    },
    {
      v0: [-8, 0, -8], v1: [8, 0, 8], v2: [-8, 0, 8],
      n0: [0, 1, 0], n1: [0, 1, 0], n2: [0, 1, 0],
      uv0: [0, 0], uv1: [1, 1], uv2: [0, 1],
      material: floorMat, objectId: 'floor'
    }
  );

  if (state.sceneType === 'lens') {
    const sphereCenter: Vector3Tuple = [0, 1.6, 0];
    const sphereRadius = 1.0;
    const glassMat: SurfaceMaterial = {
      color: '#ffffff',
      metalness: 0.0,
      roughness: 0.0,
      transmission: 1.0,
      ior: 1.52,
    };

    const sphereTris = createSphereTriangles(sphereCenter, sphereRadius, 14, 18, glassMat, 'lens');
    triangles.push(...sphereTris);

    const light: LightSource = {
      id: 'spot_lens',
      kind: 'spot',
      position: [-2.5, 4.6, 0.0],
      direction: [2.5, -3.0, 0.0],
      color: '#ffffff',
      colorTemperature: 6000,
      intensity: 120.0,
      range: 20,
      spotAngle: 28,
      spotSoftness: 0.15,
      enabled: true,
    };
    lights.push(light);

    // Three.js Visual Mesh
    const sphereGeo = new THREE.SphereGeometry(sphereRadius, 36, 36);
    const sphereThreeMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.94,
      opacity: 1.0,
      transparent: true,
      roughness: 0.03,
      ior: 1.52,
      thickness: 1.8,
    });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereThreeMat);
    sphereMesh.position.set(...sphereCenter);
    threeMeshes.push(sphereMesh);

    // Emitter Visualizer
    const coneGeo = new THREE.ConeGeometry(0.18, 0.45, 16);
    coneGeo.rotateX(Math.PI / 2);
    const emitter = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
    emitter.position.set(...light.position);
    emitter.lookAt(sphereCenter[0], sphereCenter[1], sphereCenter[2]);
    threeMeshes.push(emitter);
  } else if (state.sceneType === 'prism') {
    const prismCenter: Vector3Tuple = [0, 1.4, 0];
    const glassMat: SurfaceMaterial = {
      color: '#ffffff',
      metalness: 0.0,
      roughness: 0.0,
      transmission: 1.0,
      ior: 1.54,
    };

    const prismTris = createPrismTriangles(prismCenter, 1.6, 1.6, 1.4, glassMat, 'prism');
    triangles.push(...prismTris);

    const light: LightSource = {
      id: 'beam_prism',
      kind: 'spot',
      position: [-3.5, 1.4, 0.0],
      direction: [3.5, 0.0, 0.0],
      color: '#ffffff',
      colorTemperature: 6500,
      intensity: 140.0,
      range: 20,
      spotAngle: 18,
      spotSoftness: 0.05,
      enabled: true,
    };
    lights.push(light);

    // Three.js Visual Mesh
    const shape = new THREE.Shape();
    shape.moveTo(-0.8, -0.8);
    shape.lineTo(0.8, -0.8);
    shape.lineTo(0.0, 0.8);
    shape.closePath();

    const extrudeGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false });
    extrudeGeo.center();
    const prismThreeMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.94,
      opacity: 1.0,
      transparent: true,
      roughness: 0.02,
      ior: 1.54,
    });
    const prismMesh = new THREE.Mesh(extrudeGeo, prismThreeMat);
    prismMesh.position.set(...prismCenter);
    threeMeshes.push(prismMesh);

    const coneGeo = new THREE.ConeGeometry(0.18, 0.45, 16);
    coneGeo.rotateX(Math.PI / 2);
    const emitter = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    emitter.position.set(...light.position);
    emitter.lookAt(prismCenter[0], prismCenter[1], prismCenter[2]);
    threeMeshes.push(emitter);
  } else if (state.sceneType === 'mirror') {
    const mirrorCenter: Vector3Tuple = [0, 1.6, 0];
    const mirrorRadius = 1.1;
    const mirrorMat: SurfaceMaterial = {
      color: '#eef2ff',
      metalness: 1.0,
      roughness: 0.02,
    };

    const mirrorTris = createSphereTriangles(mirrorCenter, mirrorRadius, 14, 18, mirrorMat, 'mirror');
    triangles.push(...mirrorTris);

    const light: LightSource = {
      id: 'spot_mirror',
      kind: 'spot',
      position: [-2.8, 3.8, 1.0],
      direction: [2.8, -2.2, -1.0],
      color: '#ffffff',
      colorTemperature: 5500,
      intensity: 100.0,
      range: 20,
      spotAngle: 32,
      spotSoftness: 0.2,
      enabled: true,
    };
    lights.push(light);

    const mirrorGeo = new THREE.SphereGeometry(mirrorRadius, 32, 32);
    const mirrorThreeMat = new THREE.MeshStandardMaterial({
      color: 0xe0e7ff,
      metalness: 0.95,
      roughness: 0.05,
    });
    const mirrorMesh = new THREE.Mesh(mirrorGeo, mirrorThreeMat);
    mirrorMesh.position.set(...mirrorCenter);
    threeMeshes.push(mirrorMesh);

    const coneGeo = new THREE.ConeGeometry(0.18, 0.45, 16);
    coneGeo.rotateX(Math.PI / 2);
    const emitter = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
    emitter.position.set(...light.position);
    emitter.lookAt(mirrorCenter[0], mirrorCenter[1], mirrorCenter[2]);
    threeMeshes.push(emitter);
  }

  return { triangles, lights, threeMeshes };
}

function runSimulation() {
  statusDot.style.backgroundColor = '#f59e0b';
  statusDot.style.boxShadow = '0 0 8px #f59e0b';
  telemetryText.textContent = 'Tracing Photons...';

  const t0 = performance.now();

  // Clear previous Three.js objects
  while (objectGroup.children.length > 0) {
    const child = objectGroup.children[0];
    objectGroup.remove(child);
  }

  if (streamlineMesh) {
    scene.remove(streamlineMesh);
    streamlineMesh.geometry.dispose();
    streamlineMesh = null;
  }

  // 1. Build Scene Geometries & Lights
  const { triangles, lights, threeMeshes } = buildSceneGeometry();
  for (const m of threeMeshes) {
    objectGroup.add(m);
  }

  // 2. Build BVH
  const bvh: BVHNode = buildBVH(triangles);

  // 3. Run Forward Particle-Tracing
  const simResult = runParticleTracing(lights, bvh, {
    particleCount: state.photonCount,
    maxBounces: 5,
    recordTrajectories: true,
    enableDispersion: state.enableDispersion || state.sceneType === 'prism',
    searchRadius: 0.35,
    maxGatherPhotons: 40,
  });

  // 4. Extract and Build Streamlines (ระบบลายเส้น)
  if (state.showStreamlines && simResult.particles.length > 0) {
    let paths: StreamlinePath[] = extractStreamlines(simResult.particles);

    if (state.enableSmoothing) {
      paths = paths.map((p) => ({
        ...p,
        points: subdivideStreamline(p.points, 2),
      }));
    }

    const buffers = buildStreamlineBuffers(paths);
    createStreamlinesMesh(buffers);
  }

  // 5. Bake Floor Caustic Map
  if (state.bakeCaustics && simResult.photonMap.photons.length > 0) {
    const bakedPixels = bakeCausticsTexture(simResult.photonMap, {
      width: 256,
      height: 256,
      worldBounds: {
        min: [-4, -4],
        max: [4, 4],
      },
      intensityScale: 3.5,
      searchRadius: 0.35,
    });

    updateCausticTexture(bakedPixels);
    if (causticPlane) causticPlane.visible = true;
  } else {
    if (causticPlane) causticPlane.visible = false;
  }

  const duration = (performance.now() - t0).toFixed(1);
  statusDot.style.backgroundColor = '#10b981';
  statusDot.style.boxShadow = '0 0 8px #10b981';
  telemetryText.textContent = `${duration}ms | ${simResult.photonMap.photons.length} hits | ${simResult.particles.length} paths`;
}

function createStreamlinesMesh(buffers: {
  positions: Float32Array;
  colors: Float32Array;
  progress: Float32Array;
  segmentCount: number;
}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 4));
  geometry.setAttribute('progress', new THREE.BufferAttribute(buffers.progress, 1));

  streamlineMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uSpeed: { value: state.pulseSpeed },
      uTailLength: { value: state.tailLength },
      uGlowIntensity: { value: state.glowIntensity },
    },
    vertexShader: `
      attribute vec4 color;
      attribute float progress;
      varying vec4 vColor;
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

      varying vec4 vColor;
      varying float vProgress;

      void main() {
        float head = fract(uTime * uSpeed);
        float dist = head - vProgress;
        if (dist < 0.0) dist += 1.0;

        float intensity = 0.0;
        if (dist < uTailLength) {
          float normDist = dist / uTailLength;
          intensity = pow(1.0 - normDist, 2.0) * uGlowIntensity;
        }

        float ambient = 0.12;
        vec3 finalRgb = vColor.rgb * (ambient + intensity);
        gl_FragColor = vec4(finalRgb, vColor.a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  streamlineMesh = new THREE.LineSegments(geometry, streamlineMaterial);
  scene.add(streamlineMesh);
}

function updateCausticTexture(bakedPixels: Float32Array) {
  const ctx = causticCanvas.getContext('2d')!;
  const imgData = ctx.createImageData(256, 256);
  const data = imgData.data;

  for (let i = 0; i < 256 * 256; i++) {
    const idx = i * 4;
    const r = Math.min(255, Math.pow(bakedPixels[idx], 1 / 2.2) * 255);
    const g = Math.min(255, Math.pow(bakedPixels[idx + 1], 1 / 2.2) * 255);
    const b = Math.min(255, Math.pow(bakedPixels[idx + 2], 1 / 2.2) * 255);
    const alpha = Math.min(255, (r + g + b) * 0.8);

    data[idx] = r;
    data[idx + 1] = g;
    data[idx + 2] = b;
    data[idx + 3] = alpha;
  }

  ctx.putImageData(imgData, 0, 0);

  if (!causticTexture) {
    causticTexture = new THREE.CanvasTexture(causticCanvas);
    if (causticPlane) {
      (causticPlane.material as THREE.MeshBasicMaterial).map = causticTexture;
      (causticPlane.material as THREE.MeshBasicMaterial).needsUpdate = true;
    }
  } else {
    causticTexture.needsUpdate = true;
  }
}

function setupUI() {
  const sceneButtons = document.querySelectorAll('.segment-btn');
  sceneButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      sceneButtons.forEach((b) => b.classList.remove('active'));
      const target = e.currentTarget as HTMLButtonElement;
      target.classList.add('active');
      state.sceneType = target.dataset.scene as AppState['sceneType'];
      runSimulation();
    });
  });

  const inputPhotons = document.getElementById('input-photons') as HTMLInputElement;
  inputPhotons.addEventListener('input', () => {
    state.photonCount = parseInt(inputPhotons.value, 10);
    labelPhotonCount.textContent = state.photonCount.toLocaleString();
  });
  inputPhotons.addEventListener('change', () => {
    runSimulation();
  });

  const inputDispersion = document.getElementById('input-dispersion') as HTMLInputElement;
  inputDispersion.addEventListener('change', () => {
    state.enableDispersion = inputDispersion.checked;
    runSimulation();
  });

  const inputCausticMap = document.getElementById('input-caustic-map') as HTMLInputElement;
  inputCausticMap.addEventListener('change', () => {
    state.bakeCaustics = inputCausticMap.checked;
    if (causticPlane) causticPlane.visible = state.bakeCaustics;
  });

  const btnRetrace = document.getElementById('btn-retrace') as HTMLButtonElement;
  btnRetrace.addEventListener('click', () => {
    runSimulation();
  });

  const inputShowStreamlines = document.getElementById('input-show-streamlines') as HTMLInputElement;
  inputShowStreamlines.addEventListener('change', () => {
    state.showStreamlines = inputShowStreamlines.checked;
    if (streamlineMesh) streamlineMesh.visible = state.showStreamlines;
  });

  const inputSpeed = document.getElementById('input-speed') as HTMLInputElement;
  inputSpeed.addEventListener('input', () => {
    state.pulseSpeed = parseFloat(inputSpeed.value);
    labelSpeed.textContent = `${state.pulseSpeed.toFixed(1)}x`;
    if (streamlineMaterial) streamlineMaterial.uniforms.uSpeed.value = state.pulseSpeed;
  });

  const inputGlow = document.getElementById('input-glow') as HTMLInputElement;
  inputGlow.addEventListener('input', () => {
    state.glowIntensity = parseFloat(inputGlow.value);
    labelGlow.textContent = `${state.glowIntensity.toFixed(1)}x`;
    if (streamlineMaterial) streamlineMaterial.uniforms.uGlowIntensity.value = state.glowIntensity;
  });

  const inputTail = document.getElementById('input-tail') as HTMLInputElement;
  inputTail.addEventListener('input', () => {
    state.tailLength = parseFloat(inputTail.value);
    labelTail.textContent = state.tailLength.toFixed(2);
    if (streamlineMaterial) streamlineMaterial.uniforms.uTailLength.value = state.tailLength;
  });

  const inputSmoothing = document.getElementById('input-smoothing') as HTMLInputElement;
  inputSmoothing.addEventListener('change', () => {
    state.enableSmoothing = inputSmoothing.checked;
    runSimulation();
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  const elapsedTime = clock.getElapsedTime();
  if (streamlineMaterial) {
    streamlineMaterial.uniforms.uTime.value = elapsedTime;
  }

  controls.update();
  renderer.render(scene, camera);
}

init();
