/* ============================================================
   La Course à la Viralité — moteur de jeu (Canvas 2D, vanilla)
   Endless runner type Jetpack Joyride.
   - Maintenir (clic / doigt / Espace) = poussée vers le haut.
   - Attraper ❤️/🧑 (followers+), éviter 🐛/😡/💢 (followers-), 🔥 = tendance x2.
   - Temps écoulé -> score figé = followers = XP.
   Repère logique fixe : 1000 x 600 px (mis à l'échelle via le contexte).
   ============================================================ */
(() => {
'use strict';

// ---------- Repère logique ----------
const LOGW = 1000, LOGH = 600;
const PLAYER_X = 235;          // l'avatar reste à gauche, le monde défile
const CEIL_Y = 30;             // plafond jouable
const FLOOR_Y = LOGH - 54;     // sol jouable (au-dessus de la bande de rue)

// ---------- Configuration des deux parcours ----------
// Physique identique (mêmes sensations) ; on fait varier vitesse, densité,
// pénalités et récompenses pour distinguer « découverte » et « maîtrise ».
const PARCOURS = {
  1: {
    id: 1, name: 'Découverte', label: 'P1 · Découverte', guided: true,
    duration: 60,
    baseSpeed: 285, speedRampFrac: 0.30,      // +30 % de vitesse en fin de manche
    gravity: 1850, thrust: 3450, vMax: 760,
    good: [0.62, 0.98], bad: [1.75, 2.7], trend: [10, 15], badRampFrac: 0.30,
    penaltyMult: 0.5, rewardMult: 1.0, trendDuration: 6.0,
  },
  2: {
    id: 2, name: 'Maîtrise', label: 'P2 · Maîtrise', guided: false,
    duration: 60,
    baseSpeed: 370, speedRampFrac: 0.42,
    gravity: 1950, thrust: 3550, vMax: 800,
    good: [0.5, 0.8], bad: [1.0, 1.65], trend: [12, 18], badRampFrac: 0.42,
    penaltyMult: 1.0, rewardMult: 1.2, trendDuration: 4.5,
  },
};

// ---------- Tables d'objets ----------
const GOOD = [
  { type: 'like',     emoji: '❤️', value: 1, r: 19, weight: 72 },
  { type: 'follower', emoji: '🧑', value: 3, r: 23, weight: 28 },
];
const BAD = [
  { type: 'bug',  emoji: '🐛', penalty: 2, r: 23, weight: 46 },
  { type: 'hate', emoji: '😡', penalty: 3, r: 25, weight: 34 },
  { type: 'buzz', emoji: '💢', penalty: 5, r: 29, weight: 20 },
];
const TREND = { type: 'trend', emoji: '🔥', r: 25 };

// ---------- DOM ----------
const $ = (s) => document.querySelector(s);
let canvas, ctx, baseSX = 1, baseSY = 1;
const dom = {};

// ---------- État de jeu ----------
let state = 'menu';            // menu | countdown | playing | gameover
let cfg = null;
let player, collectibles, obstacles, particles, popups, bgFar, bgNear;
let followers, followersShown, likesRun, timeLeft, elapsed, worldSpeed;
let trendTimer, comboFx;
let spawnGoodT, spawnBadT, spawnTrendT;
let shake, flashGood, flashBad, hintT, countdownT, streetOffset;
let bestKey, isNewBest;
let lastT = 0;
const input = { down: false };

// ---------- Audio (Web Audio, créé au 1er geste) ----------
let actx = null;
let muted = localStorage.getItem('viral_muted') === '1';

function ensureAudio() {
  if (actx || muted) return;
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
}
function beep(freq, dur, type = 'sine', gain = 0.06, slideTo = null) {
  if (!actx || muted) return;
  const t = actx.currentTime;
  const osc = actx.createOscillator();
  const g = actx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(actx.destination);
  osc.start(t); osc.stop(t + dur + 0.02);
}
const sfx = {
  like:    () => beep(680, 0.12, 'triangle', 0.05, 1020),
  follow:  () => { beep(620, 0.1, 'triangle', 0.05, 920); setTimeout(() => beep(940, 0.12, 'triangle', 0.05, 1240), 70); },
  hit:     () => beep(150, 0.22, 'square', 0.07, 70),
  trend:   () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.14, 'sawtooth', 0.045), i * 70)); },
  go:      () => beep(880, 0.16, 'triangle', 0.05, 1320),
  over:    () => { [784, 587, 440].forEach((f, i) => setTimeout(() => beep(f, 0.22, 'sine', 0.05), i * 130)); },
};

