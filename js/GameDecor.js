// GameDecor.js — живая трава и декали на дорогах и карте.
//
// ТРАВА. Пучок из пяти лезвий (15 треугольников, цвет в вершинах: тёмное основание — светлый кончик), ОДИН меш на всю
// траву с thin instances: один draw call. Мир поделён на клетки T×T; трава есть только в клетках вокруг машины (радиус —
// по уровню графики), содержимое клетки считается один раз (детерминированно, по хэшу клетки) и кэшируется, при переходе
// в другую клетку буфер просто собирается из готовых кусков. Растёт только на газоне (не на дороге, тротуаре, площадке,
// воде и не внутри зданий), пятнами. Ветер — вершинный сдвиг в шейдере (плагин материала GrassWind): кончики качаются,
// основание стоит; время идёт в uniform, CPU каждый кадр ничего не пересчитывает. Тени трава не отбрасывает.
// Уровни графики: низкий — травы нет, средний — радиус 2 клетки и реже, высокий — радиус 3.
//
// ДЕКАЛИ. Атлас 4×4 рисуется кодом на холсте (без файлов): масляные пятна, трещины, заплатки, люки, решётки ливнёвок,
// стрелки разметки, следы торможения, листья, проплешины. Раскладка — детерминированная по карте: стрелки перед
// перекрёстками по реальным направлениям выезда, трещины/пятна/люки — по хэшу плитки, листья — под деревьями.
// Все декали района склеены в один меш (сетка районов 6×6 T) — немного draw calls и отсечение по кадру.

class GrassWindPlugin extends BABYLON.MaterialPluginBase {
    constructor(material) {
        super(material, 'GrassWind', 210, { GRASSWIND: false }, true, true);
    }
    getClassName() { return 'GrassWindPlugin'; }
    prepareDefines(defines) { defines.GRASSWIND = true; }
    getUniforms() {
        return {
            ubo: [{ name: 'grassTime', size: 1, type: 'float' }, { name: 'grassEye', size: 4, type: 'vec4' }],
            vertex: '#ifdef GRASSWIND\nuniform float grassTime;\nuniform vec4 grassEye;\n#endif',
        };
    }
    bindForSubMesh(ubo, scene) {
        ubo.updateFloat('grassTime', GameDecor.time);
        const cam = scene.activeCamera, p = cam ? cam.globalPosition : null;
        ubo.updateFloat4('grassEye', p ? p.x : 0, p ? p.y : 0, p ? p.z : 0, 0);
    }
    getCustomCode(shaderType) {
        if (shaderType !== 'vertex') return null;
        return {
            CUSTOM_VERTEX_UPDATE_WORLDPOS: `
#ifdef GRASSWIND
{
    float tipK = clamp(positionUpdated.y / 45.0, 0.0, 1.0);
    tipK *= tipK;
    float ph = worldPos.x * 0.0035 + worldPos.z * 0.0027;
    float sway = sin(grassTime * 1.6 + ph) + 0.45 * sin(grassTime * 2.7 + ph * 1.9);
    worldPos.x += sway * 7.0 * tipK;
    worldPos.z += sway * 3.5 * tipK;
    // у самой камеры пучок плавно уходит в землю: крупные лезвия не загораживают вид
    float nearK = smoothstep(220.0, 650.0, length(worldPos.xz - grassEye.xz));
    worldPos.xyz = mix(finalWorld[3].xyz, worldPos.xyz, nearK);
}
#endif
`,
        };
    }
}

