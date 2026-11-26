// 和室と縁側: 和室に座って外を見る。開けた障子の先に縁側、その先に庭と山。
// 実物大（cm）。目の高さが y=0、畳の面は y=-75（座ったときの目の高さ）。
import * as THREE from 'three';
import { rng, canvasTex, speckle, vgrad, std, merger, lumpy } from '../util.js';

export default {
  id: 'washitsu', name: '和室と縁側', sub: '障子の先に縁側と庭。近づくと部屋の中も見える',
  thumb: 'linear-gradient(180deg,#cfe6f5 0%,#cfe6f5 30%,#7aa060 31%,#5a8048 60%,#a88a5a 61%,#d8c58f 100%)',
  shadows: true,
  build({ W, H, zRef, mobile }) {
    const R = rng(8);
    const root = new THREE.Group();
    // 窓が小さいと実物大では庭の一部しか見えないので、部屋ごと縮めて「障子の開口が窓いっぱい」になるようにする
    const eH = W / 2 / zRef, eV = H / 2 / zRef;
    const fit = (half, e) => (e * zRef) / Math.max(1e-3, half - 270 * e);
    const s = Math.max(0.04, Math.min(1, Math.max(eH < 110 / 270 ? fit(110, eH) : 1, eV < 95 / 270 ? fit(95, eV) : 1)));
    root.scale.setScalar(s);
    const FLOOR = -75, GROUND = -115;
    const ROOM_X = 170, ROOM_Z = -270, ENG_Z = -360, KAMOI = 105, CEIL = 165;

    /* 光 */
    root.add(new THREE.HemisphereLight(0xe6f0ff, 0x8a7a5a, 0.62));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
    sun.position.set(-360, 700, -900); sun.target.position.set(0, 0, -500);
    sun.castShadow = true;
    const sc = sun.shadow.camera; sc.left = -900 * s; sc.right = 900 * s; sc.top = 900 * s; sc.bottom = -900 * s; sc.near = 100 * s; sc.far = 2600 * s;   // 影のカメラは世界の大きさで指定する
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 2 * s;
    root.add(sun, sun.target);

    /* 空と遠くの山 */
    const skyTex = canvasTex(16, 512, (x, w, h) => vgrad(x, w, h, [[0, '#5d9bd6'], [0.35, '#9cc8ec'], [0.5, '#dbe9f2'], [0.52, '#c9d6cf'], [1, '#9aa58f']]));
    const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 24), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, toneMapped: false }));
    root.add(sky);
    const mtTex = canvasTex(2048, 512, (x, w, h) => {
      const ridge = (col, base, amp, f, ph) => { x.fillStyle = col; x.beginPath(); x.moveTo(0, h); for (let i = 0; i <= w; i += 8) x.lineTo(i, base - amp * (0.55 * Math.sin(i * f + ph) + 0.3 * Math.sin(i * f * 2.7 + ph * 2) + 0.15 * Math.sin(i * f * 7 + ph))); x.lineTo(w, h); x.fill(); };
      ridge('#a9bccb', 260, 150, 0.004, 1); ridge('#8ea7b3', 330, 120, 0.006, 4); ridge('#6f8f88', 400, 70, 0.009, 2);
    });
    const mts = new THREE.Mesh(new THREE.PlaneGeometry(26000, 6500), new THREE.MeshBasicMaterial({ map: mtTex, transparent: true, fog: false }));
    mts.position.set(0, 1200, -7000); root.add(mts);

    /* 庭の地面: 手前は白砂（砂紋）、奥は苔 */
    const gravel = canvasTex(512, 512, (x, w, h) => {
      x.fillStyle = '#e6e0d0'; x.fillRect(0, 0, w, h);
      speckle(x, w, h, 14000, ['#cfc8b6', '#f4f0e6', '#bdb5a2'], 2, R);
      x.strokeStyle = 'rgba(120,110,90,.28)'; x.lineWidth = 2;
      for (let y = 6; y < h; y += 14) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); }
    }, { repeat: [12, 3] });
    const g1 = new THREE.Mesh(new THREE.PlaneGeometry(1600, 260), std(0xffffff, 1, 0, { map: gravel }));
    g1.rotation.x = -Math.PI / 2; g1.position.set(0, GROUND, ENG_Z - 130); g1.receiveShadow = true; root.add(g1);
    const moss = canvasTex(512, 512, (x, w, h) => { x.fillStyle = '#5f8a3e'; x.fillRect(0, 0, w, h); speckle(x, w, h, 20000, ['#4f7a32', '#73a04a', '#3f6a2a', '#86b05a'], 3, R); }, { repeat: [16, 10] });
    const g2 = new THREE.Mesh(new THREE.PlaneGeometry(3200, 2200), std(0xffffff, 1, 0, { map: moss }));
    g2.rotation.x = -Math.PI / 2; g2.position.set(0, GROUND - 0.5, ENG_Z - 260 - 1100); g2.receiveShadow = true; root.add(g2);

    /* 竹垣 */
    const fenceTex = canvasTex(512, 256, (x, w, h) => {
      x.fillStyle = '#b39a5e'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < w; i += 10) { const g = x.createLinearGradient(i, 0, i + 10, 0); g.addColorStop(0, '#8a7442'); g.addColorStop(0.5, '#d2bb7f'); g.addColorStop(1, '#7a6438'); x.fillStyle = g; x.fillRect(i, 0, 10, h); }
      x.fillStyle = 'rgba(60,40,20,.5)'; for (let i = 0; i < w; i += 10) for (let y = 20 + (i % 30); y < h; y += 60) x.fillRect(i, y, 10, 2);
      x.fillStyle = '#4a3a24'; [0.25, 0.7].forEach(p => x.fillRect(0, h * p, w, 7));
    }, { repeat: [40, 1] });
    const fence = new THREE.Mesh(new THREE.PlaneGeometry(3200, 110), std(0xffffff, 0.9, 0, { map: fenceTex }));
    fence.position.set(0, GROUND + 55, -1150); fence.receiveShadow = true; root.add(fence);

    /* 庭の木や石（動かないので1つにまとめる） */
    const mg = merger();
    const ball = new THREE.IcosahedronGeometry(1, 2), cyl = new THREE.CylinderGeometry(1, 1, 1, 28), box = new THREE.BoxGeometry(1, 1, 1);
    const cone6 = new THREE.ConeGeometry(1, 1, 6);
    const rocks = [0, 1, 2, 3].map(i => lumpy(1, 0.2, i * 5.1, [1, 0.65, 0.9]));
    const rock = (x, z, s, c = '#8a877e') => mg.add(rocks[(R() * 4) | 0], c, [x, GROUND + s * 0.2, z], [0, R() * 3, 0], s, 0.08, R);
    // 飛び石
    for (let i = 0; i < 7; i++) mg.add(cyl, '#9b978c', [-20 - i * 14 + R() * 10, GROUND + 1.5, ENG_Z - 40 - i * 34], [0, 0, 0], [16 + R() * 5, 3, 13 + R() * 4], 0.08, R);
    // 石灯籠
    const LX = -120, LZ = -640;
    mg.add(cyl, '#8f8c84', [LX, GROUND + 8, LZ], [0, 0, 0], [22, 16, 22]);
    mg.add(cyl, '#99968e', [LX, GROUND + 50, LZ], [0, 0, 0], [8, 70, 8]);
    mg.add(box, '#8f8c84', [LX, GROUND + 90, LZ], [0, 0, 0], [30, 10, 30]);
    mg.add(box, '#a39f96', [LX, GROUND + 108, LZ], [0, 0, 0], [24, 26, 24]);
    mg.add(cone6, '#7f7c75', [LX, GROUND + 134, LZ], [0, 0, 0], [30, 26, 30]);
    mg.add(ball, '#8f8c84', [LX, GROUND + 150, LZ], [0, 0, 0], 6);
    rock(LX + 30, LZ + 20, 18); rock(LX - 35, LZ - 10, 24);
    // 池のまわりの石
    const PX = 160, PZ = -800;
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; rock(PX + Math.cos(a) * 118, PZ + Math.sin(a) * 66, 14 + R() * 16, ['#7d7a72', '#8f8b82', '#6f6c66'][i % 3]); }
    // 松（幹を曲げ、葉を平たい塊に）
    const pine = (x, z, s) => {
      let px = x, py = GROUND, pz = z, ang = 0.3;
      for (let i = 0; i < 6; i++) {
        const len = 45 * s, nx = px + Math.sin(ang) * len, ny = py + Math.cos(ang) * len * 0.95;
        mg.add(cyl, '#5a4434', [(px + nx) / 2, (py + ny) / 2, pz], [0, 0, -ang], [8 * s * (1 - i * 0.1), len + 4, 8 * s * (1 - i * 0.1)], 0.05, R);
        px = nx; py = ny; ang += (i % 2 ? -0.55 : 0.45);
        if (i >= 2) for (let j = 0; j < 3; j++) mg.add(ball, '#2f5a32', [px + (R() - 0.5) * 70 * s, py + R() * 12 * s, pz + (R() - 0.5) * 60 * s], [0, R() * 3, 0], [45 * s, 14 * s, 38 * s], 0.12, R);
      }
    };
    pine(300, -700, 1.1); pine(-420, -1000, 0.9);
    // もみじ
    const maple = (x, z, s) => {
      mg.add(cyl, '#5e4a3a', [x, GROUND + 70 * s, z], [0, 0, 0.08], [6 * s, 140 * s, 6 * s]);
      for (let j = 0; j < 14; j++) mg.add(ball, ['#c8402a', '#e0662f', '#b8302a', '#e89040'][j % 4], [x + (R() - 0.5) * 120 * s, GROUND + (120 + R() * 90) * s, z + (R() - 0.5) * 80 * s], [R(), R(), 0], (26 + R() * 16) * s, 0.1, R);
    };
    maple(-330, -820, 1.0); maple(560, -980, 0.8);
    // 刈り込み
    for (let i = 0; i < 18; i++) { const x = (R() - 0.5) * 1400, z = -950 - R() * 160; mg.add(ball, '#3f7a38', [x, GROUND + 18, z], [0, R() * 3, 0], [36 + R() * 30, 28 + R() * 14, 30 + R() * 16], 0.1, R); }
    for (let i = 0; i < 6; i++) mg.add(ball, '#4a8a3f', [PX - 140 + R() * 280, GROUND + 12, PZ - 80 - R() * 40], [0, R() * 3, 0], [24 + R() * 12, 18, 22], 0.1, R);
    // 垣の向こうの木立
    for (let i = 0; i < 70; i++) { const x = (R() - 0.5) * 4200, z = -1700 - R() * 1100, h = 110 + R() * 150; mg.add(ball, ['#4f7a56', '#5a8560', '#466e4c'][i % 3], [x, GROUND + h, z], [0, R() * 3, 0], [55 + R() * 45, 70 + R() * 60, 55], 0.08, R); mg.add(cyl, '#4a3a2c', [x, GROUND + h / 2, z], [0, 0, 0], [8, h, 8]); }

    /* 縁側と部屋（木の部分） */
    const wood = '#7a5a3c', woodD = '#5a3f28';
    mg.add(box, '#9a7650', [0, FLOOR - 4.2, (ROOM_Z + ENG_Z) / 2], [0, 0, 0], [900, 8, ROOM_Z - ENG_Z]);   // 縁側の床板の下地
    mg.add(box, woodD, [0, (FLOOR - 4 + GROUND) / 2, ENG_Z - 2], [0, 0, 0], [900, FLOOR - GROUND - 8, 6]);                                     // 縁側の下の板
    [-ROOM_X, ROOM_X, -460, 460].forEach(x => mg.add(box, wood, [x, (GROUND + 200) / 2, ENG_Z + 6], [0, 0, 0], [12, 200 - GROUND, 12], 0.04, R));  // 縁側の柱
    [-ROOM_X, ROOM_X].forEach(x => mg.add(box, wood, [x, (FLOOR + CEIL) / 2, ROOM_Z], [0, 0, 0], [12, CEIL - FLOOR, 12], 0.04, R));              // 部屋の柱
    mg.add(box, wood, [0, KAMOI + 4, ROOM_Z], [0, 0, 0], [ROOM_X * 2, 8, 10]);      // 鴨居
    mg.add(box, wood, [0, FLOOR + 1, ROOM_Z], [0, 0, 0], [ROOM_X * 2, 3, 10]);      // 敷居
    mg.add(box, '#d8c8a2', [0, (KAMOI + 8 + CEIL) / 2, ROOM_Z], [0, 0, 0], [ROOM_X * 2, CEIL - KAMOI - 8, 6]);   // 小壁
    mg.add(box, wood, [0, 196, ENG_Z + 6], [0, 0, 0], [960, 14, 14]);              // 縁側の桁
    // 屋根（影を落とす）
    mg.add(box, '#3d3a38', [0, 214, (ENG_Z - 70 + 60) / 2], [0, 0, 0], [1000, 12, -ENG_Z + 70 + 60]);
    // ちゃぶ台と湯のみ・急須
    const TX = -30, TZ = -185;
    mg.add(cyl, '#6b4428', [TX, FLOOR + 31, TZ], [0, 0, 0], [42, 3, 42]);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => mg.add(box, '#5a3820', [TX + a * 22, FLOOR + 15, TZ + b * 22], [0, 0, 0], [4, 30, 4]));
    mg.add(cyl, '#e8e2d2', [TX + 12, FLOOR + 32.5, TZ + 8], [0, 0, 0], [3.6, 8, 3.6]);
    mg.add(cyl, '#5f7a4a', [TX + 12, FLOOR + 40.3, TZ + 8], [0, 0, 0], [3.2, 0.4, 3.2]);
    mg.add(ball, '#3b3f44', [TX - 10, FLOOR + 39, TZ - 4], [0, 0, 0], [8, 6.5, 8]);
    mg.add(cyl, '#2b2e32', [TX - 1, FLOOR + 40, TZ - 4], [0, 0, 1.1], [1, 8, 1]);
    const statics = mg.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    statics.castShadow = true; statics.receiveShadow = true;
    root.add(statics);

    /* 縁側の床板 */
    const boardTex = canvasTex(512, 256, (x, w, h) => {
      x.fillStyle = '#a07a52'; x.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) { x.fillStyle = `rgb(${150 + R() * 30},${112 + R() * 20},${74 + R() * 14})`; x.fillRect(0, y, w, 31); x.fillStyle = 'rgba(50,30,15,.6)'; x.fillRect(0, y + 31, w, 1.5); }
      speckle(x, w, h, 900, ['rgba(80,50,25,.25)'], 6, R);
    }, { repeat: [6, 1] });
    const eng = new THREE.Mesh(new THREE.PlaneGeometry(900, ROOM_Z - ENG_Z), std(0xffffff, 0.55, 0, { map: boardTex }));
    eng.rotation.x = -Math.PI / 2; eng.position.set(0, FLOOR, (ROOM_Z + ENG_Z) / 2); eng.receiveShadow = true; root.add(eng);

    /* 畳 */
    const tatamiTex = canvasTex(1024, 768, (x, w, h) => {
      // 部屋 340×270cm を 6畳風に。1cm = 3px
      const s = 3;
      x.fillStyle = '#2a2a22'; x.fillRect(0, 0, w, h);
      const mat = (mx, my, mw, mh, vertical) => {
        x.fillStyle = '#b9b27a'; x.fillRect(mx * s, my * s, mw * s, mh * s);
        x.strokeStyle = 'rgba(110,105,60,.35)'; x.lineWidth = 1;
        if (vertical) for (let i = mx * s; i < (mx + mw) * s; i += 3) { x.beginPath(); x.moveTo(i, my * s); x.lineTo(i, (my + mh) * s); x.stroke(); }
        else for (let j = my * s; j < (my + mh) * s; j += 3) { x.beginPath(); x.moveTo(mx * s, j); x.lineTo((mx + mw) * s, j); x.stroke(); }
        x.strokeStyle = '#2d2a22'; x.lineWidth = 7;
        if (vertical) { x.beginPath(); x.moveTo(mx * s + 3, my * s); x.lineTo(mx * s + 3, (my + mh) * s); x.moveTo((mx + mw) * s - 3, my * s); x.lineTo((mx + mw) * s - 3, (my + mh) * s); x.stroke(); }
        else { x.beginPath(); x.moveTo(mx * s, my * s + 3); x.lineTo((mx + mw) * s, my * s + 3); x.moveTo(mx * s, (my + mh) * s - 3); x.lineTo((mx + mw) * s, (my + mh) * s - 3); x.stroke(); }
      };
      mat(0, 0, 170, 90, false); mat(170, 0, 170, 90, false);
      mat(0, 90, 90, 180, true); mat(90, 90, 160, 90, false); mat(90, 180, 160, 90, false); mat(250, 90, 90, 180, true);
    });
    const tatami = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_X * 2, -ROOM_Z), std(0xffffff, 0.9, 0, { map: tatamiTex }));
    tatami.rotation.x = -Math.PI / 2; tatami.position.set(0, FLOOR, ROOM_Z / 2); tatami.receiveShadow = true; root.add(tatami);

    /* 壁と天井 */
    const plaster = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#cdb88e'; x.fillRect(0, 0, w, h); speckle(x, w, h, 5000, ['#bfa97c', '#d9c69e', '#b39f74'], 2, R, 0.7); }, { repeat: [3, 2] });
    [-1, 1].forEach(sx => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(-ROOM_Z + 60, CEIL - FLOOR), std(0xffffff, 1, 0, { map: plaster }));
      m.rotation.y = -sx * Math.PI / 2; m.position.set(sx * ROOM_X, (CEIL + FLOOR) / 2, ROOM_Z / 2 + 30); m.receiveShadow = true; root.add(m);
    });
    const ceilTex = canvasTex(512, 256, (x, w, h) => { x.fillStyle = '#9a7a56'; x.fillRect(0, 0, w, h); for (let i = 0; i < w; i += 40) { x.fillStyle = `rgb(${140 + R() * 30},${108 + R() * 20},${74 + R() * 15})`; x.fillRect(i, 0, 39, h); x.fillStyle = 'rgba(40,25,10,.6)'; x.fillRect(i + 39, 0, 1.5, h); } });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_X * 2, -ROOM_Z + 60), std(0xffffff, 0.8, 0, { map: ceilTex }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, CEIL, ROOM_Z / 2 + 30); root.add(ceil);

    /* 障子（左右に寄せて開けてある） */
    const shojiTex = canvasTex(256, 512, (x, w, h) => {
      x.fillStyle = '#f4efe2'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#c8b48e';
      const cols = 4, rows = 8;
      for (let i = 0; i <= cols; i++) x.fillRect(i * (w - 8) / cols, 0, 8, h);
      for (let j = 0; j <= rows; j++) x.fillRect(0, j * (h * 0.78 - 8) / rows, w, 8);
      x.fillStyle = '#a88a62'; x.fillRect(0, h * 0.78, w, h * 0.22);      // 腰板
      x.strokeStyle = '#8a6a48'; x.lineWidth = 14; x.strokeRect(7, 7, w - 14, h - 14);
    });
    const shojiMat = new THREE.MeshStandardMaterial({ map: shojiTex, roughness: 0.9, emissive: 0xfff6e6, emissiveIntensity: 0.22, emissiveMap: shojiTex });
    const SW = 85, SH = KAMOI - FLOOR;
    [[-ROOM_X + SW / 2, -3], [-ROOM_X + SW / 2 + 6, -9], [ROOM_X - SW / 2, -3], [ROOM_X - SW / 2 - 6, -9]].forEach(([x, dz]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(SW, SH, 3), shojiMat); m.position.set(x, FLOOR + SH / 2, ROOM_Z + dz + 6); m.castShadow = true; m.receiveShadow = true; root.add(m);
    });

    /* 池の水 */
    const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: 0x2f5a5a, roughness: 0.08, metalness: 0.6 }));
    pond.rotation.x = -Math.PI / 2; pond.scale.set(112, 62, 1); pond.position.set(PX, GROUND + 0.6, PZ); root.add(pond);

    /* 風鈴（縁側の軒下） */
    const furin = new THREE.Group();
    furin.position.set(52, 189, ENG_Z + 10);
    const strLen = 150;
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, strLen, 4), std(0xeeeeee)); str.position.y = -strLen / 2; furin.add(str);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide }));
    bell.position.y = -strLen - 4.5; furin.add(bell);
    const tongue = new THREE.Group(); tongue.position.y = -strLen - 4; furin.add(tongue);
    const tstr = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 14, 4), std(0xeeeeee)); tstr.position.y = -7; tongue.add(tstr);
    const tanzaku = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 15), std(0xd8403a, 0.9, 0, { side: THREE.DoubleSide })); tanzaku.position.y = -21; tongue.add(tanzaku);
    root.add(furin);

    /* 舞い落ちるもみじ */
    const leafTex = canvasTex(64, 64, (x) => { x.fillStyle = '#d4502a'; x.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.62; x.lineTo(32 + Math.cos(a) * 30, 36 + Math.sin(a) * 30); x.lineTo(32 + Math.cos(a + 0.31) * 12, 36 + Math.sin(a + 0.31) * 12); } x.lineTo(32, 60); x.fill(); });
    const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
    const leaves = [];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), leafMat);
      const L = { m, x: -330 + (R() - 0.5) * 260, y: GROUND + R() * 260, z: -820 + (R() - 0.5) * 240, ph: R() * 6, v: 12 + R() * 10 };
      if (i < 6) { L.x = (R() - 0.5) * 200; L.z = -380 - R() * 120; L.y = GROUND + R() * 200; }
      leaves.push(L); root.add(m);
    }

    function update(dt, t) {
      const wind = Math.sin(t * 0.7) * 0.5 + Math.sin(t * 1.9) * 0.3;
      furin.rotation.z = wind * 0.035; furin.rotation.x = Math.sin(t * 1.1) * 0.02;
      tongue.rotation.z = wind * 0.35 + Math.sin(t * 3.1) * 0.08; tongue.rotation.x = Math.sin(t * 2.3) * 0.18;
      for (const L of leaves) {
        L.y -= L.v * dt;
        if (L.y < GROUND + 1) { L.y = GROUND + 200 + R() * 80; }
        L.m.position.set(L.x + Math.sin(t * 0.9 + L.ph) * 18, L.y, L.z + Math.cos(t * 0.7 + L.ph) * 10);
        L.m.rotation.set(t * 1.3 + L.ph, t * 0.9 + L.ph * 2, t * 0.5);
      }
    }

    const haze = new THREE.Color('#dbe6ee');
    return { root, update, background: haze, fog: new THREE.Fog(haze, 700 * s, 6500 * s), exposure: 1.0, far: 20000 * s };
  },
};
