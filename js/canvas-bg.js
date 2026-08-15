// High-performance 60+ FPS Animated Sports Cars & Circuit Speedway Background
class SportsCar {
  constructor(canvasWidth, canvasHeight, laneIndex, totalLanes) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.totalLanes = totalLanes;
    this.laneIndex = laneIndex;
    this.reset(true);
  }

  reset(initial = false) {
    this.z = initial ? Math.random() * 0.85 + 0.15 : 0.05; // 0.05 (near horizon) to 1.0 (near camera)
    this.lane = Math.floor(Math.random() * this.totalLanes);
    this.targetLane = this.lane;
    this.laneProgress = 1;
    this.laneChangeSpeed = 0.03 + Math.random() * 0.02;

    // Speeds & physics
    this.baseSpeed = 0.4 + Math.random() * 0.55;
    this.currentSpeed = this.baseSpeed;
    this.nitroActive = Math.random() > 0.6;
    this.nitroTimer = Math.random() * 100;

    // Palette themes: GT Hypercar colors
    const themes = [
      { body: '#ff1744', accent: '#ff5252', light: '#ff1744', name: 'Crimson GT' },
      { body: '#00e5ff', accent: '#18ffff', light: '#00e5ff', name: 'Apex Cyan' },
      { body: '#ffd600', accent: '#ffff00', light: '#ffd600', name: 'Gold Rush' },
      { body: '#7c4dff', accent: '#b388ff', light: '#7c4dff', name: 'Phantom Purple' },
      { body: '#00e676', accent: '#69f0ae', light: '#00e676', name: 'Emerald Turbo' },
      { body: '#ff6d00', accent: '#ff9100', light: '#ff6d00', name: 'Inferno Orange' }
    ];
    this.theme = themes[Math.floor(Math.random() * themes.length)];

    // Light trails history
    this.trail = [];
    this.maxTrail = 18;
    this.bobPhase = Math.random() * Math.PI * 2;
  }

  update(dt, speedMultiplier, width, height) {
    this.canvasWidth = width;
    this.canvasHeight = height;

    // Nitro burst cycles
    this.nitroTimer += dt * 30;
    if (this.nitroTimer > 120) {
      this.nitroActive = Math.random() > 0.4;
      this.nitroTimer = 0;
    }

    // Lane change AI
    if (Math.random() < 0.008 && this.laneProgress >= 1) {
      const delta = Math.random() > 0.5 ? 1 : -1;
      this.targetLane = Math.max(0, Math.min(this.totalLanes - 1, this.lane + delta));
      this.laneProgress = 0;
    }

    if (this.laneProgress < 1) {
      this.laneProgress += this.laneChangeSpeed * speedMultiplier;
      if (this.laneProgress >= 1) {
        this.lane = this.targetLane;
        this.laneProgress = 1;
      }
    }

    // Velocity progression along depth z (0 = horizon, 1 = passes screen)
    const effectiveSpeed = (this.baseSpeed * (this.nitroActive ? 1.5 : 1.0)) * speedMultiplier;
    this.z += effectiveSpeed * dt * 0.38;

    this.bobPhase += dt * 12;

    if (this.z > 1.15) {
      this.reset(false);
    }
  }

  getScreenPosition(horizonY, roadCenterX, roadTopWidth, roadBottomWidth) {
    // Non-linear depth projection
    const scale = Math.pow(this.z, 2.2);
    const y = horizonY + (this.canvasHeight - horizonY) * scale;

    const currentRoadWidth = roadTopWidth + (roadBottomWidth - roadTopWidth) * scale;
    const laneWidth = currentRoadWidth / this.totalLanes;

    // Smooth lane interpolation
    const currentLane = this.lane + (this.targetLane - this.lane) * (1 - Math.cos(this.laneProgress * Math.PI)) / 2;
    const x = (roadCenterX - currentRoadWidth / 2) + (currentLane + 0.5) * laneWidth;

    return { x, y, scale, laneWidth };
  }
}

class RacingCanvasBackground {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.width = 0;
    this.height = 0;
    this.lastTime = 0;
    this.animationFrameId = null;

