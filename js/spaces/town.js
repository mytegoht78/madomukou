// ミニチュアの街: 窓の奥の台の上に箱庭の街。斜め上から見下ろす。
import * as THREE from 'three';
import { rng, canvasTex, speckle, std, merger } from '../util.js';

export default {
  id: 'town', name: 'ミニチュアの街', sub: '箱庭の街を斜め上から見下ろす',
  thumb: 'linear-gradient(160deg,#bfe3ff 0%,#9ccf8a 45%,#e9d3a5 70%,#c86b5a 100%)',
  shadows: true,
  build({ W, H, mobile }) {
    const R = rng(5);
    const root = new THREE.Group();
    const k = Math.max(W, H) / 34;                  // 窓の大きさに合わせて街の縮尺を変える
    const town = new THREE.Group();
    town.scale.setScalar(k * 0.62);
    town.rotation.x = 0.78;                          // 奥が持ち上がる＝見下ろす角度
    town.position.set(0, -H / 2 - 2 * k, -6 * k);
    root.add(town);

    root.add(new THREE.HemisphereLight(0xdff0ff, 0x7a8a5a, 0.75));
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
    sun.position.set(-60, 90, 40); sun.target.position.set(0, 0, -70);
    sun.castShadow = true;
    const sc = sun.shadow.camera; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 300;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.3;
    town.add(sun, sun.target);

    /* 地面: 道路と区画をテクスチャで描く */
    const X0 = -90, X1 = 90, Z0 = 4, Z1 = -170;     // 街の範囲（cm, 台の上）
    const BLOCK = 22, ROAD = 6, STEP = BLOCK + ROAD;
    const gw = X1 - X0, gd = Z0 - Z1, px = 6;        // 1cm あたり6画素
    const railZ = -86;                                // 線路
    const river = { z: -136, w: 10 };                // 川
    const groundTex = canvasTex(gw * px, gd * px, (x, w, h) => {
      x.fillStyle = '#8fbf6a'; x.fillRect(0, 0, w, h);
      speckle(x, w, h, 26000, ['#7fb25c', '#a2cc7a', '#86b863'], 3, R, 0.6);
      const toX = cm => (cm - X0) * px, toY = cm => (Z0 - cm) * px;
      x.fillStyle = '#6b6f78';
      for (let cx = X0 + 4; cx < X1; cx += STEP) x.fillRect(toX(cx), 0, ROAD * px, h);
      for (let cz = Z0 - 4; cz > Z1; cz -= STEP) x.fillRect(0, toY(cz), w, ROAD * px);
      x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 2; x.setLineDash([10, 10]);
      for (let cx = X0 + 4; cx < X1; cx += STEP) { x.beginPath(); x.moveTo(toX(cx + ROAD / 2), 0); x.lineTo(toX(cx + ROAD / 2), h); x.stroke(); }
      for (let cz = Z0 - 4; cz > Z1; cz -= STEP) { x.beginPath(); x.moveTo(0, toY(cz - ROAD / 2)); x.lineTo(w, toY(cz - ROAD / 2)); x.stroke(); }
      x.setLineDash([]);
      // 川と土手
      x.fillStyle = '#d8c79a'; x.fillRect(0, toY(river.z + river.w / 2 + 2), w, (river.w + 4) * px);
      const rg = x.createLinearGradient(0, toY(river.z + river.w / 2), 0, toY(river.z - river.w / 2));
      rg.addColorStop(0, '#3f87b5'); rg.addColorStop(0.5, '#5fb0d8'); rg.addColorStop(1, '#3f87b5');
      x.fillStyle = rg; x.fillRect(0, toY(river.z + river.w / 2), w, river.w * px);
      // 線路の砂利
      x.fillStyle = '#9a8f80'; x.fillRect(0, toY(railZ + 2.5), w, 5 * px);
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), std(0xffffff, 0.95, 0, { map: groundTex }));
    ground.rotation.x = -Math.PI / 2; ground.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    ground.receiveShadow = true;
    town.add(ground);
    // 台のふち（街の外は木の台）
    const tableMat = std(0x8a6a4a, 0.7);
    const table = new THREE.Mesh(new THREE.BoxGeometry(gw + 400, 4, gd + 400), tableMat);
    table.position.set(0, -2.05, (Z0 + Z1) / 2); table.receiveShadow = true; town.add(table);

    /* 建物・木（動かないので1つにまとめる） */
    const mg = merger();
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const roof4 = new THREE.ConeGeometry(0.72, 1, 4, 1); roof4.rotateY(Math.PI / 4); roof4.translate(0, 0.5, 0);
    const prism = new THREE.CylinderGeometry(0.6, 0.6, 1, 3, 1); prism.rotateZ(Math.PI / 2); prism.rotateX(-Math.PI / 2); prism.translate(0, 0.3, 0);
    const cone = new THREE.ConeGeometry(1, 1, 8); cone.translate(0, 0.5, 0);
    const ball = new THREE.IcosahedronGeometry(1, 1);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 8); cyl.translate(0, 0.5, 0);
    const walls = ['#f4efe4', '#efe2c8', '#e6d3c0', '#dfe7ee', '#f1d9cf', '#e9edd8'];
    const roofs = ['#b5523f', '#3f5f8a', '#5a6b5a', '#8a4a3a', '#c6823f', '#4a4a52'];
    const tree = (x, z, s) => {
      if (R() < 0.5) { mg.add(cyl, '#6a4a32', [x, 0, z], [0, 0, 0], [0.25 * s, 1.2 * s, 0.25 * s]); mg.add(ball, '#3f8a43', [x, 1.9 * s, z], [R(), R(), 0], [s, s * 1.1, s], 0.12, R); }
      else { mg.add(cyl, '#6a4a32', [x, 0, z], [0, 0, 0], [0.2 * s, 0.8 * s, 0.2 * s]); mg.add(cone, '#2f6f3f', [x, 0.6 * s, z], [0, 0, 0], [s * 0.9, s * 2.6, s * 0.9], 0.1, R); }
    };
    const house = (x, z, w, d, h, rot) => {
      mg.add(box, walls[(R() * walls.length) | 0], [x, 0, z], [0, rot, 0], [w, h, d], 0.04, R);
      const rc = roofs[(R() * roofs.length) | 0];
      if (R() < 0.55) mg.add(prism, rc, [x, h, z], [0, rot, 0], [w * 1.15, h * 0.9, d * 1.25], 0.05, R);
      else mg.add(roof4, rc, [x, h, z], [0, rot, 0], [w * 1.05, h * 0.7, d * 1.05], 0.05, R);
    };
    const tower = (x, z, w, d, h) => {
      mg.add(box, ['#cfd6de', '#b9c2cc', '#e2ddd2'][(R() * 3) | 0], [x, 0, z], [0, 0, 0], [w, h, d], 0.05, R);
      for (let y = 2; y < h - 1; y += 2.2) mg.add(box, '#5b7590', [x, y, z + d / 2 + 0.02], [0, 0, 0], [w * 0.8, 0.9, 0.05]);   // 窓の帯
      mg.add(box, '#8a9098', [x, h, z], [0, 0, 0], [w * 0.4, 0.8, d * 0.4]);
    };
    let blockI = 0;
    for (let cz = Z0 - 4 - ROAD; cz - BLOCK > Z1; cz -= STEP) {
      for (let cx = X0 + 4 + ROAD; cx + BLOCK <= X1; cx += STEP) {
        const bx0 = cx, bz0 = cz, bx1 = cx + BLOCK, bz1 = cz - BLOCK;
        blockI++;
        const midZ = (bz0 + bz1) / 2;
        if (Math.abs(midZ - railZ) < BLOCK / 2 + 3 || Math.abs(midZ - river.z) < BLOCK / 2 + river.w / 2) {
          // 線路と川の区画は木だけ
          for (let i = 0; i < 4; i++) tree(bx0 + 2 + R() * (BLOCK - 4), (R() < 0.5 ? bz0 - 2 : bz1 + 2), 1.4 + R());
          continue;
        }
        const kind = R();
        const center = Math.abs((bx0 + bx1) / 2) < 45 && midZ < -95 && midZ > -130;
        if (kind < 0.14 && !center) {             // 公園
          mg.add(cyl, '#4f9ad0', [(bx0 + bx1) / 2, 0.02, midZ], [0, 0, 0], [5, 0.08, 3.5]);
          for (let i = 0; i < 9; i++) tree(bx0 + 2 + R() * (BLOCK - 4), bz1 + 2 + R() * (BLOCK - 4), 1.3 + R() * 1.2);
        } else if (center && kind < 0.75) {        // 中心部は背の高い建物
          tower(bx0 + 6, bz0 - 6, 8, 8, 10 + R() * 16);
          tower(bx1 - 6, bz1 + 6, 8, 8, 8 + R() * 12);
          house(bx1 - 5, bz0 - 5, 6, 6, 4, 0); house(bx0 + 5, bz1 + 5, 6, 6, 4, 0);
        } else {                                   // 住宅地
          for (let gx = 0; gx < 3; gx++) for (let gz = 0; gz < 3; gz++) {
            if (R() < 0.2) { tree(bx0 + 3.6 + gx * 7.3, bz0 - 3.6 - gz * 7.3, 1.2 + R()); continue; }
            const w = 3.6 + R() * 1.6, d = 3.6 + R() * 1.6, h = 3 + R() * 1.6;
            house(bx0 + 3.6 + gx * 7.3, bz0 - 3.6 - gz * 7.3, w, d, h, (R() < 0.5 ? 0 : Math.PI / 2));
          }
        }
      }
    }
    // 街の外まわりの森
    for (let i = 0; i < 160; i++) {
      const side = R(), x = side < 0.5 ? (R() < 0.5 ? X0 - 4 - R() * 40 : X1 + 4 + R() * 40) : (X0 + R() * gw), z = side < 0.5 ? Z1 + R() * gd : Z1 - 4 - R() * 40;
      tree(x, z, 1.6 + R() * 1.6);
    }
    // 線路
    for (let x = X0; x < X1; x += 1.6) mg.add(box, '#6a5040', [x, 0, railZ], [0, 0, 0], [0.5, 0.25, 4]);
    [-1, 1].forEach(s => mg.add(box, '#bfc4c8', [0, 0.25, railZ + s * 1.2], [0, 0, 0], [gw, 0.25, 0.25]));
    // 橋
    for (let cx = X0 + 4; cx < X1; cx += STEP) mg.add(box, '#a7a29a', [cx + ROAD / 2, 0, river.z], [0, 0, 0], [ROAD + 1, 0.5, river.w + 3]);
    const statics = mg.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    statics.castShadow = true; statics.receiveShadow = true;
    town.add(statics);

    /* 動くもの: 車と電車 */
    const carCols = ['#e0483a', '#2f6fd0', '#f2c230', '#ffffff', '#30a060', '#222'];
    const cars = [];
    const carGeo = new THREE.BoxGeometry(2.4, 1, 1.3); carGeo.translate(0, 0.6, 0);
    const cabGeo = new THREE.BoxGeometry(1.3, 0.7, 1.15); cabGeo.translate(-0.15, 1.4, 0);
    const xs = [], zs = [];
    for (let cx = X0 + 4; cx < X1; cx += STEP) xs.push(cx + ROAD / 2);
    for (let cz = Z0 - 4; cz > Z1; cz -= STEP) zs.push(cz - ROAD / 2);
    for (let i = 0; i < 26; i++) {
      const g = new THREE.Group();
      const m = std(carCols[i % carCols.length], 0.4, 0.2);
      const b = new THREE.Mesh(carGeo, m), c = new THREE.Mesh(cabGeo, std(0xdde8f0, 0.2, 0.3));
      b.castShadow = c.castShadow = true;
      g.add(b, c);
      const alongX = R() < 0.5, dir = R() < 0.5 ? 1 : -1;
      const lane = alongX ? zs[(R() * zs.length) | 0] : xs[(R() * xs.length) | 0];
      const car = { g, alongX, dir, lane: lane + dir * 1.4 * (alongX ? -1 : 1), p: alongX ? X0 + R() * gw : Z1 + R() * gd, v: 6 + R() * 6 };
      g.rotation.y = alongX ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      cars.push(car); town.add(g);
    }
    const train = new THREE.Group();
    const tcol = [std(0xe8eef2, 0.4, 0.2), std(0x2f8f5f, 0.4, 0.2)];
    for (let i = 0; i < 5; i++) {
      const car = new THREE.Mesh(new THREE.BoxGeometry(9, 2.4, 2.4), tcol[0]); car.position.set(-i * 9.6, 1.6, 0); car.castShadow = true;
      const band = new THREE.Mesh(new THREE.BoxGeometry(9.05, 0.5, 2.45), tcol[1]); band.position.set(-i * 9.6, 1.4, 0);
      train.add(car, band);
    }
    train.position.set(X0, 0, railZ);
    town.add(train);

    function update(dt) {
      for (const c of cars) {
        c.p += c.v * c.dir * dt;
        if (c.alongX) { if (c.p > X1 + 4) c.p = X0 - 4; if (c.p < X0 - 4) c.p = X1 + 4; c.g.position.set(c.p, 0, c.lane); }
        else { if (c.p > Z0 + 4) c.p = Z1 - 4; if (c.p < Z1 - 4) c.p = Z0 + 4; c.g.position.set(c.lane, 0, c.p); }
      }
      train.position.x += 14 * dt;
      if (train.position.x > X1 + 50) train.position.x = X0 - 10;
    }

    const sky = new THREE.Color('#bfdff5');
    return { root, update, background: sky, fog: new THREE.Fog(sky, 200 * k, 520 * k), exposure: 1.0 };
  },
};
