// Sable Yard: a round-based tactical FPS. Boot and the one loop: a fixed 60 Hz
// simulation feeding a render at the display's rate. All mutable match state lives
// in one `match` object; the modules own their own pieces (player, bots, weapon,
// objective, effects, HUD) and main.js is the only place that wires them together.
//
// The match: Vanguard (the player plus four bots) attack, Rustjackals (five bots)
// defend. Rounds are won by eliminating the other team, by the planted charge
// exploding, or by defusing it; the clock going out with no plant hands the round
// to the defenders. First to 5 rounds takes the match. Money is earned per round
// and per kill and spent in the buy menu during freeze time.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITES, SPAWNS } from './world.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, BUY_ITEMS } from './weapons.js';
import { createBots } from './bots.js';
import { createObjective } from './objective.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const ROUND_TIME = 100;
const BUY_TIME = 12;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const objective = createObjective(scene);
const effects = createEffects(scene);
const audio = createAudio();
const weapon = createWeapon(camera);
const player = createPlayer(world.colliders, SPAWNS.vanguard[1]);
const input = createInput(renderer.domElement, onLockChange);
const bots = createBots(scene, world, random);
const hud = createHud({ onBuy: buyItem });

// One place for match state: rounds, money, the charge, grenades in flight.
const match = {
  phase: 'buy', // buy | live | roundEnd | matchEnd
  round: 1,
  wins: { vanguard: 0, rustjackal: 0 },
  lossStreak: 0,
  money: 800,
  health: 100,
  armor: false,
  frags: 0,
  smokes: 0,
  primary: 'pistol',
  hasPrimary: false,
  carrying: true, // the player carries the charge until it is planted or dropped
  plantProgress: 0,
  timeLeft: BUY_TIME,
  site: 'A',
  started: false,
  frozen: false,
  elapsed: 0,
};

const raycaster = new THREE.Raycaster();
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const hitPoint = new THREE.Vector3();
const grenades = [];
const smokeZones = [];
let kills = 0;
let deaths = 0;
let accumulator = 0;
let lastTime = performance.now();
let roundEndAt = 0;

// The player, as a target the enemy bots can see and shoot.
const playerProxy = {
  position: player.state.position, alive: true, isPlayer: true, name: 'You', team: 'vanguard',
};
const vanguardBots = [];
const rustjackalBots = [];
for (let i = 0; i < 4; i += 1) vanguardBots.push(bots.makeBot('vanguard', i, SPAWNS.vanguard[i === 0 ? 0 : i + 1] ?? SPAWNS.vanguard[0]));
for (let i = 0; i < 5; i += 1) rustjackalBots.push(bots.makeBot('rustjackal', i, SPAWNS.rustjackal[i]));
const vanguardSide = [playerProxy, ...vanguardBots];
const enemyMeshes = [];
for (const bot of rustjackalBots) enemyMeshes.push(bot.torso, bot.head);
const shootables = world.shootables.concat(enemyMeshes);

const ctx = {
  vanguard: vanguardSide,
  rustjackal: rustjackalBots,
  bomb: objective.state,
  onBotShot,
  onPlanted,
  onDefused,
};

function onPlanted(bot, site) {
  objective.plant(site);
  hud.setBomb(`Charge planted at ${site} — defend it`);
  hud.showBanner(`Charge planted at ${site}`);
  hud.killfeed(`${bot.name} planted the charge at ${site}`);
  audio.plantDone();
  for (const enemy of rustjackalBots) {
    if (enemy.alive) {
      enemy.path = null;
      enemy.holdNode = undefined;
    }
  }
  for (const friend of vanguardBots) {
    if (friend.alive) friend.path = null;
  }
  match.carrying = false;
}

function onDefused(bot) {
  hud.killfeed(`${bot.name} defused the charge`);
  endRound('rustjackal', 'Charge defused — Rustjackals take the round');
}

