// 水槽: 画面のガラスのすぐ奥が水槽。魚がガラスの近くまで泳いでくる。
import * as THREE from 'three';
import { rng, canvasTex, speckle, vgrad, std, merger, lumpy } from '../util.js';

export default {
  id: 'aquarium', name: '水槽', sub: '魚がガラスのそばまで泳いでくる',
  thumb: 'linear-gradient(180deg,#5fc3e4 0%,#1d6f9a 55%,#0d3550 100%)',
  build({ W, H, zRef }) {
    const R = rng(21);
    const root = new THREE.Group();
    const T = Math.max(22, Math.min(60, Math.max(W, H) * 1.15));   // 水槽の奥行き
    const u = Math.min(W, H) / 20;                                   // 大きさの基準
    const floorY = -H / 2;
    const water = new THREE.Color('#0f4a6e');

    root.add(new THREE.HemisphereLight(0xcdefff, 0x1d3f4f, 1.0));
    const sun = new THREE.DirectionalLight(0xfff6e0, 1.3); sun.position.set(W * 0.2, H * 2, -T * 0.3); root.add(sun);
    root.add(new THREE.AmbientLight(0x3a6f8f, 0.35));

    /* 壁（奥と左右と天井側の水面） */
    const wallTex = canvasTex(256, 512, (x, w, h) => {
      vgrad(x, w, h, [[0, '#3d9ec8'], [0.45, '#1a6d98'], [1, '#0b3956']]);
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) {                          // 上から差し込む光の筋
        const cx = R() * w, g = x.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(180,235,255,.18)'); g.addColorStop(1, 'rgba(180,235,255,0)');
        x.fillStyle = g; x.beginPath(); x.moveTo(cx - 6, 0); x.lineTo(cx + 6, 0); x.lineTo(cx + 40 + R() * 30, h); x.lineTo(cx - 20, h); x.fill();
      }
    });
    const wallMat = new THREE.MeshBasicMaterial({ map: wallTex, fog: true });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat); back.position.z = -T; root.add(back);
    const sideMat = new THREE.MeshBasicMaterial({ map: wallTex, color: 0xb8c8d0 });
    [-1, 1].forEach(sx => { const m = new THREE.Mesh(new THREE.PlaneGeometry(T, H), sideMat); m.rotation.y = -sx * Math.PI / 2; m.position.set(sx * W / 2, 0, -T / 2); root.add(m); });
    const surfTex = canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = '#3f9fc6'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { x.strokeStyle = `rgba(220,250,255,${0.1 + R() * 0.25})`; x.lineWidth = 1 + R() * 2; x.beginPath(); x.ellipse(R() * w, R() * h, 10 + R() * 30, 5 + R() * 12, R() * 3, 0, 7); x.stroke(); }
    }, { repeat: [2, 2] });
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(W, T), new THREE.MeshBasicMaterial({ map: surfTex, side: THREE.DoubleSide }));
    surf.rotation.x = Math.PI / 2; surf.position.set(0, H / 2, -T / 2); root.add(surf);

    /* 砂: 奥ほど少し高く盛る */
    const sandH = H * 0.1;
    const sandGeo = new THREE.PlaneGeometry(W, T, 48, 36); sandGeo.rotateX(-Math.PI / 2);
    const sp = sandGeo.attributes.position;
    const sandAt = (x, z) => floorY + sandH * (0.5 + 0.9 * (-z / T)) + Math.sin(x * 0.6 / u) * 0.15 * u + Math.sin(z * 0.45 / u + x * 0.2 / u) * 0.2 * u;
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), z = sp.getZ(i) - T / 2; sp.setXYZ(i, x, sandAt(x, z), z); }
    sandGeo.computeVertexNormals();
    const sandTex = canvasTex(512, 512, (x, w, h) => { x.fillStyle = '#d9c497'; x.fillRect(0, 0, w, h); speckle(x, w, h, 9000, ['#b9a272', '#efe0b8', '#a68e5e', '#fff3d6'], 2.2, R); }, { repeat: [W / 12, T / 12] });
    root.add(new THREE.Mesh(sandGeo, std(0xffffff, 1, 0, { map: sandTex })));

    // 揺らめく光の模様（砂の少し上に重ねる）
    const caus = canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineCap = 'round';
      for (let i = 0; i < 140; i++) { x.lineWidth = 1 + R() * 2.5; x.beginPath(); const cx = R() * w, cy = R() * h, r = 8 + R() * 18; x.arc(cx, cy, r, R() * 6, R() * 6 + 1.2 + R()); x.stroke(); }
    }, { repeat: [W / 10, T / 10] });
    const causGeo = sandGeo.clone(); causGeo.translate(0, 0.05, 0);
    const causMat = new THREE.MeshBasicMaterial({ map: caus, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    root.add(new THREE.Mesh(causGeo, causMat));
    const caus2 = caus.clone(); caus2.needsUpdate = true; caus2.repeat.set(W / 7, T / 7);
    const causMat2 = causMat.clone(); causMat2.map = caus2; causMat2.opacity = 0.16;
    const c2 = new THREE.Mesh(causGeo, causMat2); root.add(c2);

    /* 岩とサンゴ（動かないので1つにまとめる） */
    const mg = merger();
    for (let i = 0; i < 9; i++) {
      const g = lumpy(1, 0.22, i * 3.7);
      const x = (R() - 0.5) * W * 0.9, z = -T * (0.3 + R() * 0.65), s = u * (0.8 + R() * 1.8);
      mg.add(g, ['#7d7468', '#5f5a55', '#8a7f70'][i % 3], [x, sandAt(x, z) + s * 0.25, z], [R(), R() * 3, R()], [s * 1.3, s * 0.75, s], 0.08, R);
    }
    for (let i = 0; i < 5; i++) {                       // 枝サンゴ
      const x = (R() - 0.5) * W * 0.85, z = -T * (0.45 + R() * 0.5), y = sandAt(x, z), col = ['#ff8a7a', '#ffb26b', '#e86fa3'][i % 3];
      for (let b = 0; b < 7; b++) {
        const h = u * (1.2 + R() * 1.8), a = (R() - 0.5) * 1.1, c = (R() - 0.5) * 1.1;
        mg.add(new THREE.CylinderGeometry(0.12 * u, 0.22 * u, h, 6), col, [x + Math.sin(a) * h / 2, y + Math.cos(a) * h / 2, z + Math.sin(c) * h / 3], [c, 0, -a], 1, 0.1, R);
        mg.add(new THREE.SphereGeometry(0.2 * u, 8, 6), col, [x + Math.sin(a) * h, y + Math.cos(a) * h, z + Math.sin(c) * h * 0.6], [0, 0, 0], 1, 0.1, R);
      }
    }
    const rocks = mg.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    root.add(rocks);

    /* 水草: 根元を固定して先を揺らす */
    const weeds = [];
    const weedMat = std(0x4fae58, 0.7, 0, { side: THREE.DoubleSide });
    for (let i = 0; i < 16; i++) {
      const h = H * (0.35 + R() * 0.45), wd = u * (0.35 + R() * 0.3);
      const g = new THREE.PlaneGeometry(wd, h, 1, 12); g.translate(0, h / 2, 0);
      const m = new THREE.Mesh(g, weedMat.clone());
      m.material.color.setHSL(0.28 + R() * 0.08, 0.5, 0.32 + R() * 0.15);
      const x = (R() < 0.5 ? -1 : 1) * W * (0.22 + R() * 0.26), z = -T * (0.25 + R() * 0.72);
      m.position.set(x, sandAt(x, z) - 0.2, z); m.rotation.y = R() * 3;
      m.userData = { base: Float32Array.from(g.attributes.position.array), h, ph: R() * 6, amp: u * (0.4 + R() * 0.5) };
      weeds.push(m); root.add(m);
    }

    /* 魚 */
    const fishes = [];
    const kinds = [
      { body: '#ff7a2f', fin: '#ffd2a8', stripe: '#ffffff', len: 2.4 },
      { body: '#ffd23f', fin: '#ffe993', stripe: null, len: 2.8 },
      { body: '#2f6fe0', fin: '#ffd23f', stripe: '#162a6b', len: 3.2 },
      { body: '#c9d6e3', fin: '#9fb3c8', stripe: null, len: 1.6 },
      { body: '#e84a6a', fin: '#ffb0c0', stripe: null, len: 2.0 },
    ];
    function fishMesh(k) {
      const g = new THREE.Group();
      const tex = canvasTex(128, 64, (x, w, h) => {
        x.fillStyle = k.body; x.fillRect(0, 0, w, h);
        const g2 = x.createLinearGradient(0, 0, 0, h); g2.addColorStop(0, 'rgba(0,0,0,.25)'); g2.addColorStop(0.5, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(255,255,255,.35)');
        x.fillStyle = g2; x.fillRect(0, 0, w, h);
        if (k.stripe) { x.fillStyle = k.stripe; [0.3, 0.55].forEach(p => x.fillRect(w * p, 0, w * 0.07, h)); }
      });
      const bodyMat = std(0xffffff, 0.45, 0.05, { map: tex });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), bodyMat);
      body.scale.set(1, 0.48, 0.24); g.add(body);
      const finMat = std(k.fin, 0.5, 0, { side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
      const tailShape = new THREE.Shape(); tailShape.moveTo(0, 0); tailShape.lineTo(-0.34, 0.24); tailShape.lineTo(-0.28, 0); tailShape.lineTo(-0.34, -0.24); tailShape.closePath();
      const tail = new THREE.Mesh(new THREE.ShapeGeometry(tailShape), finMat); tail.position.x = -0.44; g.add(tail);
      const dShape = new THREE.Shape(); dShape.moveTo(-0.2, 0); dShape.lineTo(0.05, 0.2); dShape.lineTo(0.18, 0); dShape.closePath();
      const dorsal = new THREE.Mesh(new THREE.ShapeGeometry(dShape), finMat); dorsal.position.y = 0.2; g.add(dorsal);
      const eyeMat = std(0x111111, 0.2, 0.2);
      [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMat); e.position.set(0.3, 0.05, s * 0.095); g.add(e); });
      g.userData.tail = tail;
      return g;
    }
    const bounds = { x: W / 2 - u * 1.6, yLo: floorY + sandH * 1.6 + u, yHi: H / 2 - u * 1.2, zLo: -T + u * 2, zHi: -u * 1.3 };
    const pick = (near) => new THREE.Vector3(
      (R() * 2 - 1) * bounds.x,
      bounds.yLo + R() * (bounds.yHi - bounds.yLo),
      near ? bounds.zHi - R() * u : bounds.zLo + R() * (bounds.zHi - bounds.zLo));
    const nFish = 14;
    for (let i = 0; i < nFish; i++) {
      const k = kinds[i % kinds.length], m = fishMesh(k), s = k.len * u * (0.8 + R() * 0.4);
      m.scale.setScalar(s);
      const f = { m, pos: pick(false), vel: new THREE.Vector3(R() - 0.5, 0, R() - 0.5).multiplyScalar(u), goal: pick(false), speed: u * (1.6 + R() * 1.6), ph: R() * 6, s };
      m.position.copy(f.pos);
      fishes.push(f); root.add(m);
    }

    /* 泡 */
    const bubbleN = 40;
    const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), std(0xe8fbff, 0.1, 0.1, { transparent: true, opacity: 0.45 }), bubbleN);
    const bub = [], bx = W * 0.36, bz = -T * 0.8;
    for (let i = 0; i < bubbleN; i++) bub.push({ y: floorY + R() * H, r: u * (0.06 + R() * 0.12), ph: R() * 6, v: u * (2 + R() * 2) });
    root.add(bubbles);
    const dm = new THREE.Object3D();

    const tmp = new THREE.Vector3(), look = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), qf = new THREE.Quaternion(), rotFix = new THREE.Quaternion().setFromAxisAngle(up, -Math.PI / 2);

    function update(dt, t) {
      caus.offset.set(t * 0.012, t * 0.008); caus2.offset.set(-t * 0.01, t * 0.013);
      surfTex.offset.set(t * 0.01, t * 0.006);
      for (const m of weeds) {
        const p = m.geometry.attributes.position, b = m.userData.base;
        for (let i = 0; i < p.count; i++) {
          const y = b[i * 3 + 1], k = Math.pow(Math.max(0, y) / m.userData.h, 1.6);
          p.setX(i, b[i * 3] + Math.sin(t * 1.1 + m.userData.ph + y * 0.25 / u) * m.userData.amp * k);
          p.setZ(i, b[i * 3 + 2] + Math.sin(t * 0.8 + m.userData.ph * 1.7 + y * 0.2 / u) * m.userData.amp * 0.6 * k);
        }
        p.needsUpdate = true;
      }
      for (const f of fishes) {
        tmp.copy(f.goal).sub(f.pos);
        const d = tmp.length();
        if (d < u * 1.5) f.goal = pick(R() < 0.3);         // ときどきガラスのそばへ
        tmp.normalize().multiplyScalar(f.speed);
        f.vel.lerp(tmp, Math.min(1, dt * 0.9));
        f.pos.addScaledVector(f.vel, dt);
        f.pos.x = Math.max(-bounds.x, Math.min(bounds.x, f.pos.x));
        f.pos.y = Math.max(bounds.yLo, Math.min(bounds.yHi, f.pos.y));
        f.pos.z = Math.max(bounds.zLo, Math.min(bounds.zHi, f.pos.z));
        f.m.position.copy(f.pos);
        f.m.position.y += Math.sin(t * 2 + f.ph) * u * 0.1;
        if (f.vel.lengthSq() > 1e-6) {
          tmp.copy(f.vel); tmp.y *= 0.4;
          look.lookAt(tmp.normalize(), new THREE.Vector3(), up);
          qf.setFromRotationMatrix(look).multiply(rotFix);
          f.m.quaternion.slerp(qf, Math.min(1, dt * 4));
        }
        f.m.userData.tail.rotation.y = Math.sin(t * 9 + f.ph) * 0.45;
      }
      for (let i = 0; i < bubbleN; i++) {
        const b = bub[i];
        b.y += b.v * dt;
        if (b.y > H / 2) b.y = floorY + sandH;
        dm.position.set(bx + Math.sin(t * 3 + b.ph) * u * 0.25 + (i % 3 - 1) * u * 0.3, b.y, bz + Math.cos(t * 2.5 + b.ph) * u * 0.2);
        dm.scale.setScalar(b.r); dm.updateMatrix();
        bubbles.setMatrixAt(i, dm.matrix);
      }
      bubbles.instanceMatrix.needsUpdate = true;
    }

    return { root, update, background: water, fog: new THREE.FogExp2(water, 0.55 / (zRef + T)), exposure: 1.05 };
  },
};