/** @satisfies {Record<string, any>} */
const GameDecor = {
    time: 0,
    /** @type {any} */ app: null,
    /** @type {any} */ grass: null,
    /** @type {Map<number, Float32Array>} */ chunks: new Map(),
    chunkKey: '',
    checkT: 0,
    radius: 3,
    density: 2.4,          // пучков на м² в густых местах
    CACHE_MAX: 300,        // клеток в кэше (≈ 15 КБ каждая), дальше кэш сбрасывается
    /** @type {Float32Array | null} */ buf: null,
    /** @type {any[]} */ decalMeshes: [],

    async init(app) {
        this.app = app;
        this._applyQuality();
        this._buildGrassMesh();
        this._buildDecals();
        if (typeof Quality !== 'undefined' && Quality.onChange) Quality.onChange(() => { this._applyQuality(); this.chunks.clear(); this.chunkKey = ''; });
    },

    _applyQuality() {
        const lvl = typeof Quality !== 'undefined' ? Quality.level : 2;
        if (lvl <= 0) { this.radius = 0; this.density = 0; }
        else if (lvl === 1 || (typeof IS_MOBILE !== 'undefined' && IS_MOBILE)) { this.radius = 2; this.density = 1.1; }
        else { this.radius = 3; this.density = 2.4; }
        if (this.grass) this.grass.setEnabled(this.radius > 0);
    },

    // --- Трава ----------------------------------------------------------------------------------

    _buildGrassMesh() {
        const scene = this.app.location.view.scene;
        const pos = [], col = [], nrm = [], idx = [];
        const base = [0.24, 0.42, 0.16], tip = [0.62, 0.82, 0.34];
        for (let b = 0; b < 5; b++) {
            const a = b / 5 * Math.PI * 2 + 0.3, lean = 0.35 + (b % 2) * 0.25;
            const h = 34 + (b * 7) % 16, w = 6;
            const cx = Math.cos(a) * 5, cz = Math.sin(a) * 5;
            const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
            const tx = cx + Math.cos(a) * h * lean, tz = cz + Math.sin(a) * h * lean;
            const i0 = pos.length / 3;
            pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, tx, h, tz);
            for (let k = 0; k < 3; k++) nrm.push(0, 1, 0);
            const shade = 0.85 + (b % 3) * 0.08;
            col.push(base[0] * shade, base[1] * shade, base[2] * shade, 1, base[0] * shade, base[1] * shade, base[2] * shade, 1, tip[0] * shade, tip[1] * shade, tip[2] * shade, 1);
            idx.push(i0, i0 + 1, i0 + 2);
        }
        const mesh = new BABYLON.Mesh('grass', scene);
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.normals = nrm; vd.colors = col; vd.indices = idx;
        vd.applyToMesh(mesh);
        const mat = new BABYLON.StandardMaterial('grass', scene);
        mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mat.backFaceCulling = false;
        mat.metadata = { toonGroup: 'ground' };           // ступени света как у земли
        try { new GrassWindPlugin(mat); } catch (e) { console.warn('GameDecor: ветер травы недоступен', e); }
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;     // трава всегда вокруг игрока: без пересчёта габарита тысяч инстансов
        mesh.setEnabled(this.radius > 0);
        this.grass = mesh;
    },

    _hash(x, y, s) {
        let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((s || 0) | 0, 1442695041)) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    },

    // Пучки клетки (i, j): матрицы 16 float на пучок. Кэш — до смены качества.
    _chunk(i, j) {
        const key = j * 4096 + i;
        let arr = this.chunks.get(key);
        if (arr) return arr;
        if (this.chunks.size > this.CACHE_MAX) this.chunks.clear();
        const T = Roads.T, x0 = i * T, y0 = j * T;
        const loc = this.app.location;
        if (x0 < 0 || y0 < 0 || x0 >= loc.width || y0 >= loc.height || Roads.pieceAt(x0 + T / 2, y0 + T / 2)) {
            arr = new Float32Array(0); this.chunks.set(key, arr); return arr;
        }
        const area = (T / 100) * (T / 100);
        const n = Math.round(area * this.density);
        const boxes = GameWorld.near(x0 + T / 2, y0 + T / 2, T * 0.75, []).filter(c => c.kind === 'box' && (c.h || 0) > 60);
        const out = [];
        const m = new BABYLON.Matrix(), S = new BABYLON.Vector3(), P = new BABYLON.Vector3(), Q = new BABYLON.Quaternion();
        const terrain = loc.terrain;
        for (let k = 0; k < n; k++) {
            const x = x0 + this._hash(i, j, k * 3 + 1) * T, y = y0 + this._hash(i, j, k * 3 + 2) * T;
            // пятна: густо там, где «шум» высокий
            const patch = 0.5 + 0.5 * Math.sin(x * 0.0021 + Math.sin(y * 0.0017) * 2) * Math.cos(y * 0.0019 - x * 0.0007);
            if (this._hash(i, j, k * 3 + 3) > patch * 1.25) continue;
            if (Roads.surfaceAt(x, y) !== 'grass' || loc.groundTypeAt(x, y) !== 'grass') continue;
            let inside = false;
            for (const c of boxes) { const dx = x - c.x, dy = y - c.y; if (Math.abs(dx * c.c + dy * c.s) < c.hx + 20 && Math.abs(-dx * c.s + dy * c.c) < c.hy + 20) { inside = true; break; } }
            if (inside) continue;
            const s = 0.75 + this._hash(i, j, k * 7 + 5) * 0.7;
            S.set(s, s * (0.8 + this._hash(i, j, k * 5 + 9) * 0.6), s);
            BABYLON.Quaternion.RotationAxisToRef(BABYLON.Axis.Y, this._hash(i, j, k * 11 + 4) * Math.PI * 2, Q);
            P.set(x, (terrain && terrain.heightAt ? terrain.heightAt(x, y) : 0), y);
            BABYLON.Matrix.ComposeToRef(S, Q, P, m);
            for (let q = 0; q < 16; q++) out.push(m.m[q]);
        }
        arr = new Float32Array(out);
        this.chunks.set(key, arr);
        return arr;
    },

    _updateGrass(force) {
        const car = Game.car;
        if (!car || !this.grass || this.radius <= 0) return;
        const T = Roads.T, ci = Math.floor(car.x / T), cj = Math.floor(car.y / T);
        const key = ci + ',' + cj + ',' + this.radius + ',' + this.density;
        if (!force && key === this.chunkKey) return;
        this.chunkKey = key;
        const parts = [];
        let total = 0;
        const R = this.radius;
        for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
            if ((i - ci) * (i - ci) + (j - cj) * (j - cj) > (R + 0.5) * (R + 0.5)) continue;
            const a = this._chunk(i, j);
            if (a.length) { parts.push(a); total += a.length; }
        }
        // Буфер растёт с запасом и переиспользуется: на GPU — только обновление данных, без пересоздания.
        const grow = !this.buf || this.buf.length < total;
        if (grow) this.buf = new Float32Array(Math.ceil(Math.max(total, 16) * 1.3 / 16) * 16);
        let off = 0;
        for (const a of parts) { this.buf.set(a, off); off += a.length; }
        if (grow) this.grass.thinInstanceSetBuffer('matrix', this.buf, 16, false);
        else this.grass.thinInstanceBufferUpdated('matrix');
        this.grass.thinInstanceCount = total / 16;
        this.grass.isVisible = total > 0;
    },

    update(dt) {
        this.time += dt;
        this.checkT -= dt;
        if (this.checkT <= 0) { this.checkT = 0.25; this._updateGrass(false); }
    },

    // --- Декали ---------------------------------------------------------------------------------

    CELL: { oil: 0, crackA: 1, crackB: 2, patch: 3, manhole: 4, drain: 5, arrS: 6, arrL: 7, arrR: 8, arrSL: 9, arrSR: 10, arrLSR: 11, skid: 12, leaves: 13, dirt: 14, worn: 15 },

    _atlas(scene) {
        const N = 1024, C = 256;
        const tex = new BABYLON.DynamicTexture('decal-atlas', { width: N, height: N }, scene, true);
        const g = /** @type {CanvasRenderingContext2D} */ (tex.getContext());
        g.clearRect(0, 0, N, N);
        let seed = 7;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        const cell = (k, fn) => { g.save(); g.translate((k % 4) * C, Math.floor(k / 4) * C); g.beginPath(); g.rect(0, 0, C, C); g.clip(); fn(); g.restore(); };
        const blob = (cx, cy, r, color, alpha, pts) => {
            g.fillStyle = color; g.globalAlpha = alpha; g.beginPath();
            for (let i = 0; i <= pts; i++) { const a = i / pts * Math.PI * 2, rr = r * (0.7 + rnd() * 0.45); const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
            g.closePath(); g.fill(); g.globalAlpha = 1;
        };
        const crack = (x, y, a, len, w, depth) => {
            if (depth <= 0 || len < 6) return;
            g.strokeStyle = 'rgba(18,20,26,0.75)'; g.lineWidth = w; g.lineCap = 'round';
            let px = x, py = y;
            g.beginPath(); g.moveTo(px, py);
            const steps = 6;
            for (let s = 0; s < steps; s++) { a += (rnd() - 0.5) * 0.9; px += Math.cos(a) * len / steps; py += Math.sin(a) * len / steps; g.lineTo(px, py); if (rnd() < 0.3) crack(px, py, a + (rnd() > 0.5 ? 0.9 : -0.9), len * 0.45, w * 0.6, depth - 1); }
            g.stroke();
        };
        const arrow = (dirs) => {
            // Белая краска; «вверх» клетки — по ходу. Клетка ляжет на квадрат 2.6 × 5.2 м, поэтому рисуем в координатах
            // 256 × 512 («сантиметры» мира) и сжимаем по высоте вдвое — линии везде одной толщины.
            g.save(); g.scale(1, 0.5);
            g.fillStyle = g.strokeStyle = 'rgba(246,246,240,0.95)';
            g.lineWidth = 28; g.lineCap = 'butt'; g.lineJoin = 'round';
            const cx = 128, S = dirs.includes('S');
            g.beginPath(); g.moveTo(cx, 504); g.lineTo(cx, S ? 140 : 300); g.stroke();
            if (S) { g.beginPath(); g.moveTo(cx, 8); g.lineTo(cx - 50, 150); g.lineTo(cx + 50, 150); g.closePath(); g.fill(); }
            for (const k of ['L', 'R']) {
                if (!dirs.includes(k)) continue;
                const side = k === 'L' ? -1 : 1;
                g.beginPath(); g.moveTo(cx, 340); g.quadraticCurveTo(cx, 236, cx + side * 44, 236); g.lineTo(cx + side * 72, 236); g.stroke();
                g.beginPath(); g.moveTo(cx + side * 124, 236); g.lineTo(cx + side * 66, 236 - 44); g.lineTo(cx + side * 66, 236 + 44); g.closePath(); g.fill();
            }
            g.restore();
            // потёртости краски
            g.globalCompositeOperation = 'destination-out';
            for (let i = 0; i < 90; i++) { g.globalAlpha = 0.25 + rnd() * 0.5; g.beginPath(); g.arc(rnd() * C, rnd() * C, 1 + rnd() * 3, 0, Math.PI * 2); g.fill(); }
            g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        };
        cell(0, () => { blob(128, 128, 90, '#0d0f14', 0.3, 18); blob(140, 120, 55, '#07080b', 0.22, 14); blob(100, 150, 30, '#2a1f3a', 0.15, 10); });
        cell(1, () => crack(30, 140, -0.1, 200, 3, 3));
        cell(2, () => { crack(128, 128, 0.6, 110, 2.5, 3); crack(128, 128, 2.6, 110, 2.5, 3); crack(128, 128, -1.9, 80, 2, 2); });
        cell(3, () => {
            // заплатка: чуть темнее асфальта, края неровные, по шву — тёмная полоска битума
            g.fillStyle = 'rgba(22,24,32,0.26)'; g.beginPath(); g.moveTo(24, 40); g.lineTo(130, 34); g.lineTo(228, 30); g.lineTo(232, 120); g.lineTo(236, 210); g.lineTo(120, 220); g.lineTo(30, 226); g.lineTo(28, 130); g.closePath(); g.fill();
            g.strokeStyle = 'rgba(10,11,16,0.42)'; g.lineWidth = 5; g.lineJoin = 'round'; g.stroke();
        });
        cell(4, () => {
            g.fillStyle = '#2c2f36'; g.beginPath(); g.arc(128, 128, 96, 0, Math.PI * 2); g.fill();
            g.strokeStyle = '#17191e'; g.lineWidth = 10; g.stroke();
            g.strokeStyle = '#41454f'; g.lineWidth = 7;
            for (let r = 20; r < 90; r += 20) { g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke(); }
            for (let a = 0; a < 6; a++) { g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 90, 128 + Math.sin(a) * 90); g.stroke(); }
        });
        cell(5, () => {
            g.fillStyle = '#1e2026'; g.fillRect(40, 80, 176, 96);
            g.fillStyle = '#4a4e58'; for (let x = 52; x < 210; x += 22) g.fillRect(x, 88, 10, 80);
            g.strokeStyle = '#121318'; g.lineWidth = 6; g.strokeRect(40, 80, 176, 96);
        });
        cell(6, () => arrow(['S']));
        cell(7, () => arrow(['L']));
        cell(8, () => arrow(['R']));
        cell(9, () => arrow(['S', 'L']));
        cell(10, () => arrow(['S', 'R']));
        cell(11, () => arrow(['S', 'L', 'R']));
        cell(12, () => {
            for (const x of [92, 164]) {
                const grd = g.createLinearGradient(0, 230, 0, 20); grd.addColorStop(0, 'rgba(10,10,12,0)'); grd.addColorStop(0.3, 'rgba(10,10,12,0.55)'); grd.addColorStop(1, 'rgba(10,10,12,0.15)');
                g.fillStyle = grd; g.beginPath(); g.moveTo(x - 14, 236); g.quadraticCurveTo(x + 10, 128, x - 6, 20); g.lineTo(x + 10, 20); g.quadraticCurveTo(x + 26, 128, x + 14, 236); g.closePath(); g.fill();
            }
        });
        cell(13, () => {
            const cols = ['#c9772e', '#e2a33a', '#9c5a24', '#d4c04a', '#7e8f35'];
            for (let i = 0; i < 46; i++) {
                const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.6) * 110;
                g.save(); g.translate(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); g.rotate(rnd() * 6.3);
                g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.85; g.beginPath(); g.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2); g.fill(); g.restore();
            }
            g.globalAlpha = 1;
        });
        cell(14, () => { blob(128, 128, 100, '#7a5a35', 0.55, 20); blob(110, 140, 60, '#5e4527', 0.35, 14); for (let i = 0; i < 30; i++) blob(40 + rnd() * 176, 40 + rnd() * 176, 4 + rnd() * 6, '#8e8676', 0.6, 6); });
        cell(15, () => { for (const x of [80, 176]) { g.fillStyle = 'rgba(15,16,20,0.22)'; g.fillRect(x - 22, 0, 44, C); } });
        tex.update(true);
        tex.hasAlpha = true;
        tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        return tex;
    },

    _buildDecals() {
        const app = this.app, scene = app.location.view.scene, T = Roads.T;
        /** @type {any[]} */
        const list = [];
        // декаль: тип, центр (x, y), курс (рад: «вверх» картинки — вдоль курса), длина и ширина px, высота над поверхностью
        const add = (type, x, y, a, len, wid, lift) => list.push({ type, x, y, a, len, wid, h: Roads.heightAt(x, y) + (lift || 1.4) });
        const H = (p, s) => this._hash(Math.floor(p.x), Math.floor(p.y), s);
        const axis = (p) => { const v = Roads.rot(p.name === 'road-bridge' ? 0 : 1, p.name === 'road-bridge' ? 1 : 0, p.r); return v; };
        for (const p of Roads.pieces) {
            if (p.kind === 'straight') {
                const ax = axis(p), nx = -ax.y, ny = ax.x, a = Math.atan2(ax.y, ax.x);
                const at = (u, v) => ({ x: p.x + ax.x * u * T + nx * v * T, y: p.y + ax.y * u * T + ny * v * T });
                if (H(p, 1) < 0.34) { const q = at((H(p, 2) - 0.5) * 0.7, (H(p, 3) - 0.5) * 0.5); add(H(p, 4) < 0.5 ? 'crackA' : 'crackB', q.x, q.y, a + H(p, 5) * 6.3, 260, 260); }
                if (H(p, 6) < 0.22) { const side = H(p, 7) < 0.5 ? -1 : 1; const q = at((H(p, 8) - 0.5) * 0.6, side * 0.18); add('oil', q.x, q.y, H(p, 9) * 6.3, 150 + H(p, 10) * 80, 150 + H(p, 11) * 80); }
                if (H(p, 12) < 0.12) { const q = at((H(p, 13) - 0.5) * 0.5, (H(p, 14) - 0.5) * 0.4); add('patch', q.x, q.y, a + (H(p, 15) - 0.5) * 0.3, 260, 200); }
                if (H(p, 16) < 0.16) { const q = at((H(p, 17) - 0.5) * 0.6, 0); add('manhole', q.x, q.y, 0, 95, 95); }
                if (H(p, 18) < 0.3 && p.name !== 'road-bridge') { const side = H(p, 19) < 0.5 ? -1 : 1; const q = at((H(p, 20) - 0.5) * 0.6, side * 0.36); add('drain', q.x, q.y, a, 70, 50); }
                if (H(p, 21) < 0.06) { const q = at((H(p, 22) - 0.5) * 0.4, (H(p, 23) < 0.5 ? -1 : 1) * Roads.LANE / T); add('skid', q.x, q.y, a + (H(p, 24) < 0.5 ? 0 : Math.PI), 360, 150); }
                // стрелки перед перекрёстком: на полосе, что ведёт к нему
                for (const port of p.ports) {
                    const J = port.link && port.link.piece;
                    if (!J || J.ports.length < 3 || J.kind === 'round' || p.spec.zebra) continue;
                    const turns = new Set(Roads.exits(J, port.link.port).map(b => Roads.turnOf(J, port.link.port, b)));
                    const k = (turns.has('straight') ? 'S' : '') + (turns.has('left') ? 'L' : '') + (turns.has('right') ? 'R' : '');
                    const type = { S: 'arrS', L: 'arrL', R: 'arrR', SL: 'arrSL', SR: 'arrSR', LR: 'arrLSR', SLR: 'arrLSR' }[k];
                    if (!type) continue;
                    const tx = Roads.DX[port.d], ty = Roads.DY[port.d];                  // направление к перекрёстку
                    const e = Roads.edgeMid(port);
                    // правая полоса хода (tx, ty): смещение (−ty, tx)·LANE; за 0.3 плитки до края перекрёстка
                    add(type, e.x - tx * 0.3 * T - ty * Roads.LANE, e.y - ty * 0.3 * T + tx * Roads.LANE, Math.atan2(ty, tx), 520, 260, 1.6);
                }
            } else if (p.ports.length >= 3 && p.kind !== 'round') {
                if (H(p, 31) < 0.35) add('oil', p.x + (H(p, 32) - 0.5) * 400, p.y + (H(p, 33) - 0.5) * 400, H(p, 34) * 6.3, 200, 200);
                if (H(p, 35) < 0.25) add('skid', p.x + (H(p, 36) - 0.5) * 300, p.y + (H(p, 37) - 0.5) * 300, H(p, 38) * 6.3, 380, 160);
                if (H(p, 39) < 0.3) add('crackB', p.x + (H(p, 40) - 0.5) * 500, p.y + (H(p, 41) - 0.5) * 500, H(p, 42) * 6.3, 260, 260);
            }
        }
        // Площадки: пятна масла на местах, следы на автодроме.
        const loc = app.location;
        for (const d of loc.markers('stall')) if (this._hash(d.x, d.y, 50) < 0.35) add('oil', d.x + (this._hash(d.x, d.y, 51) - 0.5) * 80, d.y + (this._hash(d.x, d.y, 52) - 0.5) * 80, this._hash(d.x, d.y, 53) * 6.3, 140, 140);
        for (const q of Roads.lots) {
            const n = Math.min(14, Math.round(q.hx * q.hy / 600000));
            for (let k = 0; k < n; k++) {
                const u = (this._hash(q.x, q.y, 60 + k) - 0.5) * 1.7 * q.hx, v = (this._hash(q.x, q.y, 80 + k) - 0.5) * 1.7 * q.hy;
                const x = q.x + u * q.c - v * q.s, y = q.y + u * q.s + v * q.c;
                const r = this._hash(q.x, q.y, 100 + k);
                add(r < 0.4 ? 'skid' : r < 0.7 ? 'worn' : 'crackA', x, y, this._hash(q.x, q.y, 120 + k) * 6.3, 360, 220);
            }
        }
        // Под деревьями у дорог — листья; проплешины на газоне.
        const terrain = loc.terrain;
        for (const c of GameWorld.colliders) {
            if (!c.tree) continue;
            if (this._hash(c.x, c.y, 140) > 0.45) continue;
            if (Roads.surfaceAt(c.x, c.y) !== 'grass') continue;
            const h = terrain && terrain.heightAt ? terrain.heightAt(c.x, c.y) : 0;
            list.push({ type: 'leaves', x: c.x, y: c.y, a: this._hash(c.x, c.y, 141) * 6.3, len: 340, wid: 340, h: h + 2.5 });
        }
        this._decalMeshes(scene, list);
    },

    _decalMeshes(scene, list) {
        const tex = this._atlas(scene);
        const mat = new BABYLON.StandardMaterial('decals', scene);
        mat.diffuseTexture = tex;
        mat.useAlphaFromDiffuseTexture = true;
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mat.backFaceCulling = false;
        mat.zOffset = -2;
        /** @type {any} */ (mat).metadata = { toonGroup: 'ground' };
        const R = 6 * Roads.T;
        /** @type {Map<number, any[]>} */
        const regions = new Map();
        for (const d of list) {
            const k = Math.floor(d.y / R) * 4096 + Math.floor(d.x / R);
            if (!regions.has(k)) regions.set(k, []);
            regions.get(k).push(d);
        }
        for (const [, ds] of regions) {
            const pos = [], uv = [], nrm = [], idx = [];
            for (const d of ds) {
                const cell = this.CELL[d.type];
                const cu = (cell % 4) * 0.25, cv = Math.floor(cell / 4) * 0.25;
                const pad = 0.004;
                const u0 = cu + pad, u1 = cu + 0.25 - pad, vTop = 1 - cv - pad, vBot = 1 - cv - 0.25 + pad;
                const c = Math.cos(d.a), s = Math.sin(d.a);
                const L = d.len / 2, W = d.wid / 2;
                // углы: перёд (вверх картинки) — по курсу; лево картинки — левая сторона хода (y вниз: лево = (s, −c))
                const corner = (fu, fv) => { const lx = fu * L, lv = fv * W; return [d.x + c * lx + s * lv, d.h, d.y + s * lx - c * lv]; };
                const i0 = pos.length / 3;
                const fl = corner(1, 1), fr = corner(1, -1), bl = corner(-1, 1), br = corner(-1, -1);
                pos.push(...fl, ...fr, ...br, ...bl);
                uv.push(u0, vTop, u1, vTop, u1, vBot, u0, vBot);
                for (let k = 0; k < 4; k++) nrm.push(0, 1, 0);
                idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
            }
            const mesh = new BABYLON.Mesh('decals', scene);
            const vd = new BABYLON.VertexData();
            vd.positions = pos; vd.uvs = uv; vd.normals = nrm; vd.indices = idx;
            vd.applyToMesh(mesh);
            mesh.material = mat;
            mesh.receiveShadows = true;
            mesh.isPickable = false;
            mesh.freezeWorldMatrix();
            this.decalMeshes.push(mesh);
        }
        this.decalCount = list.length;
    },
    decalCount: 0,
};
