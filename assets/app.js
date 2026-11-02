(() => {
  "use strict";

  const DATA = window.SPARK_DATA;
  const errorEl = document.getElementById("error");
  const loadingEl = document.getElementById("loading");

  function showError(message) {
    if (loadingEl) loadingEl.classList.add("done");
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = message;
    }
    console.error(message);
  }

  if (!DATA || !Array.isArray(DATA.supporters)) {
    showError("The supporter dataset did not load.");
    return;
  }
  if (!window.THREE) {
    showError("The 3D rendering library did not load.");
    return;
  }

  const stars = DATA.supporters;
  const count = stars.length;
  const byNumber = new Map(stars.map((star, index) => [String(star.number), index]));
  const searchable = stars.map((star, index) => ({
    index,
    number: String(star.number),
    name: star.name,
    haystack: `${star.number} #${star.number} ${star.name} ${star.id} ${star.layer} ${star.sector}`.toLocaleLowerCase()
  }));

  const canvas = document.getElementById("universe");
  const labelLayer = document.getElementById("label-layer");
  const selectedLabel = document.getElementById("selected-label");
  const selectedNumber = document.getElementById("selected-number");
  const selectedName = document.getElementById("selected-name");
  const selectedMeta = document.getElementById("selected-meta");
  const centerBrand = document.getElementById("center-brand");
  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");
  const searchShell = document.getElementById("search-shell");
  const searchClear = document.getElementById("search-clear");
  const zoomIn = document.getElementById("zoom-in");
  const zoomOut = document.getElementById("zoom-out");
  const resetButton = document.getElementById("reset-view");
  const statusCount = document.getElementById("status-count");
  if (statusCount) statusCount.textContent = String(count);

  function isMobileViewport() {
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    return Boolean(coarse || Math.min(window.innerWidth, window.innerHeight) <= 760);
  }

  function getRenderPixelRatio() {
    if (diagMode === "dpr1") return 1;
    const cap = isMobileViewport() ? 1.5 : 2;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  function getCanvasMetrics() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || window.innerWidth || 1));
    const height = Math.max(1, Math.round(rect.height || window.innerHeight || 1));
    return { left: rect.left || 0, top: rect.top || 0, width, height };
  }

  function getUiViewport() {
    const vv = window.visualViewport;
    return {
      left: vv ? vv.offsetLeft : 0,
      top: vv ? vv.offsetTop : 0,
      width: Math.max(1, vv ? vv.width : window.innerWidth),
      height: Math.max(1, vv ? vv.height : window.innerHeight),
      scale: vv ? vv.scale : 1
    };
  }

  const diagMode = new URLSearchParams(window.location.search).get("diag") || "";

  const initialCanvas = getCanvasMetrics();
  const mobileRendering = isMobileViewport();
  const rendererOptions = {
    canvas,
    antialias: !mobileRendering,
    alpha: false,
    powerPreference: mobileRendering ? "default" : "high-performance",
    stencil: false
  };
  if (diagMode === "webgl1") {
    const gl = canvas.getContext("webgl", {
      alpha: false, antialias: false, stencil: false, powerPreference: "default"
    });
    if (gl) rendererOptions.context = gl;
  }
  const renderer = new THREE.WebGLRenderer(rendererOptions);
  renderer.setClearColor(0x080808, 1);
  renderer.setPixelRatio(getRenderPixelRatio());
  renderer.setSize(initialCanvas.width, initialCanvas.height, false);
  if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  if ("toneMapping" in renderer) renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x080706, 0.012);
  const camera = new THREE.PerspectiveCamera(50, initialCanvas.width / initialCanvas.height, 0.1, 160);
  camera.position.set(0, 7, 20);

  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.18;
  const pointer = new THREE.Vector2();
  const clock = new THREE.Clock();

  const FIT_RADIUS = 6.65;
  const MIN_ZOOM_RADIUS = 2.25;
  const DEFAULT_THETA = -0.29;
  const DEFAULT_PHI = 0.46;
  let fitDistance = 18;
  let maxZoomRadius = 52;
  let selectedIndex = -1;
  let selectedMarker = null;
  let selectedGlow = null;
  let selectedCore = null;
  let lastFrame = performance.now();
  let pointerDown = null;
  let movedDistance = 0;
  let gestureHadMultiplePointers = false;
  let gestureWasPan = false;
  let activePointers = new Map();
  let pinch = null;
  let lastInteraction = performance.now();
  const labelPool = [];
  const centerMarkObjects = [];
  const heroFlares = [];
  const tempVector = new THREE.Vector3();
  let lastViewport = { left: 0, top: 0, width: 0, height: 0, dpr: 0 };
  let viewportSyncQueued = false;

  const controls = {
    current: {
      radius: fitDistance,
      theta: DEFAULT_THETA,
      phi: DEFAULT_PHI,
      target: new THREE.Vector3(0, 0, 0)
    },
    wanted: {
      radius: fitDistance,
      theta: DEFAULT_THETA,
      phi: DEFAULT_PHI,
      target: new THREE.Vector3(0, 0, 0)
    }
  };

  function fitDistanceForViewport(width, height) {
    const aspect = Math.max(0.2, width / Math.max(1, height));
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const limitingFov = Math.min(vFov, hFov);
    return (FIT_RADIUS / Math.sin(limitingFov / 2)) * 1.0;
  }

  function clampPanTarget(target) {
    const length = target.length();
    if (length > 8.4) target.multiplyScalar(8.4 / length);
    return target;
  }

  function updateViewAfterResize(oldFit, metrics) {
    const nextFit = fitDistanceForViewport(metrics.width, metrics.height);
    fitDistance = nextFit;
    maxZoomRadius = fitDistance * 2.7;
    if (selectedIndex < 0 && Math.abs(controls.wanted.radius - oldFit) < oldFit * 0.12) {
      controls.wanted.radius = fitDistance;
    }
    controls.wanted.radius = THREE.MathUtils.clamp(controls.wanted.radius, MIN_ZOOM_RADIUS, maxZoomRadius);
    controls.current.radius = THREE.MathUtils.clamp(controls.current.radius, MIN_ZOOM_RADIUS, maxZoomRadius);
  }

  fitDistance = fitDistanceForViewport(initialCanvas.width, initialCanvas.height);
  maxZoomRadius = fitDistance * 2.7;
  controls.current.radius = fitDistance;
  controls.wanted.radius = fitDistance;

  function makeGlowTexture(size = 256, stops = [[0, "rgba(255,245,232,1)"], [0.18, "rgba(255,200,150,0.65)"], [0.55, "rgba(255,122,51,0.12)"], [1, "rgba(255,122,51,0)"]] ) {
    const surface = document.createElement("canvas");
    surface.width = size;
    surface.height = size;
    const ctx = surface.getContext("2d");
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  function makeRingTexture(size = 512) {
    const surface = document.createElement("canvas");
    surface.width = size;
    surface.height = size;
    const ctx = surface.getContext("2d");
    const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.20, size / 2, size / 2, size * 0.49);
    gradient.addColorStop(0, "rgba(255,122,51,0)");
    gradient.addColorStop(0.48, "rgba(255,122,51,0)");
    gradient.addColorStop(0.63, "rgba(255,160,90,0.26)");
    gradient.addColorStop(0.76, "rgba(255,122,51,0.10)");
    gradient.addColorStop(1, "rgba(255,122,51,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }

  function makeSparkTexture(size = 256) {
    const surface = document.createElement("canvas");
    surface.width = size;
    surface.height = size;
    const ctx = surface.getContext("2d");
    ctx.translate(size / 2, size / 2);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.48);
    glow.addColorStop(0, "rgba(255,245,230,.98)");
    glow.addColorStop(0.12, "rgba(255,205,155,.76)");
    glow.addColorStop(0.45, "rgba(255,122,51,.12)");
    glow.addColorStop(1, "rgba(255,122,51,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    const path = new Path2D();
    const s = size * 0.31;
    path.moveTo(0, -s);
    path.bezierCurveTo(s * 0.05, -s * 0.2, s * 0.2, -s * 0.05, s, 0);
    path.bezierCurveTo(s * 0.2, s * 0.05, s * 0.05, s * 0.2, 0, s);
    path.bezierCurveTo(-s * 0.05, s * 0.2, -s * 0.2, s * 0.05, -s, 0);
    path.bezierCurveTo(-s * 0.2, -s * 0.05, -s * 0.05, -s * 0.2, 0, -s);
    ctx.fillStyle = "#FFF4E5";
    ctx.shadowColor = "rgba(255,138,76,.9)";
    ctx.shadowBlur = size * 0.10;
    ctx.fill(path);
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }

  function makeFlareTexture(size = 256) {
    const surface = document.createElement("canvas");
    surface.width = size;
    surface.height = size;
    const ctx = surface.getContext("2d");
    ctx.translate(size / 2, size / 2);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.5);
    glow.addColorStop(0, "rgba(255,248,236,1)");
    glow.addColorStop(0.07, "rgba(255,216,177,.9)");
    glow.addColorStop(0.32, "rgba(255,138,76,.18)");
    glow.addColorStop(1, "rgba(255,138,76,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    const ray = ctx.createLinearGradient(-size * 0.45, 0, size * 0.45, 0);
    ray.addColorStop(0, "rgba(255,213,173,0)");
    ray.addColorStop(0.45, "rgba(255,236,209,.70)");
    ray.addColorStop(1, "rgba(255,213,173,0)");
    ctx.fillStyle = ray;
    ctx.fillRect(-size * 0.48, -1.2, size * 0.96, 2.4);
    ctx.fillRect(-1.2, -size * 0.48, 2.4, size * 0.96);
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }

  const SELECT_COLOR = new THREE.Color(0xff7c44);

  function hash01(value) {
    const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function starSeed(star) {
    const number = Number(star.number) || 0;
    const angle = Number(star.angle) || 0;
    const phase = Number(star.phase) || 0;
    const layerBias = star.layer === "middle" ? 7.1 : star.layer === "outer" ? 13.7 : 3.3;
    return number * 1.317 + angle * 0.071 + phase * 2.417 + layerBias;
  }

  function createStarUniforms(options = {}) {
    return {
      uTime: { value: 0 },
      uPointScale: { value: initialCanvas.height * 1.08 },
      uDpr: { value: renderer.getPixelRatio() },
      uHasSelection: { value: 0 },
      uSelectedIndex: { value: -1 },
      uSelectColor: { value: SELECT_COLOR.clone() },
      uCameraDistance: { value: 16 },
      uDepthStrength: { value: options.depthStrength ?? 1 },
      uHaloOnly: { value: options.haloOnly ? 1 : 0 }
    };
  }

  const starMaterial = new THREE.ShaderMaterial({
    uniforms: createStarUniforms(),
    vertexShader: `
      attribute float aSize;
      attribute float aBrightness;
      attribute vec3 aColor;
      attribute float aPhase;
      attribute float aIndex;
      attribute float aHalo;
      attribute float aGlow;
      attribute float aCore;
      attribute float aCross;
      attribute float aTwinkle;
      uniform float uPointScale;
      uniform float uDpr;
      uniform float uHasSelection;
      uniform float uSelectedIndex;
      uniform vec3 uSelectColor;
      uniform float uCameraDistance;
      uniform float uDepthStrength;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vPhase;
      varying float vSelected;
      varying float vHalo;
      varying float vGlow;
      varying float vCore;
      varying float vCross;
      varying float vTwinkle;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float distance = max(1.0, -mv.z);
        float selected = uHasSelection * step(abs(aIndex - uSelectedIndex), 0.5);
        float pointScale = 1.0 + selected * 0.32 + (aHalo - 0.9) * 0.08;
        gl_PointSize = clamp(aSize * uPointScale * uDpr * pointScale / distance, 1.2, 42.0 * uDpr);
        float depthNorm = clamp(0.5 + (uCameraDistance - distance) * 0.18, 0.15, 0.85);
        float depthFade = mix(1.0, 0.82 + depthNorm * 0.24, uDepthStrength);
        vColor = mix(aColor, uSelectColor, selected * 0.58);
        float baseAlpha = aBrightness * mix(1.0, 0.30, uHasSelection);
        float selectedAlpha = max(1.15, min(2.2, aBrightness * 1.40));
        vAlpha = mix(baseAlpha, selectedAlpha, selected) * depthFade;
        vPhase = aPhase;
        vSelected = selected;
        vHalo = aHalo;
        vGlow = aGlow;
        vCore = aCore;
        vCross = aCross;
        vTwinkle = aTwinkle;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uHaloOnly;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vPhase;
      varying float vSelected;
      varying float vHalo;
      varying float vGlow;
      varying float vCore;
      varying float vCross;
      varying float vTwinkle;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p) * 2.0;
        float coreR = mix(0.16, 0.32, clamp(vCore, 0.0, 1.3));
        float core = 1.0 - smoothstep(0.0, coreR, d);
        float inner = 1.0 - smoothstep(0.0, 0.48, d);
        float haloR = mix(0.58, 1.0, clamp(vHalo, 0.0, 1.5));
        float halo = 1.0 - smoothstep(0.0, haloR, d);
        float glow = pow(max(0.0, 1.0 - d), 2.4) * vGlow;
        float cross = 0.0;
        if (uHaloOnly < 0.5 && vCross > 0.001) {
          float horizontal = exp(-abs(p.y) * 58.0) * exp(-abs(p.x) * 4.2);
          float vertical = exp(-abs(p.x) * 58.0) * exp(-abs(p.y) * 4.2);
          cross = (horizontal + vertical) * vCross;
        }
        if (uHaloOnly > 0.5) {
          core = 0.0;
          inner = 0.0;
          cross = 0.0;
          glow *= 0.65;
        }
        float coreWeight = mix(0.80, 1.20, clamp(vCore, 0.0, 1.3));
        float innerWeight = mix(0.12, 0.24, clamp(vHalo, 0.0, 1.2));
        float haloWeight = mix(0.14, 0.38, clamp(vHalo, 0.0, 1.5));
        float glowWeight = mix(0.06, 0.20, clamp(vGlow, 0.0, 1.5));
        float twinkle = 1.0 + vTwinkle * sin(uTime * 0.55 + vPhase * 1.7);
        float alpha = (core * coreWeight + inner * innerWeight + halo * haloWeight + glow * glowWeight + cross * 0.55) * vAlpha * twinkle;
        alpha *= 1.0 + vSelected * 0.18;
        if (!(alpha >= 0.012)) discard;
        float coreWhite = mix(0.24, 0.65, clamp(vCore, 0.0, 1.2));
        vec3 coreColor = mix(vColor, vec3(1.0), coreWhite);
        vec3 crossColor = mix(vColor, vec3(1.0, 0.78, 0.55), 0.45);
        vec3 color = coreColor * (core * mix(0.82, 1.18, clamp(vCore, 0.0, 1.3))) + vColor * (inner * 0.36 + halo * 0.28 + glow * 0.20) + crossColor * cross * 0.60;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true
  });

  function buildDataPoints() {
    const positions = new Float32Array(stars.length * 3);
    const colors = new Float32Array(stars.length * 3);
    const sizes = new Float32Array(stars.length);
    const brightness = new Float32Array(stars.length);
    const phases = new Float32Array(stars.length);
    const indices = new Float32Array(stars.length);
    const halos = new Float32Array(stars.length);
    const glows = new Float32Array(stars.length);
    const cores = new Float32Array(stars.length);
    const crosses = new Float32Array(stars.length);
    const twinkles = new Float32Array(stars.length);
    stars.forEach((star, i) => {
      positions[i * 3] = star.x;
      positions[i * 3 + 1] = star.y;
      positions[i * 3 + 2] = star.z;

      const seed = starSeed(star);
      const qSize = hash01(seed + 1.71);
      const qBright = hash01(seed + 3.37);
      const qColor = hash01(seed + 5.19);
      const qHalo = hash01(seed + 7.03);
      const qGlow = hash01(seed + 8.41);
      const qCore = hash01(seed + 9.83);
      const qCross = hash01(seed + 11.27);
      const qTwinkle = hash01(seed + 13.61);

      let sizeMul;
      if (qSize < 0.48) {
        sizeMul = 0.66 + 0.26 * (qSize / 0.48);
      } else if (qSize < 0.93) {
        sizeMul = 0.96 + 0.42 * ((qSize - 0.48) / 0.45);
      } else if (qSize < 0.992) {
        sizeMul = 1.46 + 0.60 * ((qSize - 0.93) / 0.062);
      } else {
        sizeMul = 2.18 + 0.55 * ((qSize - 0.992) / 0.008);
      }
      if (star.anchor) sizeMul *= 1.12;

      let brightMul;
      if (qBright < 0.30) {
        brightMul = 0.40 + 0.28 * (qBright / 0.30);
      } else if (qBright < 0.94) {
        brightMul = 0.74 + 0.46 * ((qBright - 0.30) / 0.64);
      } else if (qBright < 0.988) {
        brightMul = 1.25 + 0.38 * ((qBright - 0.94) / 0.048);
      } else {
        brightMul = 1.70 + 0.28 * ((qBright - 0.988) / 0.012);
      }

      const sizeNorm = THREE.MathUtils.clamp((sizeMul - 0.66) / 2.07, 0, 1);
      const brightNorm = THREE.MathUtils.clamp((brightMul - 0.40) / 1.58, 0, 1);
      const prominence = Math.min(1, sizeNorm * 0.60 + brightNorm * 0.40 + (star.anchor ? 0.12 : 0));

      const color = new THREE.Color(star.color);
      if (qColor < 0.16) {
        color.lerp(new THREE.Color(0xfff8ef), 0.30);
      } else if (qColor < 0.34) {
        color.lerp(new THREE.Color(0xffd5a8), 0.20);
      } else if (qColor > 0.86) {
        color.lerp(new THREE.Color(0xff8a4e), 0.20);
      }
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      sizes[i] = star.size * sizeMul;
      brightness[i] = Math.min(1.85, star.brightness * brightMul);
      phases[i] = star.phase;
      indices[i] = i;
      halos[i] = 0.22 + prominence * 1.18 + qHalo * 0.10;
      glows[i] = 0.10 + brightNorm * 1.25 + qGlow * 0.08;
      cores[i] = 0.45 + prominence * 0.80 + qCore * 0.08;

      const crossCandidate = star.anchor || (prominence > 0.78 && qCross > 0.55);
      crosses[i] = crossCandidate ? 0.05 + qCross * 0.12 : 0;
      twinkles[i] = qTwinkle < 0.12 ? 0.012 + qTwinkle * 0.024 : 0;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aBrightness", new THREE.BufferAttribute(brightness, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aIndex", new THREE.BufferAttribute(indices, 1));
    geometry.setAttribute("aHalo", new THREE.BufferAttribute(halos, 1));
    geometry.setAttribute("aGlow", new THREE.BufferAttribute(glows, 1));
    geometry.setAttribute("aCore", new THREE.BufferAttribute(cores, 1));
    geometry.setAttribute("aCross", new THREE.BufferAttribute(crosses, 1));
    geometry.setAttribute("aTwinkle", new THREE.BufferAttribute(twinkles, 1));
    const points = new THREE.Points(geometry, starMaterial);
    points.frustumCulled = false;
    points.renderOrder = 3;
    points.userData.kind = "supporters";
    scene.add(points);
    return points;
  }

  const dataPoints = buildDataPoints();
  // Pointer events cover mouse, pen and touch; two active pointers invoke pinch zoom.

  function buildDataHalos() {
    const geometry = dataPoints.geometry.clone();
    const sizes = geometry.getAttribute("aSize");
    const brightness = geometry.getAttribute("aBrightness");
    const haloValues = geometry.getAttribute("aHalo");
    const haloSize = new Float32Array(sizes.count);
    const haloBright = new Float32Array(sizes.count);
    for (let i = 0; i < sizes.count; i++) {
      haloSize[i] = sizes.getX(i) * (1.5 + haloValues.getX(i) * 1.15);
      haloBright[i] = brightness.getX(i) * 0.085;
    }
    geometry.setAttribute("aSize", new THREE.BufferAttribute(haloSize, 1));
    geometry.setAttribute("aBrightness", new THREE.BufferAttribute(haloBright, 1));
    const material = starMaterial.clone();
    material.uniforms = createStarUniforms({ haloOnly: true, depthStrength: 0.8 });
    const halos = new THREE.Points(geometry, material);
    halos.frustumCulled = false;
    halos.renderOrder = 2;
    scene.add(halos);
    return halos;
  }

  const dataHalos = buildDataHalos();

  function makePointCloud(count, options) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const brightness = new Float32Array(count);
    const phases = new Float32Array(count);
    const indices = new Float32Array(count);
    const halos = new Float32Array(count);
    const glows = new Float32Array(count);
    const cores = new Float32Array(count);
    const crosses = new Float32Array(count);
    const twinkles = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const p = options.position(i);
      positions[i * 3] = p[0];
      positions[i * 3 + 1] = p[1];
      positions[i * 3 + 2] = p[2];
      const color = new THREE.Color(options.color(i));
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      sizes[i] = options.size(i);
      brightness[i] = options.brightness(i);
      phases[i] = Math.random() * Math.PI * 2;
      indices[i] = -1;
      halos[i] = 0.28 + Math.random() * 0.42;
      glows[i] = 0.12 + Math.random() * 0.32;
      cores[i] = 0.48 + Math.random() * 0.20;
      crosses[i] = 0;
      twinkles[i] = 0;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aBrightness", new THREE.BufferAttribute(brightness, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aIndex", new THREE.BufferAttribute(indices, 1));
    geometry.setAttribute("aHalo", new THREE.BufferAttribute(halos, 1));
    geometry.setAttribute("aGlow", new THREE.BufferAttribute(glows, 1));
    geometry.setAttribute("aCore", new THREE.BufferAttribute(cores, 1));
    geometry.setAttribute("aCross", new THREE.BufferAttribute(crosses, 1));
    geometry.setAttribute("aTwinkle", new THREE.BufferAttribute(twinkles, 1));
    const material = starMaterial.clone();
    material.uniforms = createStarUniforms({ depthStrength: options.depthStrength ?? 0.45 });
    material.blending = THREE.AdditiveBlending;
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = options.renderOrder || 0;
    scene.add(points);
    return points;
  }

  const backgroundStars = makePointCloud(1750, {
    position: () => {
      const radius = 22 + Math.random() * 42;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
      return [
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi)
      ];
    },
    color: () => (Math.random() < 0.23 ? "#FFD2A9" : "#F4EEE7"),
    size: () => 0.009 + Math.random() * 0.030,
    brightness: () => 0.10 + Math.random() * 0.30,
    depthStrength: 0.22,
    renderOrder: 0
  });

  const dust = makePointCloud(1800, {
    position: () => {
      const angle = Math.random() * Math.PI * 2;
      const radius = 3.6 + Math.random() * 4.2;
      return [
        radius * Math.cos(angle) * THREE.MathUtils.randFloat(0.88, 1.08),
        radius * Math.sin(angle) * THREE.MathUtils.randFloat(0.88, 1.08),
        THREE.MathUtils.randFloatSpread(4.2)
      ];
    },
    color: () => (Math.random() < 0.64 ? "#FFB17A" : "#FFE4C9"),
    size: () => 0.008 + Math.random() * 0.030,
    brightness: () => 0.08 + Math.random() * 0.22,
    depthStrength: 0.55,
    renderOrder: 1
  });

  const ringDust = makePointCloud(2600, {
    position: () => {
      const angle = Math.random() * Math.PI * 2;
      const radius = 4.0 + Math.random() * 1.85;
      return [
        radius * Math.cos(angle),
        radius * Math.sin(angle),
        THREE.MathUtils.randFloatSpread(2.4)
      ];
    },
    color: () => (Math.random() < 0.72 ? "#FFB17A" : "#FFE4C9"),
    size: () => 0.009 + Math.random() * 0.032,
    brightness: () => 0.09 + Math.random() * 0.24,
    depthStrength: 0.55,
    renderOrder: 1
  });

  const starGlowTexture = makeGlowTexture(256, [
    [0, "rgba(255,246,232,1)"],
    [0.14, "rgba(255,218,177,.85)"],
    [0.48, "rgba(255,138,76,.13)"],
    [1, "rgba(255,122,51,0)"]
  ]);
  const ringGlowTexture = makeRingTexture(512);
  const sparkTexture = makeSparkTexture(256);
  const flareTexture = makeFlareTexture(256);

  function addAtmosphere() {
    for (const [radius, opacity] of [[4.8, 0.10], [5.9, 0.045]]) {
      const points = [];
      for (let i = 0; i < 180; i++) {
        const angle = (i / 180) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
      }
      const ring = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: 0xffb36f,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false
        })
      );
      ring.renderOrder = 0;
      scene.add(ring);
    }

    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({
      map: starGlowTexture,
      color: 0xff8a4c,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false
    }));
    cloud.position.set(0, 0, -1.6);
    cloud.scale.set(28, 28, 1);
    cloud.renderOrder = -5;
    scene.add(cloud);

    const ringHaze = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ringGlowTexture,
      color: 0xff8a4c,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false
    }));
    ringHaze.position.set(0, 0, -2.2);
    ringHaze.scale.set(18.4, 18.4, 1);
    ringHaze.renderOrder = -3;
    scene.add(ringHaze);

    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: starGlowTexture,
      color: 0xffb36f,
      transparent: true,
      opacity: 0.07,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false
    }));
    core.position.set(0.6, -0.4, -5.2);
    core.scale.set(17, 17, 1);
    core.renderOrder = -4;
    scene.add(core);

    const second = new THREE.Sprite(new THREE.SpriteMaterial({
      map: starGlowTexture,
      color: 0xff7a33,
      transparent: true,
      opacity: 0.065,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false
    }));
    second.position.set(-3.2, 2.4, -7.5);
    second.scale.set(15, 15, 1);
    second.renderOrder = -6;
    scene.add(second);
  }

  function addCenterMark() {
    const centerGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ringGlowTexture,
      color: 0xff9a5c,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false
    }));
    centerGlow.scale.set(4.4, 4.4, 1);
    centerGlow.renderOrder = 2;
    scene.add(centerGlow);
    centerMarkObjects.push(centerGlow);

    const centerHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: starGlowTexture,
      color: 0xff7c44,
      transparent: true,
      opacity: 0.20,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false
    }));
    centerHalo.scale.set(2.8, 2.8, 1);
    centerHalo.renderOrder = 8;
    scene.add(centerHalo);
    centerMarkObjects.push(centerHalo);

    const points = [];
    for (let i = 0; i < 96; i++) {
      const angle = (i / 96) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * 1.28, Math.sin(angle) * 1.28, 0));
    }
    const ringGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const ring = new THREE.LineLoop(ringGeometry, new THREE.LineBasicMaterial({
      color: 0xff7c44,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    }));
    ring.renderOrder = 4;
    scene.add(ring);
    centerMarkObjects.push(ring);
  }

  function addFlares() {
    const material = new THREE.SpriteMaterial({
      map: flareTexture,
      color: 0xffe0bf,
      transparent: true,
      opacity: 0.43,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false
    });
    const flareStars = stars
      .map((star, index) => ({ star, index }))
      .filter(({ star }) => star.anchor || (star.hero && star.size > 0.35))
      .sort((a, b) => b.star.size - a.star.size)
      .slice(0, 10);
    flareStars.forEach(({ star }) => {
      const sprite = new THREE.Sprite(material.clone());
      sprite.position.set(star.x, star.y, star.z);
      const scale = 0.32 + star.size * 2.0;
      sprite.scale.set(scale, scale, 1);
      sprite.material.opacity = star.anchor ? 0.62 : 0.38;
      sprite.renderOrder = 4;
      heroFlares.push({ sprite, baseOpacity: sprite.material.opacity });
      scene.add(sprite);
    });
  }

  function addConstellationLines() {
    const middle = stars
      .map((star, index) => ({ star, index }))
      .filter(item => item.star.layer === "middle");
    const seen = new Set();
    const positions = [];
    middle.forEach((item, i) => {
      if (i % 3 !== 0) return;
      let best = null;
      for (let j = 0; j < middle.length; j++) {
        if (i === j) continue;
        const other = middle[j];
        const d = item.star.x * other.star.x + item.star.y * other.star.y + item.star.z * other.star.z;
        const distance = Math.hypot(item.star.x - other.star.x, item.star.y - other.star.y, item.star.z - other.star.z);
        if (distance < 1.65 && (best === null || distance < best.distance)) best = { other, distance };
      }
      if (!best) return;
      const a = Math.min(item.index, best.other.index);
      const b = Math.max(item.index, best.other.index);
      const key = `${a}:${b}`;
      if (seen.has(key)) return;
      seen.add(key);
      positions.push(item.star.x, item.star.y, item.star.z, best.other.star.x, best.other.star.y, best.other.star.z);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      color: 0xff9a5c,
      transparent: true,
      opacity: 0.10,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    }));
    lines.renderOrder = 1;
    scene.add(lines);
  }

  function addSelectionMarker() {
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ringGlowTexture,
      color: 0xff7c44,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false
    }));
    marker.scale.set(1.15, 1.15, 1);
    marker.visible = false;
    marker.renderOrder = 20;
    scene.add(marker);
    return marker;
  }

  function addSelectionGlow() {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: starGlowTexture,
      color: 0xff7c44,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false
    }));
    glow.scale.set(0.58, 0.58, 1);
    glow.visible = false;
    glow.renderOrder = 19;
    scene.add(glow);
    return glow;
  }

  function addSelectionCore() {
    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: starGlowTexture,
      color: 0xfff4e8,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false
    }));
    core.scale.set(0.24, 0.24, 1);
    core.visible = false;
    core.renderOrder = 21;
    scene.add(core);
    return core;
  }

  addAtmosphere();
  addCenterMark();
  addFlares();
  addConstellationLines();
  selectedMarker = addSelectionMarker();
  selectedGlow = addSelectionGlow();
  selectedCore = addSelectionCore();

  function applyDiagnosticMode() {
    if (!diagMode) return;
    if (diagMode === "canvas-hidden") {
      canvas.style.visibility = "hidden";
    } else if (diagMode === "none") {
      scene.visible = false;
    } else {
      scene.traverse(object => {
        if (diagMode === "points") {
          if (object.isSprite || object.isLine || object.isLineSegments) object.visible = false;
        } else if (diagMode === "sprites") {
          if (!object.isSprite) object.visible = false;
        } else if (diagMode === "lines") {
          if (!(object.isLine || object.isLineSegments)) object.visible = false;
        } else if (diagMode === "no-points") {
          if (object.isPoints) object.visible = false;
        } else if (diagMode === "no-sprites") {
          if (object.isSprite) object.visible = false;
        } else if (diagMode === "no-lines") {
          if (object.isLine || object.isLineSegments) object.visible = false;
        }
      });
    }
    const badge = document.createElement("div");
    badge.textContent = `DIAG ${diagMode}`;
    badge.style.cssText = "position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:99999;padding:4px 8px;border:1px solid #FF7C44;background:rgba(8,8,8,.9);color:#FF7C44;font:10px monospace;letter-spacing:.08em;pointer-events:none;";
    document.body.appendChild(badge);
  }
  applyDiagnosticMode();

  function updateSelectionFocus() {
    const active = selectedIndex >= 0;
    const index = active ? selectedIndex : -1;
    for (const material of [starMaterial, dataHalos.material, backgroundStars.material, dust.material, ringDust.material]) {
      material.uniforms.uHasSelection.value = active ? 1 : 0;
      material.uniforms.uSelectedIndex.value = index;
    }
    for (const flare of heroFlares) {
      flare.sprite.material.opacity = flare.baseOpacity * (active ? 0.34 : 1);
    }
  }

  function syncViewport(force = false) {
    const metrics = getCanvasMetrics();
    const dpr = getRenderPixelRatio();
    const changed = force
      || metrics.width !== lastViewport.width
      || metrics.height !== lastViewport.height
      || dpr !== lastViewport.dpr
      || metrics.left !== lastViewport.left
      || metrics.top !== lastViewport.top;
    if (!changed) {
      updateSelectedLabel();
      return false;
    }

    const oldFit = fitDistance;
    lastViewport = { ...metrics, dpr };
    renderer.setPixelRatio(dpr);
    renderer.setSize(metrics.width, metrics.height, false);
    camera.aspect = metrics.width / metrics.height;
    camera.updateProjectionMatrix();
    updateViewAfterResize(oldFit, metrics);
    starMaterial.uniforms.uDpr.value = renderer.getPixelRatio();
    starMaterial.uniforms.uPointScale.value = metrics.height * 1.08;
    dataHalos.material.uniforms.uDpr.value = renderer.getPixelRatio();
    dataHalos.material.uniforms.uPointScale.value = metrics.height * 1.08;
    backgroundStars.material.uniforms.uDpr.value = renderer.getPixelRatio();
    backgroundStars.material.uniforms.uPointScale.value = metrics.height * 1.08;
    dust.material.uniforms.uDpr.value = renderer.getPixelRatio();
    dust.material.uniforms.uPointScale.value = metrics.height * 1.08;
    ringDust.material.uniforms.uDpr.value = renderer.getPixelRatio();
    ringDust.material.uniforms.uPointScale.value = metrics.height * 1.08;
    updateSelectedLabel();
    updateCenterBrand();
    updateLabels(true);
    return true;
  }

  function queueViewportSync() {
    if (viewportSyncQueued) return;
    viewportSyncQueued = true;
    requestAnimationFrame(() => {
      viewportSyncQueued = false;
      syncViewport(true);
    });
  }

  function applyCamera(dt) {
    const k = 1 - Math.exp(-dt * 10.5);
    controls.current.theta += (controls.wanted.theta - controls.current.theta) * k;
    controls.current.phi += (controls.wanted.phi - controls.current.phi) * k;
    controls.current.radius += (controls.wanted.radius - controls.current.radius) * k;
    controls.current.target.lerp(controls.wanted.target, k);
    const { radius, theta, phi, target } = controls.current;
    const cosPhi = Math.cos(phi);
    camera.position.set(
      target.x + radius * cosPhi * Math.sin(theta),
      target.y + radius * Math.sin(phi),
      target.z + radius * cosPhi * Math.cos(theta)
    );
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  function updateSelectionMarker(time) {
    if (!selectedMarker) return;
    if (selectedIndex < 0) {
      selectedMarker.visible = false;
      if (selectedGlow) selectedGlow.visible = false;
      if (selectedCore) selectedCore.visible = false;
      return;
    }
    const star = stars[selectedIndex];
    const pulse = 0.94 + Math.sin(time * 2.4) * 0.04;
    selectedMarker.visible = true;
    selectedMarker.position.set(star.x, star.y, star.z);
    const base = 0.52;
    selectedMarker.scale.set(base * pulse, base * pulse, 1);
    if (selectedGlow) {
      selectedGlow.visible = true;
      selectedGlow.position.set(star.x, star.y, star.z);
      const glowScale = 0.54 + Math.sin(time * 1.8) * 0.035;
      selectedGlow.scale.set(glowScale, glowScale, 1);
    }
    if (selectedCore) {
      selectedCore.visible = true;
      selectedCore.position.set(star.x, star.y, star.z);
      const coreScale = 0.23 + Math.sin(time * 2.8) * 0.015;
      selectedCore.scale.set(coreScale, coreScale, 1);
    }
  }

  function projectPoint(x, y, z) {
    tempVector.set(x, y, z).project(camera);
    if (tempVector.z < -1 || tempVector.z > 1) return null;
    const metrics = getCanvasMetrics();
    const sx = metrics.left + (tempVector.x * 0.5 + 0.5) * metrics.width;
    const sy = metrics.top + (-tempVector.y * 0.5 + 0.5) * metrics.height;
    return { x: sx, y: sy, z: tempVector.z };
  }

  function updateCenterBrand() {
    if (!centerBrand) return;
    if (selectedIndex >= 0) {
      centerBrand.hidden = true;
      centerBrand.classList.remove("visible");
      return;
    }
    centerBrand.hidden = false;
    const p = projectPoint(0, 0, 0);
    const distance = camera.position.distanceTo(controls.current.target);
    if (!p || distance < fitDistance * 0.56) {
      centerBrand.classList.remove("visible");
      return;
    }
    centerBrand.style.left = `${p.x}px`;
    centerBrand.style.top = `${p.y - 16}px`;
    centerBrand.classList.add("visible");
    centerBrand.style.opacity = String(0.30 + Math.min(0.52, distance / 70));
  }

  function updateSelectedLabel() {
    if (!selectedLabel) return;
    if (selectedIndex < 0) {
      selectedLabel.hidden = true;
      return;
    }
    const star = stars[selectedIndex];
    const p = projectPoint(star.x, star.y, star.z);
    if (!p) {
      selectedLabel.hidden = true;
      return;
    }
    selectedLabel.hidden = false;
    selectedNumber.textContent = `#${star.number}`;
    selectedName.textContent = star.name;
    selectedMeta.textContent = `${star.id}  / ${star.layer.toUpperCase()}  / ${star.sector}`;

    const ui = getUiViewport();
    const margin = 14;
    const halfWidth = selectedLabel.offsetWidth ? selectedLabel.offsetWidth / 2 : 90;
    const labelHeight = selectedLabel.offsetHeight || 78;
    const minLeft = ui.left + halfWidth + margin;
    const maxLeft = ui.left + ui.width - halfWidth - margin;
    const left = maxLeft >= minLeft
      ? THREE.MathUtils.clamp(p.x, minLeft, maxLeft)
      : ui.left + ui.width / 2;

    const safeTop = ui.top + (isMobileViewport() ? 92 : 76);
    const safeBottom = ui.top + ui.height - 14;
    const aboveSpace = p.y - 18 - labelHeight >= safeTop;
    let top = aboveSpace ? p.y - 18 : p.y + 26 + labelHeight;
    top = THREE.MathUtils.clamp(top, safeTop + labelHeight, safeBottom);

    selectedLabel.style.left = `${left}px`;
    selectedLabel.style.top = `${top}px`;
    selectedLabel.classList.toggle("below", !aboveSpace);
  }

  function labelPoolElement(index) {
    if (labelPool[index]) return labelPool[index];
    const el = document.createElement("div");
    el.className = "star-tag";
    const number = document.createElement("span");
    number.className = "tag-number";
    const name = document.createElement("span");
    name.className = "tag-name";
    el.append(number, name);
    labelLayer.appendChild(el);
    labelPool[index] = el;
    return el;
  }

  function updateLabels(force = false) {
    if (!labelLayer) return;
    const distance = camera.position.distanceTo(controls.current.target);
    const show = distance < fitDistance * 0.70 || selectedIndex >= 0;
    if (!show) {
      for (const el of labelPool) el.classList.remove("visible");
      return;
    }
    const metrics = getCanvasMetrics();
    const ui = getUiViewport();
    const width = metrics.width;
    const height = metrics.height;
    const leftBound = metrics.left;
    const topBound = metrics.top;
    const rightBound = metrics.left + metrics.width;
    const bottomBound = metrics.top + metrics.height;
    const centerX = leftBound + width / 2;
    const centerY = topBound + height / 2;
    const candidates = [];
    const selected = selectedIndex >= 0 ? stars[selectedIndex] : null;
    for (let i = 0; i < stars.length; i++) {
      if (i === selectedIndex) continue;
      const star = stars[i];
      const p = projectPoint(star.x, star.y, star.z);
      if (!p) continue;
      if (p.x < leftBound - 20 || p.x > rightBound + 20 || p.y < topBound - 20 || p.y > bottomBound + 20) continue;
      const dx = p.x - centerX;
      const dy = p.y - centerY;
      const score = dx * dx + dy * dy;
      if (Math.hypot(dx, dy) < Math.min(width, height) * 0.52) {
        candidates.push({ star, p, score });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    const placed = [];
    if (selected && !selectedLabel.hidden) {
      const r = selectedLabel.getBoundingClientRect();
      placed.push({ x: r.left - 8, y: r.top - 8, w: r.width + 16, h: r.height + 16 });
    }
    let used = 0;
    const budget = selected ? 5 : 12;
    for (const candidate of candidates) {
      if (used >= budget) break;
      const star = candidate.star;
      const numberText = `#${star.number}`;
      const nameText = star.name;
      const w = Math.max(58, Math.max(numberText.length * 6.2, nameText.length * 4.2) + 12);
      const h = 24;
      const offsets = [
        [9, -26], [9, 9], [-w - 9, -26], [-w - 9, 9],
        [9, -46], [-w - 9, -46], [16, -10], [-w - 16, -10]
      ];
      let choice = null;
      for (const [ox, oy] of offsets) {
        const x = candidate.p.x + ox;
        const y = candidate.p.y + oy;
        if (x < leftBound + 4 || y < topBound + 4 || x + w > rightBound - 4 || y + h > bottomBound - 4) continue;
        let hit = false;
        for (const box of placed) {
          if (!(x + w + 5 <= box.x || x >= box.x + box.w + 5 || y + h + 4 <= box.y || y >= box.y + box.h + 4)) {
            hit = true; break;
          }
        }
        if (!hit) { choice = [x, y]; break; }
      }
      if (!choice) continue;
      placed.push({ x: choice[0], y: choice[1], w, h });
      const el = labelPoolElement(used);
      el.classList.add("visible");
      el.style.transform = `translate3d(${choice[0]}px, ${choice[1]}px, 0)`;
      const num = el.firstChild;
      const name = el.lastChild;
      if (num.textContent !== numberText) num.textContent = numberText;
      if (name.textContent !== nameText) name.textContent = nameText;
      el.classList.toggle("selected", false);
      used += 1;
    }
    for (let i = used; i < labelPool.length; i++) labelPool[i].classList.remove("visible");
  }

  function resetGestureState() {
    activePointers.clear();
    pinch = null;
    pointerDown = null;
    movedDistance = 0;
    gestureHadMultiplePointers = false;
    gestureWasPan = false;
    canvas.classList.remove("dragging");
  }

  function closeSearchUI() {
    searchResults.hidden = true;
    activeSearchIndex = -1;
    currentResults = [];
    searchInput.blur();
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }
    if (window.scrollX !== 0 || window.scrollY !== 0) {
      window.scrollTo(0, 0);
    }
  }

  function waitForViewportSettle(maxWait = 320) {
    return new Promise(resolve => {
      let done = false;
      const vv = window.visualViewport;
      const finish = () => {
        if (done) return;
        done = true;
        if (vv) vv.removeEventListener("resize", onViewportResize);
        clearTimeout(timeout);
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      };
      const onViewportResize = () => setTimeout(finish, 60);
      if (vv) vv.addEventListener("resize", onViewportResize, { once: true });
      const timeout = setTimeout(finish, maxWait);
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(finish, 80)));
    });
  }

  function applySelection(index) {
    const star = stars[index];
    selectedIndex = index;
    searchInput.value = `#${star.number}`;
    searchResults.hidden = true;
    searchClear.style.visibility = "visible";
    updateSelectedLabel();
    updateLabels(true);
    updateSelectionFocus();
  }

  function focusSelectedStar(options = {}) {
    if (selectedIndex < 0) return;
    const star = stars[selectedIndex];
    const focusRadius = THREE.MathUtils.clamp(
      fitDistance * 0.25,
      4.0,
      isMobileViewport() ? 7.2 : 6.4
    );
    const focusTarget = new THREE.Vector3(star.x, star.y, star.z);
    const alreadyFramed = options.force !== true
      && controls.wanted.target.distanceToSquared(focusTarget) < 0.0025
      && Math.abs(controls.wanted.radius - focusRadius) < 0.08;
    if (alreadyFramed && !options.preserveRadius) return;

    controls.wanted.target.copy(focusTarget);
    if (!options.preserveRadius) {
      controls.wanted.radius = focusRadius;
    }
    controls.wanted.radius = THREE.MathUtils.clamp(controls.wanted.radius, MIN_ZOOM_RADIUS, maxZoomRadius);
    controls.wanted.theta = controls.current.theta;
    controls.wanted.phi = THREE.MathUtils.clamp(controls.current.phi, 0.18, 0.78);
    lastInteraction = performance.now();
    updateSelectedLabel();
    updateLabels(true);
  }

  function clearSelection() {
    selectedIndex = -1;
    selectedLabel.hidden = true;
    selectedLabel.classList.remove("below");
    if (selectedMarker) selectedMarker.visible = false;
    if (selectedGlow) selectedGlow.visible = false;
    if (selectedCore) selectedCore.visible = false;
    for (const el of labelPool) el.classList.remove("visible");
    searchInput.value = "";
    searchInput.blur();
    searchResults.hidden = true;
    searchClear.style.visibility = "hidden";
    activeSearchIndex = -1;
    updateSelectionFocus();
  }

  function selectStar(index, fly = true) {
    if (index < 0 || index >= stars.length) return;
    const wasSelected = index === selectedIndex;
    applySelection(index);
    if (fly) {
      focusSelectedStar({ force: !wasSelected });
    }
    updateSelectedLabel();
    updateLabels(true);
    updateSelectionFocus();
  }

  let searchSelectionPending = false;

  async function selectFromSearch(index) {
    if (searchSelectionPending) return;
    searchSelectionPending = true;
    try {
      closeSearchUI();
      resetGestureState();
      await waitForViewportSettle();
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
      syncViewport(true);
      applySelection(index);
      focusSelectedStar({ force: true });
      resetGestureState();
      window.setTimeout(() => {
        if (selectedIndex !== index) return;
        if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
        syncViewport(true);
        focusSelectedStar({ force: true });
        updateSelectedLabel();
      }, 420);
    } finally {
      searchSelectionPending = false;
    }
  }

  function resetView() {
    closeSearchUI();
    resetGestureState();
    clearSelection();
    syncViewport(true);
    controls.wanted.target.set(0, 0, 0);
    controls.wanted.radius = fitDistance;
    controls.wanted.theta = DEFAULT_THETA;
    controls.wanted.phi = DEFAULT_PHI;
    lastInteraction = performance.now();
    updateSelectedLabel();
    updateCenterBrand();
    updateLabels(true);
  }

  function zoomBy(factor) {
    controls.wanted.radius = THREE.MathUtils.clamp(
      controls.wanted.radius * factor,
      MIN_ZOOM_RADIUS,
      maxZoomRadius
    );
  }

  function panBy(dx, dy) {
    const scale = controls.wanted.radius * 0.00145;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    controls.wanted.target.addScaledVector(right, -dx * scale);
    controls.wanted.target.addScaledVector(up, dy * scale);
    clampPanTarget(controls.wanted.target);
  }

  function setPointer(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pickAt(event) {
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    raycaster.params.Points.threshold = Math.max(0.12, (camera.position.distanceTo(controls.current.target) / fitDistance) * 0.34);
    const hits = raycaster.intersectObject(dataPoints, false);
    if (!hits.length) return -1;
    return hits[0].index;
  }

  function onPointerDown(event) {
    if (event.target !== canvas) return;
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic or already-released pointers do not need capture.
    }
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.size === 1) {
      movedDistance = 0;
      gestureHadMultiplePointers = false;
      gestureWasPan = false;
      pointerDown = {
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
        shift: event.shiftKey,
        button: event.button
      };
      canvas.classList.add("dragging");
      pinch = null;
    } else {
      gestureHadMultiplePointers = true;
      if (activePointers.size === 2) {
        const pts = [...activePointers.values()];
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        pinch = {
          distance: Math.max(1, Math.hypot(dx, dy)),
          radius: controls.wanted.radius,
          midX: (pts[0].x + pts[1].x) / 2,
          midY: (pts[0].y + pts[1].y) / 2,
          target: controls.wanted.target.clone()
        };
      }
    }
    lastInteraction = performance.now();
  }

  function onPointerMove(event) {
    if (!activePointers.has(event.pointerId)) return;
    const previous = activePointers.get(event.pointerId);
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    movedDistance += Math.hypot(dx, dy);
    if (activePointers.size === 1) {
      if (pointerDown && (event.shiftKey || pointerDown.button === 2 || pointerDown.button === 1)) {
        gestureWasPan = true;
        panBy(dx, dy);
      } else {
        controls.wanted.theta -= dx * 0.0052;
        controls.wanted.phi = THREE.MathUtils.clamp(controls.wanted.phi - dy * 0.0048, -1.12, 1.12);
      }
    } else if (activePointers.size === 2 && pinch) {
      const pts = [...activePointers.values()];
      const distance = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      controls.wanted.radius = THREE.MathUtils.clamp(
        pinch.radius * (pinch.distance / distance),
        MIN_ZOOM_RADIUS,
        maxZoomRadius
      );
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      panBy(midX - pinch.midX, midY - pinch.midY);
      pinch.midX = midX;
      pinch.midY = midY;
    }
    lastInteraction = performance.now();
    updateSelectedLabel();
    updateLabels();
  }

  function onPointerUp(event) {
    const had = activePointers.delete(event.pointerId);
    if (!had) return;
    if (activePointers.size < 2) pinch = null;
    if (activePointers.size === 0) {
      canvas.classList.remove("dragging");
      const isClick = pointerDown
        && !gestureHadMultiplePointers
        && !gestureWasPan
        && pointerDown.button === 0
        && !pointerDown.shift
        && movedDistance < 5
        && performance.now() - pointerDown.time < 600;
      if (isClick) {
        const index = pickAt(event);
        if (index >= 0) {
          selectStar(index, true);
        } else {
          clearSelection();
        }
      }
      pointerDown = null;
      gestureHadMultiplePointers = false;
      gestureWasPan = false;
      movedDistance = 0;
    }
    lastInteraction = performance.now();
  }

  function onPointerCancel(event) {
    const had = activePointers.delete(event.pointerId);
    if (!had) return;
    if (activePointers.size < 2) pinch = null;
    if (activePointers.size === 0) {
      canvas.classList.remove("dragging");
      pointerDown = null;
      gestureHadMultiplePointers = false;
      gestureWasPan = false;
      movedDistance = 0;
    }
    lastInteraction = performance.now();
  }

  function onWheel(event) {
    event.preventDefault();
    const factor = Math.exp(event.deltaY * 0.00095);
    zoomBy(factor);
    lastInteraction = performance.now();
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      if (!searchResults.hidden) {
        searchResults.hidden = true;
      } else {
        clearSelection();
      }
    }
    if ((event.key === "=" || event.key === "+") && document.activeElement !== searchInput) {
      event.preventDefault();
      zoomBy(0.84);
    }
    if (event.key === "-" && document.activeElement !== searchInput) {
      event.preventDefault();
      zoomBy(1.19);
    }
    if (event.key === "0" && document.activeElement !== searchInput) {
      event.preventDefault();
      resetView();
    }
  }

  let activeSearchIndex = -1;
  let currentResults = [];

  function hideResults() {
    searchResults.hidden = true;
    activeSearchIndex = -1;
  }

  function renderSearch(query) {
    const q = query.trim().toLocaleLowerCase();
    if (!q) {
      currentResults = [];
      hideResults();
      return;
    }
    const normalized = q.replace(/^#/, "");
    const matches = searchable
      .filter(item => item.haystack.includes(normalized))
      .sort((a, b) => {
        const aExact = a.number === normalized ? 0 : 1;
        const bExact = b.number === normalized ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return a.number.localeCompare(b.number, undefined, { numeric: true });
      })
      .slice(0, 7);
    currentResults = matches;
    activeSearchIndex = matches.length ? 0 : -1;
    searchResults.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "search-empty";
      empty.textContent = "NO STAR MATCHES. TRY A BACKER NUMBER OR MASKED NAME.";
      searchResults.appendChild(empty);
      searchResults.hidden = false;
      return;
    }
    matches.forEach((item, i) => {
      const star = stars[item.index];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result" + (i === 0 ? " active" : "");
      button.setAttribute("role", "option");
      const number = document.createElement("span");
      number.className = "result-number";
      number.textContent = `#${star.number}`;
      const body = document.createElement("span");
      const name = document.createElement("span");
      name.className = "result-name";
      name.textContent = star.name;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `${star.layer.toUpperCase()}  / ${star.sector}  / ${star.id}`;
      body.append(name, meta);
      button.append(number, body);
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", () => { void selectFromSearch(item.index); });
      searchResults.appendChild(button);
    });
    searchResults.hidden = false;
  }

  function updateSearchActive() {
    [...searchResults.querySelectorAll(".search-result")].forEach((el, i) => {
      el.classList.toggle("active", i === activeSearchIndex);
    });
  }

  searchInput.addEventListener("input", () => {
    searchClear.style.visibility = searchInput.value ? "visible" : "hidden";
    renderSearch(searchInput.value);
  });
  searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim()) renderSearch(searchInput.value);
  });
  searchInput.addEventListener("keydown", event => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (currentResults.length) {
        activeSearchIndex = (activeSearchIndex + 1) % currentResults.length;
        updateSearchActive();
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (currentResults.length) {
        activeSearchIndex = (activeSearchIndex - 1 + currentResults.length) % currentResults.length;
        updateSearchActive();
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeSearchIndex >= 0 && currentResults[activeSearchIndex]) {
        void selectFromSearch(currentResults[activeSearchIndex].index);
      }
    } else if (event.key === "Escape") {
      hideResults();
      searchInput.blur();
    }
  });
  searchInput.addEventListener("blur", () => {
    window.setTimeout(hideResults, 130);
  });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchClear.style.visibility = "hidden";
    hideResults();
    searchInput.focus();
  });
  searchClear.style.visibility = "hidden";

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", queueViewportSync);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", queueViewportSync);
    window.visualViewport.addEventListener("scroll", queueViewportSync);
  }

  let orientationTimer = null;
  function handleOrientationChange() {
    clearTimeout(orientationTimer);
    orientationTimer = window.setTimeout(() => {
      resetGestureState();
      syncViewport(true);
      if (selectedIndex >= 0) {
        focusSelectedStar({ preserveRadius: true, force: true });
      }
    }, 180);
  }
  window.addEventListener("orientationchange", handleOrientationChange);

  zoomIn.addEventListener("click", () => zoomBy(0.80));
  zoomOut.addEventListener("click", () => zoomBy(1.25));
  resetButton.addEventListener("click", resetView);

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;
    const elapsed = clock.getElapsedTime();
    if (selectedIndex < 0 && !document.hidden && now - lastInteraction > 7000) {
      controls.wanted.theta += dt * 0.006;
    }
    applyCamera(dt);
    const cameraDistance = camera.position.distanceTo(controls.current.target);
    for (const material of [starMaterial, dataHalos.material, backgroundStars.material, dust.material, ringDust.material]) {
      material.uniforms.uCameraDistance.value = cameraDistance;
    }
    starMaterial.uniforms.uTime.value = elapsed;
    dataHalos.material.uniforms.uTime.value = elapsed;
    backgroundStars.material.uniforms.uTime.value = elapsed;
    dust.material.uniforms.uTime.value = elapsed;
    ringDust.material.uniforms.uTime.value = elapsed;
    updateSelectionMarker(elapsed);
    updateSelectedLabel();
    updateCenterBrand();
    const showCenterMark = selectedIndex < 0
      && controls.current.target.lengthSq() < 0.36
      && camera.position.distanceTo(controls.current.target) > fitDistance * 0.55;
    for (const object of centerMarkObjects) object.visible = showCenterMark;
    updateLabels();
    renderer.render(scene, camera);
  }

  window.__SPARK_APP__ = {
    meta: DATA.meta,
    stars,
    scene,
    camera,
    renderer,
    dataPoints,
    dataHalos,
    controls,
    getState: () => ({
      count,
      selected: selectedIndex >= 0 ? stars[selectedIndex].number : null,
      camera: {
        radius: controls.current.radius,
        theta: controls.current.theta,
        phi: controls.current.phi,
        target: controls.current.target.toArray()
      },
      labels: labelPool.filter(el => el.classList.contains("visible")).length,
      marker: selectedMarker ? selectedMarker.visible : false,
      glow: selectedGlow ? selectedGlow.visible : false,
      core: selectedCore ? selectedCore.visible : false,
      centerMark: centerMarkObjects[0] ? centerMarkObjects[0].visible : false
    }),
    getViewportDiagnostics: () => {
      const metrics = getCanvasMetrics();
      const ui = getUiViewport();
      const star = selectedIndex >= 0 ? stars[selectedIndex] : null;
      const projected = star ? projectPoint(star.x, star.y, star.z) : null;
      const labelRect = selectedLabel && !selectedLabel.hidden
        ? selectedLabel.getBoundingClientRect()
        : null;
      return {
        window: { width: window.innerWidth, height: window.innerHeight },
        visualViewport: window.visualViewport ? {
          width: window.visualViewport.width,
          height: window.visualViewport.height,
          offsetLeft: window.visualViewport.offsetLeft,
          offsetTop: window.visualViewport.offsetTop,
          scale: window.visualViewport.scale
        } : null,
        canvas: metrics,
        renderer: {
          cssWidth: renderer.domElement.clientWidth,
          cssHeight: renderer.domElement.clientHeight,
          pixelWidth: renderer.domElement.width,
          pixelHeight: renderer.domElement.height,
          pixelRatio: renderer.getPixelRatio()
        },
        cameraAspect: camera.aspect,
        fitDistance,
        maxZoomRadius,
        selected: star ? star.number : null,
        starWorld: star ? [star.x, star.y, star.z] : null,
        projected,
        label: labelRect ? {
          left: labelRect.left,
          top: labelRect.top,
          right: labelRect.right,
          bottom: labelRect.bottom,
          hidden: selectedLabel.hidden,
          below: selectedLabel.classList.contains("below")
        } : null,
        ui
      };
    },
    forceViewportSync: () => syncViewport(true),
    selectByNumber: number => {
      const index = byNumber.get(String(number));
      if (index !== undefined) selectStar(index, true);
      return index;
    },
    projectStar: index => {
      const star = stars[index];
      if (!star) return null;
      tempVector.set(star.x, star.y, star.z).project(camera);
      if (tempVector.z < -1 || tempVector.z > 1) return null;
      const metrics = getCanvasMetrics();
      return {
        x: metrics.left + (tempVector.x * 0.5 + 0.5) * metrics.width,
        y: metrics.top + (-tempVector.y * 0.5 + 0.5) * metrics.height,
        z: tempVector.z
      };
    },
    reset: resetView,
    setView: (theta, phi, radius) => {
      if (Number.isFinite(theta)) controls.wanted.theta = theta;
      if (Number.isFinite(phi)) controls.wanted.phi = THREE.MathUtils.clamp(phi, -1.12, 1.12);
      if (Number.isFinite(radius)) controls.wanted.radius = THREE.MathUtils.clamp(radius, MIN_ZOOM_RADIUS, maxZoomRadius);
    },
    zoomBy,
    fitDistance: () => fitDistance
  };

  syncViewport(true);
  updateSelectedLabel();
  updateSelectionFocus();
  updateLabels(true);
  requestAnimationFrame(animate);
  requestAnimationFrame(() => {
    loadingEl.classList.add("done");
  });
})();





