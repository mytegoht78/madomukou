// 窓のむこう: 画面を窓に見立て、目の位置から見た景色を描く。
import * as THREE from 'three';
import { createViewpoint } from './viewpoint.js';
import { buildFrame } from './frame.js';
import { createPhoto } from './photo.js';
import { disposeTree } from './util.js';
import washitsu from './spaces/washitsu.js';
import aquarium from './spaces/aquarium.js';
import town from './spaces/town.js';
import cosmos from './spaces/cosmos.js';

const SPACES = [washitsu, aquarium, town, cosmos];
const PHOTO = { id: 'photo', name: '夕暮れの山', sub: '写真モードのサンプル', thumb: 'linear-gradient(180deg,#2f3d73 0%,#d7739a 45%,#ffc58a 62%,#3f4a7a 63%,#0e1730 100%)' };

THREE.ColorManagement.legacyMode = false;
const $ = id => document.getElementById(id);
const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);

/* ---------- 設定（この端末に保存） ---------- */
const KEY = 'madomukou.v1';
const DEF = {
  scene: 'washitsu', frameSpace: true, framePhoto: false,
  gain: mobile ? 1.5 : 2, tiltGain: 1, approach: 1.5,
  cmPerPx: mobile ? 2.54 / 160 : 34 / Math.max(800, screen.width || 1440),
  D: 20, zoom: 1, hole: 'auto', tilt: true, showCam: true, seenIntro: false,
};
const st = { ...DEF };
try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* 保存なしで動く */ }
let saveT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 保存できなくても動く */ } }, 300); }

/* ---------- 画面の大きさ ---------- */
const zRef = mobile ? 32 : 55;           // ふつうに見るときの目と画面の距離(cm)
let W = 34, H = 20;
const env = () => ({ W, H, mobile, zRef });

/* ---------- お知らせ ---------- */
const toast = $('toast');
let toastT = 0;
function say(msg, sticky = false) {
  toast.textContent = msg;
  toast.classList.add('on');
  clearTimeout(toastT);
  if (!sticky) toastT = setTimeout(() => toast.classList.remove('on'), Math.max(2600, msg.length * 110));
}

/* ---------- 描画 ---------- */
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera();
let frame = null;

const video = $('cam');
const vp = createViewpoint({ st, env, video, say, onChange: syncView });
let head = { x: 0, y: 0, z: zRef };
const photo = createPhoto({ st, say, getHead: () => head });

let current = null;      // いま表示している景色 { id, root, update, ... }
let builtFor = '';

function isPhoto() { return current && current.id === 'photo'; }

function showScene(id) {
  if (current && current.id !== 'photo') disposeTree(current.root);
  if (current) scene.remove(current.root);
  if (id === 'photo') {
    current = { id: 'photo', root: photo.root, background: new THREE.Color('#07080c'), fog: null, exposure: 1, far: 3000 };
    photo.layout(W, H, zRef);
  } else {
    const def = SPACES.find(s => s.id === id) || SPACES[0];
    current = { id: def.id, shadows: def.shadows, ...def.build({ W, H, zRef, mobile }) };
    current.root.traverse(o => { if (o.isMesh && !def.shadows) { o.castShadow = o.receiveShadow = false; } });
  }
  builtFor = `${W.toFixed(1)}x${H.toFixed(1)}`;
  scene.add(current.root);
  scene.background = current.background || null;
  scene.fog = current.fog || null;
  renderer.toneMappingExposure = current.exposure || 1;
  st.scene = id; save();
  applyFrame();
  renderCards();
  $('photoGroup').hidden = !isPhoto();
}

function applyFrame() {
  const on = isPhoto() ? st.framePhoto : st.frameSpace;
  if (frame) frame.visible = on;
  $('frameBtn').setAttribute('aria-pressed', String(on));
}

function layout() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.75 : 2));
  renderer.setSize(innerWidth, innerHeight, false);
  W = innerWidth * st.cmPerPx; H = innerHeight * st.cmPerPx;
  if (frame) { scene.remove(frame); disposeTree(frame); }
  frame = buildFrame(W, H); scene.add(frame); applyFrame();
  photo.layout(W, H, zRef);
  syncWidth();
}
let rebuildT = 0;
function onResize() {
  layout();
  clearTimeout(rebuildT);
  rebuildT = setTimeout(() => { if (current && !isPhoto() && builtFor !== `${W.toFixed(1)}x${H.toFixed(1)}`) showScene(current.id); }, 250);
}