// ---------- Utilitaires ----------
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
function weighted(list) {
  let total = 0; for (const it of list) total += it.weight;
  let r = Math.random() * total;
  for (const it of list) { r -= it.weight; if (r <= 0) return it; }
  return list[list.length - 1];
}

// ============================================================
//  Initialisation
// ============================================================
function init() {
  canvas = $('#game');
  ctx = canvas.getContext('2d');
  dom.menu = $('#screen-menu');
  dom.over = $('#screen-gameover');
  dom.hud = $('#hud');
  dom.followers = $('#hud-followers');
  dom.likes = $('#hud-likes');
  dom.time = $('#hud-time');
  dom.timer = $('#hud-timer');
  dom.statFollowers = $('.stat-followers');
  dom.statLikes = $('.stat-likes');
  dom.trendBanner = $('#trend-banner');
  dom.mute = $('#mute-btn');

  refreshBestLabels();
  updateMuteBtn();

  window.addEventListener('resize', resize);
  resize();

  // Sélection de parcours
  document.querySelectorAll('.card').forEach((c) =>
    c.addEventListener('click', () => startGame(parseInt(c.dataset.parcours, 10))));

  $('#btn-replay').addEventListener('click', () => startGame(cfg ? cfg.id : 1));
  $('#btn-menu').addEventListener('click', showMenu);

  // Son
  dom.mute.addEventListener('click', (e) => { e.stopPropagation(); toggleMute(); });

  // Commande unique : maintenir pour monter
  const press = () => { ensureAudio(); input.down = true; };
  const release = () => { input.down = false; };
  canvas.addEventListener('pointerdown', press);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); press(); }
    else if (e.code === 'KeyM') toggleMute();
    else if (e.code === 'Enter' && state === 'gameover') startGame(cfg ? cfg.id : 1);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') release();
  });

  // Pause de sécurité quand l'onglet perd le focus
  document.addEventListener('visibilitychange', () => { if (document.hidden) input.down = false; });

  requestAnimationFrame(loop);
}