function buyItem(id) {
  if (match.phase !== 'buy') return;
  const item = BUY_ITEMS.find((entry) => entry.id === id);
  if (!item || match.money < item.price) return;
  if (WEAPONS[id]) {
    match.primary = id;
    match.hasPrimary = true;
    weapon.equip(id);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name);
  } else if (id === 'frag') match.frags += 1;
  else if (id === 'smoke') match.smokes += 1;
  else if (id === 'armor') match.armor = true;
  match.money -= item.price;
  hud.setMoney(match.money);
  audio.buy();
}

function startRound() {
  objective.reset();
  match.site = random() < 0.5 ? 'A' : 'B';
  match.phase = 'buy';
  match.timeLeft = BUY_TIME;
  match.carrying = true;
  match.plantProgress = 0;
  match.health = 100;
  playerProxy.alive = true;
  player.reset(SPAWNS.vanguard[1]);
  bots.reset(SPAWNS);
  bots.assignRoundJobs(vanguardBots, rustjackalBots, match.site);
  weapon.refill();
  if (match.hasPrimary) weapon.equip(match.primary);
  else weapon.equip('pistol');
  hud.setHealth(match.health);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name);
  hud.setMoney(match.money);
  hud.setScore(match.wins.vanguard, match.wins.rustjackal);
  hud.setBomb('You carry the charge — plant it at A or B (hold E)');
  hud.setProgress(null, 0);
  hud.showBanner(`Round ${match.round} — plant at ${match.site}`);
  hud.showBuy(match.started);
}

function endRound(winner, reason) {
  if (match.phase === 'roundEnd' || match.phase === 'matchEnd') return;
  const playerWon = winner === 'vanguard';
  const payout = playerWon ? 3250 : 1900 + Math.min(1500, match.lossStreak * 500);
  match.money += payout;
  match.lossStreak = playerWon ? 0 : match.lossStreak + 1;
  match.wins[winner] += 1;
  match.phase = 'roundEnd';
  roundEndAt = match.elapsed;
  hud.setMoney(match.money);
  hud.setScore(match.wins.vanguard, match.wins.rustjackal);
  hud.showBanner(reason, 3200);
  hud.showBuy(false);
  audio.round();
  if (match.wins[winner] >= WIN_ROUNDS || match.round >= MAX_ROUNDS) {
    match.phase = 'matchEnd';
    const vanguardWon = match.wins.vanguard > match.wins.rustjackal;
    hud.showOverlay('match', {
      title: vanguardWon ? 'Vanguard take the match' : 'Rustjackals take the match',
      copy: `Final score: Vanguard ${match.wins.vanguard} — ${match.wins.rustjackal} Rustjackals. You scored ${kills} eliminations.`,
    });
    if (document.pointerLockElement) document.exitPointerLock();
    return;
  }
  hud.showOverlay('end', {
    title: playerWon ? 'Round won' : 'Round lost',
    copy: `${reason} Vanguard ${match.wins.vanguard} — ${match.wins.rustjackal} Rustjackals. +$${payout}.`,
  });
  if (document.pointerLockElement) document.exitPointerLock();
}

function nextRound() {
  match.round += 1;
  match.frags = 0;
  match.smokes = 0;
  match.armor = false;
  match.hasPrimary = false;
  match.primary = 'pistol';
  startRound();
}