function render() {
  // 画面を窓とみなし、目の位置から見た非対称な視錐台を作る
  const n = 0.5, f = (current && current.far) || 5000, k = n / head.z;
  cam.position.set(head.x, head.y, head.z);
  cam.updateMatrixWorld();
  cam.projectionMatrix.makePerspective((-W / 2 - head.x) * k, (W / 2 - head.x) * k, (H / 2 - head.y) * k, (-H / 2 - head.y) * k, n, f);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  renderer.render(scene, cam);
}

/* ---------- 景色のカード ---------- */
function renderCards() {
  const box = $('cards'); box.textContent = '';
  [...SPACES, PHOTO].forEach(s => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'card'; b.setAttribute('aria-pressed', String(current && current.id === s.id && (s.id !== 'photo' || photo.isSample)));
    b.innerHTML = `<span class="thumb"></span><span class="name"></span><span class="sub"></span>`;
    b.querySelector('.thumb').style.background = s.thumb;
    b.querySelector('.name').textContent = s.name;
    b.querySelector('.sub').textContent = s.sub;
    b.onclick = () => {
      if (s.id === 'photo') { if (!photo.isSample) photo.loadDemo(); showScene('photo'); }
      else showScene(s.id);
      closeSheets();
      say(s.name);
    };
    box.appendChild(b);
  });
}
function openPhotoFile(file) {
  photo.loadFile(file, () => { showScene('photo'); closeSheets(); });
}
$('file').addEventListener('change', e => { openPhotoFile(e.target.files[0]); e.target.value = ''; });

/* ---------- シート（下から出る操作パネル） ---------- */
const sheets = ['scenes', 'view', 'adjust'];
function openSheet(name) {
  const willOpen = $('sheet-' + name).hidden;
  closeSheets();
  if (willOpen) {
    $('sheet-' + name).hidden = false;
    document.querySelector(`[data-sheet="${name}"]`).setAttribute('aria-expanded', 'true');
    if (name === 'view') syncView();
    if (name === 'adjust') renderDropper();
  }
  showUI();
}
function closeSheets() {
  sheets.forEach(n => { $('sheet-' + n).hidden = true; document.querySelector(`[data-sheet="${n}"]`).setAttribute('aria-expanded', 'false'); });
}
const anySheet = () => sheets.some(n => !$('sheet-' + n).hidden);
document.querySelectorAll('[data-sheet]').forEach(b => b.addEventListener('click', () => openSheet(b.dataset.sheet)));
document.querySelectorAll('.sheet .x').forEach(b => b.addEventListener('click', closeSheets));

/* ---------- 操作の表示・非表示 ---------- */
let hideT = 0, uiLocked = false;
function showUI(ms = mobile ? 5000 : 2500) {
  if (uiLocked) return;
  document.body.classList.remove('ui-hidden');
  clearTimeout(hideT);
  hideT = setTimeout(() => { if (!anySheet() && !dockHover) document.body.classList.add('ui-hidden'); }, ms);
}
function hideUI() { if (!anySheet()) { clearTimeout(hideT); document.body.classList.add('ui-hidden'); } }
let dockHover = false;
$('dock').addEventListener('pointerenter', () => { dockHover = true; showUI(); });
$('dock').addEventListener('pointerleave', () => { dockHover = false; showUI(); });

/* ---------- 窓枠・全画面 ---------- */
$('frameBtn').onclick = () => {
  if (isPhoto()) st.framePhoto = !st.framePhoto; else st.frameSpace = !st.frameSpace;
  applyFrame(); save();
  say((isPhoto() ? st.framePhoto : st.frameSpace) ? '窓枠を表示しました' : '窓枠を消しました');
};
function toggleFullscreen() {
  const d = document;
  (d.fullscreenElement ? d.exitFullscreen() : d.documentElement.requestFullscreen({ navigationUI: 'hide' })).catch(() => say('全画面にできませんでした。'));
}
$('fsBtn').onclick = toggleFullscreen;
document.addEventListener('fullscreenchange', () => $('fsBtn').setAttribute('aria-pressed', String(!!document.fullscreenElement)));

