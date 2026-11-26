// 視点（目の位置）を決める。座標は画面の中心が原点、単位は cm、x 右・y 上・z 画面から手前。
// 入力は3つ: マウス/指（手動）、インカメラの顔追跡、傾きセンサー（ジャイロ）。
// 顔と傾きを両方使うときは、カメラの遅れ（約0.1秒）の間に回った分を傾きセンサーで補う。
import * as THREE from 'three';

const abs = p => new URL(p, location.href).href;
const MP_URL = abs('vendor/mp/vision_bundle.mjs');
const MP_WASM = abs('vendor/mp/wasm');
const FACE_MODEL = abs('vendor/mp/face_landmarker.task');
const EYE_GAP_CM = 6.3;       // 平均的な瞳孔間距離
const LOST_MS = 1200;         // これだけ顔が見えなければ「見失った」

export function createViewpoint({ st, env, video, say, onChange }) {
  // env(): { W, H, mobile, angle, zRef }
  const manual = { x: 0, y: 0, z: null, tx: 0, ty: 0 };  // 手動（tx,ty は目標、x,y は追従後）
  const face = { on: false, starting: false, lm: null, lastT: -1, last: 0, frames: 0, t: { x: 0, y: 0, z: 55 }, q: new THREE.Quaternion(), fresh: false };
  const center = { x: 0, y: 0, z: null };                  // 顔追跡で「正面」とする位置
  const tilt = { on: false, available: false, have: false, q: new THREE.Quaternion(), ref: new THREE.Quaternion(), angle: 0 };
  const head = { x: 0, y: 0, z: 55 };                       // 平滑化した頭の位置（回転補正の前）
  const out = { x: 0, y: 0, z: 55 };                        // 最終的な目の位置
  let info = '停止中';

  const now = () => performance.now();
  const faceActive = () => face.on && now() - face.last < LOST_MS;

  /* ---------- 手動（マウス・指） ---------- */
  function setPointer(nx, ny) {          // nx, ny: 画面中心からの割合 -0.5..0.5
    const { W, H } = env();
    manual.tx = nx * W * 0.9; manual.ty = -ny * H * 0.9;
  }
  function setOffset(x, y) { manual.tx = x; manual.ty = y; }
  function getZ() { return manual.z ?? env().zRef; }
  function setZ(z) { manual.z = Math.max(8, Math.min(140, z)); }

  /* ---------- 傾きセンサー ---------- */
  const zee = new THREE.Vector3(0, 0, 1), eul = new THREE.Euler();
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
  const toRad = Math.PI / 180;
  function screenAngle() {
    const a = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
    return ((a % 360) + 360) % 360;
  }
  function onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    if (!tilt.available) { tilt.available = true; onChange && onChange('tilt-available'); }
    if (!tilt.on) return;
    // three.js の DeviceOrientationControls と同じ変換: 端末の向き → 画面座標系の回転
    const ang = screenAngle();
    eul.set(e.beta * toRad, (e.alpha || 0) * toRad, -e.gamma * toRad, 'YXZ');
    tilt.q.setFromEuler(eul).multiply(q1).multiply(q0.setFromAxisAngle(zee, -ang * toRad));
    if (!tilt.have || ang !== tilt.angle) {           // 最初の1回と、縦横が変わったときは今を基準にする
      tilt.ref.copy(tilt.q); face.q.copy(tilt.q); tilt.angle = ang; tilt.have = true;
    }
  }
  addEventListener('deviceorientation', onOrient);
  async function setTilt(on) {
    if (on && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { if (await DeviceOrientationEvent.requestPermission() !== 'granted') { say('傾きセンサーが許可されませんでした。'); return false; } } catch (e) { return false; }
    }
    tilt.on = on; tilt.have = false;
    return true;
  }

  /* ---------- 顔追跡 ---------- */
  function camOffset() {             // インカメラの位置（画面中心から, cm）
    const { W, H, mobile } = env();
    if (!mobile) return { x: 0, y: H / 2 + 1 };
    const m = 0.6;
    switch (screenAngle()) {
      case 90: return { x: -W / 2 - m, y: 0 };
      case 270: return { x: W / 2 + m, y: 0 };
      case 180: return { x: 0, y: -H / 2 - m };
      default: return { x: 0, y: H / 2 + m };
    }
  }

  let stream = null;
  async function startFace() {
    if (face.on || face.starting) return;
    face.starting = true; onChange && onChange('face');
    const mine = {};
    stream = mine;
    const gone = () => stream !== mine;
    try {
      say('カメラの使用を許可してください…', true);
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (gone()) { s.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = s; face.lastT = -1;
      if (document.hidden) { stopFace('hidden'); return; }
      await video.play();
      if (gone()) return;
      say('顔の検出モデルを読み込み中…', true);
      if (!face.lm) {
        const V = await import(MP_URL);
        const fileset = await V.FilesetResolver.forVisionTasks(MP_WASM);
        const opts = d => ({ baseOptions: { modelAssetPath: FACE_MODEL, delegate: d }, runningMode: 'VIDEO', numFaces: 1 });
        let lm = null;
        if (env().mobile) { try { lm = await V.FaceLandmarker.createFromOptions(fileset, opts('GPU')); } catch (e) { lm = null; } }
        face.lm = lm || await V.FaceLandmarker.createFromOptions(fileset, opts('CPU'));
      }
      if (gone()) return;
      face.on = true; face.starting = false; face.frames = 0;
      say(env().mobile ? '顔を探しています。画面を顔に向けてください。' : '顔を探しています。画面から50cmほど離れて、正面を向いてください。');
      onChange && onChange('face');
    } catch (err) {
      if (gone()) return;
      console.error(err);
      release();
      face.starting = false; onChange && onChange('face');
      const known = { NotAllowedError: 'カメラが許可されていません。アドレスバーのカメラの表示から許可してください。', NotFoundError: 'カメラが見つかりません。', NotReadableError: 'カメラを別のアプリが使っています。そのアプリを閉じてください。' };
      say(known[err && err.name] || `カメラまたは顔検出を始められませんでした（${(err && err.name) || 'Error'}）。`);
    }
  }
  function release() {
    if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
  function stopFace(why) {
    stream = null;
    const was = face.on || face.starting;
    face.on = false; face.starting = false;
    center.x = center.y = 0; center.z = null;
    release();
    info = '停止中';
    if (was && why === 'hidden') say('画面を離れたので、カメラを止めました。');
    onChange && onChange('face');
  }
  // 別のタブやアプリに移ったら、カメラをつけたままにしない（戻っても自動では再開しない）
  document.addEventListener('visibilitychange', () => { if (document.hidden && (face.on || face.starting)) stopFace('hidden'); });
  addEventListener('pagehide', () => { if (face.on || face.starting) stopFace('hidden'); });

  function trackFace(t) {
    if (!face.on || !face.lm || video.readyState < 2 || video.currentTime === face.lastT) return;
    face.lastT = video.currentTime;
    let res;
    try { res = face.lm.detectForVideo(video, t); } catch (e) { return; }
    const lm = res.faceLandmarks && res.faceLandmarks[0];
    face.frames++;
    if (!lm) {
      info = '顔が見えません';
      if (t - face.last > LOST_MS && face.wasFound) { face.wasFound = false; say('顔が見つかりません。カメラに顔を向けてください。'); }
      return;
    }
    if (!face.wasFound) { face.wasFound = true; say('顔を追っています。頭を動かしたり、近づいたりしてみてください。'); }
    face.last = t;
    const L = lm[468] || lm[33], R = lm[473] || lm[263];
    const vw = video.videoWidth, vh = video.videoHeight;
    const gap = Math.hypot((R.x - L.x) * vw, (R.y - L.y) * vh);
    if (gap < 4) return;
    const gapCm = lm[468] ? EYE_GAP_CM : 9.0;
    const fov = env().mobile ? 68 : 63;                 // 長辺方向の画角の仮定
    const fpx = (Math.max(vw, vh) / 2) / Math.tan(fov * Math.PI / 360);
    const dist = Math.min(150, Math.max(10, fpx * gapCm / gap));
    const cxn = (L.x + R.x) / 2 - 0.5, cyn = (L.y + R.y) / 2 - 0.5;
    const off = camOffset();
    // 生のカメラ映像は左右が逆
    face.t.x = off.x - (cxn * vw) / fpx * dist;
    face.t.y = off.y - (cyn * vh) / fpx * dist;
    face.t.z = dist;
    if (tilt.have) face.q.copy(tilt.q);                  // この測定をしたときの端末の向き
    info = `横 ${face.t.x.toFixed(1)} / 縦 ${face.t.y.toFixed(1)} / 距離 ${dist.toFixed(0)} cm`;
  }

  function recenter() {
    if (faceActive()) {
      center.x = face.t.x; center.y = face.t.y; center.z = face.t.z;
      say('いまの頭の位置を正面にしました。');
    } else {
      manual.tx = manual.ty = 0; manual.z = null;
      say('視点を正面に戻しました。');
    }
    if (tilt.have) { tilt.ref.copy(tilt.q); face.q.copy(tilt.q); }
  }

  /* ---------- 毎フレーム ---------- */
  const v = new THREE.Vector3(), qd = new THREE.Quaternion(), qi = new THREE.Quaternion();
  function scaleRot(q, k) {          // 回転角を k 倍する
    if (k === 1) return q;
    const w = Math.max(-1, Math.min(1, q.w)), ang = 2 * Math.acos(w), s = Math.sqrt(1 - w * w);
    if (s < 1e-6) return q.identity();
    const a = Math.min(Math.PI * 0.9, ang * k);
    return q.set(q.x / s * Math.sin(a / 2), q.y / s * Math.sin(a / 2), q.z / s * Math.sin(a / 2), Math.cos(a / 2));
  }

  function update(t, dt) {
    trackFace(t);
    const { zRef } = env();
    let tx, ty, tz, rate;
    if (faceActive()) {
      const g = st.gain, cz = center.z ?? zRef;
      tx = (face.t.x - center.x) * g;
      ty = (face.t.y - center.y) * g;
      tz = face.t.z + (face.t.z - cz) * (st.approach - 1);
      rate = tilt.have ? 0.5 : 0.25;                   // 傾き補正があるときは遅れを減らす
    } else {
      manual.x += (manual.tx - manual.x) * Math.min(1, dt * 12);
      manual.y += (manual.ty - manual.y) * Math.min(1, dt * 12);
      tx = manual.x; ty = manual.y; tz = getZ();
      rate = 0.35;
    }
    tz = Math.max(6, Math.min(160, tz));
    const a = d => Math.min(0.85, rate + Math.abs(d) * 0.04);
    head.x += (tx - head.x) * a(tx - head.x);
    head.y += (ty - head.y) * a(ty - head.y);
    head.z += (tz - head.z) * Math.min(0.5, rate * 0.7);

    v.set(head.x, head.y, head.z);
    if (tilt.on && tilt.have) {
      qi.copy(tilt.q).invert();
      if (faceActive()) {
        qd.copy(qi).multiply(face.q);                    // 最後の測定から今までに回った分だけ
      } else {
        // 基準の向きはゆっくり今の向きに追いつく（姿勢を変えても数秒でなじむ）
        tilt.ref.slerp(tilt.q, 1 - Math.exp(-dt / 3.5));
        qd.copy(qi).multiply(tilt.ref);
        scaleRot(qd, st.tiltGain);
      }
      v.applyQuaternion(qd);
    }
    out.x = v.x; out.y = v.y; out.z = Math.max(4, v.z);
    return out;
  }

  return {
    update, setPointer, setOffset, getZ, setZ, recenter, startFace, stopFace, setTilt,
    get faceOn() { return face.on; }, get faceStarting() { return face.starting; }, get faceActive() { return faceActive(); },
    get tiltOn() { return tilt.on; }, get tiltAvailable() { return tilt.available; },
    get info() { return face.on ? (faceActive() ? '顔: ' + info : '顔: 見つかりません') : (face.starting ? '準備中…' : '顔追跡は止まっています'); },
  };
}
