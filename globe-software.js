/* A textured sphere that also works when index.html is opened with file://. */
(() => {
  const stage = document.getElementById('globe-stage');
  const mount = document.getElementById('globe-canvas');
  const data = window.TIKPAN_GLOBE_DATA;
  if (!stage || !mount || !data) return;
  const coverageMode = stage.dataset.globeMode === 'coverage';
  const coverageJourney = coverageMode ? stage.closest('.coverage-globe-journey') : null;
  const coverageScene = coverageJourney?.querySelector('.coverage-globe-scene');
  let coverageProgress = 0;
  let coverageScrollAt = -Infinity, coverageScrollY = window.scrollY;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return;
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.zIndex = '1';
  canvas.style.pointerEvents = 'none';
  mount.append(canvas);

  const globeCanvas = document.createElement('canvas');
  const globeContext = globeCanvas.getContext('2d', { alpha: true });
  const sourceCanvas = document.createElement('canvas');
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const PI = Math.PI;
  const RAD = PI / 180;
  const targetLon = 15 * RAD;
  const targetLat = 5 * RAD;
  const locations = [[-.19, 5.56], [36.82, -1.29], [28.05, -26.2], [-17.44, 14.69], [31.24, 30.04]];
  const routes = locations.slice(1).map(destination => {
    const from = vector(...locations[0]);
    const to = vector(...destination);
    return Array.from({ length: 49 }, (_, index) => {
      const t = index / 48;
      const x = from[0] * (1 - t) + to[0] * t;
      const y = from[1] * (1 - t) + to[1] * t;
      const z = from[2] * (1 - t) + to[2] * t;
      const length = Math.hypot(x, y, z);
      return [x / length, y / length, z / length];
    });
  });

  let texture, landMask, glowMask, gpuSphere, width = 1, height = 1, dpr = 1;
  let lon = targetLon, lat = targetLat, scrollLon = lon, scrollLat = lat;
  let scrolling = false, dragging = false, pointerX = 0, pointerY = 0;
  let coverageReturning = false;
  let velocityLon = 0, velocityLat = 0, pointerTime = 0;
  let lastTime = performance.now(), lastPaint = 0, frame = 0, visible = true;
  const geometryCache = new Map();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smooth = (start, end, value) => {
    const t = clamp((value - start) / (end - start), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const progress = () => coverageMode
    ? (reducedMotion.matches ? 1 : coverageProgress)
    : (reducedMotion.matches ? 0 : clamp(window.tikpanHeroProgress || 0, 0, 1));
  function updateCoverageProgress(fromScroll = false) {
    if (!coverageJourney || !coverageScene) return;
    const top = parseFloat(getComputedStyle(coverageScene).top) || 0;
    const bounds = coverageJourney.getBoundingClientRect();
    const travel = coverageJourney.offsetHeight - coverageScene.offsetHeight;
    // Short screens use an ordinary section; orient to Africa as it passes.
    coverageProgress = travel > 1
      ? clamp((top - bounds.top) / travel, 0, 1)
      : clamp((window.innerHeight * .6 - bounds.top) / Math.max(1, bounds.height * .6), 0, 1);
    if (fromScroll && window.scrollY > coverageScrollY && coverageProgress > .55) {
      coverageScrollAt = performance.now();
    }
    coverageScrollY = window.scrollY;
  }

  function vector(longitude, latitude) {
    const longitudeRad = longitude * RAD;
    const latitudeRad = latitude * RAD;
    return [
      Math.sin(longitudeRad) * Math.cos(latitudeRad),
      Math.sin(latitudeRad),
      Math.cos(longitudeRad) * Math.cos(latitudeRad)
    ];
  }

  function paintAfrica() {
    const mapWidth = sourceCanvas.width;
    const mapHeight = sourceCanvas.height;
    const landCanvas = document.createElement('canvas');
    landCanvas.width = mapWidth;
    landCanvas.height = mapHeight;
    const landContext = landCanvas.getContext('2d', { willReadFrequently: true });
    const trace = ring => {
      ring.forEach(([longitude, latitude], index) => {
        const x = (longitude + 180) / 360 * mapWidth;
        const y = (90 - latitude) / 180 * mapHeight;
        if (index === 0) landContext.moveTo(x, y);
        else landContext.lineTo(x, y);
      });
      landContext.closePath();
    };
    for (const feature of data.countries?.features || []) {
      if (feature.properties.CONTINENT !== 'Africa') continue;
      const polygons = feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
      for (const polygon of polygons) {
        landContext.beginPath();
        polygon.forEach(trace);
        landContext.fillStyle = '#fff';
        landContext.fill('evenodd');
      }
    }
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = mapWidth;
    glowCanvas.height = mapHeight;
    const glowContext = glowCanvas.getContext('2d', { willReadFrequently: true });
    glowContext.filter = 'blur(21px)';
    glowContext.drawImage(landCanvas, 0, 0);
    return { landCanvas, glowCanvas, landContext, glowContext };
  }

  function createGpuSphere(mapCanvas, landCanvas, glowCanvas) {
    const surface = document.createElement('canvas');
    const gl = surface.getContext('webgl', {
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });
    if (!gl) return null;
    const vertexSource = `
      attribute vec2 aPosition;
      varying vec2 vUv;
      void main() {
        vUv = aPosition * .5 + .5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;
    const fragmentSource = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uMap;
      uniform sampler2D uLand;
      uniform sampler2D uGlow;
      uniform float uLon;
      uniform float uLat;
      uniform float uTime;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float radius2 = dot(p, p);
        if (radius2 > 1.0) discard;
        float nz = sqrt(1.0 - radius2);
        float cosLat = cos(uLat);
        float sinLat = sin(uLat);
        float worldY = p.y * cosLat + nz * sinLat;
        float rotatedZ = -p.y * sinLat + nz * cosLat;
        float worldX = p.x * cos(uLon) + rotatedZ * sin(uLon);
        float worldZ = -p.x * sin(uLon) + rotatedZ * cos(uLon);
        float longitude = atan(worldX, worldZ);
        float latitude = asin(clamp(worldY, -1.0, 1.0));
        vec2 uv = vec2(fract(longitude / 6.283185307 + 1.5), .5 - latitude / 3.141592654);
        vec3 earth = texture2D(uMap, uv).rgb;
        float land = texture2D(uLand, uv).a;
        float aura = texture2D(uGlow, uv).a;
        float light = .28 + .72 * max(0.0, dot(vec3(p, nz), vec3(-.38, .39, .83)));
        vec3 gold = mix(vec3(.85, .44, .08), vec3(1.0, .76, .30), clamp(light * .95, 0.0, 1.0));
        float breath = .5 + .5 * sin(uTime * 1.25);
        vec3 color = mix(earth * light, gold * (.90 + .12 * breath), land * .96);
        color += vec3(1.0, .54, .10) * aura * (.10 + .25 * breath);
        gl_FragColor = vec4(min(color, vec3(1.0)), 1.0);
      }
    `;
    const shader = (type, source) => {
      const result = gl.createShader(type);
      gl.shaderSource(result, source);
      gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(result) || 'Globe shader failed');
      }
      return result;
    };
    try {
      const program = gl.createProgram();
      gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'Globe program failed');
      }
      gl.useProgram(program);
      const vertices = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const upload = (unit, uniform, source) => {
        const texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.uniform1i(gl.getUniformLocation(program, uniform), unit);
      };
      upload(0, 'uMap', mapCanvas);
      upload(1, 'uLand', landCanvas);
      upload(2, 'uGlow', glowCanvas);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Globe texture upload failed');
      const longitudeLocation = gl.getUniformLocation(program, 'uLon');
      const latitudeLocation = gl.getUniformLocation(program, 'uLat');
      const timeLocation = gl.getUniformLocation(program, 'uTime');
      gl.disable(gl.DEPTH_TEST);
      gl.clearColor(0, 0, 0, 0);
      surface.style.position = 'absolute';
      surface.style.zIndex = '0';
      surface.style.pointerEvents = 'none';
      surface.style.borderRadius = '50%';
      surface.style.boxShadow = '0 0 30px rgba(96,166,208,.1)';
      surface.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        gpuSphere = null;
        surface.remove();
        render(performance.now());
      });
      mount.insertBefore(surface, canvas);
      return {
        canvas: surface,
        draw(size, centerLon, centerLat, x, y, radius, now) {
          if (surface.width !== size) {
            surface.width = surface.height = size;
            gl.viewport(0, 0, size, size);
          }
          surface.style.left = `${x - radius}px`;
          surface.style.top = `${y - radius}px`;
          surface.style.width = `${radius * 2}px`;
          surface.style.height = `${radius * 2}px`;
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.uniform1f(longitudeLocation, centerLon);
          gl.uniform1f(latitudeLocation, centerLat);
          gl.uniform1f(timeLocation, now / 1000);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      };
    } catch (error) {
      console.warn('Using the lighter globe renderer:', error);
      return null;
    }
  }

  function geometry(size) {
    if (geometryCache.has(size)) return geometryCache.get(size);
    const count = size * size;
    const x = new Float32Array(count);
    const y = new Float32Array(count);
    const z = new Float32Array(count);
    const light = new Float32Array(count);
    const inside = new Uint8Array(count);
    for (let row = 0; row < size; row++) {
      const ny = 1 - (row + .5) * 2 / size;
      for (let col = 0; col < size; col++) {
        const nx = (col + .5) * 2 / size - 1;
        const radius2 = nx * nx + ny * ny;
        if (radius2 > 1) continue;
        const index = row * size + col;
        const nz = Math.sqrt(1 - radius2);
        x[index] = nx;
        y[index] = ny;
        z[index] = nz;
        light[index] = .28 + .72 * Math.max(0, nx * -.38 + ny * .39 + nz * .83);
        inside[index] = 1;
      }
    }
    const value = { x, y, z, light, inside };
    geometryCache.set(size, value);
    return value;
  }

  function project(point, centerLon, centerLat, centerX, centerY, radius) {
    const cosLon = Math.cos(centerLon), sinLon = Math.sin(centerLon);
    const cosLat = Math.cos(centerLat), sinLat = Math.sin(centerLat);
    const x = point[0] * cosLon - point[2] * sinLon;
    const z1 = point[0] * sinLon + point[2] * cosLon;
    const y = point[1] * cosLat - z1 * sinLat;
    const z = point[1] * sinLat + z1 * cosLat;
    return z > .035 ? [centerX + x * radius, centerY - y * radius, z] : null;
  }

  function drawSignals(now, centerLon, centerLat, centerX, centerY, radius) {
    context.save();
    context.lineWidth = clamp(radius / 340, 1, 2);
    routes.forEach((route, index) => {
      context.beginPath();
      let started = false;
      route.forEach(point => {
        const position = project(point, centerLon, centerLat, centerX, centerY, radius);
        if (!position) { started = false; return; }
        if (!started) context.moveTo(position[0], position[1]);
        else context.lineTo(position[0], position[1]);
        started = true;
      });
      context.strokeStyle = 'rgba(248,193,102,.38)';
      context.stroke();
      if (reducedMotion.matches) return;
      const cycle = (now / 6900 + index * .247) % 1;
      if (cycle > .235) return;
      const point = route[Math.min(route.length - 1, Math.floor(smooth(0, .235, cycle) * (route.length - 1)))];
      const position = project(point, centerLon, centerLat, centerX, centerY, radius);
      if (!position) return;
      const halo = context.createRadialGradient(position[0], position[1], 1, position[0], position[1], clamp(radius * .035, 8, 23));
      halo.addColorStop(0, 'rgba(255,239,190,.95)');
      halo.addColorStop(.28, 'rgba(255,191,85,.55)');
      halo.addColorStop(1, 'rgba(255,167,58,0)');
      context.fillStyle = halo;
      context.beginPath();
      context.arc(position[0], position[1], clamp(radius * .035, 8, 23), 0, PI * 2);
      context.fill();
    });
    locations.forEach((place, index) => {
      const position = project(vector(...place), centerLon, centerLat, centerX, centerY, radius);
      if (!position) return;
      context.beginPath();
      context.arc(position[0], position[1], index === 0 ? 4 : 2.2, 0, PI * 2);
      context.fillStyle = '#ffe1a2';
      context.shadowColor = '#ffc76c';
      context.shadowBlur = index === 0 ? 18 : 10;
      context.fill();
    });
    context.restore();
  }

  function render(now) {
    if (!texture || (!coverageMode && window.innerWidth <= 700)) return;
    const p = progress();
    if (!coverageMode && p > .008 && !scrolling) {
      scrollLon = lon;
      scrollLat = lat;
      scrolling = true;
      velocityLon = velocityLat = 0;
    } else if (p <= .008 && scrolling) {
      lon = scrollLon;
      lat = scrollLat;
      scrolling = false;
    }
    const turn = Math.atan2(Math.sin(targetLon - scrollLon), Math.cos(targetLon - scrollLon));
    const alignment = smooth(.02, .34, p);
    const centerLon = coverageMode ? lon : scrolling ? scrollLon + turn * alignment : lon;
    const centerLat = coverageMode ? lat : scrolling ? scrollLat + (targetLat - scrollLat) * alignment : lat;
    const mobile = window.innerWidth < 701;
    const baseRadius = coverageMode ? Math.min(height * .4, width * .4) : mobile ? Math.min(height * .215, width * .42) : Math.min(height * .34, width * .31);
    const zoom = coverageMode ? 0 : smooth(.29, .78, p);
    const radius = baseRadius + (Math.max(width, height) * 1.18 - baseRadius) * zoom;
    const centerX = coverageMode ? width * .5 : width * (mobile ? .5 : .75 - .25 * smooth(.14, .6, p));
    const centerY = coverageMode ? height * .5 : height * (mobile ? .29 + .21 * smooth(.14, .6, p) : .5);
    context.clearRect(0, 0, width, height);
    if (gpuSphere) {
      const size = coverageMode ? Math.min(768, Math.max(256, Math.ceil(radius * 2 * dpr))) : mobile ? (p > .42 ? 640 : 512) : (p > .42 ? 960 : 768);
      gpuSphere.draw(size, centerLon, centerLat, centerX, centerY, radius, now);
    } else {
      const size = coverageMode ? (mobile ? 256 : 320) : mobile ? (p > .42 ? 360 : 256) : (p > .42 ? 448 : 320);
      if (globeCanvas.width !== size) globeCanvas.width = globeCanvas.height = size;
      const sphere = geometry(size);
      const output = globeContext.createImageData(size, size);
      const target = output.data;
      const source = texture.data;
      const land = landMask.data;
      const aura = glowMask.data;
      const sourceWidth = texture.width, sourceHeight = texture.height;
      const cosLon = Math.cos(centerLon), sinLon = Math.sin(centerLon);
      const cosLat = Math.cos(centerLat), sinLat = Math.sin(centerLat);
      const breath = .5 + .5 * Math.sin(now / 1000 * 1.25);
      const core = .90 + .12 * breath;
      const halo = .10 + .25 * breath;
      for (let index = 0; index < sphere.inside.length; index++) {
        if (!sphere.inside[index]) continue;
        const vy = sphere.y[index] * cosLat + sphere.z[index] * sinLat;
        const vz = -sphere.y[index] * sinLat + sphere.z[index] * cosLat;
        const wx = sphere.x[index] * cosLon + vz * sinLon;
        const wz = -sphere.x[index] * sinLon + vz * cosLon;
        const longitude = Math.atan2(wx, wz);
        const latitude = Math.asin(clamp(vy, -1, 1));
        const u = (longitude / (PI * 2) + .5 + 1) % 1;
        const v = .5 - latitude / PI;
        const from = (Math.min(sourceHeight - 1, Math.floor(v * sourceHeight)) * sourceWidth
          + Math.min(sourceWidth - 1, Math.floor(u * sourceWidth))) * 4;
        const to = index * 4;
        const brightness = sphere.light[index];
        const gold = land[from + 3] / 255 * .96;
        const glow = aura[from + 3] / 255 * halo;
        target[to] = Math.min(255, source[from] * brightness * (1 - gold) + 255 * core * gold + 110 * glow);
        target[to + 1] = Math.min(255, source[from + 1] * brightness * (1 - gold) + (112 + brightness * 82) * core * gold + 55 * glow);
        target[to + 2] = Math.min(255, source[from + 2] * brightness * (1 - gold) + (19 + brightness * 58) * core * gold + 10 * glow);
        target[to + 3] = 255;
      }
      globeContext.putImageData(output, 0, 0);
      context.save();
      context.shadowColor = 'rgba(95,165,211,.12)';
      context.shadowBlur = clamp(radius * .065, 18, 65);
      context.drawImage(globeCanvas, centerX - radius, centerY - radius, radius * 2, radius * 2);
      context.restore();
    }
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, PI * 2);
    context.strokeStyle = 'rgba(127,193,230,.25)';
    context.lineWidth = clamp(radius * .008, 1, 4);
    context.stroke();
    drawSignals(now, centerLon, centerLat, centerX, centerY, radius);
    stage.classList.add('is-ready');
  }

  function resize() {
    width = Math.max(1, mount.clientWidth);
    height = Math.max(1, mount.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateCoverageProgress();
    render(performance.now());
    start();
  }

  function animate(now) {
    frame = 0;
    if (!visible || document.hidden || (!coverageMode && (window.innerWidth <= 700 || progress() >= .88))) return;
    const dt = Math.min((now - lastTime) / 1000, .05);
    lastTime = now;
    if (coverageMode && coverageReturning && !dragging && !reducedMotion.matches) {
      const turn = Math.atan2(Math.sin(targetLon - lon), Math.cos(targetLon - lon));
      velocityLon += (turn * 26 - velocityLon * 10) * dt;
      velocityLat += ((targetLat - lat) * 26 - velocityLat * 10) * dt;
      lon += velocityLon * dt;
      lat = clamp(lat + velocityLat * dt, -1.08, 1.08);
      const remaining = Math.atan2(Math.sin(targetLon - lon), Math.cos(targetLon - lon));
      if (Math.abs(remaining) < .0015 && Math.abs(targetLat - lat) < .0015 && Math.abs(velocityLon) < .008 && Math.abs(velocityLat) < .008) {
        lon = targetLon;
        lat = targetLat;
        velocityLon = velocityLat = 0;
        coverageReturning = false;
      }
    } else if (!coverageMode && !dragging && progress() <= .008 && !reducedMotion.matches) {
      lon += (PI * 2 / 195 + velocityLon) * dt;
      lat = clamp(lat + velocityLat * dt, -1.08, 1.08);
      velocityLon *= Math.exp(-dt / 1.15);
      velocityLat *= Math.exp(-dt / .8);
    }
    if (now - lastPaint >= (gpuSphere ? 16 : dragging ? 33 : 70)) {
      render(now);
      lastPaint = now;
    }
    if (!reducedMotion.matches) frame = requestAnimationFrame(animate);
  }
  function start() {
    if (!texture || frame || !visible || document.hidden || reducedMotion.matches || (!coverageMode && window.innerWidth <= 700)) return;
    lastTime = performance.now();
    frame = requestAnimationFrame(animate);
  }

  stage.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!coverageMode && progress() > .015) return;
    const rect = stage.getBoundingClientRect();
    const mobile = window.innerWidth < 701;
    const x = rect.left + rect.width * (coverageMode ? .5 : mobile ? .5 : .75);
    const y = rect.top + rect.height * (coverageMode ? .5 : mobile ? .29 : .5);
    const radius = coverageMode ? Math.min(rect.height * .4, rect.width * .4) : mobile ? Math.min(rect.height * .215, rect.width * .42) : Math.min(rect.height * .34, rect.width * .31);
    if (Math.hypot(event.clientX - x, event.clientY - y) > radius * 1.1) return;
    dragging = true;
    coverageReturning = false;
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerTime = performance.now();
    velocityLon = velocityLat = 0;
    stage.classList.add('is-dragging');
    stage.setPointerCapture(event.pointerId);
    start();
  });
  stage.addEventListener('pointermove', event => {
    if (!dragging) return;
    const now = performance.now();
    const seconds = Math.max((now - pointerTime) / 1000, .015);
    const dx = event.clientX - pointerX;
    const dy = event.clientY - pointerY;
    lon -= dx * .006;
    lat = clamp(lat + dy * .0035, -1.08, 1.08);
    velocityLon = clamp(-dx * .006 / seconds, -2.5, 2.5);
    velocityLat = clamp(dy * .0035 / seconds, -1.3, 1.3);
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerTime = now;
    if (reducedMotion.matches) render(now);
  });
  const release = () => {
    dragging = false;
    stage.classList.remove('is-dragging');
    if (!coverageMode) return;
    if (reducedMotion.matches) {
      lon = targetLon;
      lat = targetLat;
      velocityLon = velocityLat = 0;
      render(performance.now());
    } else {
      velocityLon = velocityLat = 0;
      coverageReturning = true;
      start();
    }
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('lostpointercapture', release);
  stage.addEventListener('keydown', event => {
    if (!coverageMode && progress() > .015) return;
    const step = event.shiftKey ? .42 : .22;
    if (event.key === 'ArrowLeft') lon += step;
    else if (event.key === 'ArrowRight') lon -= step;
    else if (event.key === 'ArrowUp') lat = clamp(lat + step * .55, -1.08, 1.08);
    else if (event.key === 'ArrowDown') lat = clamp(lat - step * .55, -1.08, 1.08);
    else if (event.key === 'Home') { lon = targetLon; lat = targetLat; }
    else return;
    event.preventDefault();
    velocityLon = velocityLat = 0;
    if (coverageMode) coverageReturning = true;
    render(performance.now());
    start();
  });

  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (!visible && frame) { cancelAnimationFrame(frame); frame = 0; }
    else if (visible) start();
  }, { threshold: .02 });
  observer.observe(stage);
  window.addEventListener('scroll', () => {
    updateCoverageProgress(true);
    if (reducedMotion.matches) render(performance.now());
    else start();
  }, { passive: true });
  document.addEventListener('visibilitychange', start);
  reducedMotion.addEventListener('change', () => { render(performance.now()); start(); });
  new ResizeObserver(resize).observe(mount);
  resize();

  const image = new Image();
  image.onload = () => {
    sourceCanvas.width = image.naturalWidth;
    sourceCanvas.height = image.naturalHeight;
    sourceContext.drawImage(image, 0, 0);
    const africa = paintAfrica();
    const pixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    texture = { data: pixels.data, width: pixels.width, height: pixels.height };
    landMask = africa.landContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    glowMask = africa.glowContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    gpuSphere = createGpuSphere(sourceCanvas, africa.landCanvas, africa.glowCanvas);
    render(performance.now());
    start();
  };
  image.onerror = error => console.error('Earth texture could not load', error);
  image.src = data.earth;
})();