function damagePlayer(amount, fromName) {
  if (match.phase !== 'live' || !playerProxy.alive) return;
  if (match.armor) amount *= 0.5;
  match.health -= amount;
  hud.setHealth(match.health);
  audio.hurt();
  if (match.health <= 0) {
    match.health = 0;
    playerProxy.alive = false;
    deaths += 1;
    hud.killfeed(`${fromName} ▸ You`);
    hud.showBanner('You are down — watching your team');
    if (match.carrying) {
      match.carrying = false;
      const carrier = vanguardBots.find((bot) => bot.alive);
      if (carrier) {
        carrier.carrier = true;
        carrier.path = null;
        hud.setBomb(`${carrier.name} picked up the charge`);
      } else {
        hud.setBomb('The charge is lost with your team');
      }
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function onBotShot(bot, target, spread) {
  const from = new THREE.Vector3(bot.position.x, bot.position.y + 1.35, bot.position.z);
  const dist = Math.hypot(target.position.x - from.x, target.position.z - from.z);
  const hitChance = Math.max(0.12, Math.min(0.85, 0.8 - dist * 0.008 - spread * 3));
  const end = new THREE.Vector3(target.position.x, target.position.y + 1.1, target.position.z);
  if (random() > hitChance) {
    end.x += (random() * 2 - 1) * 1.5;
    end.y += (random() * 2 - 1) * 0.8;
    end.z += (random() * 2 - 1) * 1.5;
    effects.tracer(from, end);
    if (dist < 30) audio.distantShot();
    return;
  }
  effects.tracer(from, end);
  const headshot = random() < 0.15;
  const damage = Math.round((headshot ? 90 : 22 + random() * 12) * (target.isPlayer && match.armor ? 0.5 : 1));
  if (target.isPlayer) {
    damagePlayer(damage, bot.name);
  } else {
    const killed = bots.damage(target, damage);
    hud.killfeed(killed ? `${bot.name} ▸ ${target.name}` : `${bot.name} hit ${target.name}`);
    if (killed && target.team === 'vanguard') checkElimination();
  }
  if (dist < 30) audio.distantShot();
}

function checkElimination() {
  if (objective.state.planted) return; // the fuse decides the round now
  if (bots.aliveCount('rustjackal') === 0) {
    endRound('vanguard', 'Rustjackals wiped out — Vanguard take the round');
  } else if (bots.aliveCount('vanguard') === 0 && !playerProxy.alive) {
    endRound('rustjackal', 'Vanguard wiped out — Rustjackals take the round');
  }
}

function shoot(spread) {
  if (!weapon.takeRound()) {
    audio.dryFire();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  muzzle.copy(camera.position).addScaledVector(direction, 0.6);
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  raycaster.far = weapon.state.def.range;
  const hits = raycaster.intersectObjects(shootables, false);
  const def = weapon.state.def;
  let endPoint = camera.position.clone().addScaledVector(direction, def.range);
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    const hit = hits[0];
    if (hit) {
      endPoint = hit.point;
      hitPoint.copy(hit.point);
      if (hit.object.userData.bot) {
        const bot = hit.object.userData.bot;
        const part = hit.object.userData.part;
        const damage = Math.round(def.damage * (part === 'head' ? def.headMult : 1));
        const killed = bots.damage(bot, damage);
        if (killed) {
          kills += 1;
          match.money += 300;
          hud.setMoney(match.money);
          hud.killfeed(`You ▸ ${bot.name}${part === 'head' ? ' (headshot)' : ''}`);
        } else {
          hud.killfeed(`You hit ${bot.name}`);
        }
        hud.hitMarker(killed, shot ? 4000 : 90);
        audio.hit(killed);
        effects.sparksAt(hitPoint, killed ? 14 : 6, 5);
        checkElimination();
      } else {
        effects.sparksAt(hitPoint, 4, 3);
      }
      break;
    }
  }
  effects.tracer(muzzle, endPoint);
  weapon.pullTrigger();
  player.recoil(def.recoil + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, def.name);
  bots.hearNoise(player.state.position.x, player.state.position.z, match.elapsed);
  audio.shot(def.kind);
  return true;
}

function throwGrenade(kind) {
  if (match.phase !== 'live' || !playerProxy.alive) return;
  const count = kind === 'frag' ? match.frags : match.smokes;
  if (count <= 0) return;
  if (kind === 'frag') match.frags -= 1;
  else match.smokes -= 1;
  camera.getWorldDirection(direction);
  grenades.push({
    kind,
    position: camera.position.clone().addScaledVector(direction, 0.5),
    velocity: direction.clone().multiplyScalar(15).add(new THREE.Vector3(0, 4.5, 0)),
    fuse: kind === 'frag' ? 2.2 : 1.4,
    mesh: makeGrenadeMesh(),
  });
  audio.buy();
}

function makeGrenadeMesh() {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.4, metalness: 0.6 }),
  );
  mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
}