    this.speedMultiplier = 1.0;
    this.targetSpeedMultiplier = 1.0;
    this.roadScroll = 0;

    // Environment elements
    this.totalLanes = 4;
    this.cars = [];
    this.sparks = [];
    this.stars = [];
    this.lightPillars = [];

    this.init();
  }

  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Generate sports cars
    const carCount = 5;
    for (let i = 0; i < carCount; i++) {
      const car = new SportsCar(this.width, this.height, i % this.totalLanes, this.totalLanes);
      car.z = 0.12 + (i / carCount) * 0.85; // stagger along road
      this.cars.push(car);
    }

    // Stars / City Sky particles
    for (let i = 0; i < 90; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random() * 0.45,
        size: Math.random() * 1.5 + 0.4,
        alpha: Math.random() * 0.7 + 0.3,
        twinkle: Math.random() * 5
      });
    }

    // Distant searchlight / stadium floodlights
    for (let i = 0; i < 4; i++) {
      this.lightPillars.push({
        x: 0.15 + i * 0.24,
        angle: Math.sin(i) * 0.3,
        angularSpeed: (i % 2 === 0 ? 1 : -1) * (0.2 + Math.random() * 0.15),
        color: i % 2 === 0 ? 'rgba(0, 229, 255, 0.04)' : 'rgba(255, 23, 68, 0.035)'
      });
    }

    this.animate(0);
  }

  resize() {
    this.width = this.canvas.width = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
  }

  boostSpeed() {
    this.targetSpeedMultiplier = 2.5;
    setTimeout(() => {
      this.targetSpeedMultiplier = 1.0;
    }, 1500);
  }

  drawSkyAndHorizon(horizonY) {
    const ctx = this.ctx;

    // Deep high-contrast night race sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#04060a');
    skyGrad.addColorStop(0.55, '#070b14');
    skyGrad.addColorStop(0.88, '#0d1527');
    skyGrad.addColorStop(1, '#1a102a');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.width, horizonY);

    // Stars / distant stadium lights
    for (let star of this.stars) {
      const sx = star.x * this.width;
      const sy = star.y * this.height;
      const blink = Math.sin(star.twinkle += 0.04) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha * blink})`;
      ctx.beginPath();
      ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sweeping Grand Prix stadium floodlight cones
    for (let pillar of this.lightPillars) {
      pillar.angle += pillar.angularSpeed * 0.008;
      const originX = pillar.x * this.width;
      const topX = originX + Math.sin(pillar.angle) * (this.height * 0.6);

      ctx.save();
      const beamGrad = ctx.createLinearGradient(originX, horizonY, topX, 0);
      beamGrad.addColorStop(0, pillar.color);
      beamGrad.addColorStop(0.8, 'rgba(0,0,0,0)');

      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(originX - 15, horizonY);
      ctx.lineTo(topX - 90, 0);
      ctx.lineTo(topX + 90, 0);
      ctx.lineTo(originX + 15, horizonY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Horizon neon glow streak
    const horizonGlow = ctx.createLinearGradient(0, horizonY - 4, 0, horizonY + 8);
    horizonGlow.addColorStop(0, 'rgba(0, 229, 255, 0)');
    horizonGlow.addColorStop(0.5, 'rgba(0, 229, 255, 0.25)');
    horizonGlow.addColorStop(0.8, 'rgba(255, 23, 68, 0.18)');
    horizonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, horizonY - 4, this.width, 12);
  }

  drawSpeedwayRoad(horizonY, roadCenterX, roadTopWidth, roadBottomWidth) {
    const ctx = this.ctx;

    // Track surface background
    const trackGrad = ctx.createLinearGradient(0, horizonY, 0, this.height);
    trackGrad.addColorStop(0, '#0c101b');
    trackGrad.addColorStop(0.4, '#090d16');
    trackGrad.addColorStop(1, '#05070c');
    ctx.fillStyle = trackGrad;
    ctx.fillRect(0, horizonY, this.width, this.height - horizonY);

    // Main Asphalt Trapezoid
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(roadCenterX - roadTopWidth / 2, horizonY);
    ctx.lineTo(roadCenterX + roadTopWidth / 2, horizonY);
    ctx.lineTo(roadCenterX + roadBottomWidth / 2, this.height);
    ctx.lineTo(roadCenterX - roadBottomWidth / 2, this.height);
    ctx.closePath();

    const asphaltGrad = ctx.createLinearGradient(0, horizonY, 0, this.height);
    asphaltGrad.addColorStop(0, '#101524');
    asphaltGrad.addColorStop(0.7, '#0b0f19');
    asphaltGrad.addColorStop(1, '#070a12');
    ctx.fillStyle = asphaltGrad;
    ctx.fill();
    ctx.restore();

    // Curbs & Rumble Strips (Alternating Neon Cyan & Crimson blocks on road borders)
    const curbSegments = 24;
    for (let i = 0; i < curbSegments; i++) {
      const z1 = Math.pow((i + (this.roadScroll % 1)) / curbSegments, 2.2);
      const z2 = Math.pow((i + 1 + (this.roadScroll % 1)) / curbSegments, 2.2);

      const y1 = horizonY + (this.height - horizonY) * z1;
      const y2 = horizonY + (this.height - horizonY) * z2;

      const w1 = roadTopWidth + (roadBottomWidth - roadTopWidth) * z1;
      const w2 = roadTopWidth + (roadBottomWidth - roadTopWidth) * z2;

      const curbW1 = 12 * z1 + 2;
      const curbW2 = 12 * z2 + 2;

      const isAlternate = (i + Math.floor(this.roadScroll)) % 2 === 0;
      ctx.fillStyle = isAlternate ? 'rgba(0, 229, 255, 0.7)' : 'rgba(255, 23, 68, 0.75)';

      // Left curb
      ctx.beginPath();
      ctx.moveTo(roadCenterX - w1 / 2, y1);
      ctx.lineTo(roadCenterX - w1 / 2 - curbW1, y1);
      ctx.lineTo(roadCenterX - w2 / 2 - curbW2, y2);
      ctx.lineTo(roadCenterX - w2 / 2, y2);
      ctx.closePath();
      ctx.fill();

      // Right curb
      ctx.beginPath();
      ctx.moveTo(roadCenterX + w1 / 2, y1);
      ctx.lineTo(roadCenterX + w1 / 2 + curbW1, y1);
      ctx.lineTo(roadCenterX + w2 / 2 + curbW2, y2);
      ctx.lineTo(roadCenterX + w2 / 2, y2);
      ctx.closePath();
      ctx.fill();
    }

    // Animated Dashed Lane Dividers
    for (let laneIdx = 1; laneIdx < this.totalLanes; laneIdx++) {
      for (let i = 0; i < 18; i++) {
        const segProgress = (i + (this.roadScroll * 1.8 % 1)) / 18;
        if (i % 2 !== 0) continue; // dashed gaps

        const z1 = Math.pow(segProgress, 2.2);
        const z2 = Math.pow(Math.min(1, segProgress + 0.04), 2.2);

        const y1 = horizonY + (this.height - horizonY) * z1;
        const y2 = horizonY + (this.height - horizonY) * z2;

        const w1 = roadTopWidth + (roadBottomWidth - roadTopWidth) * z1;
        const w2 = roadTopWidth + (roadBottomWidth - roadTopWidth) * z2;

        const laneRatio = laneIdx / this.totalLanes;
        const x1 = (roadCenterX - w1 / 2) + w1 * laneRatio;
        const x2 = (roadCenterX - w2 / 2) + w2 * laneRatio;

        const lineWidth = Math.max(1, 4 * z2);

        ctx.save();
        ctx.strokeStyle = `rgba(0, 229, 255, ${0.15 + z1 * 0.65})`;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawSportsCar(car, horizonY, roadCenterX, roadTopWidth, roadBottomWidth) {
    const ctx = this.ctx;
    const { x, y, scale, laneWidth } = car.getScreenPosition(horizonY, roadCenterX, roadTopWidth, roadBottomWidth);

    if (scale <= 0.01) return;

    // Dynamic car dimensional scaling
    const carWidth = Math.max(14, 78 * scale);
    const carHeight = Math.max(8, 38 * scale);
    const bobOffset = Math.sin(car.bobPhase) * (1.2 * scale);

    const carY = y - carHeight + bobOffset;

    // 1. Long high-speed taillight photon trails behind car
    const trailLength = (80 + (car.nitroActive ? 110 : 40)) * scale * this.speedMultiplier;
    const leftLightX = x - carWidth * 0.32;
    const rightLightX = x + carWidth * 0.32;
    const tailY = carY + carHeight * 0.7;

    ctx.save();
    // Left trail
    const trailGradLeft = ctx.createLinearGradient(leftLightX, tailY, leftLightX, tailY - trailLength);
    trailGradLeft.addColorStop(0, car.theme.light);
    trailGradLeft.addColorStop(0.3, car.theme.accent);
    trailGradLeft.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.strokeStyle = trailGradLeft;
    ctx.lineWidth = Math.max(2, 5 * scale);
    ctx.beginPath();
    ctx.moveTo(leftLightX, tailY);
    ctx.lineTo(leftLightX, tailY - trailLength);
    ctx.stroke();

    // Right trail
    const trailGradRight = ctx.createLinearGradient(rightLightX, tailY, rightLightX, tailY - trailLength);
    trailGradRight.addColorStop(0, car.theme.light);
    trailGradRight.addColorStop(0.3, car.theme.accent);
    trailGradRight.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.strokeStyle = trailGradRight;
    ctx.beginPath();
    ctx.moveTo(rightLightX, tailY);
    ctx.lineTo(rightLightX, tailY - trailLength);
    ctx.stroke();
    ctx.restore();

    // 2. Underglow neon beneath the chassis
    ctx.save();
    const underglowGrad = ctx.createRadialGradient(x, carY + carHeight * 0.8, 2, x, carY + carHeight * 0.8, carWidth * 0.85);
    underglowGrad.addColorStop(0, car.theme.accent);
    underglowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = underglowGrad;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x - carWidth, carY + carHeight * 0.4, carWidth * 2, carHeight * 1.2);
    ctx.restore();

    // 3. Nitro twin exhaust flame plumes
    if (car.nitroActive && scale > 0.05) {
      const flameLen = (24 + Math.random() * 18) * scale;
      const flameW = (5 + Math.random() * 3) * scale;

      ctx.save();
      const nitroGrad = ctx.createLinearGradient(0, tailY, 0, tailY + flameLen);
      nitroGrad.addColorStop(0, '#ffffff');
      nitroGrad.addColorStop(0.3, '#00e5ff');
      nitroGrad.addColorStop(0.8, '#ff1744');
      nitroGrad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = nitroGrad;

      // Left exhaust flame
      ctx.beginPath();
      ctx.ellipse(leftLightX + 4 * scale, tailY + flameLen * 0.4, flameW, flameLen * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Right exhaust flame
      ctx.beginPath();
      ctx.ellipse(rightLightX - 4 * scale, tailY + flameLen * 0.4, flameW, flameLen * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // 4. Aerodynamic Hypercar Body Silhouette (Rear perspective)
    ctx.save();
    ctx.fillStyle = '#0a0d14';
    ctx.strokeStyle = car.theme.body;
    ctx.lineWidth = Math.max(1, 2.2 * scale);

    // Main rear bumper & fuselage
    const rw = carWidth;
    const rh = carHeight;
    const rx = x - rw / 2;
    const ry = carY;

    // Body chassis outline
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.15, ry + rh); // bottom left
    ctx.lineTo(rx + rw * 0.05, ry + rh * 0.6); // left wheel arch
    ctx.lineTo(rx + rw * 0.2, ry + rh * 0.35); // left cockpit slope
    ctx.lineTo(rx + rw * 0.3, ry + rh * 0.1); // roof left
    ctx.lineTo(rx + rw * 0.7, ry + rh * 0.1); // roof right
    ctx.lineTo(rx + rw * 0.8, ry + rh * 0.35); // right cockpit slope
    ctx.lineTo(rx + rw * 0.95, ry + rh * 0.6); // right wheel arch
    ctx.lineTo(rx + rw * 0.85, ry + rh); // bottom right
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cockpit Tinted Windshield
    ctx.fillStyle = 'rgba(0, 229, 255, 0.18)';
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.25, ry + rh * 0.35);
    ctx.lineTo(rx + rw * 0.33, ry + rh * 0.14);
    ctx.lineTo(rx + rw * 0.67, ry + rh * 0.14);
    ctx.lineTo(rx + rw * 0.75, ry + rh * 0.35);
    ctx.closePath();
    ctx.fill();

    // GT Wing Spoiler
    ctx.strokeStyle = car.theme.accent;
    ctx.lineWidth = Math.max(1.5, 3.2 * scale);
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.08, ry + rh * 0.2);
    ctx.lineTo(rx + rw * 0.92, ry + rh * 0.2);
    ctx.stroke();

    // High-performance LED Taillight Bars
    ctx.fillStyle = car.theme.light;
    ctx.shadowBlur = 12 * scale;
    ctx.shadowColor = car.theme.light;

    // Left taillight bar
    ctx.fillRect(rx + rw * 0.14, ry + rh * 0.55, rw * 0.26, Math.max(2, 4.5 * scale));
    // Right taillight bar
    ctx.fillRect(rx + rw * 0.6, ry + rh * 0.55, rw * 0.26, Math.max(2, 4.5 * scale));

    // Center diffuser light
    ctx.fillStyle = '#ff1744';
    ctx.fillRect(rx + rw * 0.46, ry + rh * 0.75, rw * 0.08, Math.max(1.5, 3 * scale));

    // Wheels / Tires
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#05070a';
    ctx.fillRect(rx + rw * 0.02, ry + rh * 0.65, rw * 0.12, rh * 0.4);
    ctx.fillRect(rx + rw * 0.86, ry + rh * 0.65, rw * 0.12, rh * 0.4);

    ctx.restore();
  }

  animate(currentTime = 0) {
    if (!this.lastTime) this.lastTime = currentTime;
    const dt = Math.min(0.1, (currentTime - this.lastTime) / 1000);
    this.lastTime = currentTime;

    // Smooth speed interpolation
    this.speedMultiplier += (this.targetSpeedMultiplier - this.speedMultiplier) * (dt * 5);

    // Track scroll rate
    this.roadScroll += this.speedMultiplier * dt * 3.5;

    // Geometry layout: perspective horizon
    const horizonY = this.height * 0.38;
    const roadCenterX = this.width * 0.5;
    const roadTopWidth = this.width * 0.16;
    const roadBottomWidth = this.width * 1.35;

    // 1. Render Sky, Stadium searchlights & Horizon
    this.drawSkyAndHorizon(horizonY);

    // 2. Render 3D Perspective Speedway Track, Curbs & Lanes
    this.drawSpeedwayRoad(horizonY, roadCenterX, roadTopWidth, roadBottomWidth);

    // 3. Update & Sort Sports Cars by Depth (Draw distant cars first, closer cars in front)
    for (let car of this.cars) {
      car.update(dt, this.speedMultiplier, this.width, this.height);
    }
    const sortedCars = [...this.cars].sort((a, b) => a.z - b.z);

    // 4. Render Sports Cars with Light Trails & Nitro
    for (let car of sortedCars) {
      this.drawSportsCar(car, horizonY, roadCenterX, roadTopWidth, roadBottomWidth);
    }

    // 5. Subtle Vignette overlay to keep UI text ultra crisp & high contrast
    const vignette = this.ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.5,
      this.height * 0.4,
      this.width * 0.5,
      this.height * 0.5,
      this.width * 0.85
    );
    vignette.addColorStop(0, 'rgba(4, 7, 12, 0.35)');
    vignette.addColorStop(0.7, 'rgba(4, 7, 12, 0.72)');
    vignette.addColorStop(1, 'rgba(3, 5, 8, 0.94)');
    this.ctx.fillStyle = vignette;
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.animationFrameId = requestAnimationFrame((t) => this.animate(t));
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
}

export function initCanvasBackground(canvasId) {
  return new RacingCanvasBackground(canvasId);
}
