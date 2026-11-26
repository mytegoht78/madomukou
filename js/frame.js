// 窓枠: 画面のふちに木の枠を描き、枠の内側の面（見込み）を奥へ伸ばす。
// 頭を動かすと見込みの見え方が変わり、「本当に窓がある」感じが強まる。
import * as THREE from 'three';
import { canvasTex, rng } from './util.js';

let woodTex = null;
function wood() {
  if (woodTex) return woodTex;
  const r = rng(11);
  woodTex = canvasTex(512, 128, (x, w, h) => {
    x.fillStyle = '#8a6240'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {                 // 木目
      const y = r() * h, a = 0.05 + r() * 0.12;
      x.strokeStyle = r() < 0.5 ? `rgba(60,36,18,${a})` : `rgba(190,150,105,${a * 0.8})`;
      x.lineWidth = 0.6 + r() * 2.2;
      x.beginPath(); x.moveTo(0, y);
      for (let px = 0; px <= w; px += 16) x.lineTo(px, y + Math.sin(px * 0.01 + i) * 3 + (r() - 0.5) * 1.5);
      x.stroke();
    }
  });
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  return woodTex;
}

export function buildFrame(W, H) {
  const g = new THREE.Group();
  g.name = 'frame';
  const b = Math.max(0.35, Math.min(2.6, Math.min(W, H) * 0.06));   // 枠の太さ
  const j = b * 1.6;                                                   // 見込みの深さ
  const iw = W - 2 * b, ih = H - 2 * b;
  const mat = (shade, rx, ry, rot = 0) => {
    const t = wood().clone(); t.needsUpdate = true;
    t.repeat.set(rx, ry); t.rotation = rot; t.center.set(0.5, 0.5);
    return new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(shade, shade, shade), toneMapped: false });
  };
  const plane = (w, h, m, setup) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); setup(p); p.renderOrder = 10; g.add(p); };
  const L = 18; // 木目1本あたりの長さ(cm)
  // 正面の枠（上下は横長、左右は縦長）
  plane(W, b, mat(1.0, W / L, 0.25), p => p.position.set(0, H / 2 - b / 2, 0.001));
  plane(W, b, mat(0.92, W / L, 0.25), p => p.position.set(0, -H / 2 + b / 2, 0.001));
  plane(b, ih, mat(0.96, ih / L, 0.25, Math.PI / 2), p => p.position.set(-W / 2 + b / 2, 0, 0.001));
  plane(b, ih, mat(0.96, ih / L, 0.25, Math.PI / 2), p => p.position.set(W / 2 - b / 2, 0, 0.001));
  // 見込み（枠の内側の面）: 上は暗く、下（窓台）は明るい
  plane(iw, j, mat(0.48, iw / L, 0.3), p => { p.rotation.x = Math.PI / 2; p.position.set(0, ih / 2, -j / 2); });
  plane(iw, j, mat(0.86, iw / L, 0.3), p => { p.rotation.x = -Math.PI / 2; p.position.set(0, -ih / 2, -j / 2); });
  plane(j, ih, mat(0.66, ih / L, 0.3, Math.PI / 2), p => { p.rotation.y = Math.PI / 2; p.position.set(-iw / 2, 0, -j / 2); });
  plane(j, ih, mat(0.6, ih / L, 0.3, Math.PI / 2), p => { p.rotation.y = -Math.PI / 2; p.position.set(iw / 2, 0, -j / 2); });
  g.userData = { b, j };
  return g;
}