function explodeGrenade(grenade) {
  const point = grenade.position;
  if (grenade.kind === 'frag') {
    effects.explosion(point);
    audio.explosion();
    const targets = [playerProxy, ...bots.bots];
    for (const target of targets) {
      if (!target.alive) continue;
      const d = Math.hypot(target.position.x - point.x, target.position.z - point.z) + Math.abs(target.position.y - point.y);
      if (d > 10) continue;
      const damage = Math.round(120 * (1 - d / 10) + 10);
      if (target.isPlayer) damagePlayer(damage, 'Frag grenade');
      else {
        const killed = bots.damage(target, damage);
        if (killed && target.team === 'rustjackal') {
          kills += 1;
          match.money += 300;
          hud.setMoney(match.money);
          hud.killfeed(`Your frag ▸ ${target.name}`);
        }
      }
    }
    checkElimination();
  } else {
    effects.smokeAt(point, 12);
    smokeZones.push({ x: point.x, y: point.y + 0.8, z: point.z, radius: 3.4, life: 12 });
  }
  scene.remove(grenade.mesh);
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const grenade = grenades[i];
    grenade.fuse -= dt;
    grenade.velocity.y -= 16 * dt;
    const next = grenade.position.clone().addScaledVector(grenade.velocity, dt);
    const box = new THREE.Box3();
    let bounced = false;
    for (const collider of world.colliders) {
      box.copy(collider).expandByScalar(0.09);
      if (box.containsPoint(next)) {
        bounced = true;
        if (Math.abs(grenade.velocity.x) > 0.5) grenade.velocity.x *= -0.45;
        if (Math.abs(grenade.velocity.z) > 0.5) grenade.velocity.z *= -0.45;
        if (grenade.velocity.y < 0) grenade.velocity.y *= -0.45;
        break;
      }
    }
    if (!bounced) grenade.position.copy(next);
    if (grenade.position.y < 0.09) {
      grenade.position.y = 0.09;
      grenade.velocity.y = Math.abs(grenade.velocity.y) > 1 ? -grenade.velocity.y * 0.45 : 0;
      grenade.velocity.x *= 0.7;
      grenade.velocity.z *= 0.7;
    }
    grenade.mesh.position.copy(grenade.position);
    if (grenade.fuse <= 0) {
      explodeGrenade(grenade);
      grenades.splice(i, 1);
    }
  }
  for (let i = smokeZones.length - 1; i >= 0; i -= 1) {
    smokeZones[i].life -= dt;
    if (smokeZones[i].life <= 0) smokeZones.splice(i, 1);
  }
}

