// Bots: one agent per opponent and teammate. Each bot is a body (torso + head
// hitboxes, so headshots pay) with a small state machine over the waypoint graph:
// route to a site or a hold, hold an angle, engage what it sees, investigate what
// it hears, and plant or defuse the charge when it carries the job. Vision is a
// raycast against the world (no seeing through walls); hearing is a noise event
// with a radius. Fire is burst-based with an inaccuracy that grows with distance
// and movement, and a reaction delay, so a bot that just rounded a corner does not
// instantly land every shot.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WAYPOINTS, SITES } from './world.js';

const BOT_SPEED = 3.6;
const BOT_HOLD_SPEED = 1.4;
const VISION_RANGE = 42;
const HEAR_RADIUS = 26;
const REACT_MIN = 0.35;
const REACT_MAX = 0.8;

const NAMES = {
  vanguard: ['Ash', 'Bram', 'Cleo', 'Dara'],
  rustjackal: ['Vex', 'Mara', 'Kite', 'Rook', 'Sable'],
};

export function createBots(scene, world, random) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = VISION_RANGE;
  const tmp = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const toTarget = new THREE.Vector3();

  const torsoGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeo = new THREE.SphereGeometry(0.155, 12, 10);
  const legGeo = new THREE.BoxGeometry(0.46, 0.5, 0.28);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.5);
  const bots = [];

  function makeBot(team, index, spawn) {
    const isEnemy = team === 'rustjackal';
    const color = isEnemy ? PALETTE.rust : PALETTE.teal;
    const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.6, metalness: 0.05 });
    const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
    const group = new THREE.Group();
    group.position.set(spawn.x, 0, spawn.z);
    const legs = new THREE.Mesh(legGeo, darkMat);
    legs.position.y = 0.25;
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.0;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.53;
    head.userData.part = 'head';
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.2, 1.05, -0.3);
    group.add(legs, torso, head, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);
    const bot = {
      team, name: NAMES[team][index % NAMES[team].length], group, torso, head,
      position: group.position, yaw: spawn.yaw ?? 0, health: 100, alive: true,
      state: 'route', waypoint: nearestWaypoint(spawn.x, spawn.z), targetNode: -1,
      holdUntil: 0, reactUntil: 0, burstLeft: 0, burstGap: 0, seen: null, seenAt: -99,
      hearAt: null, hearUntil: 0, speed: BOT_SPEED, carrier: false, planting: 0,
      defusing: 0, weapon: isEnemy ? 'rifle' : 'rifle', fall: 0, respawnAt: 0,
      aimError: 0, lastShotAt: -99, strafeDir: 1, strafeUntil: 0,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    bots.push(bot);
    return bot;
  }

  function nearestWaypoint(x, z) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < WAYPOINTS.length; i += 1) {
      const d = (WAYPOINTS[i].x - x) ** 2 + (WAYPOINTS[i].z - z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  // Breadth-first route over the waypoint graph, from the bot's node to a goal node.
  function route(from, to) {
    if (from === to) return [to];
    const prev = new Array(WAYPOINTS.length).fill(-1);
    const queue = [from];
    prev[from] = from;
    while (queue.length > 0) {
      const current = queue.shift();
      for (const next of WAYPOINTS[current].links) {
        if (prev[next] !== -1) continue;
        prev[next] = current;
        if (next === to) {
          const path = [to];
          let node = to;
          while (node !== from) {
            node = prev[node];
            path.unshift(node);
          }
          return path;
        }
        queue.push(next);
      }
    }
    return [to];
  }

  function pickSiteNode(bot) {
    // The carrier's site is chosen at round start; others follow the same site.
    return bot.site === 'A' ? 8 : 10;
  }

  function assignRoundJobs(attackers, defenders, site) {
    for (const bot of bots) {
      bot.site = site;
      bot.carrier = false;
      bot.planting = 0;
      bot.defusing = 0;
      bot.state = 'route';
      bot.seen = null;
      bot.hearAt = null;
    }
    const carrier = attackers[Math.floor(random() * attackers.length)];
    if (carrier) carrier.carrier = true;
    // Attackers route to the site; two defenders hold the sites, the rest mid.
    for (const bot of attackers) bot.path = route(bot.waypoint, pickSiteNode(bot));
    for (let i = 0; i < defenders.length; i += 1) {
      const bot = defenders[i];
      bot.path = route(bot.waypoint, i < 2 ? (i === 0 ? 8 : 10) : 6);
      bot.holdNode = i < 2 ? (i === 0 ? 8 : 10) : 6;
    }
  }

  function hasLineOfSight(from, target, height = 1.4) {
    tmp.set(from.x, height, from.z);
    toTarget.set(target.x - from.x, 0, target.z - from.z);
    const dist = Math.hypot(toTarget.x, toTarget.z);
    if (dist > VISION_RANGE) return false;
    dir.copy(toTarget).normalize();
    dir.y = (1.3 - height) / Math.max(dist, 0.01);
    dir.normalize();
    raycaster.set(tmp, dir);
    raycaster.far = dist;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit;
  }

  function nearestVisibleEnemy(bot, enemies, time) {
    let best = null;
    let bestDist = Infinity;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.position.x - bot.position.x;
      const dz = enemy.position.z - bot.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= bestDist) continue;
      const eye = { x: bot.position.x, z: bot.position.z };
      const foe = { x: enemy.position.x, z: enemy.position.z };
      if (!hasLineOfSight(eye, foe)) continue;
      best = enemy;
      bestDist = dist;
    }
    if (best) {
      if (bot.seen !== best) bot.reactUntil = time + REACT_MIN + random() * (REACT_MAX - REACT_MIN);
      bot.seen = best;
      bot.seenAt = time;
    }
    return best;
  }

  function moveToward(bot, x, z, dt, speed) {
    const dx = x - bot.position.x;
    const dz = z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.15) return true;
    const step = Math.min(dist, speed * dt);
    bot.position.x += (dx / dist) * step;
    bot.position.z += (dz / dist) * step;
    bot.yaw = Math.atan2(dx, dz);
    return dist - step < 0.15;
  }

  function step(bot, dt, time, ctx) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    bot.group.rotation.x = 0;
    const enemies = bot.team === 'rustjackal' ? ctx.vanguard : ctx.rustjackal;
    const visible = nearestVisibleEnemy(bot, enemies, time);
    if (visible && time < bot.reactUntil) {
      // Reaction delay: the bot has seen the enemy but has not opened fire yet.
    }

    // Plant / defuse take priority over routing when the bot is on the site.
    if (ctx.bomb.planted) {
      if (bot.team === 'rustjackal' && ctx.bomb.site) {
        const site = SITES[ctx.bomb.site];
        const d = Math.hypot(bot.position.x - site.x, bot.position.z - site.z);
        if (d < site.radius && !visible) {
          bot.state = 'defuse';
          bot.defusing += dt;
          if (bot.defusing >= 5) ctx.onDefused(bot);
          bot.group.rotation.y = bot.yaw;
          return;
        }
        bot.defusing = 0;
      }
    } else if (bot.carrier && bot.alive) {
      const site = SITES[bot.site];
      const d = Math.hypot(bot.position.x - site.x, bot.position.z - site.z);
      if (d < site.radius * 0.7 && !visible) {
        bot.state = 'plant';
        bot.planting += dt;
        if (bot.planting >= 3.2) ctx.onPlanted(bot, bot.site);
        bot.group.rotation.y = bot.yaw;
        return;
      }
      bot.planting = 0;
    }
    bot.defusing = 0;

    if (visible && time >= bot.reactUntil) {
      // Engage: strafe, face the target, fire in bursts.
      bot.state = 'engage';
      const dx = visible.position.x - bot.position.x;
      const dz = visible.position.z - bot.position.z;
      bot.yaw = Math.atan2(dx, dz);
      if (time > bot.strafeUntil) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeUntil = time + 0.5 + random() * 0.7;
      }
      const strafeX = Math.cos(bot.yaw) * bot.strafeDir;
      const strafeZ = -Math.sin(bot.yaw) * bot.strafeDir;
      bot.position.x += strafeX * BOT_HOLD_SPEED * dt;
      bot.position.z += strafeZ * BOT_HOLD_SPEED * dt;
      bot.burstGap -= dt;
      if (bot.burstGap <= 0) {
        if (bot.burstLeft <= 0) {
          bot.burstLeft = 3 + Math.floor(random() * 3);
          bot.burstGap = 0.5 + random() * 0.6;
        } else {
          bot.burstLeft -= 1;
          bot.burstGap = 0.11;
          const dist = Math.hypot(dx, dz);
          const spread = 0.02 + dist * 0.0012;
          ctx.onBotShot(bot, visible, spread);
        }
      }
    } else if (bot.hearAt && time < bot.hearUntil && !visible) {
      // Investigate a heard shot, then resume the route.
      bot.state = 'investigate';
      if (moveToward(bot, bot.hearAt.x, bot.hearAt.z, dt, BOT_SPEED)) {
        bot.hearAt = null;
      }
    } else if (bot.state === 'hold' || (bot.holdNode !== undefined && bot.waypoint === bot.holdNode && bot.team === 'rustjackal')) {
      bot.state = 'hold';
      bot.holdUntil = Math.max(bot.holdUntil, time + 0.5);
      // Hold the angle: slowly scan the lane the node watches.
      bot.yaw += Math.sin(time * 0.4 + bot.waypoint) * dt * 0.25;
    } else {
      bot.state = 'route';
      const path = bot.path && bot.path.length > 0 ? bot.path : route(bot.waypoint, bot.holdNode !== undefined ? bot.holdNode : pickSiteNode(bot));
      bot.path = path;
      const node = WAYPOINTS[path[0]];
      if (moveToward(bot, node.x, node.z, dt, BOT_SPEED)) {
        bot.waypoint = path.shift();
        if (bot.team === 'vanguard' && bot.holdNode !== undefined && bot.waypoint === bot.holdNode) {
          bot.state = 'hold';
        }
      }
    }
    bot.group.rotation.y = bot.yaw;
  }

  return {
    bots,
    makeBot,
    assignRoundJobs,
    hearNoise(x, z, time) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        const d = Math.hypot(bot.position.x - x, bot.position.z - z);
        if (d < HEAR_RADIUS) {
          bot.hearAt = { x, z };
          bot.hearUntil = time + 4;
        }
      }
    },
    stepAll(dt, time, ctx) {
      for (const bot of bots) step(bot, dt, time, ctx);
    },
    damage(bot, amount) {
      if (!bot.alive) return false;
      bot.health -= amount;
      if (bot.health > 0) return false;
      bot.alive = false;
      bot.fall = 0;
      bot.state = 'dead';
      return true;
    },
    aliveCount(team) {
      return bots.filter((bot) => bot.team === team && bot.alive).length;
    },
    reset(spawns) {
      for (const bot of bots) {
        const spawn = spawns[bot.team][bots.filter((b) => b.team === bot.team).indexOf(bot)];
        bot.position.set(spawn.x, 0, spawn.z);
        bot.yaw = spawn.yaw ?? 0;
        bot.health = 100;
        bot.alive = true;
        bot.fall = 0;
        bot.state = 'route';
        bot.waypoint = nearestWaypoint(spawn.x, spawn.z);
        bot.path = null;
        bot.holdNode = undefined;
        bot.seen = null;
        bot.hearAt = null;
        bot.planting = 0;
        bot.defusing = 0;
        bot.group.rotation.set(0, bot.yaw, 0);
      }
    },
    hitMeshes() {
      const meshes = [];
      for (const bot of bots) meshes.push(bot.torso, bot.head);
      return meshes;
    },
  };
}
