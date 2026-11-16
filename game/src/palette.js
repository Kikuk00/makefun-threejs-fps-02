// The look plan, in one place. Sable Yard is a dusk industrial yard: sun-baked sand,
// rusted steel and one amber accent, with teal for the player's team and rust for the
// enemy team so a silhouette reads at a glance. The same names are the CSS custom
// properties in index.html, so the HUD and the 3D scene share one palette.
export const PALETTE = {
  canvas: '#191410',
  surface: '#2b2118',
  hairline: '#4a3a28',
  ink: '#f0e7d3',
  muted: '#a3906f',
  accent: '#e07830',
  sand: '#c8a06a',
  steel: '#5d6a6e',
  teal: '#3fa7a0',
  rust: '#c8502e',
  site: '#e07830',
};

export function shade(name) {
  return PALETTE[name];
}