function step(dt) {
  match.elapsed += dt;
  if (match.phase === 'buy') {
    match.timeLeft -= dt;
    hud.setTimer(match.timeLeft);
    // Freeze time lets the player move and buy; the bots wait at their spawn.
    player.step(dt, input.state.keys);
    weapon.step(dt);
    effects.step(dt);
    if (match.timeLeft <= 0) {
      match.phase = 'live';
      match.timeLeft = ROUND_TIME;
      hud.showBuy(false);
      hud.showBanner('Go — plant the charge');
      audio.round();
      if (!input.state.locked) {
        hud.showOverlay('round', { title: 'Freeze time over', copy: 'The round is live. Click to continue.' });
      }
    }
    return;
  }
  if (match.phase === 'live') {
    match.timeLeft -= dt;
    hud.setTimer(objective.state.planted ? objective.state.fuseLeft : match.timeLeft);
    if (objective.state.planted) {
      hud.setBomb(`Charge planted at ${objective.state.site} — ${Math.ceil(objective.state.fuseLeft)}s to blast`);
      const plantedSite = objective.state.site;
      const result = objective.step(dt, () => audio.beep(true));
      if (result === 'exploded') {
        effects.explosion(new THREE.Vector3(SITES[plantedSite].x, 0.5, SITES[plantedSite].z));
        audio.explosion();
        endRound('vanguard', 'Charge detonated — Vanguard take the round');
        return;
      }
    } else if (match.timeLeft <= 0) {
      endRound('rustjackal', 'Time out — Rustjackals hold the yard');
      return;
    }

    // Planting: hold E on a site while carrying the charge.
    const keys = input.state.keys;
    if (match.carrying && playerProxy.alive && keys.has('KeyE')) {
      const onSite = objective.inSite(player.state.position.x, player.state.position.z, 'A') ||
        objective.inSite(player.state.position.x, player.state.position.z, 'B');
      if (onSite) {
        const site = objective.inSite(player.state.position.x, player.state.position.z, 'A') ? 'A' : 'B';
        match.plantProgress += dt;
        hud.setProgress('Planting charge…', match.plantProgress / objective.plantTime);
        if (match.plantProgress >= objective.plantTime) {
          match.carrying = false;
          match.plantProgress = 0;
          hud.setProgress(null, 0);
          match.money += 300;
          hud.setMoney(match.money);
          objective.plant(site);
          hud.setBomb(`Charge planted at ${site} — defend it`);
          hud.showBanner(`Charge planted at ${site}`);
          audio.plantDone();
        }
      } else {
        match.plantProgress = 0;
        hud.setProgress(null, 0);
      }
    } else {
      match.plantProgress = 0;
      hud.setProgress(null, 0);
    }

    player.step(dt, keys);
    weapon.step(dt);
    bots.stepAll(dt, match.elapsed, ctx);
    effects.step(dt);
    stepGrenades(dt);
    checkElimination();
  }
  if (match.phase === 'roundEnd' && match.elapsed - roundEndAt > 3.5) {
    // The overlay's button advances; nothing auto-advances while the player reads.
  }
}

