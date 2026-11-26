// 景色づくりの共通部品
import * as THREE from 'three';
import { mergeBufferGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';

// 動かない部品を色ごと1つの形にまとめる（描画の回数が減り、スマホでも軽くなる）
export function merger() {
  const parts = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  return {
    add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1], jitter = 0, rand = Math.random) {
      const gg = geo.clone();
      if (gg.attributes.uv) gg.deleteAttribute('uv');
      if (gg.attributes.uv2) gg.deleteAttribute('uv2');
      if (!gg.index) gg.setIndex([...Array(gg.attributes.position.count).keys()]);
      m4.compose(p.set(...pos), q.setFromEuler(e.set(...rot)), s.set(...(typeof scl === 'number' ? [scl, scl, scl] : scl)));
      gg.applyMatrix4(m4);
      col.set(color);
      if (jitter) col.offsetHSL(0, 0, (rand() - 0.5) * jitter);
      const n = gg.attributes.position.count, c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
      gg.setAttribute('color', new THREE.BufferAttribute(c, 3));
      parts.push(gg);
      return gg;
    },
    build(material) {
      if (!parts.length) return new THREE.Group();
      const merged = mergeBufferGeometries(parts, false);
      parts.forEach(g => g.dispose());
      return new THREE.Mesh(merged, material || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    },
  };
}

// 決まった順の乱数（毎回同じ景色になる）
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// キャンバスに描いてテクスチャにする
export function canvasTex(w, h, draw, { repeat = null, srgb = true, aniso = 4 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// 細かな凹凸（ノイズ）を点で散らす
export function speckle(x, w, h, n, colors, r, rand, alpha = 1) {
  x.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    x.fillStyle = colors[(rand() * colors.length) | 0];
    const s = r * (0.4 + rand());
    x.fillRect(rand() * w, rand() * h, s, s);
  }
  x.globalAlpha = 1;
}

export function vgrad(x, w, h, stops) {
  const g = x.createLinearGradient(0, 0, 0, h);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}

// 円形のぼかし点（光・星雲・影など）
export function glowTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  return canvasTex(size, size, (x, w) => {
    const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    x.fillStyle = g; x.fillRect(0, 0, w, w);
  });
}

// でこぼこの岩: 位置から決まる量で頂点を動かす（同じ位置の頂点は同じだけ動くので割れない）
export function lumpy(detail = 1, amt = 0.25, seed = 1, squash = [1, 1, 1]) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = 1 + amt * (Math.sin(x * 3.1 + seed) * Math.sin(y * 2.7 + seed * 1.7) + 0.6 * Math.sin(z * 4.3 + seed * 0.7) * Math.cos(x * 2.2 - seed));
    p.setXYZ(i, x * f * squash[0], y * f * squash[1], z * f * squash[2]);
  }
  g.computeVertexNormals();
  return g;
}

export const std =(color, rough = 0.8, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

// 片付け: 景色を切り替えるときにGPUのメモリを返す
export function disposeTree(o) {
  const seen = new Set();
  o.traverse(c => {
    if (c.geometry && !seen.has(c.geometry)) { seen.add(c.geometry); c.geometry.dispose(); }
    const mats = c.material ? (Array.isArray(c.material) ? c.material : [c.material]) : [];
    mats.forEach(m => {
      if (seen.has(m)) return; seen.add(m);
      Object.values(m).forEach(val => { if (val && val.isTexture && !seen.has(val)) { seen.add(val); val.dispose(); } });
      if (m.uniforms) Object.values(m.uniforms).forEach(u => { if (u.value && u.value.isTexture && !seen.has(u.value)) { seen.add(u.value); u.value.dispose(); } });
      m.dispose();
    });
  });
}