/* ---------- 覗き方 ---------- */
function setSwitch(id, on) { $(id).setAttribute('aria-checked', String(!!on)); }
function syncView(what) {
  if (what === 'tilt-available' && st.tilt && !vp.tiltOn) vp.setTilt(true).then(syncView);
  setSwitch('faceSw', vp.faceOn || vp.faceStarting);
  $('faceSw').disabled = location.protocol === 'file:';
  $('tiltRow').hidden = !vp.tiltAvailable;
  setSwitch('tiltSw', vp.tiltOn);
  setSwitch('camSw', st.showCam);
  video.classList.toggle('on', st.showCam && (vp.faceOn || vp.faceStarting));
  $('howto').textContent = mobile
    ? '指でなぞると視点が動き、2本指で広げると窓に近づきます。2回タップで正面に戻ります。'
    : 'マウスで視点が動き、ホイールで窓に近づけます。Cキーで正面に戻ります。';
}
$('faceSw').onclick = () => { if (vp.faceOn || vp.faceStarting) vp.stopFace(); else vp.startFace(); syncView(); };
$('tiltSw').onclick = async () => { st.tilt = !vp.tiltOn; await vp.setTilt(st.tilt); save(); syncView(); say(st.tilt ? 'スマホを傾けると奥が見えます' : '傾きセンサーを止めました'); };
$('camSw').onclick = () => { st.showCam = !st.showCam; save(); syncView(); };
$('recenterBtn').onclick = () => vp.recenter();
setInterval(() => { if (!$('sheet-view').hidden) $('trackInfo').textContent = vp.info; }, 250);

/* ---------- 調整 ---------- */
function bindRange(id, get, set, fmt) {
  const el = $(id), out = $(id + 'O');
  const show = () => { out.textContent = fmt(+el.value); };
  el.value = get(); show();
  el.addEventListener('input', () => { set(+el.value); show(); save(); });
  return () => { el.value = get(); show(); };
}
const syncs = [
  bindRange('rD', () => st.D, v => { st.D = v; photo.layout(W, H, zRef); }, v => `${v} cm`),
  bindRange('rZoom', () => st.zoom, v => { st.zoom = v; photo.layout(W, H, zRef); }, v => `${Math.round(v * 100)}%`),
  bindRange('rGain', () => st.gain, v => { st.gain = v; }, v => `${v.toFixed(1)} 倍`),
  bindRange('rTilt', () => st.tiltGain, v => { st.tiltGain = v; }, v => `${v.toFixed(1)} 倍`),
  bindRange('rApproach', () => st.approach, v => { st.approach = v; }, v => `${v.toFixed(1)} 倍`),
];
const rW = $('rW');
rW.min = mobile ? 4 : 15; rW.max = mobile ? 40 : 120;
function syncWidth() { rW.value = (innerWidth * st.cmPerPx).toFixed(1); $('rWO').textContent = `${(+rW.value).toFixed(1)} cm`; }
rW.addEventListener('input', () => { st.cmPerPx = +rW.value / innerWidth; save(); onResize(); });

document.querySelectorAll('#holeSeg button').forEach(b => b.addEventListener('click', () => {
  st.hole = b.dataset.v; save(); photo.applyHole(); renderDropper();
}));
function renderDropper() {
  document.querySelectorAll('#holeSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === st.hole)));
  const on = st.hole === 'dropper';
  $('dropperBox').hidden = !on;
  canvas.classList.toggle('picking', on && isPhoto());
  if (!on) return;
  const box = $('swatches'); box.textContent = '';
  const ds = photo.dropperState;
  const sw = (c, pend) => { const s = document.createElement('span'); s.className = 'sw' + (pend ? ' pend' : ''); s.style.background = `rgb(${c.map(Math.round)})`; box.appendChild(s); };
  ds.pairs.forEach(c => sw(c, false));
  if (ds.pending) sw(ds.pending, true);
  $('dropperHint').textContent = ds.pending ? '② 頭を動かして穴を開け、色を付けたい穴をタップ' : '① 色を取りたい写真の場所をタップ';
}
$('dUndo').onclick = () => { photo.dropperUndo(); renderDropper(); };
$('dClear').onclick = () => { photo.dropperClear(); renderDropper(); };
$('resetBtn').onclick = () => {
  ['gain', 'tiltGain', 'approach', 'cmPerPx', 'D', 'zoom', 'hole'].forEach(k => { st[k] = DEF[k]; });
  save(); syncs.forEach(f => f()); photo.applyHole(); renderDropper(); onResize();
  say('調整を初期値に戻しました');
};

/* ---------- 指・マウス ---------- */
const ptrs = new Map();
let pinch = null, lastTap = 0, drag = null;
const offset = { x: 0, y: 0 };
function toCm(cx, cy) { return { x: (cx / innerWidth - 0.5) * W, y: (0.5 - cy / innerHeight) * H }; }

addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') {
    vp.setPointer(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5);
    if (e.clientY > innerHeight - 150 || anySheet()) showUI(); else if (!dockHover && !anySheet()) hideUI();
  }
});
document.addEventListener('mouseleave', () => hideUI());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: vp.getZ() };
    drag = null;
  } else if (ptrs.size === 1 && e.pointerType !== 'mouse') {
    drag = { ox: offset.x, oy: offset.y };
  }
});
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  p.x = e.clientX; p.y = e.clientY;
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    vp.setZ(pinch.z0 * pinch.d0 / Math.max(10, d));
  } else if (drag) {
    // 指でなぞった向きに「頭を動かした」ことにする
    offset.x = Math.max(-W * 1.2, Math.min(W * 1.2, drag.ox + (p.x - p.sx) / innerWidth * W * 1.6));
    offset.y = Math.max(-H * 1.2, Math.min(H * 1.2, drag.oy - (p.y - p.sy) / innerHeight * H * 1.6));
    vp.setOffset(offset.x, offset.y);
  }
});
function endPtr(e) {
  const p = ptrs.get(e.pointerId); if (!p) return;
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (ptrs.size === 0) drag = null;
  const moved = Math.hypot(p.x - p.sx, p.y - p.sy), dt = performance.now() - p.t;
  if (e.type === 'pointerup' && moved < 10 && dt < 350) onTap(e);
}
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', e => { e.preventDefault(); vp.setZ(vp.getZ() * (1 + Math.sign(e.deltaY) * 0.08)); }, { passive: false });

