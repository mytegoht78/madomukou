// 写真モード: 写真から奥行きを推定し、起伏のある板として窓の奥に置く。
// 手前の物がずれて開く「穴」は、奥の板（背景の色）で埋める。
import * as THREE from 'three';

const abs = p => new URL(p, location.href).href;
const TF_URL = abs('vendor/transformers.min.js');
const DEPTH_MODEL = 'onnx-community/depth-anything-v2-small';
const GRID = 240;          // 板の分割数

function texFrom(canvas, srgb) {
  const t = new THREE.Texture(canvas);
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  if (srgb) t.encoding = THREE.sRGBEncoding;
  t.needsUpdate = true;
  return t;
}

export function createPhoto({ st, say, getHead }) {
  const root = new THREE.Group();
  root.name = 'photo';
  const S = { imgAspect: 1.6, W: 34, H: 20, zRef: 55, name: 'sample' };

  const colorTex = new THREE.Texture();
  const depthTex = new THREE.DataTexture(new Uint8Array([178, 178, 178, 255]), 1, 1, THREE.RGBAFormat);
  depthTex.needsUpdate = true;

  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uMap: { value: colorTex }, uDepth: { value: depthTex }, uD: { value: st.D }, uStep: { value: new THREE.Vector2(1 / GRID, 1 / GRID) }, uEdge: { value: 0.28 } },
    vertexShader: `
      uniform sampler2D uDepth; uniform float uD; uniform vec2 uStep;
      varying vec2 vUv; varying float vEdge;
      float dep(vec2 p){ return texture2D(uDepth, p).r; }
      void main(){
        vUv = uv;
        float d = dep(uv);
        float a = dep(uv + vec2(uStep.x, 0.)), b = dep(uv - vec2(uStep.x, 0.));
        float c = dep(uv + vec2(0., uStep.y)), e = dep(uv - vec2(0., uStep.y));
        vEdge = max(max(abs(a-d), abs(b-d)), max(abs(c-d), abs(e-d)));
        vec3 p = position;
        p.z = uD * (d - 0.7);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uEdge;
      varying vec2 vUv; varying float vEdge;
      void main(){
        if (vEdge > uEdge) discard;
        gl_FragColor = texture2D(uMap, vUv);
      }`
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, GRID, GRID), mat);
  mesh.frustumCulled = false;
  root.add(mesh);

  // 奥の板: 写真の3倍の大きさ。中央の1/3が写真と重なり、外側は写真のふちの色が伸びる
  const bgGeo = new THREE.PlaneGeometry(3, 3);
  const uv = bgGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3 - 1, uv.getY(i) * 3 - 1);
  const bgMesh = new THREE.Mesh(bgGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  bgMesh.frustumCulled = false;
  root.add(bgMesh);

  const fill = { blur: null, auto: null, field: null, src: null, pairs: [], pending: null };
  let depthCPU = { data: new Float32Array([0.7]), w: 1, h: 1 };

  /* ---------- 穴の埋め方 ---------- */
  function applyHole() {
    const m = st.hole;
    bgMesh.visible = m !== 'black';
    const t = m === 'blur' ? fill.blur : m === 'dropper' ? (fill.field || fill.auto) : fill.auto;
    bgMesh.material.map = t || fill.blur;
    bgMesh.material.needsUpdate = true;
  }

  // 自動: 奥にある画素ほど重く扱い、ピラミッド状に広げて穴を埋める（push-pull）
  function buildAuto() {
    const src = fill.src; if (!src) return;
    const w = 160, h = Math.max(2, Math.round(160 * src.height / src.width));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0, w, h);
    const img = x.getImageData(0, 0, w, h), px = img.data;
    const { data: dd, w: dw, h: dh } = depthCPU;
    let wt = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const d = dd[Math.min(dh - 1, Math.floor(j / h * dh)) * dw + Math.min(dw - 1, Math.floor(i / w * dw))];
      wt[j * w + i] = Math.pow(Math.max(0, 1 - d), 3);
    }
    // 手前の物のふちは色が混ざっているので、重みの低い側を少し広げる
    const er = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let m = 1;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const ii = Math.min(w - 1, Math.max(0, i + di)), jj = Math.min(h - 1, Math.max(0, j + dj));
        m = Math.min(m, wt[jj * w + ii]);
      }
      er[j * w + i] = m;
    }
    wt = er;
    let lv = { w, h, c: new Float32Array(w * h * 3), a: new Float32Array(w * h) };
    for (let k = 0; k < w * h; k++) { const a = wt[k]; lv.a[k] = a; lv.c[k * 3] = px[k * 4] * a; lv.c[k * 3 + 1] = px[k * 4 + 1] * a; lv.c[k * 3 + 2] = px[k * 4 + 2] * a; }
    const levels = [lv];
    while (lv.w > 1 || lv.h > 1) {
      const nw = Math.ceil(lv.w / 2), nh = Math.ceil(lv.h / 2);
      const n = { w: nw, h: nh, c: new Float32Array(nw * nh * 3), a: new Float32Array(nw * nh) }, cnt = new Float32Array(nw * nh);
      for (let j = 0; j < lv.h; j++) for (let i = 0; i < lv.w; i++) {
        const s = j * lv.w + i, d = (j >> 1) * nw + (i >> 1);
        n.a[d] += lv.a[s]; n.c[d * 3] += lv.c[s * 3]; n.c[d * 3 + 1] += lv.c[s * 3 + 1]; n.c[d * 3 + 2] += lv.c[s * 3 + 2]; cnt[d]++;
      }
      for (let d = 0; d < nw * nh; d++) { n.a[d] /= cnt[d]; n.c[d * 3] /= cnt[d]; n.c[d * 3 + 1] /= cnt[d]; n.c[d * 3 + 2] /= cnt[d]; }
      levels.push(n); lv = n;
    }
    // 一番粗い段: 色に直す
    const top = levels[levels.length - 1];
    for (let d = 0; d < top.w * top.h; d++) {
      const a = top.a[d];
      for (let k = 0; k < 3; k++) top.c[d * 3 + k] = a > 1e-6 ? top.c[d * 3 + k] / a : 128;
      top.a[d] = 1;
    }
    for (let l = levels.length - 2; l >= 0; l--) {
      const f = levels[l], cs = levels[l + 1];
      for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
        // 粗い段を双線形で読む
        const fx = Math.min(cs.w - 1, Math.max(0, (i + 0.5) / 2 - 0.5)), fy = Math.min(cs.h - 1, Math.max(0, (j + 0.5) / 2 - 0.5));
        const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(cs.w - 1, x0 + 1), y1 = Math.min(cs.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
        const s = j * f.w + i, af = Math.min(1, f.a[s]);
        for (let k = 0; k < 3; k++) {
          const v = (cs.c[(y0 * cs.w + x0) * 3 + k] * (1 - tx) + cs.c[(y0 * cs.w + x1) * 3 + k] * tx) * (1 - ty)
                  + (cs.c[(y1 * cs.w + x0) * 3 + k] * (1 - tx) + cs.c[(y1 * cs.w + x1) * 3 + k] * tx) * ty;
          f.c[s * 3 + k] = (af > 0 ? f.c[s * 3 + k] / Math.max(f.a[s], 1e-6) * af : 0) + (1 - af) * v;
        }
        f.a[s] = 1;
      }
    }
    const L0 = levels[0];
    for (let k = 0; k < w * h; k++) { px[k * 4] = L0.c[k * 3]; px[k * 4 + 1] = L0.c[k * 3 + 1]; px[k * 4 + 2] = L0.c[k * 3 + 2]; px[k * 4 + 3] = 255; }
    x.putImageData(img, 0, 0);
    const o = document.createElement('canvas'); o.width = w; o.height = h;
    const ox = o.getContext('2d'); ox.filter = 'blur(1.5px)'; ox.drawImage(c, 0, 0);
    if (fill.auto) fill.auto.dispose();
    fill.auto = texFrom(o, true);
    applyHole();
  }

  // スポイト: 終点が1つなら一面その色、2つ以上なら距離に応じたグラデーション（逆距離加重）
  function rebuildField() {
    if (fill.field) { fill.field.dispose(); fill.field = null; }
    if (fill.pairs.length) {
      const w = 96, h = Math.max(1, Math.round(96 / S.imgAspect));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'), img = x.createImageData(w, h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const u = (i + 0.5) / w, v = 1 - (j + 0.5) / h;
        let sw = 0, r = 0, g = 0, b = 0;
        for (const p of fill.pairs) {
          const dx = (u - p.u) * S.imgAspect, dy = v - p.v, k = 1 / (dx * dx + dy * dy + 0.002);
          sw += k; r += p.c[0] * k; g += p.c[1] * k; b += p.c[2] * k;
        }
        const o = (j * w + i) * 4;
        img.data[o] = r / sw; img.data[o + 1] = g / sw; img.data[o + 2] = b / sw; img.data[o + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      fill.field = texFrom(c, true);
    }
    applyHole();
  }

  function sampleColor(u, v) {
    const s = fill.src, w = s.width, h = s.height;
    const px = Math.min(w - 5, Math.max(0, Math.floor(u * w) - 2)), py = Math.min(h - 5, Math.max(0, Math.floor((1 - v) * h) - 2));
    const d = s.getContext('2d').getImageData(px, py, 5, 5).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    return [r / n, g / n, b / n];
  }

  // 画面上の点(cm)から目へ向かう視線が、手前の面（穴を除く）に当たる位置
  function pickFront(sx, sy) {
    const head = getHead(), { data, w, h } = depthCPU, D = st.D;
    const at = (u, v) => data[Math.min(h - 1, Math.max(0, Math.round((1 - v) * (h - 1)))) * w + Math.min(w - 1, Math.max(0, Math.round(u * (w - 1))))];
    for (let n = 0; n <= 400; n++) {
      const z = 0.3 * D - n / 400 * D, s = (head.z - z) / head.z;
      const x = head.x + (sx - head.x) * s, y = head.y + (sy - head.y) * s;
      const u = x / mesh.scale.x + 0.5, v = y / mesh.scale.y + 0.5;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const d = at(u, v), e = 1 / GRID;
      const edge = Math.max(Math.abs(at(u + e, v) - d), Math.abs(at(u - e, v) - d), Math.abs(at(u, v + e) - d), Math.abs(at(u, v - e) - d));
      if (edge > mat.uniforms.uEdge.value) continue;
      if (z <= D * (d - 0.7)) return { u, v };
    }
    return null;
  }
  function pickBack(sx, sy) {
    const head = getHead(), z = bgMesh.position.z, s = (head.z - z) / head.z;
    const u = (head.x + (sx - head.x) * s) / bgMesh.scale.x + 0.5, v = (head.y + (sy - head.y) * s) / bgMesh.scale.y + 0.5;
    return (u < 0 || u > 1 || v < 0 || v > 1) ? null : { u, v };
  }

  // スポイトの操作（画面上の点 sx, sy は cm）。戻り値は案内文
  function dropperTap(sx, sy) {
    if (!fill.pending) {
      const hit = pickFront(sx, sy);
      if (!hit) return '写真の上をタップしてください。';
      fill.pending = { c: sampleColor(hit.u, hit.v) };
      return '色を取りました。次に、頭を動かして穴を開け、色を付けたい穴をタップしてください。';
    }
    const hit = pickBack(sx, sy);
    if (!hit) return '穴の位置が写真の外です。写真の範囲内をタップしてください。';
    fill.pairs.push({ c: fill.pending.c, u: hit.u, v: hit.v });
    fill.pending = null;
    rebuildField();
    return `色を置きました（${fill.pairs.length}組）。続けて次の色を取れます。`;
  }
  function dropperUndo() { if (fill.pending) fill.pending = null; else fill.pairs.pop(); rebuildField(); }
  function dropperClear() { fill.pairs.length = 0; fill.pending = null; rebuildField(); }

  /* ---------- 配置 ---------- */
  function layout(W, H, zRef) {
    S.W = W; S.H = H; S.zRef = zRef;
    const sa = W / H, ia = S.imgAspect;
    let w, h;
    if (ia > sa) { h = H; w = H * ia; } else { w = W; h = W / ia; }
    const m = (zRef + 0.7 * st.D) / zRef * 1.08;   // 奥へ引いた分の余白
    mesh.scale.set(w * m * st.zoom, h * m * st.zoom, 1);
    bgMesh.scale.copy(mesh.scale);
    bgMesh.position.z = -0.72 * st.D;
    mat.uniforms.uD.value = st.D;
  }

  /* ---------- 画像と深度 ---------- */
  function setImage(colorCanvas) {
    const old = mat.uniforms.uMap.value;
    mat.uniforms.uMap.value = texFrom(colorCanvas, false);   // ShaderMaterial はそのままの値を出すので変換しない
    old.dispose();
    const bw = 48, bh = Math.max(1, Math.round(48 * colorCanvas.height / colorCanvas.width));
    const bc = document.createElement('canvas'); bc.width = bw; bc.height = bh;
    const bx = bc.getContext('2d'); bx.filter = 'blur(2px)'; bx.drawImage(colorCanvas, 0, 0, bw, bh);
    if (fill.blur) fill.blur.dispose();
    fill.blur = texFrom(bc, true);
    fill.src = colorCanvas; fill.pairs.length = 0; fill.pending = null;
    S.imgAspect = colorCanvas.width / colorCanvas.height;
    rebuildField();
    buildAuto();
    layout(S.W, S.H, S.zRef);
  }

  function setDepth(values, w, h) {          // values: 0..1（大きいほど手前）、画像の上から下の順
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      const dst = (h - 1 - y) * w;
      for (let x = 0; x < w; x++) {
        const v = Math.max(0, Math.min(255, Math.round(values[y * w + x] * 255)));
        const o = (dst + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255;
      }
    }
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
    depthCPU = { data: values, w, h };
    const old = mat.uniforms.uDepth.value;
    mat.uniforms.uDepth.value = t;
    old.dispose();
    buildAuto();
  }

  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      let acc = 0, cnt = 0;
      for (let x = -r; x <= r; x++) { if (x >= 0 && x < w) { acc += src[y * w + x]; cnt++; } }
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc / cnt;
        const a = x - r, b = x + r + 1;
        if (a >= 0) { acc -= src[y * w + a]; cnt--; }
        if (b < w) { acc += src[y * w + b]; cnt++; }
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0, cnt = 0;
      for (let y = -r; y <= r; y++) { if (y >= 0 && y < h) { acc += tmp[y * w + x]; cnt++; } }
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / cnt;
        const a = y - r, b = y + r + 1;
        if (a >= 0) { acc -= tmp[a * w + x]; cnt--; }
        if (b < h) { acc += tmp[b * w + x]; cnt++; }
      }
    }
    return out;
  }

  // 8bitの深度（大きいほど手前）を 2%〜98% で正規化して 0..1 にする
  function normalizeDepth(u8, w, h) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < u8.length; i++) hist[u8[i]]++;
    const total = u8.length;
    let acc = 0, lo = 0, hi = 255;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * 0.02) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= total * 0.02) { hi = i; break; } }
    const span = Math.max(1, hi - lo);
    const f = new Float32Array(u8.length);
    for (let i = 0; i < f.length; i++) f[i] = Math.min(1, Math.max(0, (u8[i] - lo) / span));
    setDepth(boxBlur(boxBlur(f, w, h, 2), w, h, 1), w, h);
  }

  let depthPipe = null, jobId = 0;
  async function estimateDepth(srcCanvas) {
    const job = ++jobId;
    try {
      if (!depthPipe) {
        say('奥行きを推定するモデルを読み込み中…（初回は約120MB。写真は外に送りません）', true);
        const T = await import(TF_URL);
        T.env.allowRemoteModels = false;
        T.env.allowLocalModels = true;
        T.env.localModelPath = abs('vendor/models/');
        T.env.backends.onnx.wasm.wasmPaths = abs('vendor/ort/');
        const progress = p => {
          if (p.status === 'progress' && p.file && p.file.endsWith('.onnx')) say(`奥行きを推定するモデルを読み込み中… ${Math.round(p.progress)}%`, true);
        };
        try {
          if (!navigator.gpu) throw new Error('no webgpu');
          depthPipe = await T.pipeline('depth-estimation', DEPTH_MODEL, { device: 'webgpu', progress_callback: progress });
        } catch (e) {
          depthPipe = await T.pipeline('depth-estimation', DEPTH_MODEL, { progress_callback: progress });
        }
      }
      say('写真の奥行きを推定中…', true);
      const out = await depthPipe(srcCanvas.toDataURL('image/jpeg', 0.92));
      if (job !== jobId) return;
      const d = out.depth;
      normalizeDepth(d.data, d.width, d.height);
      say('奥行きができました。頭や視点を動かして覗いてみてください。');
    } catch (err) {
      console.error(err);
      if (job !== jobId) return;
      say('奥行きの推定に失敗しました。簡易的な奥行きで表示します。');
      fallbackDepth(srcCanvas);
    }
  }

  // モデルが使えないときの代わり: 画像の下ほど手前、明るいほど奥とみなす
  function fallbackDepth(c) {
    const w = 160, h = Math.max(1, Math.round(160 / (c.width / c.height)));
    const t = document.createElement('canvas'); t.width = w; t.height = h;
    const x = t.getContext('2d'); x.drawImage(c, 0, 0, w, h);
    const px = x.getImageData(0, 0, w, h).data, u8 = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const o = (j * w + i) * 4, lum = (px[o] * .3 + px[o + 1] * .59 + px[o + 2] * .11) / 255;
      u8[j * w + i] = Math.round(255 * (0.6 * (j / h) + 0.4 * (1 - lum)));
    }
    normalizeDepth(u8, w, h);
  }

  function loadFile(file, done) {
    if (!file || !file.type.startsWith('image/')) { say('画像ファイルを選んでください。'); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      S.name = 'file';
      setDepth(new Float32Array([0.7]), 1, 1);   // 推定が終わるまで平らに
      setImage(c);
      done && done();
      estimateDepth(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); say('この画像は読み込めませんでした。'); };
    img.src = url;
  }

  /* ---------- サンプル写真（夕暮れの山並み。奥行きも一緒に描く） ---------- */
  function makeDemo() {
    const w = 1280, h = 800;
    const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const col = mk(), dep = mk(), cx = col.getContext('2d'), dx = dep.getContext('2d');
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const g = v => { const n = Math.round(v * 255); return `rgb(${n},${n},${n})`; };
    const sky = cx.createLinearGradient(0, 0, 0, h * .7);
    sky.addColorStop(0, '#2f3d73'); sky.addColorStop(.55, '#d7739a'); sky.addColorStop(1, '#ffc58a');
    cx.fillStyle = sky; cx.fillRect(0, 0, w, h);
    dx.fillStyle = g(0.04); dx.fillRect(0, 0, w, h);
    const layer = (colorStyle, dTop, dBot, y0, pathFn) => {
      cx.fillStyle = colorStyle; cx.beginPath(); pathFn(cx); cx.fill();
      const gr = dx.createLinearGradient(0, y0, 0, h); gr.addColorStop(0, g(dTop)); gr.addColorStop(1, g(dBot));
      dx.fillStyle = gr; dx.beginPath(); pathFn(dx); dx.fill();
    };
    const ridge = (base, amp, f1, f2, ph) => x => base - amp * (0.6 * Math.sin(x * f1 + ph) + 0.4 * Math.sin(x * f2 + ph * 2.3) * Math.sin(x * f1 * .37 + ph));
    const area = fn => c => { c.moveTo(0, h); for (let x = 0; x <= w; x += 8) c.lineTo(x, fn(x)); c.lineTo(w, h); c.closePath(); };
    cx.fillStyle = '#fff1c9'; cx.beginPath(); cx.arc(900, 330, 70, 0, 7); cx.fill();
    dx.fillStyle = g(0.06); dx.beginPath(); dx.arc(900, 330, 70, 0, 7); dx.fill();
    const r1 = ridge(380, 90, .006, .017, 1.1), r2 = ridge(470, 80, .008, .021, 3.4), r3 = ridge(570, 55, .006, .015, 5.2);
    layer('#9a7fb0', .12, .18, 280, area(r1));
    layer('#6d5d96', .22, .3, 380, area(r2));
    layer('#3f4a7a', .36, .5, 500, area(r3));
    const lake = cx.createLinearGradient(0, 600, 0, 700); lake.addColorStop(0, '#f2a98b'); lake.addColorStop(1, '#6f6aa3');
    layer(lake, .5, .56, 600, c => { c.rect(0, 600, w, 110); });
    const tree = (c, x, base, size) => {
      for (let i = 0; i < 4; i++) {
        const t = base - size * (0.28 * i), wd = size * (0.5 - i * 0.08);
        c.moveTo(x, t - size * 0.55); c.lineTo(x - wd, t); c.lineTo(x + wd, t); c.closePath();
      }
    };
    const forest = (colorStyle, depthV, base, size, step) => {
      const xs = []; for (let x = -20; x < w + 40; x += step) xs.push([x + rnd() * step * .6, size * (.7 + rnd() * .6)]);
      layer(colorStyle, depthV, depthV, base - size, c => { xs.forEach(([x, s]) => tree(c, x, base, s)); c.rect(0, base, w, h - base); });
    };
    forest('#24365a', .6, 700, 80, 46);
    forest('#182645', .72, 760, 120, 85);
    layer('#0e1730', .86, .9, 100, c => { tree(c, 120, 800, 430); tree(c, 190, 810, 300); });
    layer('#0e1730', .84, .88, 100, c => { tree(c, 1130, 800, 470); tree(c, 1060, 810, 260); });
    layer('#0a1124', .9, 1, 720, c => { c.moveTo(0, h); for (let x = 0; x <= w; x += 6) c.lineTo(x, 760 + 20 * Math.sin(x * .05) + rnd() * 18); c.lineTo(w, h); c.closePath(); });
    layer('#ffb86b', .97, .97, 560, c => { c.moveTo(640, 800); c.lineTo(650, 560); c.lineTo(740, 585); c.lineTo(650, 612); c.lineTo(660, 800); c.closePath(); });
    const d8 = dx.getImageData(0, 0, w, h).data, f = new Float32Array(w * h);
    for (let i = 0; i < f.length; i++) f[i] = d8[i * 4] / 255;
    return { col, depth: boxBlur(f, w, h, 1), w, h };
  }
  function loadDemo() {
    jobId++;
    const demo = makeDemo();
    S.name = 'sample';
    fill.src = demo.col;
    setDepth(demo.depth, demo.w, demo.h);
    setImage(demo.col);
  }

  return {
    root, layout, loadFile, loadDemo, applyHole, dropperTap, dropperUndo, dropperClear,
    get dropperState() { return { pairs: fill.pairs.map(p => p.c), pending: fill.pending && fill.pending.c }; },
    get isSample() { return S.name === 'sample'; },
  };
}