function resize() {
  const root = $('#game-root');
  const maxW = root.clientWidth, maxH = root.clientHeight;
  const aspect = LOGW / LOGH;
  let w = maxW, h = w / aspect;
  if (h > maxH) { h = maxH; w = h * aspect; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  baseSX = canvas.width / LOGW;
  baseSY = canvas.height / LOGH;
}

// ============================================================
//  Cycle de partie
// ============================================================
function showMenu() {
  state = 'menu';
  input.down = false;
  dom.menu.classList.remove('hidden');
  dom.over.classList.add('hidden');
  dom.hud.classList.add('hidden');
  refreshBestLabels();
}

function startGame(id) {
  cfg = PARCOURS[id];
  bestKey = 'viral_best_' + id;
  followers = 0; followersShown = 0; likesRun = 0;
  timeLeft = cfg.duration; elapsed = 0;
  worldSpeed = cfg.baseSpeed;
  trendTimer = 0; comboFx = 0;
  shake = 0; flashGood = 0; flashBad = 0; streetOffset = 0;
  isNewBest = false;
  collectibles = []; obstacles = []; particles = []; popups = [];
  player = { x: PLAYER_X, y: LOGH * 0.5, vy: 0, r: 22, tilt: 0, trail: [] };
  buildSkyline();
  // Délais de spawn (le 1er bon objet arrive vite pour amorcer)
  spawnGoodT = 0.5; spawnBadT = cfg.bad[1]; spawnTrendT = rand(cfg.trend[0], cfg.trend[1]);
  hintT = cfg.guided ? 0 : -1;     // -1 = pas de tuto
  countdownT = 3.0;

  dom.menu.classList.add('hidden');
  dom.over.classList.add('hidden');
  dom.hud.classList.remove('hidden');
  dom.trendBanner.classList.add('hidden');
  syncHud();
  state = 'countdown';
}

function gameOver() {
  state = 'gameover';
  input.down = false;
  sfx.over();
  const best = parseInt(localStorage.getItem(bestKey) || '0', 10);
  if (followers > best) { localStorage.setItem(bestKey, String(followers)); isNewBest = true; }
  const shownBest = Math.max(best, followers);

  $('#over-likes').textContent = likesRun;
  $('#over-best').textContent = shownBest;
  $('#over-parcours').textContent = cfg.id;
  $('#over-rank').innerHTML = rankFor(followers);
  $('#over-newbest').classList.toggle('hidden', !isNewBest);

  // Compteur animé du score final
  const el = $('#over-score');
  const target = followers;
  const t0 = performance.now();
  const dur = 1100;
  (function tick(now) {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(target * e);
    if (k < 1) requestAnimationFrame(tick);
  })(t0);

  dom.hud.classList.add('hidden');
  dom.over.classList.remove('hidden');
}

function rankFor(n) {
  if (n >= 700) return '🚀🔥 <b>VIRAL</b> — la ville entière partage tes posts !';
  if (n >= 350) return '🌟 <b>Star montante</b> — tu squattes les recommandations.';
  if (n >= 150) return '📈 <b>Créateur·rice en montée</b> — l\'algo t\'a repéré·e.';
  if (n >= 50)  return '🌱 <b>Micro-buzz</b> — ça commence à frémir.';
  return '👻 <b>Fantôme du web</b> — retente ta chance !';
}

// ============================================================
//  Boucle principale
// ============================================================
function loop(t) {
  const dt = Math.min((t - lastT) / 1000 || 0, 0.05);
  lastT = t;

  if (state === 'countdown') {
    countdownT -= dt;
    updateBackground(dt, cfg.baseSpeed * 0.4);
    if (countdownT <= 0) { state = 'playing'; sfx.go(); addPopup(player.x, player.y - 40, 'GO !', '#34e7e4', 1.4); }
  } else if (state === 'playing') {
    update(dt);
  } else {
    updateBackground(dt, 60);    // léger défilement décoratif au menu / game over
  }

  render();
  requestAnimationFrame(loop);
}

// ============================================================
//  Mise à jour (playing)
// ============================================================
function update(dt) {
  elapsed += dt;
  timeLeft -= dt;
  if (timeLeft <= 0) { timeLeft = 0; syncHud(); gameOver(); return; }

  if (trendTimer > 0) { trendTimer -= dt; if (trendTimer <= 0) { trendTimer = 0; dom.trendBanner.classList.add('hidden'); } }

  // Vitesse du monde : rampe de difficulté + boost tendance
  const ramp = 1 + cfg.speedRampFrac * (elapsed / cfg.duration);
  worldSpeed = cfg.baseSpeed * ramp * (trendTimer > 0 ? 1.5 : 1);
  const mult = trendTimer > 0 ? 2 : 1;

  updateBackground(dt, worldSpeed);

  // --- Physique avatar ---
  if (input.down) player.vy -= cfg.thrust * dt;
  player.vy += cfg.gravity * dt;
  player.vy = clamp(player.vy, -cfg.vMax, cfg.vMax);
  player.y += player.vy * dt;
  if (player.y < CEIL_Y + player.r) { player.y = CEIL_Y + player.r; player.vy = Math.max(player.vy, 0); }
  if (player.y > FLOOR_Y - player.r) { player.y = FLOOR_Y - player.r; player.vy = Math.min(player.vy, 0); }
  player.tilt = clamp(player.vy / cfg.vMax, -1, 1);

  // Traînée
  player.trail.unshift({ x: player.x - 16, y: player.y + 14 });
  if (player.trail.length > 12) player.trail.pop();
  // Particules de réacteur quand on pousse
  if (input.down && Math.random() < 0.9) {
    const c = trendTimer > 0 ? pickColor(['#ffd23f', '#ff3d8b', '#34e7e4']) : pickColor(['#ff77ae', '#ff3d8b', '#ffb38a']);
    particles.push({ x: player.x - 14, y: player.y + 20, vx: rand(-40, 10), vy: rand(60, 180), life: rand(0.3, 0.6), max: 0.6, r: rand(3, 6), c, glow: true });
  }

  // --- Spawns ---
  spawnGoodT -= dt; spawnBadT -= dt; spawnTrendT -= dt;
  if (spawnGoodT <= 0) { spawnGood(); spawnGoodT = rand(cfg.good[0], cfg.good[1]); }
  if (spawnBadT <= 0) {
    spawnBad();
    const badRamp = 1 - cfg.badRampFrac * (elapsed / cfg.duration);
    spawnBadT = rand(cfg.bad[0], cfg.bad[1]) * Math.max(0.55, badRamp);
  }
  if (spawnTrendT <= 0) { spawnTrend(); spawnTrendT = rand(cfg.trend[0], cfg.trend[1]); }

  // --- Déplacement + collisions : bons objets ---
  for (let i = collectibles.length - 1; i >= 0; i--) {
    const o = collectibles[i];
    o.x -= worldSpeed * dt;
    o.bob += dt * 4;
    // Aimant doux vers l'avatar (récolte agréable)
    const dx = player.x - o.x, dy = player.y - o.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 115) { const f = (1 - d / 115) * 240 * dt; o.x += dx / d * f; o.y += dy / d * f; }

    if (d < player.r + o.r) {
      collectibles.splice(i, 1);
      if (o.type === 'trend') {
        trendTimer = cfg.trendDuration;
        dom.trendBanner.classList.remove('hidden');
        sfx.trend(); shake = Math.max(shake, 8); comboFx = 1;
        burst(o.x, o.y, 26, ['#ffd23f', '#ff3d8b', '#34e7e4'], 260);
        addPopup(o.x, o.y, 'TENDANCE ×2 !', '#ffd23f', 1.3);
      } else {
        const gain = Math.max(1, Math.round(o.value * mult * cfg.rewardMult));
        followers += gain;
        if (o.type === 'like') likesRun++;
        o.type === 'follower' ? sfx.follow() : sfx.like();
        burst(o.x, o.y, o.type === 'follower' ? 14 : 9, ['#ff77ae', '#ff3d8b', '#fff'], 170);
        addPopup(o.x, o.y, '+' + gain, '#42e6a4', o.type === 'follower' ? 1.1 : 0.95);
        flashGood = 0.18; bumpStat(dom.statFollowers);
      }
      syncHud();
    } else if (o.x < -60) {
      collectibles.splice(i, 1);
    }
  }

  // --- Déplacement + collisions : obstacles ---
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.x -= worldSpeed * dt;
    o.bob += dt * 3;
    const d = Math.hypot(player.x - o.x, player.y - o.y);
    if (d < player.r + o.r * 0.82) {   // hitbox un peu indulgente
      obstacles.splice(i, 1);
      const dmg = Math.max(1, Math.round(o.penalty * cfg.penaltyMult));
      followers = Math.max(0, followers - dmg);
      sfx.hit(); shake = Math.max(shake, 12); flashBad = 0.32;
      burst(o.x, o.y, 16, ['#ff5470', '#8a8a9a', '#3a2a4a'], 200);
      addPopup(o.x, o.y, '-' + dmg, '#ff5470', 1.1);
      bumpStat(dom.statFollowers, true);
      syncHud();
    } else if (o.x < -70) {
      obstacles.splice(i, 1);
    }
  }

  // --- Particules & popups ---
  updateParticles(dt);
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.y -= 46 * dt; p.life -= dt;
    if (p.life <= 0) popups.splice(i, 1);
  }

  if (shake > 0) shake = Math.max(0, shake - 30 * dt);
  if (flashGood > 0) flashGood = Math.max(0, flashGood - dt);
  if (flashBad > 0) flashBad = Math.max(0, flashBad - dt);
  if (comboFx > 0) comboFx = Math.max(0, comboFx - dt);
  if (hintT >= 0) hintT += dt;

  // Affichage lissé du compteur de followers
  followersShown = lerp(followersShown, followers, 1 - Math.pow(0.001, dt));
  dom.followers.textContent = Math.round(followersShown);
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += 320 * dt; p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  if (particles.length > 360) particles.splice(0, particles.length - 360);
}