function onTap(e) {
  if (anySheet() && !(isPhoto() && st.hole === 'dropper')) { closeSheets(); return; }
  if (isPhoto() && st.hole === 'dropper') {
    const c = toCm(e.clientX, e.clientY);
    say(photo.dropperTap(c.x, c.y));
    renderDropper();
    return;
  }
  const now = performance.now();
  if (now - lastTap < 320) { offset.x = offset.y = 0; vp.recenter(); lastTap = 0; return; }
  lastTap = now;
  if (e.pointerType !== 'mouse') {
    if (document.body.classList.contains('ui-hidden')) showUI(); else hideUI();
  }
}

addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'c') { offset.x = offset.y = 0; vp.recenter(); }
  else if (k === 'f') toggleFullscreen();
  else if (k === 'h') { uiLocked = !uiLocked; if (uiLocked) { closeSheets(); document.body.classList.add('ui-hidden'); } else showUI(); }
  else if (k === 'escape') closeSheets();
  else if (/^[1-5]$/.test(k)) { const s = [...SPACES, PHOTO][+k - 1]; if (s.id === 'photo') { if (!photo.isSample) photo.loadDemo(); } showScene(s.id); say(s.name); }
});

/* ---------- 写真のドロップ ---------- */
const dropEl = $('drop');
addEventListener('dragover', e => { e.preventDefault(); dropEl.classList.add('on'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) dropEl.classList.remove('on'); });
addEventListener('drop', e => { e.preventDefault(); dropEl.classList.remove('on'); if (e.dataTransfer.files[0]) openPhotoFile(e.dataTransfer.files[0]); });
addEventListener('resize', onResize);
if (screen.orientation) screen.orientation.addEventListener('change', onResize);

/* ---------- はじめの案内 ---------- */
function closeIntro() { $('intro').hidden = true; st.seenIntro = true; save(); showUI(); }
$('introCam').onclick = () => { closeIntro(); vp.startFace(); syncView(); };
$('introGo').onclick = () => { closeIntro(); if (mobile) say('スマホを傾けたり、指でなぞったりしてみてください'); else say('マウスを動かしたり、ホイールで近づいたりしてみてください'); };
$('introPC').hidden = mobile; $('introMobile').hidden = !mobile;
$('helpBtn').onclick = () => { closeSheets(); $('intro').hidden = false; };

/* ---------- 開始 ---------- */
if (location.protocol === 'file:') say('このファイルを直接開くと、カメラと写真の奥行き推定が使えません。start.bat から起動してください。', true);
photo.loadDemo();
layout();
showScene([...SPACES.map(s => s.id), 'photo'].includes(st.scene) ? st.scene : 'washitsu');
syncView();
$('intro').hidden = !!st.seenIntro;
if (st.seenIntro) showUI(3500);

const clock = new THREE.Clock();
let elapsed = 0;
(function loop(t) {
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;
  head = vp.update(t, dt);
  if (current && current.update) current.update(dt, elapsed, head);
  render();
  requestAnimationFrame(loop);
})(performance.now());
