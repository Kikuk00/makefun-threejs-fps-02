// Sable Yard: an original dusk industrial yard, 44 x 36 m, built from boxes. Every
// box is a collider for players and bots and a surface a bullet stops on.
// Layout: the Vanguard spawn at the south gate, the Rustjackal spawn at the north
// wall. Three lanes run north: Long (west, open sightline past the fuel tanks),
// Mid (centre, through the container chicane) and Yard (east, past the warehouse).
// Site A is the fuel depot at the north-west; Site B is the warehouse at the
// north-east. Crates and containers make corners worth holding and crouch spots
// worth taking. Waypoints join the lanes so bots route, hold and rotate.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint graph: id -> { x, z, links: [ids] }. Bots walk it; holds are nodes where
// a bot may stop and watch a lane.
export const WAYPOINTS = [
  { x: 0, z: 14, links: [1, 2, 3] }, // 0 south gate (Vanguard spawn)
  { x: -12, z: 6, links: [0, 4, 5] }, // 1 long west
  { x: 0, z: 4, links: [0, 4, 6] }, // 2 mid south
  { x: 12, z: 6, links: [0, 6, 7] }, // 3 yard east
  { x: -14, z: -6, links: [1, 2, 8] }, // 4 long mid
  { x: -14, z: -14, links: [4, 8] }, // 5 site A approach
  { x: 0, z: -6, links: [2, 4, 6, 9] }, // 6 mid crossing
  { x: 14, z: -6, links: [3, 6, 10] }, // 7 yard mid
  { x: -10, z: -14, links: [5, 6, 9] }, // 8 site A
  { x: 0, z: -14, links: [6, 8, 10] }, // 9 north middle
  { x: 12, z: -14, links: [7, 9] }, // 10 site B
  { x: 0, z: -16, links: [9] }, // 11 north wall (Rustjackal spawn)
];

export const SITES = {
  A: { name: 'Fuel Depot', x: -11, z: -14, radius: 4.5 },
  B: { name: 'Warehouse', x: 12, z: -14, radius: 4.5 },
};

export const SPAWNS = {
  vanguard: [
    { x: -3, z: 14, yaw: 0 },
    { x: 0, z: 15, yaw: 0 },
    { x: 3, z: 14, yaw: 0 },
    { x: -6, z: 12, yaw: 0 },
    { x: 6, z: 12, yaw: 0 },
  ],
  rustjackal: [
    { x: -3, z: -16, yaw: Math.PI },
    { x: 0, z: -17, yaw: Math.PI },
    { x: 3, z: -16, yaw: Math.PI },
    { x: -7, z: -14, yaw: Math.PI },
    { x: 7, z: -14, yaw: Math.PI },
  ],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of ['canvas', 'surface', 'hairline', 'sand', 'steel', 'accent', 'site']) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'site' ? 0.55 : 0.92,
      metalness: name === 'steel' ? 0.35 : 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and the yard wall, 44 x 36 m, 5 m high, open to the dusk sky.
  box(44.4, 0.4, 36.4, 0, -0.2, 0, 'canvas');
  box(0.4, 5, 36.4, -22.2, 2.5, 0, 'surface');
  box(0.4, 5, 36.4, 22.2, 2.5, 0, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, -18.2, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, 18.2, 'surface');

  // Site A: fuel depot — two tanks and a low wall, north-west.
  const tankGeo = new THREE.CylinderGeometry(1.6, 1.6, 2.6, 20);
  for (const [x, z] of [[-14, -14], [-8, -15.5]]) {
    const tank = new THREE.Mesh(tankGeo, materials.steel);
    tank.position.set(x, 1.3, z);
    tank.castShadow = true;
    tank.receiveShadow = true;
    group.add(tank);
    shootables.push(tank);
    colliders.push(new THREE.Box3().setFromObject(tank));
  }
  box(6, 1.1, 0.8, -11, 0.55, -11, 'hairline');
  box(0.8, 1.1, 4, -16.5, 0.55, -12, 'hairline');

  // Site B: warehouse — a tall shed wall and stacked pallets, north-east.
  box(8, 3.4, 0.6, 12, 1.7, -17.4, 'surface');
  box(3.2, 1.0, 2.2, 9, 0.5, -13, 'sand');
  box(3.2, 1.0, 2.2, 15.5, 0.5, -12, 'sand');
  box(2.2, 0.8, 2.2, 12, 1.4, -13.5, 'hairline');

  // Long lane (west): a container to peek around and a crate to crouch behind.
  box(6, 2.6, 2.4, -18, 1.3, -2, 'steel');
  box(1.6, 1.0, 1.6, -12, 0.5, 2, 'sand');
  box(1.6, 1.0, 1.6, -14, 0.5, -8, 'sand');

  // Mid: container chicane that splits the lane and blocks the long sightline.
  box(2.4, 2.6, 6, -4, 1.3, 0, 'steel');
  box(2.4, 2.6, 6, 4, 1.3, -4, 'steel');
  box(1.4, 0.9, 1.4, 0, 0.45, 3, 'sand');
  box(1.4, 0.9, 1.4, -1.5, 0.45, -9, 'sand');

  // Yard lane (east): crates, a low wall and a raised loading dock.
  box(2.2, 1.1, 2.2, 13, 0.55, 2, 'sand');
  box(2.2, 1.1, 2.2, 16, 0.55, -3, 'sand');
  box(5, 1.0, 0.8, 17, 0.5, 7, 'hairline');
  box(6, 0.5, 3, 18, 0.25, -9, 'surface');

  // South gate cover and centre pillar.
  box(2.4, 1.0, 1.2, -3, 0.5, 9, 'hairline');
  box(2.4, 1.0, 1.2, 3, 0.5, 9, 'hairline');
  box(1.4, 3.4, 1.4, 0, 1.7, -1, 'hairline');

  // Site markers: flat amber pads on the ground, so a site reads at a glance.
  const padGeo = new THREE.PlaneGeometry(7, 7);
  for (const site of Object.values(SITES)) {
    const pad = new THREE.Mesh(
      padGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.site), transparent: true, opacity: 0.16, depthWrite: false }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(site.x, 0.02, site.z);
    pad.receiveShadow = true;
    group.add(pad);
  }

  // Light: low amber sun from the west, cool dusk fill, warm sky gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#f5d9a8'), new THREE.Color(PALETTE.canvas), 1.35);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb35c'), 2.4);
  sun.position.set(-20, 12, 8);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(new THREE.Color('#7d8aa8'), 0.75);
  fill.position.set(14, 10, 12);
  scene.add(fill);

  return { colliders, shootables, group };
}
