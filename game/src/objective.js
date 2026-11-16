// The objective: one charge, two sites, one timer. The enemy carrier plants it
// on a site (3.2 s, standing on the pad); the plant starts a 35 s fuse and the
// round becomes a race to defuse (5 s, standing on the pad) or to wipe the other
// team. The fuse beeps faster as it runs down, and the blast ends the round.
import * as THREE from 'three';
import { SITES } from './world.js';
import { PALETTE } from './palette.js';

const PLANT_TIME = 3.2;
const DEFUSE_TIME = 5;
const FUSE_TIME = 35;

export function createObjective(scene) {
  const group = new THREE.Group();
  const bombMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.25, 0.3),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.3, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.4 }),
  );
  bombMesh.visible = false;
  bombMesh.castShadow = true;
  group.add(bombMesh);
  const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 8);
  group.add(light);
  scene.add(group);

  const state = {
    planted: false, site: null, fuseLeft: 0, beepAt: 0,
    plantProgress: 0, defuseProgress: 0,
  };

  return {
    state,
    reset() {
      state.planted = false;
      state.site = null;
      state.fuseLeft = 0;
      state.plantProgress = 0;
      state.defuseProgress = 0;
      bombMesh.visible = false;
      light.intensity = 0;
    },
    plant(site) {
      state.planted = true;
      state.site = site;
      state.fuseLeft = FUSE_TIME;
      state.beepAt = 0;
      const pad = SITES[site];
      bombMesh.position.set(pad.x, 0.15, pad.z);
      bombMesh.visible = true;
      light.position.set(pad.x, 1, pad.z);
      light.intensity = 6;
    },
    // Returns 'exploded' when the fuse runs out, else null. Beeps accelerate.
    step(dt, onBeep) {
      if (!state.planted) return null;
      state.fuseLeft -= dt;
      const interval = state.fuseLeft > 20 ? 1.0 : state.fuseLeft > 10 ? 0.5 : 0.25;
      state.beepAt += dt;
      if (state.beepAt >= interval) {
        state.beepAt = 0;
        onBeep();
      }
      light.intensity = 4 + Math.sin(state.fuseLeft * 8) * 3;
      if (state.fuseLeft <= 0) {
        this.reset();
        return 'exploded';
      }
      return null;
    },
    inSite(x, z, site) {
      const pad = SITES[site];
      return Math.hypot(x - pad.x, z - pad.z) < pad.radius;
    },
    plantTime: PLANT_TIME,
    defuseTime: DEFUSE_TIME,
  };
}
