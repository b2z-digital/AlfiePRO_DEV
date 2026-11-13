// The trees' pictures, drawn once into one strip of cells: four gums, a far-off clump of bush and a
// Norfolk Island pine. Red is how much light falls on it, green how much of it is leaf (the rest is
// bark), so the scene can colour each tree from the aerial photo and keep its trunk pale.

export const TREE_CELLS = 6;
const CELL = 256;

export function treeAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CELL * TREE_CELLS; c.height = CELL;
  const g = c.getContext('2d')!;
  let seed = 11;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const leaf = (x: number, y: number, rad: number, light: number, a = 1) => {
    g.fillStyle = `rgba(${Math.max(0, Math.min(255, Math.round(light)))},255,0,${a})`;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  };
  const bark = (x0: number, y0: number, x1: number, y1: number, w: number, light = 210) => {
    g.strokeStyle = `rgb(${light},0,0)`; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  };
  // Light from the upper left; darker underneath and inside.
  const shade = (x: number, y: number, cx: number, top: number, bottom: number) => {
    const v = 1 - (y - top) / Math.max(1, bottom - top);
    return 105 + 120 * v + (cx - x) * 0.35 + (r() - 0.5) * 40;
  };

  // ── Gums: pale trunks forking up into open, clumpy crowns with sky through them ──
  for (let k = 0; k < 4; k++) {
    g.save();
    g.translate(k * CELL, 0);
    const cx = CELL / 2 + (r() - 0.5) * 20;
    const crownTop = 10 + r() * 20, crownBottom = 150 + r() * 40;
    // The trunk and its main limbs.
    const forkY = crownBottom + 10 + r() * 30;
    bark(cx, CELL, cx + (r() - 0.5) * 10, forkY, 12 - k);
    const limbs: [number, number][] = [];
    const nl = 3 + Math.floor(r() * 3);
    for (let i = 0; i < nl; i++) {
      const tx = cx + (i / (nl - 1) - 0.5) * (120 + r() * 60), ty = crownTop + 20 + r() * (crownBottom - crownTop - 30);
      bark(cx, forkY, tx, ty, 6 - i * 0.5, 190 + r() * 40);
      limbs.push([tx, ty]);
    }
    // Clumps of leaf at the ends of the limbs, and a few more between.
    const clumps: [number, number, number][] = limbs.map(([x, y]) => [x, y, 26 + r() * 20]);
    for (let i = 0; i < 4 + k; i++) clumps.push([cx + (r() - 0.5) * 170, crownTop + 20 + r() * (crownBottom - crownTop - 20), 18 + r() * 18]);
    for (const [x, y, rad] of clumps) {
      for (let j = 0; j < 140; j++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
        const px = x + Math.cos(a) * d * 1.25, py = y + Math.sin(a) * d * 0.85;
        if (px < 4 || px > CELL - 4 || py < 2) continue;
        leaf(px, py, 2.2 + r() * 3.8, shade(px, py, cx, crownTop, crownBottom + 20), 0.75 + r() * 0.25);
      }
    }
    g.restore();
  }

  // ── A clump of far-off bush: a broad, dense, rounded mass ──
  {
    g.save(); g.translate(4 * CELL, 0);
    const cx = CELL / 2;
    for (let j = 0; j < 1600; j++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      const px = cx + Math.cos(a) * d * 118, py = 120 + Math.sin(a) * d * 100 - (1 - d) * 20;
      if (py > CELL - 8 || py < 6) continue;
      leaf(px, py, 4 + r() * 6, shade(px, py, cx, 10, 230), 0.9);
    }
    g.restore();
  }

  // ── A Norfolk Island pine: a straight trunk and level tiers of branches, a tall narrow cone ──
  {
    g.save(); g.translate(5 * CELL, 0);
    const cx = CELL / 2;
    bark(cx, CELL, cx, 4, 6, 170);
    // Level tiers with sky between them, each branch drooping a little then turning up at the tip;
    // the lowest tiers long gone, as on the old foreshore trees.
    const tiers = 10;
    for (let t = 0; t < tiers; t++) {
      const y = 16 + (t / (tiers - 1)) * 168 + (r() - 0.5) * 6;
      const half = 8 + (t / (tiers - 1)) * 116 * (0.75 + r() * 0.45);
      for (const side of [-1, 1]) {
        if (t > 2 && r() < 0.12) continue; // a branch lost here and there
        bark(cx, y, cx + side * half * 0.92, y + 5, 2, 140);
        for (let j = 0; j < 34; j++) {
          const u = r();
          const px = cx + side * u * half, py = y + Math.sin(u * Math.PI) * 6 - u * u * 6 + (r() - 0.5) * 9;
          leaf(px, py, 2 + r() * 3.2, 160 + (1 - t / tiers) * 60 - u * 18 + (side < 0 ? 18 : 0) + (r() - 0.5) * 30, 0.95);
        }
      }
    }
    g.restore();
  }
  return c;
}