// ---------- Spawns ----------
function spawnGood() {
  const def = weighted(GOOD);
  const x0 = LOGW + 50;
  // Quelques motifs pour un rendu « designé »
  const pattern = def.type === 'follower' ? 'single' : ['single', 'line', 'arc', 'cluster'][randInt(0, 3)];
  if (pattern === 'single') {
    addCollectible(def, x0, rand(CEIL_Y + 60, FLOOR_Y - 60));
  } else if (pattern === 'line') {
    const y = rand(CEIL_Y + 70, FLOOR_Y - 70);
    for (let k = 0; k < randInt(4, 6); k++) addCollectible(def, x0 + k * 54, y);
  } else if (pattern === 'arc') {
    const cy = rand(LOGH * 0.35, LOGH * 0.62), amp = rand(70, 120), n = 6;
    for (let k = 0; k < n; k++) addCollectible(def, x0 + k * 52, cy - Math.sin((k / (n - 1)) * Math.PI) * amp);
  } else { // cluster
    const cx = x0, cy = rand(CEIL_Y + 90, FLOOR_Y - 90);
    for (let k = 0; k < 5; k++) addCollectible(def, cx + rand(-34, 34), cy + rand(-34, 34));
  }
}
function addCollectible(def, x, y) {
  collectibles.push({ ...def, x, y: clamp(y, CEIL_Y + 40, FLOOR_Y - 40), bob: rand(0, 6.28) });
}
function spawnBad() {
  const def = weighted(BAD);
  obstacles.push({ ...def, x: LOGW + 60, y: rand(CEIL_Y + 55, FLOOR_Y - 55), bob: rand(0, 6.28) });
}
function spawnTrend() {
  collectibles.push({ ...TREND, value: 0, x: LOGW + 60, y: rand(CEIL_Y + 80, FLOOR_Y - 80), bob: rand(0, 6.28) });
}

