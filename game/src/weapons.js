// Weapons: one table owns every gun's numbers, so balance lives in one place and
// the buy menu, the HUD and the shooter all read the same row. A weapon is a
// view-model group on the camera, a magazine, a reload timer and a spread model:
// standing still and crouched is accurate, moving and airborne is not, and every
// shot adds recoil that the player must pull back down.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    name: 'P9 Sidearm', price: 0, slot: 1, mag: 12, reserve: 48, damage: 26, headMult: 3.5,
    fireGap: 0.16, reloadTime: 1.4, auto: false, spreadStill: 0.003, spreadMove: 0.03,
    recoil: 0.006, range: 60, pellets: 1, kind: 'pistol',
  },
  rifle: {
    name: 'VK-7 Rifle', price: 2700, slot: 1, mag: 30, reserve: 90, damage: 33, headMult: 4,
    fireGap: 0.096, reloadTime: 1.9, auto: true, spreadStill: 0.0022, spreadMove: 0.028,
    recoil: 0.009, range: 80, pellets: 1, kind: 'rifle',
  },
  smg: {
    name: 'Kestrel SMG', price: 1500, slot: 1, mag: 32, reserve: 96, damage: 21, headMult: 3.5,
    fireGap: 0.07, reloadTime: 1.6, auto: true, spreadStill: 0.005, spreadMove: 0.034,
    recoil: 0.005, range: 50, pellets: 1, kind: 'smg',
  },
  shotgun: {
    name: 'Maul-12 Shotgun', price: 1200, slot: 1, mag: 6, reserve: 24, damage: 13, headMult: 2.5,
    fireGap: 0.85, reloadTime: 2.4, auto: false, spreadStill: 0.02, spreadMove: 0.045,
    recoil: 0.03, range: 26, pellets: 8, kind: 'shotgun',
  },
  marksman: {
    name: 'Longbow DMR', price: 4000, slot: 1, mag: 8, reserve: 24, damage: 78, headMult: 4,
    fireGap: 0.9, reloadTime: 2.6, auto: false, spreadStill: 0.0008, spreadMove: 0.05,
    recoil: 0.035, range: 100, pellets: 1, kind: 'sniper',
  },
};

export const BUY_ITEMS = [
  { id: 'rifle', label: 'VK-7 Rifle — $2700', price: 2700 },
  { id: 'smg', label: 'Kestrel SMG — $1500', price: 1500 },
  { id: 'shotgun', label: 'Maul-12 Shotgun — $1200', price: 1200 },
  { id: 'marksman', label: 'Longbow DMR — $4000', price: 4000 },
  { id: 'frag', label: 'Frag Grenade — $300', price: 300 },
  { id: 'smoke', label: 'Smoke Grenade — $250', price: 250 },
  { id: 'armor', label: 'Vest — $650', price: 650 },
];

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.45, metalness: 0.5 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
  barrel.position.set(0, 0.025, -0.38);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
  stock.position.set(0, -0.02, 0.3);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.06), dark);
  sight.position.set(0, 0.075, -0.1);
  model.add(receiver, barrel, stock, sight);
  model.position.set(0.22, -0.21, -0.5);
  model.scale.setScalar(0.7);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.22, -0.19, -1.05);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.22, -0.17, -0.7);
  camera.add(flashLight);

  const state = {
    def: WEAPONS.pistol, mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0,
  };

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.5 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (state.def.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = state.def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    equip(id) {
      const def = WEAPONS[id];
      if (!def) return false;
      state.def = def;
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      return true;
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = state.def.fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === state.def.mag || state.reserve === 0) return false;
      state.reloadLeft = state.def.reloadTime;
      return true;
    },
    // Spread grows with speed and while airborne, and shrinks while crouched.
    spread(speed, crouching, onGround) {
      const move = Math.min(1, speed / 5.2);
      let value = state.def.spreadStill + move * state.def.spreadMove;
      if (crouching) value *= 0.6;
      if (!onGround) value *= 1.8;
      return value;
    },
    refill() {
      state.mag = state.def.mag;
      state.reserve = state.def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}
