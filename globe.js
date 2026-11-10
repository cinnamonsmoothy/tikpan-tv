const THREE = window.THREE;
const globeData = window.TIKPAN_GLOBE_DATA;
const stage = document.getElementById('globe-stage');
const mount = document.getElementById('globe-canvas');
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
if (stage && mount && THREE && globeData) initialiseGlobe().catch(error => {
  console.error('Tikpan globe could not start:', error);
  stage.classList.add('no-webgl');
});
else if (stage) stage.classList.add('no-webgl');

async function initialiseGlobe() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'high-performance'});
  } catch {
    stage.classList.add('no-webgl');
    return;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 701 ? 1.35 : 1.75));
  mount.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  camera.position.set(0, 0, window.innerWidth < 701 ? 15.2 : 9.2);
  scene.add(new THREE.AmbientLight(0x7ea4c6, 1.55));
  const sunlight = new THREE.DirectionalLight(0xfff4db, 2.25);
  sunlight.position.set(-3.4, 2.6, 5);
  scene.add(sunlight);
  const fillLight = new THREE.DirectionalLight(0x4584bc, .62);
  fillLight.position.set(4, -2, 2);
  scene.add(fillLight);

  const earthRig = new THREE.Group();
  scene.add(earthRig);
  const globeGeometry = new THREE.SphereGeometry(2, 80, 64);
  const textureLoader = new THREE.TextureLoader();
  const [earthResult, cloudsResult, countriesResult] = await Promise.allSettled([
    textureLoader.loadAsync(globeData.earth),
    textureLoader.loadAsync(globeData.clouds),
    Promise.resolve(globeData.countries)
  ]);
  if (earthResult.status !== 'fulfilled') {
    renderer.dispose();
    renderer.domElement.remove();
    stage.classList.add('no-webgl');
    return;
  }

  const earthTexture = earthResult.value;
  earthTexture.colorSpace = THREE.SRGBColorSpace;
  earthTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  earthRig.add(new THREE.Mesh(globeGeometry, new THREE.MeshPhongMaterial({
    map: earthTexture,
    specular: 0x28374a,
    shininess: 11
  })));

  let africaMaterial;
  if (countriesResult.status === 'fulfilled') {
    const africaTextures = paintAfrica(countriesResult.value);
    earthRig.add(new THREE.Mesh(new THREE.SphereGeometry(2.027, 80, 64), new THREE.MeshBasicMaterial({
      map: africaTextures.glow,
      transparent: true,
      opacity: .42,
      depthWrite: false
    })));
    africaMaterial = new THREE.MeshBasicMaterial({
      map: africaTextures.land,
      transparent: true,
      opacity: .89,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1
    });
    earthRig.add(new THREE.Mesh(new THREE.SphereGeometry(2.012, 80, 64), africaMaterial));
  }

  let cloudMesh;
  if (cloudsResult.status === 'fulfilled') {
    cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(2.032, 64, 48), new THREE.MeshBasicMaterial({
      color: 0xe5f1ff,
      alphaMap: cloudsResult.value,
      transparent: true,
      opacity: .075,
      depthWrite: false
    }));
    earthRig.add(cloudMesh);
  }

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(2.09, 64, 48),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float rim = pow(1.0 - max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0), 3.2);
          gl_FragColor = vec4(0.24, 0.52, 0.77, rim * 0.47);
        }
      `
    })
  );
  atmosphere.renderOrder = 4;
  earthRig.add(atmosphere);

  const signals = addConnections(earthRig);

  // A few distant stars give the canvas depth; the CSS stars fill the wider sky.
  let seed = 712365;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const positions = [];
  for (let index = 0; index < 230; index++) {
    positions.push((random() - .5) * 18, (random() - .5) * 12, -5 - random() * 8);
  }
  const starsGeometry = new THREE.BufferGeometry();
  starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  scene.add(new THREE.Points(starsGeometry, new THREE.PointsMaterial({
    color: 0xbed4ef,
    size: .018,
    transparent: true,
    opacity: .58,
    sizeAttenuation: true
  })));

  const homeYaw = Math.PI + THREE.MathUtils.degToRad(75);
  const homePitch = THREE.MathUtils.degToRad(5);
  let freeYaw = homeYaw, freePitch = homePitch;
  let yawVelocity = 0, pitchVelocity = 0;
  let scrollAnchorYaw = homeYaw, scrollAnchorPitch = homePitch, inScroll = false;
  let dragging = false, pointerX = 0, pointerY = 0, pointerTime = 0;
  let lastFrame = performance.now(), frame = 0;
  let visible = true;
  const ease = (start, end, value) => {
    const t = THREE.MathUtils.clamp((value - start) / (end - start), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const getProgress = () => motionPreference.matches ? 0 : THREE.MathUtils.clamp(window.tikpanHeroProgress || 0, 0, 1);

  const resize = () => {
    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 701 ? 1.35 : 1.75));
    renderer.setSize(width, height, false);
    draw(performance.now());
  };
  const draw = now => {
    const progress = getProgress();
    if (progress > .008 && !inScroll) {
      scrollAnchorYaw = freeYaw;
      scrollAnchorPitch = freePitch;
      inScroll = true;
      yawVelocity = pitchVelocity = 0;
    } else if (progress <= .008 && inScroll) {
      freeYaw = scrollAnchorYaw;
      freePitch = scrollAnchorPitch;
      inScroll = false;
    }
    const alignment = ease(.02, .34, progress);
    const shortestTurn = Math.atan2(Math.sin(homeYaw - scrollAnchorYaw), Math.cos(homeYaw - scrollAnchorYaw));
    const displayedYaw = inScroll ? scrollAnchorYaw + shortestTurn * alignment : freeYaw;
    const displayedPitch = inScroll ? THREE.MathUtils.lerp(scrollAnchorPitch, homePitch, alignment) : freePitch;
    earthRig.rotation.set(displayedPitch, displayedYaw, 0);

    const mobile = window.innerWidth < 701;
    const startDistance = mobile ? 15.2 : 9.2;
    const distance = THREE.MathUtils.lerp(startDistance, 2.32, ease(.29, .78, progress));
    camera.position.z = distance;
    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);
    const worldPerPixel = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / height;
    const positionShift = ease(.14, .60, progress);
    const centerX = width * (mobile ? .5 : THREE.MathUtils.lerp(.75, .5, positionShift));
    const centerY = height * (mobile ? THREE.MathUtils.lerp(.29, .5, positionShift) : .5);
    earthRig.position.set((centerX - width / 2) * worldPerPixel, (height / 2 - centerY) * worldPerPixel, 0);

    signals.forEach((signal, index) => {
      if (motionPreference.matches) { signal.tracer.visible = false; return; }
      const cycle = ((now / 6900 + index * .247) % 1 + 1) % 1;
      signal.tracer.visible = cycle < .235;
      if (!signal.tracer.visible) return;
      const t = ease(0, .235, cycle);
      const position = t * (signal.points.length - 1);
      const first = Math.floor(position);
      signal.tracer.position.copy(signal.points[first]).lerp(signal.points[Math.min(first + 1, signal.points.length - 1)], position - first);
      signal.tracer.scale.setScalar(.8 + Math.sin(t * Math.PI) * .55);
    });
    renderer.render(scene, camera);
  };
  const animate = now => {
    frame = 0;
    if (!visible || document.hidden || motionPreference.matches || getProgress() >= .88) return;
    const dt = Math.min((now - lastFrame) / 1000, .05);
    lastFrame = now;
    if (!dragging && getProgress() <= .008) {
      freeYaw += (Math.PI * 2 / 195 + yawVelocity) * dt;
      freePitch = THREE.MathUtils.clamp(freePitch + pitchVelocity * dt, homePitch - .65, homePitch + .65);
      yawVelocity *= Math.exp(-dt / 1.15);
      pitchVelocity *= Math.exp(-dt / .8);
    }
    if (cloudMesh) cloudMesh.rotation.y += dt * .006;
    draw(now);
    frame = requestAnimationFrame(animate);
  };
  const start = () => {
    if (frame || !visible || document.hidden || motionPreference.matches) return;
    lastFrame = performance.now();
    frame = requestAnimationFrame(animate);
  };

  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    if (getProgress() > .015) return;
    const rect = stage.getBoundingClientRect();
    const mobile = window.innerWidth < 701;
    const centerX = rect.left + rect.width * (mobile ? .5 : .75);
    const centerY = rect.top + rect.height * (mobile ? .29 : .5);
    const radius = rect.height * (mobile ? .22 : .33);
    if (Math.hypot(event.clientX - centerX, event.clientY - centerY) > radius * 1.18) return;
    dragging = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerTime = performance.now();
    yawVelocity = pitchVelocity = 0;
    stage.classList.add('is-dragging');
    stage.setPointerCapture(event.pointerId);
    start();
  });
  stage.addEventListener('pointermove', event => {
    if (!dragging) return;
    const dx = event.clientX - pointerX;
    const dy = event.clientY - pointerY;
    const now = performance.now();
    const seconds = Math.max((now - pointerTime) / 1000, .015);
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerTime = now;
    freeYaw += dx * .006;
    freePitch = THREE.MathUtils.clamp(freePitch + dy * .0035, homePitch - .65, homePitch + .65);
    yawVelocity = THREE.MathUtils.clamp(dx * .006 / seconds, -2.5, 2.5);
    pitchVelocity = THREE.MathUtils.clamp(dy * .0035 / seconds, -1.3, 1.3);
    if (motionPreference.matches) draw(now);
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('is-dragging');
    if (motionPreference.matches) { yawVelocity = pitchVelocity = 0; draw(performance.now()); }
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('lostpointercapture', release);
  stage.addEventListener('keydown', event => {
    if (getProgress() > .015) return;
    const step = event.shiftKey ? .42 : .22;
    if (event.key === 'ArrowLeft') freeYaw -= step;
    else if (event.key === 'ArrowRight') freeYaw += step;
    else if (event.key === 'ArrowUp') freePitch = Math.max(homePitch - .65, freePitch - step * .55);
    else if (event.key === 'ArrowDown') freePitch = Math.min(homePitch + .65, freePitch + step * .55);
    else if (event.key === 'Home') { freeYaw = homeYaw; freePitch = homePitch; }
    else return;
    event.preventDefault();
    yawVelocity = pitchVelocity = 0;
    if (motionPreference.matches) draw(performance.now());
    else start();
  });

  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (!visible && frame) { cancelAnimationFrame(frame); frame = 0; }
    else if (visible) start();
  }, {threshold: .02});
  observer.observe(stage);
  window.addEventListener('scroll', start, {passive: true});
  document.addEventListener('visibilitychange', start);
  motionPreference.addEventListener('change', () => {
    if (motionPreference.matches && frame) { cancelAnimationFrame(frame); frame = 0; yawVelocity = pitchVelocity = 0; draw(performance.now()); }
    else start();
  });
  new ResizeObserver(resize).observe(mount);
  resize();
  stage.classList.add('is-ready');
  start();
}

function paintAfrica(geojson) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext('2d');
  const outline = [];
  const trace = ring => {
    ring.forEach(([longitude, latitude], index) => {
      const x = (longitude + 180) / 360 * canvas.width;
      const y = (90 - latitude) / 180 * canvas.height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
  };
  geojson.features.filter(feature => feature.properties.CONTINENT === 'Africa').forEach(feature => {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    polygons.forEach(polygon => {
      context.beginPath();
      polygon.forEach(trace);
      context.fillStyle = 'rgba(226, 161, 55, .62)';
      context.fill('evenodd');
      outline.push(polygon[0]);
    });
  });
  context.shadowColor = 'rgba(248, 177, 63, .8)';
  context.shadowBlur = 8;
  context.lineWidth = 1.1;
  context.strokeStyle = 'rgba(255, 211, 123, .34)';
  outline.forEach(ring => { context.beginPath(); trace(ring); context.stroke(); });
  context.shadowBlur = 0;
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 1024;
  glowCanvas.height = 512;
  const glowContext = glowCanvas.getContext('2d');
  glowContext.filter = 'blur(10px)';
  glowContext.drawImage(canvas, 0, 0, glowCanvas.width, glowCanvas.height);
  const land = new THREE.CanvasTexture(canvas);
  land.colorSpace = THREE.SRGBColorSpace;
  land.anisotropy = 4;
  const glow = new THREE.CanvasTexture(glowCanvas);
  glow.colorSpace = THREE.SRGBColorSpace;
  return {land, glow};
}

function addConnections(group) {
  const surfacePoint = (longitude, latitude, radius) => {
    const lon = THREE.MathUtils.degToRad(longitude);
    const lat = THREE.MathUtils.degToRad(latitude);
    return new THREE.Vector3(
      radius * Math.cos(lon) * Math.cos(lat),
      radius * Math.sin(lat),
      -radius * Math.sin(lon) * Math.cos(lat)
    );
  };
  const ghana = [-.19, 5.56];
  const destinations = [[36.82, -1.29], [28.05, -26.2], [-17.44, 14.69], [31.24, 30.04]];
  const signals = [];
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const glowContext = glowCanvas.getContext('2d');
  const gradient = glowContext.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,238,177,.85)');
  gradient.addColorStop(.28, 'rgba(255,191,81,.45)');
  gradient.addColorStop(1, 'rgba(255,174,67,0)');
  glowContext.fillStyle = gradient;
  glowContext.fillRect(0, 0, 64, 64);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  destinations.forEach((destination, index) => {
    const start = surfacePoint(...ghana, 1).normalize();
    const end = surfacePoint(...destination, 1).normalize();
    const points = [];
    for (let index = 0; index <= 64; index++) {
      const t = index / 64;
      const point = start.clone().lerp(end, t).normalize().multiplyScalar(2.043 + Math.sin(t * Math.PI) * .055);
      points.push(point);
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({
      color: 0xe8bd78, transparent: true, opacity: .21, depthWrite: false
    })));
    const tracer = new THREE.Mesh(new THREE.SphereGeometry(.024, 12, 8), new THREE.MeshBasicMaterial({color: 0xffdfa0}));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTexture, color: 0xffd186, transparent: true, opacity: .73, depthWrite: false}));
    halo.scale.set(.25, .25, 1);
    tracer.add(halo);
    tracer.visible = false;
    group.add(tracer);
    signals.push({points, tracer, index});
  });
  [ghana, ...destinations].forEach((coordinates, index) => {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(index === 0 ? .031 : .018, 12, 8),
      new THREE.MeshBasicMaterial({color: index === 0 ? 0xffdc91 : 0xe7ba70})
    );
    dot.position.copy(surfacePoint(...coordinates, 2.058));
    group.add(dot);
  });
  return signals;
}