// ---------- Effets ----------
function burst(x, y, n, colors, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = rand(speed * 0.3, speed);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: rand(0.4, 0.9), max: 0.9, r: rand(2.5, 6), c: pickColor(colors), glow: true });
  }
}
function addPopup(x, y, text, color, scale = 1) { popups.push({ x, y, text, color, life: 0.9, scale }); }
const pickColor = (arr) => arr[randInt(0, arr.length - 1)];

function bumpStat(el, isHit) {
  el.classList.remove('bump', 'hit');
  void el.offsetWidth;                 // reflow pour relancer l'anim
  el.classList.add(isHit ? 'hit' : 'bump');
}

// ============================================================
//  Décor (parallaxe ville numérique)
// ============================================================
function buildSkyline() {
  bgFar = []; bgNear = [];
  let x = 0;
  while (x < LOGW + 260) { const w = rand(70, 130), h = rand(90, 220); bgFar.push({ x, w, h, hue: rand(250, 280) }); x += w + rand(8, 26); }
  x = 0;
  while (x < LOGW + 260) { const w = rand(54, 104), h = rand(150, 320); bgNear.push({ x, w, h, hue: rand(300, 340), win: makeWindows(w, h) }); x += w + rand(10, 30); }
}
function makeWindows(w, h) {
  const arr = [];
  for (let yy = 20; yy < h - 14; yy += 20)
    for (let xx = 8; xx < w - 10; xx += 16)
      if (Math.random() < 0.55) arr.push({ x: xx, y: yy, on: Math.random() < 0.6 });
  return arr;
}
function updateBackground(dt, speed) {
  if (!bgFar) buildSkyline();
  streetOffset = (streetOffset + speed * dt) % 80;
  const recycle = (arr, factor, gapMin, gapMax) => {
    for (const b of arr) b.x -= speed * factor * dt;
    while (arr.length && arr[0].x + arr[0].w < -10) {
      const removed = arr.shift();
      const last = arr[arr.length - 1];
      removed.x = last.x + last.w + rand(gapMin, gapMax);
      if (removed.win) removed.win = makeWindows(removed.w, removed.h);
      arr.push(removed);
    }
  };
  recycle(bgFar, 0.18, 8, 26);
  recycle(bgNear, 0.4, 10, 30);
}

