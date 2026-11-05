// GameWorld.js — статический мир игры поверх карты: коллизии по объектам карты (габариты моделей),
// площадки (lot) и разметка упражнений, горки (ramp), конусы (физические), шлагбаум (gate),
// припаркованные машины (parked). Всё строится из маркеров карты — правка в редакторе меняет игру.
// Коллизии — чистая 2D-логика (OBB и круги) по данным моделей, без запросов к Babylon (инвариант 4).

/** @satisfies {Record<string, any>} */
const GameGfx = {
    /** @type {any} */ view: null,

    color(hex) { return BABYLON.Color3.FromHexString(hex); },

    mat(name, hex, opts) {
        const o = opts || {};
        const m = new BABYLON.StandardMaterial(name, this.view.scene);
        m.diffuseColor = this.color(hex);
        m.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
        if (o.emissive) m.emissiveColor = this.color(o.emissive);
        if (o.alpha !== undefined) m.alpha = o.alpha;
        if (o.unlit) { m.disableLighting = true; m.emissiveColor = this.color(hex); }
        return m;
    },

    // Матрица объекта карты: позиция (x, h, y), курс θ (рад), масштаб [sx, sy, sz].
    matrix(x, y, h, heading, s, out) {
        const sc = Array.isArray(s) ? s : [s || 1, s || 1, s || 1];
        return BABYLON.Matrix.ComposeToRef(new BABYLON.Vector3(sc[0], sc[1], sc[2]),
            BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, -heading), new BABYLON.Vector3(x, h, y), out || new BABYLON.Matrix());
    },

    // Модель пачкой: одна сборка, у каждой части thin instances по списку матриц. -> { root, parts, set(list) }
    async instanced(url, name, list, opts) {
        const o = opts || {};
        const view = this.view;
        let model;
        try { model = await Model3D.load(url); } catch (e) { console.warn('GameGfx: нет модели ' + url); return null; }
        const root = Model3D.build(model, view.scene, { name });
        const parts = /** @type {any[]} */ (root.getChildMeshes(false));
        const api = {
            root, parts, model,
            set(mats) {
                const buf = new Float32Array(Math.max(1, mats.length) * 16);
                mats.forEach((m, i) => m.copyToArray(buf, i * 16));
                for (const p of parts) {
                    p.thinInstanceSetBuffer('matrix', buf, 16, false);
                    p.thinInstanceCount = mats.length;
                    p.thinInstanceRefreshBoundingInfo(false);
                    p.isVisible = mats.length > 0;
                }
            },
        };
        World3D.addObject(view, root, o.kind || 'prop', { ink: false, outline: false, castShadow: o.shadow !== false });
        api.set(list || []);
        return api;
    },

    // Одиночная модель (свои материалы). -> root | null
    async single(url, name, kind) {
        try {
            const model = await Model3D.load(url);
            const root = Model3D.build(model, this.view.scene, { name });
            World3D.addObject(this.view, root, kind || 'prop', { ink: false, outline: false });
            return root;
        } catch (e) { console.warn('GameGfx: нет модели ' + url); return null; }
    },

    part(root, name) {
        if (!root) return null;
        return root.getChildMeshes(false).find(m => m.metadata && m.metadata.part === name) || null;
    },
};