function syncCamera() {
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!match.frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const def = weapon.state.def;
    // One-shot keys are drained every frame, whatever the phase, so a tap during
    // freeze time still buys and a tap mid-round still throws.
    for (const code of input.drainPressed()) {
      if (code === 'KeyB' && match.phase === 'buy') {
        const opening = !hud.isBuyOpen();
        hud.showBuy(opening);
        if (opening && document.pointerLockElement) document.exitPointerLock();
        else if (!opening && !input.state.locked) input.requestLock();
      } else if (hud.isBuyOpen() && code.startsWith('Digit')) {
        const index = Number(code.slice(5)) - 1;
        if (BUY_ITEMS[index]) buyItem(BUY_ITEMS[index].id);
      } else if (match.phase === 'live' && playerProxy.alive) {
        if (code === 'KeyG') throwGrenade('frag');
        if (code === 'KeyH') throwGrenade('smoke');
        if (code === 'Digit1' && match.hasPrimary) weapon.equip(match.primary);
        if (code === 'Digit2') weapon.equip('pistol');
      }
    }
    if (match.phase === 'live' && playerProxy.alive) {
      if (input.state.firing && weapon.ready()) shoot(shot ? 0 : weapon.spread(player.groundSpeed(), player.state.crouching, player.state.onGround));
      if (input.state.keys.has('KeyR')) {
        if (weapon.reload()) audio.reload();
      }
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    hud.setCrosshairSpread(2 + weapon.spread(player.groundSpeed(), player.state.crouching, player.state.onGround) * 900);
    hud.drawMinimap({ sites: SITES }, player.state, bots.bots, objective.state, match.elapsed);
  }
  renderer.render(scene, camera);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    match.started = true;
    hud.hideOverlay();
    if (match.phase === 'buy') hud.showBuy(true);
    audio.unlock();
  } else if (match.phase === 'matchEnd') {
    // Overlay stays.
  } else if (match.phase === 'roundEnd') {
    // Overlay stays.
  } else if (!match.started) {
    hud.showOverlay('start');
  } else if (!hud.isBuyOpen()) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (match.phase === 'matchEnd') {
    match.round = 1;
    match.wins = { vanguard: 0, rustjackal: 0 };
    match.lossStreak = 0;
    match.money = 800;
    kills = 0;
    deaths = 0;
    startRound();
    input.requestLock();
    return;
  }
  if (match.phase === 'roundEnd') {
    nextRound();
    input.requestLock();
    return;
  }
  input.requestLock();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  match.phase = 'live';
  match.timeLeft = 72;
  match.wins = { vanguard: 2, rustjackal: 1 };
  match.money = 2450;
  match.health = 100;
  playerProxy.alive = true;
  player.reset(SPAWNS.vanguard[1]);
  bots.reset(SPAWNS);
  bots.assignRoundJobs(vanguardBots, rustjackalBots, 'A');
  weapon.equip('rifle');
  weapon.refill();
  hud.setHealth(100);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name);
  hud.setMoney(match.money);
  hud.setScore(2, 1);
  hud.setTimer(72);
  if (name === 'start') {
    player.state.position.set(0, 0, 10);
    player.state.yaw = 0.3;
    player.state.pitch = 0;
    rustjackalBots[0].position.set(-6, 0, -4);
    rustjackalBots[0].yaw = Math.PI;
    rustjackalBots[0].group.rotation.y = Math.PI;
    rustjackalBots[1].position.set(5, 0, -8);
    rustjackalBots[1].yaw = Math.PI;
    rustjackalBots[1].group.rotation.y = Math.PI;
    settle(30);
    hud.showOverlay('start');
    hud.setBomb('You carry the charge — plant it at A or B (hold E)');
  } else if (name === 'play') {
    // Clear lane up Mid: the player, the target and the downed bot all in view.
    player.state.position.set(-1.5, 0, 5);
    settle(40);
    const target = rustjackalBots[1];
    target.position.set(-1.5, 0, -5);
    target.yaw = Math.PI;
    target.group.rotation.y = target.yaw;
    const down = rustjackalBots[0];
    bots.damage(down, 500);
    down.position.set(1.5, 0, -3);
    const watcher = rustjackalBots[2];
    watcher.position.set(3.5, 0, -8);
    watcher.yaw = Math.PI;
    watcher.group.rotation.y = watcher.yaw;
    aimAt(new THREE.Vector3(target.position.x, 1.53, target.position.z));
    shoot(0); // a headshot with the rifle drops the target for real
    settle(6);
    hud.setBomb('You carry the charge — plant it at A or B (hold E)');
  } else {
    // end: charge planted at A, two defenders down, round won.
    objective.plant('A');
    match.carrying = false;
    player.state.position.set(-8, 0, -8);
    bots.damage(rustjackalBots[0], 500);
    rustjackalBots[0].position.set(-12, 0, -12);
    bots.damage(rustjackalBots[2], 500);
    rustjackalBots[2].position.set(-6, 0, -16);
    settle(20);
    aimAt(new THREE.Vector3(-11, 1.2, -14));
    hud.setBomb('Charge planted at A — 28s to blast');
    hud.setScore(3, 1);
    hud.showBanner('Round won — charge detonated', 4000);
  }
  hud.setHealth(match.health);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    hud.drawMinimap({ sites: SITES }, player.state, bots.bots, objective.state, match.elapsed);
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      match.frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

syncCamera();
if (shot) runShot(shot);
else {
  startRound();
  requestAnimationFrame(frame);
}
