// GameNav.js — навигатор: маршрут A* по плиткам до цели (маркер у тротуара или точка), подсказки манёвров
// инструктором, стрелки на дороге перед машиной, маяк цели, перестроение при съезде с маршрута.

/** @satisfies {Record<string, any>} */
const GameNav = {
    /** @type {any} */ target: null,      // { x, y, rot?, r, label, onArrive, stop }
    /** @type {any[] | null} */ steps: null,
    /** @type {any} */ poly: null,
    stepIdx: 0,
    rerouteT: 0,
    sayIdx: -1,
    distLeft: 0,
    next: null,                           // { turn, dist, n } — следующий манёвр
    /** @type {any} */ arrows: null,
    /** @type {any} */ beacon: null,
    arrived: false,
    _nearIdx: 0,
    /** @type {Float32Array | null} */ _arrowBuf: null,
    _arrowBufSet: false,
    /** @type {any[]} */ _mpool: [],
    /** @type {any[]} */ _arrowMats: [],

    // Цель: { x, y, rot? (курс маркера, градусы), radius px, label, stop: bool (нужна остановка), direct: bool (без дорог) }
    set(target) {
        this.target = Object.assign({ radius: 420, stop: true }, target);
        this.arrived = false;
        this.sayIdx = -1;
        this.reroute(true);
        this._ensureGfx();
    },

    clear() {
        this.target = null; this.steps = null; this.poly = null; this.next = null;
        if (this.arrows) this.arrows.isVisible = false;
        if (this.beacon) this.beacon.setEnabled(false);
    },

    reroute(silent) {
        const car = Game.car, t = this.target;
        if (!car || !t) return;
        this.rerouteT = 1.2;
        if (t.direct || !Roads.pieceAt(t.x, t.y)) {
            // цель вне дорог (площадка автодрома) — маршрут до ближайшей плитки, дальше напрямую
            const near = this._nearestPiece(t.x, t.y);
            const from = Roads.stateAt(car.x, car.y, car.heading);
            const steps = near && from && from.piece !== near ? Roads.route(from, { piece: near, port: null }) : null;
            this.steps = steps;
            this.poly = steps ? Roads.routePolyline(steps, t) : Roads._measure([{ x: car.x, y: car.y }, { x: t.x, y: t.y }]);
        } else {
            const from = Roads.stateAt(car.x, car.y, car.heading);
            const to = Roads.targetState({ x: t.x, y: t.y, rot: [0, t.rot || 0, 0] });
            let steps = from && to ? Roads.route(from, to) : null;
            if (!steps && from && to) steps = Roads.route(from, { piece: to.piece, port: null });
            this.steps = steps;
            this.poly = steps ? Roads.routePolyline(steps, t) : Roads._measure([{ x: car.x, y: car.y }, { x: t.x, y: t.y }]);
        }
        this.stepIdx = 0;
        if (!silent && typeof GameInstructor !== 'undefined') GameInstructor.say('reroute', 'calm');
    },

    _nearestPiece(x, y) {
        let best = null, bd = Infinity;
        for (const p of Roads.pieces) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
        return best;
    },

    update(dt) {
        const t = this.target, car = Game.car;
        if (!t || !car) return;
        if (this.rerouteT > 0) this.rerouteT -= dt;
        const dist = Math.hypot(car.x - t.x, car.y - t.y);
        // Продвижение по шагам маршрута.
        const piece = Roads.pieceAt(car.x, car.y);
        if (this.steps && piece) {
            let found = -1;
            for (let k = this.stepIdx; k < Math.min(this.steps.length, this.stepIdx + 4); k++) if (this.steps[k].piece === piece) { found = k; break; }
            if (found >= 0) this.stepIdx = found;
            else if (this.rerouteT <= 0 && dist > t.radius * 1.5 && !this.steps.some(s => s.piece === piece)) this.reroute(false);
        } else if (!this.steps && piece && this.rerouteT <= 0 && dist > 1500) this.reroute(true);
        // Следующий манёвр.
        this.next = null;
        if (this.steps) {
            let acc = 0;
            for (let k = this.stepIdx; k < this.steps.length; k++) {
                const s = this.steps[k];
                if (s.b === null || s.b === undefined) break;
                const p = s.piece;
                const turn = Roads.turnOf(p, s.a, s.b);
                const isJunction = p.ports.length >= 3;
                if (k > this.stepIdx || (k === this.stepIdx && isJunction)) {
                    if (isJunction && (turn !== 'straight' || p.kind === 'round')) {
                        const d = Math.max(0, acc + (k === this.stepIdx ? 0 : Math.hypot(p.x - car.x, p.y - car.y) - acc));
                        this.next = { turn: p.kind === 'round' ? 'round' : turn, dist: Math.hypot(p.x - car.x, p.y - car.y), n: p.kind === 'round' ? Roads.roundExit(p, s.a, s.b) : 0, idx: k, signal: !!p.signal };
                        void d;
                        break;
                    }
                }
                acc += Roads.T;
            }
        }
        // Реплика инструктора о манёвре заранее (один раз на манёвр).
        if (this.next && this.next.dist < 1900 && this.sayIdx !== this.next.idx && typeof GameInstructor !== 'undefined') {
            this.sayIdx = this.next.idx;
            const key = { left: 'turnLeft', right: 'turnRight', round: 'round', uturn: 'uturn', straight: 'straight' }[this.next.turn];
            GameInstructor.say(key, 'calm', { n: this.next.n });
        }
        this.distLeft = this._remaining(car);
        // Прибытие.
        if (!this.arrived && dist < t.radius && (!t.stop || car.speed < 0.6)) {
            this.arrived = true;
            const cb = t.onArrive;
            if (cb) cb();
        }
        this._updateGfx(car, dt);
    },

    // Остаток пути по ломаной от ближайшей к машине точки.
    _remaining(car) {
        const p = this.poly;
        if (!p) return 0;
        // ближайшая точка ломаной: ищем в окне вокруг прошлой (машина движется вдоль маршрута), раз в секунду — по всей
        const n = p.pts.length;
        const full = !this._fullT || Game.time - this._fullT > 1;
        if (full) this._fullT = Game.time;
        const from = full ? 0 : Math.max(0, (this._nearIdx || 0) - 20), to = full ? n : Math.min(n, (this._nearIdx || 0) + 60);
        let best = this._nearIdx || 0, bd = Infinity;
        for (let i = from; i < to; i++) {
            const d = (p.pts[i].x - car.x) ** 2 + (p.pts[i].y - car.y) ** 2;
            if (d < bd) { bd = d; best = i; }
        }
        this._nearIdx = best;
        return p.len - p.cum[best];
    },
    _fullT: 0,

    _ensureGfx() {
        if (this.arrows) return;
        const scene = GameGfx.view.scene;
        // Шеврон «›» острием по ходу движения (локальная +x — курс, как у моделей): два плоских плеча от острия назад.
        const pos = [], idx = [], nrm = [];
        const tip = [44, 0], t = 18;
        for (const side of [-1, 1]) {
            const end = [-16, side * 46];
            const dx = end[0] - tip[0], dz = end[1] - tip[1], len = Math.hypot(dx, dz);
            const nx = -dz / len * t / 2, nz = dx / len * t / 2;
            const base = pos.length / 3;
            for (const p of [[tip[0] + nx, tip[1] + nz], [tip[0] - nx, tip[1] - nz], [end[0] - nx, end[1] - nz], [end[0] + nx, end[1] + nz]]) {
                pos.push(p[0], 0, p[1]); nrm.push(0, 1, 0);
            }
            idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
        const m = new BABYLON.Mesh('chevron', scene);
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.indices = idx; vd.normals = nrm;
        vd.applyToMesh(m);
        const mat = new BABYLON.StandardMaterial('chev', scene);
        mat.disableLighting = true; mat.emissiveColor = BABYLON.Color3.FromHexString('#3ee6ff'); mat.alpha = 0.85;
        mat.backFaceCulling = false;   // плоская стрелка видна сверху при любом порядке обхода
        /** @type {any} */ (mat).metadata = { toon: false };
        m.material = mat;
        this.arrows = m;
        this._arrowMats = [];
        // Маяк цели: полупрозрачный столб света.
        const beacon = BABYLON.MeshBuilder.CreateCylinder('beacon', { diameterTop: 220, diameterBottom: 260, height: 1400, tessellation: 24, cap: BABYLON.Mesh.NO_CAP }, scene);
        beacon.bakeTransformIntoVertices(BABYLON.Matrix.Translation(0, 700, 0));
        const bm = new BABYLON.StandardMaterial('beacon', scene);
        bm.disableLighting = true; bm.emissiveColor = BABYLON.Color3.FromHexString('#ffd23f'); bm.alpha = 0.28; bm.backFaceCulling = false;
        /** @type {any} */ (bm).metadata = { toon: false };
        beacon.material = bm;
        const ring = BABYLON.MeshBuilder.CreateTorus('beacon-ring', { diameter: 520, thickness: 26, tessellation: 40 }, scene);
        ring.material = bm; ring.parent = beacon; ring.position.y = 6;
        this.beacon = beacon;
    },

    _updateGfx(car, dt) {
        const p = this.poly, t = this.target;
        if (this.beacon && t) {
            this.beacon.setEnabled(true);
            this.beacon.position.set(t.x, Roads.heightAt(t.x, t.y), t.y);
            this.beacon.rotation.y += dt * 0.8;
        }
        if (!this.arrows || !p) return;
        // 6 шевронов по маршруту впереди машины (на 7..30 м).
        const start = p.cum[this._nearIdx || 0] + 700;
        const mats = this._arrowMats;
        mats.length = 0;
        const o = { x: 0, y: 0, dx: 1, dy: 0 };
        for (let k = 0; k < 7; k++) {
            const s = start + k * 380;
            if (s > p.len - 200) break;
            Roads.pointOn(p, s, o);
            const pulse = 1 + 0.12 * Math.sin(Game.time * 6 - k * 0.8);
            const pool = this._mpool;
            mats.push(GameGfx.matrix(o.x, o.y, Roads.heightAt(o.x, o.y) + 3, Math.atan2(o.dy, o.dx), [pulse, 1, pulse], pool[k] || (pool[k] = new BABYLON.Matrix())));
        }
        const buf = this._arrowBuf || (this._arrowBuf = new Float32Array(7 * 16));
        mats.forEach((m, i) => m.copyToArray(buf, i * 16));
        if (!this._arrowBufSet) { this.arrows.thinInstanceSetBuffer('matrix', buf, 16, false); this._arrowBufSet = true; }
        else this.arrows.thinInstanceBufferUpdated('matrix');
        this.arrows.thinInstanceCount = mats.length;
        this.arrows.thinInstanceRefreshBoundingInfo(false);
        this.arrows.isVisible = mats.length > 0;
    },
};