/** @satisfies {Record<string, any>} */
const GameWorld = {
    CELL: 600,
    /** @type {Map<number, any[]>} */ grid: new Map(),
    /** @type {any[]} */ colliders: [],
    /** @type {any[]} */ cones: [],
    /** @type {any} */ gate: null,
    /** @type {any[]} */ parked: [],
    /** @type {any} */ app: null,
    W: 0, H: 0,

    // Модели без коллизии и «столбы» (круг у начала модели) — по имени файла.
    NO_COLLIDE: /bridge-pillar|\/roads\/road-|\/roads\/tile-|path-|driveway-|flower|grass|mushroom|lily|plant_|crop|construction-cone|wires|detail-awning|detail-overhang|detail-parasol|solar-panel-flat/,
    POLES: /light-|construction-light|traffic-light|electricity-pole|electricity-side|road-sign|sign-highway|sign_speed|sign_school|sign_crosswalk|hydrant|lamp|post/,
    TREES: /tree|palm|pine|birch|oak/,

    // Коллизии из спецификаций Blender-декораций (docs/props/*.json -> GAME_PROP_BOXES), м.
    PROP_BOXES: GAME_PROP_BOXES,

    async build(app) {
        this.app = app;
        GameGfx.view = app.location.view;
        const loc = app.location;
        this.W = loc.width; this.H = loc.height;
        this.grid = new Map(); this.colliders = [];
        // Габариты моделей карты.
        const urls = new Set();
        for (const d of loc.map.objects) if (d.model && d.kind !== 'marker') urls.add(d.model);
        /** @type {Map<string, any>} */
        const models = new Map();
        await Promise.all([...urls].map(async u => { try { models.set(u, await Model3D.load(u)); } catch (e) { /* нет файла — без коллизии */ } }));
        for (const d of loc.map.objects) {
            if (!d.model || d.kind === 'marker') continue;
            const m = models.get(d.model);
            if (m) this._addFromModel(d, m);
        }
        // Стены по краю карты.
        const W = this.W, H = this.H, t = 400;
        this.addBox(W / 2, -t, W / 2 + t, t, 0, 1000);
        this.addBox(W / 2, H + t, W / 2 + t, t, 0, 1000);
        this.addBox(-t, H / 2, t, H / 2 + t, 0, 1000);
        this.addBox(W + t, H / 2, t, H / 2 + t, 0, 1000);
        // Вода — круги-препятствия (кроме мест, где по воде идёт мост: там дорога).
        for (const w of loc.markers('water')) {
            const r = Math.abs((w.scale && w.scale[0]) || 1) * 100;
            this.add({ kind: 'circle', x: w.x, y: w.y, r: r * 0.9, h: 0, water: true });
        }
        await this._buildLots();
        await this._buildRamps();
        await this._buildCones();
        await this._buildGate();
        await this._buildParked();
    },

    key(i, j) { return j * 8192 + i; },

    add(c) {
        const R = c.kind === 'circle' ? c.r : Math.hypot(c.hx, c.hy);
        c.R = R;
        this.colliders.push(c);
        const S = this.CELL;
        for (let j = Math.floor((c.y - R) / S); j <= Math.floor((c.y + R) / S); j++)
            for (let i = Math.floor((c.x - R) / S); i <= Math.floor((c.x + R) / S); i++) {
                const k = this.key(i, j);
                let list = this.grid.get(k);
                if (!list) { list = []; this.grid.set(k, list); }
                list.push(c);
            }
        return c;
    },

    addBox(x, y, hx, hy, a, h, extra) {
        return this.add(Object.assign({ kind: 'box', x, y, hx, hy, a, c: Math.cos(a), s: Math.sin(a), h: h || 300 }, extra || {}));
    },

    remove(c) {
        const i = this.colliders.indexOf(c);
        if (i >= 0) this.colliders.splice(i, 1);
        for (const list of this.grid.values()) { const k = list.indexOf(c); if (k >= 0) list.splice(k, 1); }
    },

    // Коллайдеры рядом с точкой (радиус r) — без повторов.
    near(x, y, r, out) {
        const res = out || [];
        res.length = 0;
        const S = this.CELL;
        const seen = this._seen || (this._seen = new Set());
        seen.clear();
        for (let j = Math.floor((y - r) / S); j <= Math.floor((y + r) / S); j++)
            for (let i = Math.floor((x - r) / S); i <= Math.floor((x + r) / S); i++) {
                const list = this.grid.get(this.key(i, j));
                if (!list) continue;
                for (const c of list) if (!seen.has(c) && !c.disabled) { seen.add(c); res.push(c); }
            }
        return res;
    },

    _addFromModel(d, m) {
        const url = d.model;
        if (this.NO_COLLIDE.test(url)) return;
        const s = d.scale || [1, 1, 1];
        const sx = Math.abs(s[0]), sy = Math.abs(s[1]), sz = Math.abs(s[2]);
        const minY = m.min[1] * sy, maxY = m.max[1] * sy;
        if (maxY - minY < 35 || minY > 230) return;      // плоское или высоко над дорогой
        const a = ((d.rot && d.rot[1]) || 0) * Math.PI / 180;
        const ca = Math.cos(a), sa = Math.sin(a);
        const name = url.split('/').pop().replace(/\.[a-z0-9]+$/i, '');
        const boxes = this.PROP_BOXES[name];
        if (boxes) {
            for (const b of boxes) {
                // Blender XY (м): x вперёд, y влево -> модель: x, z = −y
                const lx = b[0] * 100 * sx, lz = -b[1] * 100 * sz;
                this.addBox(d.x + lx * ca - lz * sa, d.y + lx * sa + lz * ca, b[2] * 50 * sx, b[3] * 50 * sz, a, maxY);
            }
            return;
        }
        if (this.POLES.test(url)) {
            this.add({ kind: 'circle', x: d.x, y: d.y, r: 22, h: maxY });
            return;
        }
        const w = (m.max[0] - m.min[0]) * sx, dz = (m.max[2] - m.min[2]) * sz;
        const cx = (m.max[0] + m.min[0]) / 2 * sx, cz = (m.max[2] + m.min[2]) / 2 * sz;
        const px = d.x + cx * ca - cz * sa, py = d.y + cx * sa + cz * ca;
        if (this.TREES.test(url)) {
            this.add({ kind: 'circle', x: px, y: py, r: Math.max(18, Math.min(w, dz) * 0.12), h: maxY, tree: true });
            return;
        }
        if (/\/nature\//.test(url)) {
            if (maxY < 90) return;                         // кусты, камни помельче — без коллизии
            this.add({ kind: 'circle', x: px, y: py, r: Math.min(w, dz) * 0.35, h: maxY });
            return;
        }
        this.addBox(px, py, w / 2, dz / 2, a, maxY);
    },

    // --- Площадки и разметка ------------------------------------------------------------------

    async _buildLots() {
        const scene = GameGfx.view.scene, R = Roads;
        const meshes = [], lines = [], yellow = [], curbs = [];
        for (const q of R.lots) {
            const b = BABYLON.MeshBuilder.CreateBox('lot', { width: q.hx * 2, depth: q.hy * 2, height: R.LOT_H }, scene);
            b.position.set(q.x, R.LOT_H / 2 - 1, q.y);
            b.rotation.y = -q.a;
            meshes.push(b);
            // бордюр по краю
            const edge = (cx, cy, len, rot) => {
                const e = BABYLON.MeshBuilder.CreateBox('curb', { width: len, depth: 22, height: R.LOT_H + 6 }, scene);
                e.position.set(cx, (R.LOT_H + 6) / 2 - 1, cy);
                e.rotation.y = -rot;
                curbs.push(e);
            };
            const ux = q.c, uy = q.s, vx = -q.s, vy = q.c;
            edge(q.x + vx * q.hy, q.y + vy * q.hy, q.hx * 2, q.a);
            edge(q.x - vx * q.hy, q.y - vy * q.hy, q.hx * 2, q.a);
            edge(q.x + ux * q.hx, q.y + uy * q.hx, q.hy * 2, q.a + Math.PI / 2);
            edge(q.x - ux * q.hx, q.y - uy * q.hx, q.hy * 2, q.a + Math.PI / 2);
        }
        const loc = this.app.location;
        const rectLines = (d, list, w) => {
            const q = R.rect(d);
            const ux = q.c, uy = q.s, vx = -q.s, vy = q.c;
            const seg = (cx, cy, len, rot) => {
                const l = BABYLON.MeshBuilder.CreateBox('line', { width: len, depth: w, height: 2 }, scene);
                l.position.set(cx, this.surfaceH(cx, cy) + 1.5, cy);
                l.rotation.y = -rot;
                list.push(l);
            };
            seg(q.x + vx * q.hy, q.y + vy * q.hy, q.hx * 2, q.a);
            seg(q.x - vx * q.hy, q.y - vy * q.hy, q.hx * 2, q.a);
            seg(q.x - ux * q.hx, q.y - uy * q.hx, q.hy * 2 + w, q.a + Math.PI / 2);
            return q;
        };
        for (const d of loc.markers('stall')) rectLines(d, lines, 14);
        for (const d of loc.markers('valet')) rectLines(d, lines, 14);
        for (const name of ['park', 'ppark', 'garage']) for (const d of loc.markers(name)) rectLines(d, yellow, 18);
        for (const name of ['stopline', 'slalom-in', 'slalom-out']) for (const d of loc.markers(name)) {
            const q = R.rect(d);
            const l = BABYLON.MeshBuilder.CreateBox('stop', { width: name === 'stopline' ? 40 : 24, depth: q.hy * 2, height: 2 }, scene);
            l.position.set(q.x, this.surfaceH(q.x, q.y) + 1.5, q.y);
            l.rotation.y = -q.a;
            (name === 'stopline' ? lines : yellow).push(l);
        }
        const merge = (list, name, hex) => {
            if (!list.length) return null;
            const m = BABYLON.Mesh.MergeMeshes(list, true, true);
            if (!m) return null;
            m.name = name;
            m.material = GameGfx.mat(name, hex);
            World3D.addObject(GameGfx.view, m, 'prop', { ink: false, outline: false, castShadow: false });
            m.receiveShadows = true;
            return m;
        };
        merge(meshes, 'lots', '#5b5f6b');
        merge(curbs, 'lot-curbs', '#c9ccd6');
        merge(lines, 'lot-lines', '#f4f4f0');
        merge(yellow, 'lot-yellow', '#ffd23f');
    },

    // Высота поверхности для декора разметки.
    surfaceH(x, y) { return Roads.heightAt(x, y); },

    async _buildRamps() {
        const scene = GameGfx.view.scene;
        for (const q of Roads.ramps) {
            const L = q.hx, Wd = q.hy, Hh = q.h, base = Roads.LOT_H;
            // профиль вдоль u: 0 → 0.4 (подъём) → 0.6 (плато) → 1 (спуск)
            const us = [-L, -L + 0.8 * L, L - 0.8 * L, L];
            const hs = [0, Hh, Hh, 0];
            const pos = [], idx = [];
            const add = (u, v, h) => { pos.push(u, base + h, v); return pos.length / 3 - 1; };
            for (let k = 0; k < 3; k++) {
                const a = add(us[k], -Wd, hs[k]), b = add(us[k + 1], -Wd, hs[k + 1]), c = add(us[k + 1], Wd, hs[k + 1]), d = add(us[k], Wd, hs[k]);
                idx.push(a, c, b, a, d, c);
                // боковины
                const a2 = add(us[k], -Wd, 0), b2 = add(us[k + 1], -Wd, 0);
                const e1 = add(us[k], -Wd, hs[k]), e2 = add(us[k + 1], -Wd, hs[k + 1]);
                idx.push(a2, e1, e2, a2, e2, b2);
                const c2 = add(us[k], Wd, 0), d2 = add(us[k + 1], Wd, 0);
                const f1 = add(us[k], Wd, hs[k]), f2 = add(us[k + 1], Wd, hs[k + 1]);
                idx.push(c2, f2, f1, c2, d2, f2);
            }
            const mesh = new BABYLON.Mesh('ramp', scene);
            const vd = new BABYLON.VertexData();
            vd.positions = pos; vd.indices = idx;
            const nrm = []; BABYLON.VertexData.ComputeNormals(pos, idx, nrm); vd.normals = nrm;
            vd.applyToMesh(mesh);
            mesh.material = GameGfx.mat('ramp', '#9aa0aa');
            mesh.material.backFaceCulling = false;
            mesh.position.set(q.x, 0, q.y);
            mesh.rotation.y = -q.a;
            World3D.addObject(GameGfx.view, mesh, 'prop', { ink: false, outline: false });
            // полосы по краям плато
            for (const sgn of [-1, 1]) {
                const s = BABYLON.MeshBuilder.CreateBox('ramp-edge', { width: 0.4 * L, depth: 18, height: 4 }, scene);
                s.material = GameGfx.mat('ramp-edge', '#ffd23f');
                s.parent = mesh;
                s.position.set(0, base + Hh + 1, sgn * (Wd - 9));
            }
            // боковые стенки — коллизия вдоль бортов (заехать сбоку нельзя)
            for (const sgn of [-1, 1]) this.addBox(q.x - q.s * sgn * (Wd + 20), q.y + q.c * sgn * (Wd + 20), L * 0.6, 20, q.a, Hh, { low: true });
        }
    },

    // --- Конусы ---------------------------------------------------------------------------------

    // Физика конуса (px, с): лёгкое тело на земле. Удар машины передаёт импульс (конус ~3 кг, машине почти всё равно),
    // сильный — подбрасывает. Наклон θ к стороне удара: до точки опрокидывания конус качается и встаёт сам, дальше —
    // падает на бок (θ ≈ MAX), лежащий катится и скользит с трением. Стены и другие конусы — отскок.
    // Вид: поворот вокруг края основания со стороны падения (лежащий конус приподнят на радиус основания).
    CONE: { r: 26, base: 30, g: 981, crit: 0.62, max: 1.33, gL: 34, e: 0.35, mass: 3 },

    _coneState(c, d) {
        c.x = d ? d.x : c.x0; c.y = d ? d.y : c.y0;
        c.z = 0; c.vx = 0; c.vy = 0; c.vz = 0;
        c.th = 0; c.thv = 0; c.phi = 0; c.spin = 0; c.spinv = 0;
        c.hit = false; c.down = false; c.sleep = true; c.moving = false;
        return c;
    },

    async _buildCones() {
        const loc = this.app.location;
        this.cones = loc.markers('cone').map((d, i) => this._coneState({ id: i, x0: d.x, y0: d.y, r: this.CONE.r }, d));
        this._coneGfx = await GameGfx.instanced('assets/models/roads/construction-cone.glb', 'cones', [], { kind: 'prop' });
        if (!this._coneGfx) {
            // запасной конус — примитив
            const scene = GameGfx.view.scene;
            const c = BABYLON.MeshBuilder.CreateCylinder('cone', { diameterTop: 6, diameterBottom: 48, height: 72, tessellation: 10 }, scene);
            c.material = GameGfx.mat('cone', '#ff6a1f');
            c.bakeTransformIntoVertices(BABYLON.Matrix.Translation(0, 36, 0));
            const root = new BABYLON.Mesh('cones', scene); c.parent = root;
            World3D.addObject(GameGfx.view, root, 'prop', { ink: false, outline: false });
            this._coneGfx = { root, parts: [c], set(mats) {
                const buf = new Float32Array(Math.max(1, mats.length) * 16); mats.forEach((m, i) => m.copyToArray(buf, i * 16));
                c.thinInstanceSetBuffer('matrix', buf, 16, false); c.thinInstanceCount = mats.length; c.thinInstanceRefreshBoundingInfo(false); } };
        }
        this._coneMats = this.cones.map(() => new BABYLON.Matrix());
        this.syncCones(true);
    },

    resetCones() {
        for (const c of this.cones) this._coneState(c, null);
        this.syncCones(true);
    },

    // Удар по конусу точкой машины, движущейся со скоростью (pvx, pvy) px/с; n — от машины к конусу.
    // -> изменение скорости конуса по нормали (px/с), 0 — касание без удара.
    hitCone(c, nx, ny, pvx, pvy) {
        const K = this.CONE;
        const vrel = (pvx - c.vx) * nx + (pvy - c.vy) * ny;
        if (vrel <= 0) return 0;
        const dv = (1 + K.e) * vrel;
        c.vx += nx * dv; c.vy += ny * dv;
        // трение о бампер: часть касательной скорости машины
        const tx = -ny, ty = nx;
        const vt = (pvx - c.vx) * tx + (pvy - c.vy) * ty;
        c.vx += tx * vt * 0.3; c.vy += ty * vt * 0.3;
        if (dv > 140) c.vz = Math.max(c.vz, Math.min(330, dv * 0.3));          // сильный удар — подбросило
        // наклон от машины: стоящий — в сторону удара; уже наклонённый — по проекции удара на его наклон
        if (c.th < 0.05) { c.phi = Math.atan2(ny, nx); c.thv += dv / 150; }
        else c.thv += dv / 150 * Math.max(-0.5, Math.cos(c.phi) * nx + Math.sin(c.phi) * ny);
        c.spinv += (Math.random() - 0.5) * dv / 30;
        c.sleep = false;
        return dv;
    },

    syncCones(force) {
        if (!this._coneGfx) return;
        const K = this.CONE;
        let dirty = !!force;
        const S = this._coneScale || (this._coneScale = new BABYLON.Vector3(8, 8, 8));
        const P = this._conePos || (this._conePos = new BABYLON.Vector3());
        const ax = this._coneAxis || (this._coneAxis = new BABYLON.Vector3());
        this.cones.forEach((c, i) => {
            if (!force && !c.moving) return;
            dirty = true;
            const cp = Math.cos(c.phi), sp = Math.sin(c.phi), ct = Math.cos(c.th), st = Math.sin(c.th);
            // поворот вокруг края основания со стороны падения: центр основания сдвигается и поднимается
            P.set(c.x + cp * K.base * (1 - ct), Roads.heightAt(c.x, c.y) + c.z + K.base * st, c.y + sp * K.base * (1 - ct));
            ax.set(sp, 0, -cp);
            const q = BABYLON.Quaternion.RotationAxis(ax, c.th).multiply(BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, -c.spin));
            BABYLON.Matrix.ComposeToRef(S, q, P, this._coneMats[i]);
        });
        if (dirty) this._coneGfx.set(this._coneMats);
    },

    updateCones(dt) {
        const K = this.CONE;
        let any = false;
        const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
        for (let step = 0; step < n; step++) {
            for (const c of this.cones) {
                if (c.sleep) continue;
                // вертикаль: прыжок и приземление с отскоком
                c.vz -= K.g * h; c.z += c.vz * h;
                if (c.z <= 0) { c.z = 0; c.vz = c.vz < -70 ? -c.vz * 0.3 : 0; }
                const ground = c.z <= 0.5;
                // плоскость: движение и трение (стоящий скребёт основанием, лежащий катится легче)
                c.x += c.vx * h; c.y += c.vy * h;
                const fr = ground ? (c.th > 1 ? 1.6 : 4.5) : 0.15;
                const k = Math.exp(-fr * h);
                c.vx *= k; c.vy *= k;
                // наклон: до точки опрокидывания вес возвращает конус, после — валит на бок
                let acc = K.gL * (Math.sin(c.th) - Math.sin(K.crit));
                if (!ground) acc *= 0.3;
                c.thv += acc * h;
                c.thv *= Math.exp(-1.2 * h);
                c.th += c.thv * h;
                if (c.th < 0) { c.th = -c.th; c.thv = -c.thv * 0.35; c.phi += Math.PI; }
                if (c.th > K.max) { c.th = K.max; if (c.thv > 0) c.thv = -c.thv * 0.2; }
                // лежащий катится: вращение вокруг своей оси от скорости
                const sp = Math.hypot(c.vx, c.vy);
                if (c.th > 1 && ground) c.spin += sp / K.base * h * 0.6;
                c.spin += c.spinv * h; c.spinv *= Math.exp(-2.5 * h);
                if (!c.down && c.th > K.crit + 0.2) c.down = true;
                this._coneWalls(c);
                // покой
                if (ground && sp < 4 && Math.abs(c.thv) < 0.06 && Math.abs(c.spinv) < 0.2 && (c.th < 0.03 || c.th > K.max - 0.02)) {
                    if (c.th < 0.03) c.th = 0;
                    c.vx = c.vy = c.thv = c.spinv = 0; c.vz = 0;
                    c.sleep = true;
                }
                c.moving = true; any = true;
            }
            this._coneCones();
        }
        if (any) this.syncCones(false);
        for (const c of this.cones) if (c.sleep) c.moving = false;
    },

    // Конус о стены, столбы, деревья и припаркованные машины: вытолкнуть и отразить скорость.
    _coneWalls(c) {
        const r = this.CONE.r;
        for (const col of this.near(c.x, c.y, r + 20, this._coneNear || (this._coneNear = []))) {
            if (col.water || col.gate && col.disabled) continue;
            let nx, ny, depth;
            if (col.kind === 'circle') {
                const dx = c.x - col.x, dy = c.y - col.y, d = Math.hypot(dx, dy);
                if (d >= col.r + r || d < 1e-6) continue;
                nx = dx / d; ny = dy / d; depth = col.r + r - d;
            } else {
                const dx = c.x - col.x, dy = c.y - col.y;
                const u = dx * col.c + dy * col.s, v = -dx * col.s + dy * col.c;
                const qu = Math.max(-col.hx, Math.min(col.hx, u)), qv = Math.max(-col.hy, Math.min(col.hy, v));
                let ou = u - qu, ov = v - qv, d = Math.hypot(ou, ov);
                if (d >= r) continue;
                if (d < 1e-6) { // центр внутри — наружу по ближней стороне
                    if (col.hx - Math.abs(u) < col.hy - Math.abs(v)) { ou = Math.sign(u) || 1; ov = 0; depth = col.hx - Math.abs(u) + r; }
                    else { ou = 0; ov = Math.sign(v) || 1; depth = col.hy - Math.abs(v) + r; }
                    d = 1;
                } else depth = r - d;
                nx = (ou * col.c - ov * col.s) / d; ny = (ou * col.s + ov * col.c) / d;
            }
            c.x += nx * depth; c.y += ny * depth;
            const vn = c.vx * nx + c.vy * ny;
            if (vn < 0) { c.vx -= (1 + 0.3) * vn * nx; c.vy -= (1 + 0.3) * vn * ny; }
        }
    },

    // Конусы друг о друга: раздвинуть, обменяться скоростью по нормали (массы равны), разбудить соседа.
    _coneCones() {
        const cs = this.cones, r2 = this.CONE.r * 2;
        for (let i = 0; i < cs.length; i++) {
            const a = cs[i];
            for (let j = i + 1; j < cs.length; j++) {
                const b = cs[j];
                if (a.sleep && b.sleep) continue;
                const dx = b.x - a.x, dy = b.y - a.y;
                if (dx * dx + dy * dy >= r2 * r2) continue;
                const d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d, push = (r2 - d) / 2;
                a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
                const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
                if (vn < 0) {
                    const j2 = -(1 + 0.5) * vn / 2;
                    a.vx -= j2 * nx; a.vy -= j2 * ny; b.vx += j2 * nx; b.vy += j2 * ny;
                    if (j2 > 60 && b.th < 0.05) { b.phi = Math.atan2(ny, nx); b.thv += j2 / 220; }
                    if (j2 > 60 && a.th < 0.05) { a.phi = Math.atan2(-ny, -nx); a.thv += j2 / 220; }
                }
                a.sleep = false; b.sleep = false;
            }
        }
    },

    // --- Шлагбаум ------------------------------------------------------------------------------

    async _buildGate() {
        const d = this.app.location.marker('gate');
        if (!d) { this.gate = null; return; }
        const q = Roads.rect(d);
        const root = await GameGfx.single('assets/models/props/barrier_gate.glb', 'gate', 'prop');
        const g = { q, root, arm: GameGfx.part(root, 'Arm'), open: 0, target: 0, collider: null };
        if (root) {
            // столб у правого края проезда (по ходу выезда), стрела поперёк дороги
            root.position.set(q.x + (-q.s) * (q.hy + 30), Roads.heightAt(q.x, q.y), q.y + q.c * (q.hy + 30));
            root.rotation.y = -(q.a + Math.PI);
        }
        if (!g.arm) {
            const scene = GameGfx.view.scene;
            const arm = BABYLON.MeshBuilder.CreateBox('gate-arm', { width: 16, height: 16, depth: q.hy * 2 + 40 }, scene);
            arm.material = GameGfx.mat('gate-arm', '#e8383d');
            arm.position.set(q.x, 105, q.y);
            arm.rotation.y = -q.a;
            World3D.addObject(GameGfx.view, arm, 'prop', { ink: false, outline: false });
            g.fallback = arm;
        }
        g.collider = this.addBox(q.x, q.y, 14, q.hy + 10, q.a, 120, { gate: true });
        this.gate = g;
    },

    setGateOpen(open) {
        const g = this.gate;
        if (!g) return;
        g.target = open ? 1 : 0;
        if (g.collider) g.collider.disabled = !!open;
    },

    updateGate(dt) {
        const g = this.gate;
        if (!g || g.open === g.target) return;
        g.open += Math.sign(g.target - g.open) * Math.min(Math.abs(g.target - g.open), dt * 0.9);
        const ang = g.open * Math.PI * 0.47;
        if (g.arm) {
            const pv = g.arm.metadata && g.arm.metadata.pivot;
            if (pv) g.arm.setPivotPoint(new BABYLON.Vector3(pv[0], pv[1], pv[2]));
            g.arm.rotation.x = ang;
        } else if (g.fallback) {
            g.fallback.position.y = 105 + g.open * 140;
            g.fallback.scaling.z = 1 - g.open * 0.9;
        }
    },

    // --- Припаркованные машины -----------------------------------------------------------------

    TRAFFIC_MODELS: ['assets/models/traffic/sedan.glb', 'assets/models/traffic/suv.glb', 'assets/models/traffic/van.glb',
        'assets/models/traffic/hatchback-sports.glb', 'assets/models/traffic/taxi.glb', 'assets/models/traffic/sedan-sports.glb',
        'assets/models/traffic/suv-luxury.glb', 'assets/models/traffic/police.glb', 'assets/models/traffic/delivery.glb'],
    TRAFFIC_SCALE: 175,       // Kenney Car Kit (длина 2.6 ед.) -> ~4.5 м

    async _buildParked() {
        const loc = this.app.location;
        const groups = new Map();
        for (const d of loc.markers('parked')) {
            const h = Math.abs((d.x * 31 + d.y * 17) | 0);
            const url = this.TRAFFIC_MODELS[h % 6];
            if (!groups.has(url)) groups.set(url, []);
            groups.get(url).push(d);
        }
        const S = this.TRAFFIC_SCALE / 100;
        for (const [url, list] of groups) {
            const mats = list.map(d => {
                const a = ((d.rot && d.rot[1]) || 0) * Math.PI / 180;
                // Kenney: нос машины по +Z модели -> курс модели = курс − 90°
                return GameGfx.matrix(d.x, d.y, Roads.heightAt(d.x, d.y), a - Math.PI / 2, [S, S, S]);
            });
            const gfx = await GameGfx.instanced(url, 'parked', mats, { kind: 'prop' });
            const m = gfx && gfx.model;
            const len = m ? (m.max[2] - m.min[2]) * S : 450, wid = m ? (m.max[0] - m.min[0]) * S : 260;
            for (const d of list) {
                const a = ((d.rot && d.rot[1]) || 0) * Math.PI / 180;
                this.parked.push(this.addBox(d.x, d.y, len / 2, wid / 2, a, 150, { car: true }));
            }
        }
    },

    update(dt) {
        this.updateCones(dt);
        this.updateGate(dt);
    },
};