// ============================================================
//  Rendu
// ============================================================
function render() {
  ctx.setTransform(baseSX, 0, 0, baseSY, 0, 0);
  ctx.clearRect(0, 0, LOGW, LOGH);

  // Tremblement d'écran
  let sx = 0, sy = 0;
  if (shake > 0) { sx = rand(-shake, shake); sy = rand(-shake, shake); }
  ctx.save();
  ctx.translate(sx, sy);

  drawSky();
  drawSkyline();
  drawStreet();

  if (state !== 'menu') {
    drawCollectibles();
    drawObstacles();
    drawParticles();
    drawPlayer();
    drawPopups();
  }

  // Voiles d'effet (bon / mauvais / tendance)
  if (flashGood > 0) { ctx.fillStyle = `rgba(66,230,164,${flashGood * 0.5})`; ctx.fillRect(0, 0, LOGW, LOGH); }
  if (flashBad > 0)  { ctx.fillStyle = `rgba(255,84,112,${flashBad})`; ctx.fillRect(0, 0, LOGW, LOGH); }
  if (trendTimer > 0) drawTrendOverlay();

  ctx.restore();

  if (state === 'countdown') drawCountdown();
  if (state === 'playing' && cfg.guided && hintT >= 0) drawHints();
}

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, LOGH);
  if (trendTimer > 0) { g.addColorStop(0, '#3a1140'); g.addColorStop(.5, '#27123f'); g.addColorStop(1, '#140a26'); }
  else { g.addColorStop(0, '#241046'); g.addColorStop(.55, '#190f33'); g.addColorStop(1, '#0d0720'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, LOGW, LOGH);
  // Halo lumineux
  const r = ctx.createRadialGradient(LOGW * 0.78, 80, 20, LOGW * 0.78, 80, 420);
  r.addColorStop(0, 'rgba(255,61,139,.18)'); r.addColorStop(1, 'rgba(255,61,139,0)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, LOGW, LOGH);
}

function drawSkyline() {
  for (const b of bgFar) {
    ctx.fillStyle = `hsla(${b.hue},45%,22%,.85)`;
    ctx.fillRect(b.x, FLOOR_Y - b.h, b.w, b.h);
  }
  for (const b of bgNear) {
    ctx.fillStyle = `hsla(${b.hue},38%,15%,.95)`;
    ctx.fillRect(b.x, FLOOR_Y - b.h, b.w, b.h);
    // fenêtres allumées
    for (const w of b.win) {
      if (!w.on) continue;
      ctx.fillStyle = Math.random() < 0.985 ? 'rgba(255,210,120,.75)' : 'rgba(52,231,228,.8)';
      ctx.fillRect(b.x + w.x, FLOOR_Y - b.h + w.y, 7, 9);
    }
  }
}

function drawStreet() {
  ctx.fillStyle = '#0a0617';
  ctx.fillRect(0, FLOOR_Y, LOGW, LOGH - FLOOR_Y);
  ctx.strokeStyle = 'rgba(138,75,255,.55)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, FLOOR_Y + 1.5); ctx.lineTo(LOGW, FLOOR_Y + 1.5); ctx.stroke();
  // marquage en mouvement
  ctx.fillStyle = 'rgba(255,61,139,.5)';
  for (let x = -streetOffset; x < LOGW; x += 80) ctx.fillRect(x, FLOOR_Y + 18, 40, 4);
}

function emoji(em, x, y, size) {
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(em, x, y);
}

function drawCollectibles() {
  for (const o of collectibles) {
    const yy = o.y + Math.sin(o.bob) * 4;
    if (o.type === 'trend') {
      const pulse = 1 + Math.sin(o.bob * 1.5) * 0.12;
      ctx.save(); ctx.globalAlpha = 0.5;
      const g = ctx.createRadialGradient(o.x, yy, 4, o.x, yy, o.r * 2.4);
      g.addColorStop(0, 'rgba(255,210,63,.9)'); g.addColorStop(1, 'rgba(255,61,139,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, yy, o.r * 2.4, 0, 7); ctx.fill();
      ctx.restore();
      emoji(o.emoji, o.x, yy, o.r * 2.1 * pulse);
    } else {
      ctx.save(); ctx.globalAlpha = 0.35;
      ctx.fillStyle = o.type === 'follower' ? 'rgba(52,231,228,.5)' : 'rgba(255,119,174,.5)';
      ctx.beginPath(); ctx.arc(o.x, yy, o.r * 1.5, 0, 7); ctx.fill();
      ctx.restore();
      emoji(o.emoji, o.x, yy, o.r * 1.9);
    }
  }
}

function drawObstacles() {
  for (const o of obstacles) {
    const yy = o.y + Math.sin(o.bob) * 3;
    ctx.save(); ctx.globalAlpha = 0.4;
    const g = ctx.createRadialGradient(o.x, yy, 3, o.x, yy, o.r * 1.7);
    g.addColorStop(0, 'rgba(255,84,112,.7)'); g.addColorStop(1, 'rgba(255,84,112,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, yy, o.r * 1.7, 0, 7); ctx.fill();
    ctx.restore();
    emoji(o.emoji, o.x, yy, o.r * 1.95);
  }
}

function drawParticles() {
  for (const p of particles) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = a;
    if (p.glow) { ctx.shadowColor = p.c; ctx.shadowBlur = 8; }
    ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  // Traînée
  for (let i = 0; i < player.trail.length; i++) {
    const t = player.trail[i], a = (1 - i / player.trail.length) * 0.25;
    ctx.globalAlpha = a; ctx.fillStyle = trendTimer > 0 ? '#ffd23f' : '#ff77ae';
    ctx.beginPath(); ctx.arc(t.x, t.y, 7 - i * 0.4, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.tilt * 0.32);

  // Flamme du réacteur (sous l'avatar)
  const flame = (input.down ? 1 : 0.45) * (1 + Math.sin(elapsed * 40) * 0.12);
  const fl = 26 * flame + 10;
  const fg = ctx.createLinearGradient(0, 22, 0, 22 + fl);
  fg.addColorStop(0, trendTimer > 0 ? '#fff2b0' : '#fff0a0');
  fg.addColorStop(.5, trendTimer > 0 ? '#ffd23f' : '#ff77ae');
  fg.addColorStop(1, 'rgba(255,61,139,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(-11, 22); ctx.quadraticCurveTo(0, 22 + fl * 1.5, 11, 22); ctx.closePath(); ctx.fill();

  // Corps « smartphone »
  const bw = 40, bh = 62, rad = 12;
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#16101f';
  roundRect(-bw / 2, -bh / 2, bw, bh, rad); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  // contour néon
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = trendTimer > 0 ? '#ffd23f' : '#34e7e4';
  roundRect(-bw / 2, -bh / 2, bw, bh, rad); ctx.stroke();

  // Écran
  const sg = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
  sg.addColorStop(0, '#241544'); sg.addColorStop(1, '#3a1a55');
  ctx.fillStyle = sg;
  roundRect(-bw / 2 + 5, -bh / 2 + 7, bw - 10, bh - 14, 8); ctx.fill();

  // Visage (réagit à la poussée)
  ctx.fillStyle = '#fff';
  const eyeY = -6, eyeR = input.down ? 5 : 4;
  ctx.beginPath(); ctx.arc(-8, eyeY, eyeR, 0, 7); ctx.arc(8, eyeY, eyeR, 0, 7); ctx.fill();
  ctx.fillStyle = '#16101f';
  ctx.beginPath(); ctx.arc(-8 + player.tilt * 1.5, eyeY, 2, 0, 7); ctx.arc(8 + player.tilt * 1.5, eyeY, 2, 0, 7); ctx.fill();
  // sourire
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 6, 8, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();

  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawPopups() {
  for (const p of popups) {
    const a = clamp(p.life / 0.9, 0, 1);
    ctx.globalAlpha = a;
    ctx.font = `900 ${Math.round(26 * p.scale)}px "Outfit",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

function drawTrendOverlay() {
  // teinte chaude + lignes de vitesse
  ctx.fillStyle = 'rgba(255,150,40,.06)'; ctx.fillRect(0, 0, LOGW, LOGH);
  ctx.strokeStyle = 'rgba(255,210,63,.22)'; ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const y = (elapsed * 900 + i * 120) % (LOGH + 200) - 100;
    ctx.beginPath(); ctx.moveTo(LOGW, y); ctx.lineTo(LOGW - 140, y + 26); ctx.stroke();
  }
}

function drawCountdown() {
  ctx.fillStyle = 'rgba(8,4,18,.45)'; ctx.fillRect(0, 0, LOGW, LOGH);
  const n = Math.ceil(countdownT);
  const frac = countdownT - (n - 1);            // 1 -> 0 sur chaque seconde
  const scale = 0.7 + (1 - frac) * 0.6;
  ctx.save();
  ctx.translate(LOGW / 2, LOGH / 2 - 10);
  ctx.scale(scale, scale);
  ctx.globalAlpha = clamp(frac * 1.4, 0, 1);
  ctx.font = '900 160px "Outfit",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#34e7e4'; ctx.shadowColor = '#ff3d8b'; ctx.shadowBlur = 30;
  ctx.fillText(n, 0, 0);
  ctx.restore();
  ctx.shadowBlur = 0;

  ctx.globalAlpha = 1;
  ctx.font = '700 26px "Outfit",sans-serif';
  ctx.fillStyle = '#f4f0ff'; ctx.textAlign = 'center';
  ctx.fillText(cfg.label + ' — prépare-toi à devenir viral !', LOGW / 2, LOGH - 70);
}

function drawHints() {
  // Tuto guidé (parcours 1) : 3 messages enchaînés au début
  let msg = null, fade = 1;
  const seg = (a, b, text) => { if (hintT >= a && hintT < b) { msg = text; const k = hintT - a; fade = clamp(Math.min(k, (b - a) - k) * 2.2, 0, 1); } };
  seg(0.3, 3.6, 'Maintiens le clic / l\'espace pour t\'envoler 🚀');
  seg(3.6, 7.0, 'Attrape les ❤️ et les 🧑 → des followers !');
  seg(7.0, 10.5, 'Évite 🐛 😡 💢 … et fonce sur 🔥 pour le ×2 !');
  if (!msg) return;
  ctx.globalAlpha = fade;
  ctx.font = '800 25px "Outfit",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(msg).width + 44;
  ctx.fillStyle = 'rgba(12,7,24,.72)';
  roundRect(LOGW / 2 - w / 2, LOGH - 116, w, 46, 14); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(msg, LOGW / 2, LOGH - 93);
  ctx.globalAlpha = 1;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ============================================================
//  HUD / divers
// ============================================================
function syncHud() {
  dom.likes.textContent = likesRun;
  dom.time.textContent = Math.ceil(timeLeft);
  dom.timer.classList.toggle('urgent', timeLeft <= 10 && state === 'playing');
}
function refreshBestLabels() {
  document.querySelectorAll('[data-best]').forEach((el) => {
    el.textContent = localStorage.getItem('viral_best_' + el.dataset.best) || '0';
  });
}
function toggleMute() {
  muted = !muted;
  localStorage.setItem('viral_muted', muted ? '1' : '0');
  if (!muted) ensureAudio();
  updateMuteBtn();
}
function updateMuteBtn() { dom.mute.textContent = muted ? '🔇' : '🔊'; }

// ---------- Go ----------
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
