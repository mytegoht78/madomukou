// 宇宙・星空: 手前を漂う岩、中ほどの月と環のある惑星、はるか遠くの星と星雲。
import * as THREE from 'three';
import { rng, canvasTex, glowTex, std, lumpy } from '../util.js';

export default {
  id: 'cosmos', name: '宇宙・星空', sub: '手前の岩から遠くの星まで、奥行きが一番深い',
  thumb: 'radial-gradient(circle at 70% 40%,#e8c07a 0 9%,transparent 10%),radial-gradient(circle at 30% 70%,#5a3f8f 0,transparent 45%),linear-gradient(180deg,#05060d,#141a36)',
  build({ W, H }) {
    const R = rng(33);
    const root = new THREE.Group();
    const k = Math.max(W, H) / 34;
    const near = new THREE.Group(); near.scale.setScalar(k); root.add(near);

    root.add(new THREE.AmbientLight(0x404a70, 0.25));
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.4); sun.position.set(-1, 0.35, 0.45); root.add(sun);

    /* 星: 遠い層（ほぼ動かない）と近い層（少し動く） */
    function stars(n, rMin, rMax, size, atten) {
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        let x, y, z;
        do { x = R() * 2 - 1; y = R() * 2 - 1; z = R() * 2 - 1; } while (x * x + y * y + z * z > 1 || z > -0.15);
        const l = Math.hypot(x, y, z), r = rMin + R() * (rMax - rMin);
        pos.set([x / l * r, y / l * r, z / l * r], i * 3);
        c.setHSL([0.6, 0.08, 0.12, 0.0][(R() * 4) | 0], 0.5, 0.7 + R() * 0.3).multiplyScalar(0.5 + R() * 0.8);
        col.set([c.r, c.g, c.b], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: atten, vertexColors: true, map: dot, transparent: true, depthWrite: false, alphaTest: 0.02, fog: false }));
    }
    const dot = glowTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
    root.add(stars(5000, 3000, 6000, 2.2, false));
    root.add(stars(700, 400, 1500, 2.6 * k, true));
    near.add(stars(260, 60, 300, 0.55, true));

    /* 星雲 */
    const neb = glowTex('rgba(255,255,255,.9)', 'rgba(255,255,255,0)', 256);
    [['#6a3fbf', -1500, 600, 2600], ['#2f6fbf', 1800, -300, 3000], ['#bf3f7a', 400, 1300, 2000], ['#3fa0a0', -700, -1000, 2400]].forEach(([c, x, y, s]) => {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: neb, color: c, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.position.set(x, y, -5000); m.scale.set(s, s * 0.7, 1); root.add(m);
    });

    /* 環のある惑星 */
    const bandTex = canvasTex(512, 256, (x, w, h) => {
      const cols = ['#e8c88f', '#c99a62', '#f0dcb0', '#a8784a', '#e2b87c', '#cfa36e'];
      let y = 0;
      while (y < h) { const bh = 4 + R() * 18; x.fillStyle = cols[(R() * cols.length) | 0]; x.fillRect(0, y, w, bh + 1); y += bh; }
      x.globalAlpha = 0.18;
      for (let i = 0; i < 300; i++) { x.fillStyle = R() < 0.5 ? '#fff' : '#5a3a20'; x.fillRect(R() * w, R() * h, 20 + R() * 80, 1 + R() * 2); }
      x.globalAlpha = 1;
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(36, 64, 40), std(0xffffff, 0.9, 0, { map: bandTex }));
    planet.position.set(-34, 14, -300); planet.rotation.z = 0.35;
    near.add(planet);
    const ringTex = canvasTex(512, 8, (x, w) => {
      for (let i = 0; i < w; i++) { const a = (0.25 + 0.6 * Math.abs(Math.sin(i * 0.05) * Math.sin(i * 0.013 + 1))) * (i < 30 || i > w - 15 ? 0.2 : 1); x.fillStyle = `rgba(230,205,160,${a})`; x.fillRect(i, 0, 1, 8); }
    });
    const ringGeo = new THREE.RingGeometry(48, 88, 128, 1);
    const rp = ringGeo.attributes.position, ruv = ringGeo.attributes.uv, v3 = new THREE.Vector3();
    for (let i = 0; i < rp.count; i++) { v3.fromBufferAttribute(rp, i); ruv.setXY(i, (v3.length() - 48) / 40, 0.5); }
    const ring = new THREE.Mesh(ringGeo, std(0xffffff, 0.9, 0, { map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.copy(planet.position); ring.rotation.set(-1.25, 0.2, 0.35);
    near.add(ring);

    /* 月 */
    const moonTex = canvasTex(256, 128, (x, w, h) => {
      x.fillStyle = '#9a9a9e'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 160; i++) { const r = 1 + R() * 9, cx = R() * w, cy = R() * h; x.fillStyle = `rgba(${R() < 0.5 ? '60,60,66' : '200,200,205'},${0.15 + R() * 0.25})`; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); }
    });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 40, 28), std(0xffffff, 1, 0, { map: moonTex }));
    moon.position.set(40, -16, -130); near.add(moon);

    /* 漂う岩（手前。動くほど奥行きが分かる） */
    const rocks = [];
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a7f76, roughness: 1, flatShading: true });
    for (let i = 0; i < 16; i++) {
      const g = lumpy(1, 0.3, i * 2.3, [1, 0.8, 1]);
      const m = new THREE.Mesh(g, rockMat);
      const z = -10 - R() * 90, spread = (z * -1 + 55) / 55;
      m.position.set((R() - 0.5) * 34 * spread * 0.8, (R() - 0.5) * 22 * spread * 0.8, z);
      m.scale.setScalar(0.5 + R() * (i < 4 ? 2.8 : 1.4));
      m.userData = { spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.4), drift: new THREE.Vector3((R() - 0.5) * 0.6, (R() - 0.5) * 0.3, 0) };
      rocks.push(m); near.add(m);
    }

    /* 流れ星 */
    const shootMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const shoot = new THREE.Mesh(new THREE.PlaneGeometry(260, 2.5), shootMat);
    shoot.position.z = -2500; root.add(shoot);
    let shootT = 3;

    function update(dt, t) {
      planet.rotation.y += dt * 0.03; moon.rotation.y += dt * 0.02;
      for (const m of rocks) {
        m.rotation.x += m.userData.spin.x * dt; m.rotation.y += m.userData.spin.y * dt; m.rotation.z += m.userData.spin.z * dt;
        m.position.addScaledVector(m.userData.drift, dt);
        const lim = (-m.position.z + 55) / 55 * 20;
        if (Math.abs(m.position.x) > lim) m.userData.drift.x *= -1;
        if (Math.abs(m.position.y) > lim * 0.7) m.userData.drift.y *= -1;
      }
      shootT -= dt;
      if (shootT < 0) {
        shootT = 6 + R() * 8;
        shoot.position.set(-600 - R() * 900, 300 + R() * 600, -2500); shoot.rotation.z = -0.4 - R() * 0.4;
        shoot.userData.v = new THREE.Vector3(Math.cos(shoot.rotation.z), Math.sin(shoot.rotation.z), 0).multiplyScalar(1400);
        shoot.userData.life = 0.9;
      }
      if (shoot.userData.life > 0) {
        shoot.userData.life -= dt;
        shoot.position.addScaledVector(shoot.userData.v, dt);
        shootMat.opacity = Math.max(0, Math.sin(shoot.userData.life / 0.9 * Math.PI)) * 0.8;
      } else shootMat.opacity = 0;
    }

    return { root, update, background: new THREE.Color('#03040a'), fog: null, exposure: 1.0, far: 12000 };
  },
};
