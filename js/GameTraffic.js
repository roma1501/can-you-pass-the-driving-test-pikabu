// GameTraffic.js — городской трафик: машины ИИ едут по полосам плиток GameRoads (Roads.lanePath),
// держат дистанцию, стоят на красный, уступают на нерегулируемых перекрёстках и кольце, пропускают
// пешеходов (GamePeds) и игрока. Логика — чистые числа (инвариант 4): карта и плитки читаются из Roads,
// Babylon нужен только для отрисовки (thin instances Kenney Car Kit, одна пачка на модель).
//
// Единицы: расстояния — px мира (100 px = 1 м), скорости машины — м/с, s — путь по полосе в px.
// Курс θ: нос (cos θ, sin θ). Модель Kenney смотрит носом в +Z, курс модели = θ − 90°.
//
// Как едет машина. plan — цепочка из 4 сегментов { piece, a, b, path }: плитка, порт въезда, порт выезда и
// полоса внутри плитки. Машина стоит на plan[0] на расстоянии s от начала. Каждый кадр:
//  1. look — точки впереди по плану (шаг 1 м, до 36 м): по ним ищутся препятствия;
//  2. control — целевая скорость = min(крейсерская, лимит зоны, кривизна, безопасная скорость у препятствий);
//     безопасная скорость — формула Краусса от зазора до машины / пешехода / игрока / стоп-линии;
//  3. перекрёсток (≥ 3 портов): светофор (красный и жёлтый — стоп перед краем плитки), иначе заявка
//     (claim) за 40 м; право проезда — по времени пересечения полос: кто уже внутри или заявил раньше,
//     тот едет; поворот налево уступает; через 4 с ожидания машина едет сама (нет тупиков);
//  4. move — s растёт, курс плавно догоняет касательную полосы, наклон кузова по ускорению.

/** @typedef {{ id: number, piece: any, a: number, b: number, path: any, len: number, inf: any, junc: boolean, turn: string }} TrafficSeg */
/** @typedef {{ car: TrafficCar, seg: TrafficSeg, t: number }} TrafficClaim */

class TrafficCar {
    /** @param {number} id */
    constructor(id) {
        this.id = id;
        this.model = 0;
        this.len = 450; this.wid = 200;        // px
        this.hl = 225; this.hw = 100;
        this.x = 0; this.y = 0; this.h = 0;
        this.heading = 0; this.cs = 1; this.sn = 0;
        this.speed = 0; this.acc = 0;          // м/с, м/с²
        this.cruise = 12;
        this.limit = 16; this.limT = 0;        // лимит зоны, м/с
        /** @type {any} */ this.piece = null;
        /** @type {TrafficSeg[]} */ this.plan = [];
        this.s = 0;
        this.ox = 0; this.oy = 0; this.ovx = 0; this.ovy = 0;   // смещение от толчка (px, px/с)
        this.hitT = 0; this.hornT = 0; this.blockT = 0; this.waitT = 0; this.stuckT = 0; this.hitEv = -9;
        this.vSafe = 1e9; this.vCurve = 1e9; this.blk = 0;      // 0 нет, 1 машина, 2 игрок, 3 пешеход, 4 светофор, 5 перекрёсток, 6 «коробка»
        this.gapCar = 1e9; this.gapCarV = 0;
        this.force = -1; this.pass = -1; this.comm = -1; this.waitSeg = -1; this.ghostT = 0;
        /** @type {TrafficCar | null} */ this.blkCar = null;
        this.pitch = 0; this.roll = 0; this.yawRate = 0;
        this.dead = false;
        /** @type {TrafficClaim[]} */ this.claims = [];
        this.nLook = 0;
        this.lx = new Float32Array(GameTraffic.LOOK_N);
        this.ly = new Float32Array(GameTraffic.LOOK_N);
        this.tx = new Float32Array(GameTraffic.LOOK_N);
        this.ty = new Float32Array(GameTraffic.LOOK_N);
        this.box = { kind: 'box', x: 0, y: 0, hx: 225, hy: 100, c: 1, s: 0, a: 0, h: 150, trafficCar: this };
        /** @type {any} */
        this.mover = { box: this.box, vx: 0, vy: 0, onHit: null, car: this };
    }
}

/** @satisfies {Record<string, any>} */
const GameTraffic = {
    max: (typeof IS_MOBILE !== 'undefined' && IS_MOBILE) ? 14 : 26,
    density: 1,

    // Радиусы (px): зона моделирования, окно появления, снос.
    RADIUS: 26000, SPAWN_MIN: 12000, SPAWN_MAX: 26000, DESPAWN: 29000,
    LOOK_STEP: 100, LOOK_N: 36, PLAN_N: 4,
    ACCEL: 2.5, BRAKE: 5, EMERGENCY: 8, TAU: 0.5, A_LAT: 4.5,
    LINE_MARGIN: 60, CLAIM_DIST: 4000, WAIT_FORCE: 4, TIME_GAP: 2.2,

    /** @type {TrafficCar[]} */ cars: [],
    /** @type {any} */ app: null,
    /** @type {any} */ player: null,          // подмена игрока для тестов: { x, y, vx, vy, speed, heading, P: { hl, hw } }
    ready: false,
    time: 0,
    /** @type {any[]} */ models: [],
    /** @type {Map<number, TrafficClaim[]>} */ _claims: new Map(),
    /** @type {WeakMap<object, any>} */ _pinfo: new WeakMap(),
    /** @type {any[]} */ _cand: [],
    /** @type {any[]} */ _dyn: [],
    _segId: 0, _carId: 0, _mgT: 0, _candT: 0, _tilesNear: 0, _frame: 0,
    _pl: { x: 0, y: 0, vx: 0, vy: 0, speed: 0, hl: 220, hw: 90, cs: 1, sn: 0, ok: false },
    _tmp: { x: 0, y: 0, dx: 1, dy: 0 },
    _tmp2: { x: 0, y: 0, dx: 1, dy: 0 },

    // Модели трафика (Kenney Car Kit): вес в случайном выборе. Нет файла — модель пропускается.
    MODELS: [
        { url: 'assets/models/traffic/sedan.glb', w: 3 },
        { url: 'assets/models/traffic/suv.glb', w: 2 },
        { url: 'assets/models/traffic/hatchback-sports.glb', w: 2 },
        { url: 'assets/models/traffic/van.glb', w: 1.4 },
        { url: 'assets/models/traffic/sedan-sports.glb', w: 1.4 },
        { url: 'assets/models/traffic/suv-luxury.glb', w: 1 },
        { url: 'assets/models/traffic/taxi.glb', w: 1.2 },
        { url: 'assets/models/traffic/delivery.glb', w: 0.7 },
        { url: 'assets/models/traffic/police.glb', w: 0.4 },
        { url: 'assets/models/traffic/ambulance.glb', w: 0.2 },
        { url: 'assets/models/traffic/garbage-truck.glb', w: 0.3 },
    ],

    // --- Старт -----------------------------------------------------------------------------------

    // Только логика (без графики): тесты и init.
    initSim() {
        this.cars = []; this._claims = new Map(); this._cand = [];
        this.time = 0; this._mgT = 0; this._candT = 0;
        const S = (typeof GameWorld !== 'undefined' ? GameWorld.TRAFFIC_SCALE : 175) / 100;
        this.models = this.MODELS.map(m => ({ url: m.url, w: m.w, len: 260 * S, wid: 120 * S, gfx: null, buf: null, n: 0, scale: S }));
        this.ready = true;
    },

    async init(app) {
        this.app = app;
        this.initSim();
        const cap = Math.ceil(this.max * 1.6) + 2;
        const mobile = typeof IS_MOBILE !== 'undefined' && IS_MOBILE;
        await Promise.all(this.models.map(async (m) => {
            try {
                const gfx = await GameGfx.instanced(m.url, 'traffic', [], { kind: 'prop', shadow: !mobile });
                if (!gfx) { m.w = 0; return; }
                m.gfx = gfx;
                m.buf = new Float32Array(cap * 16);
                for (const p of gfx.parts) {
                    p.thinInstanceSetBuffer('matrix', m.buf, 16, false);
                    p.thinInstanceCount = 0;
                    p.isVisible = false;
                }
                const md = gfx.model;
                if (md && md.max && md.min) { m.len = (md.max[2] - md.min[2]) * m.scale; m.wid = (md.max[0] - md.min[0]) * m.scale; }
            } catch (e) { console.warn('GameTraffic: модель не загружена', m.url, e); m.w = 0; }
        }));
        GameCar.dynamic = (x, y, r) => this.dynamicNear(x, y, r);
        this._fill();
    },

    setDensity(k) { this.density = Math.max(0, +k || 0); },

    reset() {
        for (const c of this.cars.slice()) this._remove(c);
        this.cars.length = 0;
        this._claims.clear();
        this._mgT = 0;
    },

    // Убрать машины в радиусе r вокруг точки (телепорт игрока).
    clearAround(x, y, r) {
        for (const c of this.cars.slice()) if ((c.x - x) * (c.x - x) + (c.y - y) * (c.y - y) < r * r) this._remove(c);
    },

    // Машины для столкновения с игроком: [{ box, vx, vy (м/с), onHit(impact, car) }].
    dynamicNear(x, y, r) {
        const out = this._dyn;
        out.length = 0;
        for (const c of this.cars) {
            const R = r + c.hl, dx = c.x - x, dy = c.y - y;
            if (dx * dx + dy * dy < R * R) out.push(c.mover);
        }
        return out;
    },

    // --- Игрок ------------------------------------------------------------------------------------

    _player() {
        const pl = this._pl;
        const src = this.player || (typeof Game !== 'undefined' ? Game.car : null);
        if (!src) { pl.ok = false; return pl; }
        pl.ok = true;
        pl.x = src.x; pl.y = src.y;
        pl.vx = src.vx || 0; pl.vy = src.vy || 0;
        pl.speed = Math.hypot(pl.vx, pl.vy);
        const hd = src.heading || 0;
        pl.cs = Math.cos(hd); pl.sn = Math.sin(hd);
        pl.hl = src.P ? src.P.hl * 100 : 220; pl.hw = src.P ? src.P.hw * 100 : 90;
        return pl;
    },

    // --- Полосы и план ------------------------------------------------------------------------------

    // Выборка точек пути (шаг 1 м) и предельная скорость по кривизне — один раз на путь.
    _info(path) {
        let inf = this._pinfo.get(path);
        if (inf) return inf;
        const n = Math.max(2, Math.ceil(path.len / 100) + 1);
        const xs = new Float32Array(n), ys = new Float32Array(n), ss = new Float32Array(n);
        const o = this._tmp;
        for (let i = 0; i < n; i++) {
            const s = path.len * i / (n - 1);
            Roads.pointOn(path, s, o);
            xs[i] = o.x; ys[i] = o.y; ss[i] = s;
        }
        let kmax = 0;
        const t0 = this._tmp, t1 = this._tmp2;
        for (let s = 0; s <= path.len; s += 50) {
            const a = Math.max(0, s - 100), b = Math.min(path.len, s + 100);
            if (b - a < 60) continue;
            Roads.pointOn(path, a, t0);
            const a0 = Math.atan2(t0.dy, t0.dx);
            Roads.pointOn(path, b, t1);
            let da = Math.atan2(t1.dy, t1.dx) - a0;
            while (da > Math.PI) da -= 2 * Math.PI;
            while (da < -Math.PI) da += 2 * Math.PI;
            const k = Math.abs(da) / ((b - a) / 100);
            if (k > kmax) kmax = k;
        }
        const vc = kmax > 0.01 ? Math.max(3.5, Math.sqrt(this.A_LAT / kmax)) : 99;
        inf = { xs, ys, ss, n, vc };
        this._pinfo.set(path, inf);
        return inf;
    },

    /** @returns {TrafficSeg} */
    _seg(piece, a, b) {
        const path = Roads.lanePath(piece, a, b);
        return { id: ++this._segId, piece, a, b, path, len: path.len, inf: this._info(path), junc: piece.ports.length >= 3, turn: Roads.turnOf(piece, a, b) };
    },

    // Случайный выезд: прямо чаще, без разворота (кроме тупика — exits сам вернёт порт въезда).
    _chooseExit(piece, a) {
        const ex = Roads.exits(piece, a);
        if (ex.length === 1) return ex[0];
        let tot = 0;
        // Тупик-отросток из одной плитки не берём (развернувшиеся там машины запирают перекрёсток), если есть выбор.
        const w = ex.map(b => {
            const l = piece.ports[b].link, dead = l && (l.piece.kind === 'end' || l.piece.kind === 'endround');
            const k = dead ? 0.02 : Roads.turnOf(piece, a, b) === 'straight' ? 3 : 2;
            tot += k; return k;
        });
        let r = Math.random() * tot;
        for (let i = 0; i < ex.length; i++) { r -= w[i]; if (r <= 0) return ex[i]; }
        return ex[ex.length - 1];
    },

    _extend(car) {
        const plan = car.plan;
        while (plan.length < this.PLAN_N) {
            const last = plan[plan.length - 1];
            const link = last.piece.ports[last.b].link;
            if (!link) return false;
            plan.push(this._seg(link.piece, link.port, this._chooseExit(link.piece, link.port)));
        }
        return true;
    },

    // --- Появление и снос ---------------------------------------------------------------------------

    _pickModel() {
        let tot = 0;
        for (const m of this.models) tot += m.w;
        if (tot <= 0) return -1;
        let r = Math.random() * tot;
        for (let i = 0; i < this.models.length; i++) { r -= this.models[i].w; if (r <= 0 && this.models[i].w > 0) return i; }
        return 0;
    },

    // Плитки в радиусе и кандидаты для появления: двухпортовые плитки (прямые, повороты, дуги).
    _scanCandidates(pl) {
        const cand = this._cand;
        cand.length = 0;
        let tiles = 0;
        const R2 = this.RADIUS * this.RADIUS, lo2 = this.SPAWN_MIN * this.SPAWN_MIN * 0.12;
        for (const p of Roads.pieces) {
            const dx = p.x - pl.x, dy = p.y - pl.y, d2 = pl.ok ? dx * dx + dy * dy : 0;
            if (d2 > R2) continue;
            tiles += p.cells.length;
            if (p.ports.length === 2 && p.kind !== 'end' && p.ports[0].link && p.ports[1].link && d2 > lo2) cand.push(p);
        }
        this._tilesNear = tiles;
    },

    _clearAt(x, y, len, pl) {
        for (const c of this.cars) {
            const R = (c.len + len) / 2 + 700;
            if ((c.x - x) * (c.x - x) + (c.y - y) * (c.y - y) < R * R) return false;
        }
        if (pl && pl.ok && (pl.x - x) * (pl.x - x) + (pl.y - y) * (pl.y - y) < 4500 * 4500) return false;
        return true;
    },

    // Новая машина на случайной двухпортовой плитке в кольце [minD, maxD] от игрока; вне конуса обзора.
    _trySpawn(pl, minD, maxD, avoidCone) {
        const cand = this._cand;
        if (!cand.length || !this.models.length) return false;
        for (let tries = 0; tries < 14; tries++) {
            const piece = cand[(Math.random() * cand.length) | 0];
            const a = Math.random() < 0.5 ? 0 : 1, b = 1 - a;
            const path = Roads.lanePath(piece, a, b);
            const s = path.len * (0.15 + Math.random() * 0.7);
            const o = Roads.pointOn(path, s, this._tmp);
            const dx = o.x - pl.x, dy = o.y - pl.y, d = Math.hypot(dx, dy);
            if (pl.ok && (d < minD || d > maxD)) continue;
            if (pl.ok && avoidCone && d < 22000 && dx * pl.cs + dy * pl.sn > 0.6 * d) continue;
            const mi = this._pickModel();
            if (mi < 0) return false;
            const m = this.models[mi];
            if (!this._clearAt(o.x, o.y, m.len, pl)) continue;
            this._make(piece, a, b, s, mi);
            return true;
        }
        return false;
    },

    _make(piece, a, b, s, mi) {
        const car = new TrafficCar(++this._carId);
        const m = this.models[mi];
        car.model = mi; car.len = m.len; car.wid = m.wid; car.hl = m.len / 2; car.hw = m.wid / 2;
        car.box.hx = car.hl; car.box.hy = car.hw;
        car.cruise = 11.1 + Math.random() * 4.2;
        car.plan.push(this._seg(piece, a, b));
        this._extend(car);
        car.s = s;
        const o = Roads.pointOn(car.plan[0].path, s, this._tmp);
        car.x = o.x; car.y = o.y;
        car.heading = Math.atan2(o.dy, o.dx);
        car.cs = Math.cos(car.heading); car.sn = Math.sin(car.heading);
        car.speed = car.cruise * 0.7;
        car.piece = piece;
        car.h = Roads.heightAt(car.x, car.y);
        car.mover.onHit = (impact, pc) => this._onHit(car, impact, pc);
        this._sync(car);
        this.cars.push(car);
        return car;
    },

    // Первое заполнение: машины в кольце [40 м, 260 м], конус обзора не важен (меню).
    _fill() {
        const pl = this._player();
        this._scanCandidates(pl);
        const want = this._want();
        for (let i = 0; i < want * 4 && this.cars.length < want; i++) this._trySpawn(pl, pl.ok ? 4000 : 0, this.SPAWN_MAX, false);
    },

    _want() {
        const cap = Math.ceil(this.max * Math.min(1.6, Math.max(1, this.density)));
        return Math.min(cap, Math.round(this._tilesNear * 0.5 * this.density));
    },

    _manage(dt, pl) {
        this._mgT -= dt;
        if (this._mgT > 0) return;
        this._mgT = 0.35;
        if (!pl.ok) return;
        const D2 = this.DESPAWN * this.DESPAWN;
        for (const c of this.cars.slice()) {
            const dx = c.x - pl.x, dy = c.y - pl.y, d2 = dx * dx + dy * dy;
            const seen = d2 < 20000 * 20000 && dx * pl.cs + dy * pl.sn > 0.5 * Math.sqrt(d2);
            if (d2 > D2 || (c.stuckT > 30 && !seen && d2 > 6000 * 6000)) this._remove(c);
        }
        this._candT -= 0.35;
        if (this._candT <= 0 || !this._cand.length) { this._candT = 2; this._scanCandidates(pl); }
        const want = this._want();
        if (this.cars.length < want) this._trySpawn(pl, this.SPAWN_MIN, this.SPAWN_MAX, true);
        else if (this.cars.length > want + 2) {
            // убавить плотность: самая дальняя невидимая машина
            let best = null, bd = 0;
            for (const c of this.cars) {
                const dx = c.x - pl.x, dy = c.y - pl.y, d = Math.hypot(dx, dy);
                if (d > bd && !(d < 20000 && dx * pl.cs + dy * pl.sn > 0.5 * d)) { bd = d; best = c; }
            }
            if (best && bd > 8000) this._remove(best);
        }
    },

    _remove(c) {
        this._releaseAll(c);
        c.dead = true;
        const i = this.cars.indexOf(c);
        if (i >= 0) this.cars.splice(i, 1);
    },

    // --- Заявки на перекрёстки ----------------------------------------------------------------------

    _claimFor(car, seg) {
        for (const c of car.claims) if (c.seg === seg) return c;
        /** @type {TrafficClaim} */
        const c = { car, seg, t: this.time };
        car.claims.push(c);
        let list = this._claims.get(seg.piece.id);
        if (!list) { list = []; this._claims.set(seg.piece.id, list); }
        list.push(c);
        return c;
    },

    _release(car, seg) {
        for (let i = car.claims.length - 1; i >= 0; i--) {
            const c = car.claims[i];
            if (c.seg !== seg) continue;
            car.claims.splice(i, 1);
            const list = this._claims.get(seg.piece.id);
            if (list) { const k = list.indexOf(c); if (k >= 0) list.splice(k, 1); }
        }
    },

    _releaseAll(car) {
        for (const c of car.claims.slice()) this._release(car, c.seg);
    },

    // Положение центра машины на сегменте seg: s ≥ 0 — внутри, иначе минус расстояние до въезда.
    _sOf(car, seg) {
        let d = 0;
        for (let i = 0; i < car.plan.length; i++) {
            if (car.plan[i] === seg) return i === 0 ? car.s : -d;
            d += i === 0 ? car.plan[0].len - car.s : car.plan[i].len;
        }
        return -1e9;
    },

    // Пересекутся ли полосы A и B в близкое время (с), при том что B проезжает по своему сегменту.
    _timeConflict(A, B, dA) {
        const ia = A.seg.inf, ib = B.seg.inf;
        const sB = this._sOf(B.car, B.seg);
        const uA = Math.max(A.car.speed, 4) * 100, uB = Math.max(B.car.speed, 3) * 100;
        const thr2 = 270 * 270, gap = this.TIME_GAP, from = sB - B.car.hl;
        for (let i = 0; i < ia.n; i++) {
            const tA = (dA + ia.ss[i]) / uA;
            for (let j = 0; j < ib.n; j++) {
                if (ib.ss[j] < from) continue;
                const dx = ia.xs[i] - ib.xs[j], dy = ia.ys[i] - ib.ys[j];
                if (dx * dx + dy * dy > thr2) continue;
                const tB = Math.max(0, ib.ss[j] - sB) / uB;
                if (Math.abs(tA - tB) < gap) return true;
            }
        }
        return false;
    },

    // Едущий игрок как «внутри перекрёстка»: прямая по вектору скорости.
    _playerConflict(A, dA, pl) {
        if (!pl.ok || pl.speed < 3) return false;
        const ia = A.seg.inf, ux = pl.vx / pl.speed, uy = pl.vy / pl.speed;
        const uA = Math.max(A.car.speed, 4) * 100, uP = pl.speed * 100, thr2 = 300 * 300;
        for (let i = 0; i < ia.n; i++) {
            const tA = (dA + ia.ss[i]) / uA;
            for (let s = 0; s <= 3500; s += 100) {
                const dx = ia.xs[i] - (pl.x + ux * s), dy = ia.ys[i] - (pl.y + uy * s);
                if (dx * dx + dy * dy > thr2) continue;
                if (Math.abs(tA - s / uP) < this.TIME_GAP) return true;
            }
        }
        return false;
    },

    // Можно ли ехать через перекрёсток: нет заявки с приоритетом и пересекающейся полосы.
    _rights(car, A, dA, pl) {
        const forced = car.force === A.seg.id;
        if (!forced && this._playerConflict(A, dA, pl)) return false;
        const list = this._claims.get(A.seg.piece.id);
        if (!list) return true;
        const rank = (/** @type {TrafficClaim} */ c) => (c.seg.turn === 'left' && c.seg.piece.kind !== 'round') ? 1 : 0;
        for (const B of list) {
            if (B.car === car || B.seg.a === A.seg.a) continue;
            const inside = B.car.plan[0] === B.seg || B.car.comm === B.seg.id || B.car.pass === B.seg.id;
            // Стоящий на красный не мешает: у него нет права въехать.
            // Ждёт места за перекрёстком или стоит в хвосте очереди — сам не поедет, права не занимает.
            if (!inside && B.car.speed < 1 && (B.car.blk === 6 || B.car.blk === 1)) continue;
            if (!inside && B.seg.piece.signal && Roads.signalFor(B.seg.piece, B.seg.piece.ports[B.seg.a].d) !== 'green') continue;
            if (forced && !inside && this._sOf(B.car, B.seg) < -1200) continue;   // таймаут снимает очередь заявок, но не тех, кто уже рядом
            const rb = rank(B), ra = rank(A);
            const beats = inside || rb < ra || (rb === ra && (B.t < A.t || (B.t === A.t && B.car.id < car.id)));
            if (beats && this._timeConflict(A, B, dA)) return false;
        }
        return true;
    },

    // --- Кадр ----------------------------------------------------------------------------------------

    update(dt) {
        if (!this.ready) return;
        dt = Math.min(dt, 0.05);
        if (!(dt > 0)) return;
        this.step(dt);
        this._render();
    },

    // Логика без отрисовки.
    step(dt) {
        this.time += dt;
        const pl = this._player();
        this._manage(dt, pl);
        const cars = this.cars;
        for (let i = 0; i < cars.length; i++) this._look(cars[i]);
        for (let i = 0; i < cars.length; i++) this._control(cars[i], dt, pl);
        for (let i = 0; i < cars.length; i++) this._move(cars[i], dt);
        for (let i = cars.length - 1; i >= 0; i--) if (cars[i].dead) this._remove(cars[i]);
    },

    // Точки впереди по плану: передний бампер + k метров.
    _look(car) {
        const plan = car.plan, step = this.LOOK_STEP, o = this._tmp;
        let si = 0, ss = car.s + car.hl, k = 0;
        while (k < this.LOOK_N && si < plan.length) {
            while (si < plan.length && ss > plan[si].len) { ss -= plan[si].len; si++; }
            if (si >= plan.length) break;
            Roads.pointOn(plan[si].path, ss, o);
            car.lx[k] = o.x; car.ly[k] = o.y; car.tx[k] = o.dx; car.ty[k] = o.dy;
            ss += step; k++;
        }
        car.nLook = k;
    },

    // Безопасная скорость у препятствия на зазоре gap (px) от переднего бампера: v ≤ −bτ + √(b²τ² + vl² + 2b·g).
    _cap(car, gap, vObs, margin, kind, who) {
        const g = (gap - margin) / 100;
        const bt = this.BRAKE * this.TAU;
        const v = -bt + Math.sqrt(bt * bt + vObs * vObs + 2 * this.BRAKE * (g > 0 ? g : 0));
        if (v < car.vSafe) { car.vSafe = v; car.blk = kind; car.blkCar = who || null; }
    },

    // Тело (машина, игрок) в коридоре полосы впереди.
    _scanBody(car, x, y, cs, sn, hl, hw, pvx, pvy, spd, player, who) {
        const N = car.nLook, step = this.LOOK_STEP, lat = hw + car.hw + (player ? 60 : 70);
        for (let k = 0; k < N; k++) {
            const du = car.lx[k] - x, dv = car.ly[k] - y;
            const u = du * cs + dv * sn, v = -du * sn + dv * cs;
            const rel = car.tx[k] * cs + car.ty[k] * sn;
            const ue = (rel > 0.8 || rel < -0.8) ? hl + 20 : hl + car.hw + 40;      // поперечный борт: учесть ширину своего кузова
            if (u > ue || u < -ue || v > lat || v < -lat) continue;
            let vObs = 0, depth = 0;
            if (spd < 1.2) { depth = rel > 0.35 ? u + hl : (rel < -0.35 ? hl - u : 0); }
            else if (rel > 0.35) { vObs = Math.max(0, pvx * car.tx[k] + pvy * car.ty[k]); depth = u + hl; }
            else if (rel < -0.35) { depth = hl - u; }
            else if (!player && k * step > 500) continue;          // поперечная движущаяся — только вплотную
            if (depth < 0) depth = 0; else if (depth > step) depth = step;
            const gap = k * step - depth;
            this._cap(car, gap, vObs, player ? 250 : 160, player ? 2 : 1, who);
            if (!player && vObs < 1.5 && gap < car.gapCar) { car.gapCar = gap; car.gapCarV = vObs; }
            return;
        }
    },

    _control(car, dt, pl) {
        const plan = car.plan, hl = car.hl, v = car.speed;
        car.vSafe = 1e9; car.vCurve = 1e9; car.blk = 0; car.blkCar = null; car.gapCar = 1e9; car.gapCarV = 0;
        // Лимит зоны.
        car.limT -= dt;
        if (car.limT <= 0) {
            car.limT = 0.6;
            car.limit = Math.max(5, Roads.speedLimitAt(car.x, car.y) / 3.6 * 0.95);
        }
        // Машины рядом.
        const cars = this.cars, R0 = this.LOOK_STEP * this.LOOK_N + 900;
        for (let i = 0; i < cars.length; i++) {
            const j = cars[i];
            if (j === car) continue;
            const dx = j.x - car.x, dy = j.y - car.y;
            if (dx * dx + dy * dy > R0 * R0) continue;
            if (car.ghostT > 0 && j.plan[0].junc) continue;          // выход из затора внутри перекрёстка
            this._scanBody(car, j.x, j.y, j.cs, j.sn, j.hl, j.hw, j.cs * j.speed, j.sn * j.speed, j.speed, false, j);
        }
        if (pl.ok) {
            const dx = pl.x - car.x, dy = pl.y - car.y;
            if (dx * dx + dy * dy < R0 * R0) this._scanBody(car, pl.x, pl.y, pl.cs, pl.sn, pl.hl, pl.hw, pl.vx, pl.vy, pl.speed, true);
        }
        // Пешеходы на проезжей части.
        if (typeof GamePeds !== 'undefined' && GamePeds.list && car.nLook) this._scanPeds(car);
        // Светофоры, перекрёстки, повороты по плану.
        let dEntry = plan[0].len - car.s;
        if (plan[0].inf.vc < car.cruise) car.vCurve = plan[0].inf.vc;
        for (let m = 1; m < plan.length; m++) {
            const seg = plan[m];
            const dFront = dEntry - hl;
            if (seg.inf.vc < car.cruise) {
                const vc = Math.sqrt(seg.inf.vc * seg.inf.vc + 2 * 3.5 * Math.max(0, dFront) / 100);
                if (vc < car.vCurve) car.vCurve = vc;
            }
            if (seg.junc && dFront < this.CLAIM_DIST) this._junction(car, seg, dFront, pl);
            dEntry += seg.len;
        }
        if (car.pass >= 0) {
            let seen = false;
            for (let m = 0; m < plan.length; m++) if (plan[m].id === car.pass) seen = true;
            if (!seen) car.pass = -1;
        }
        // Целевая скорость.
        let vt = Math.min(car.cruise, car.limit, car.vSafe, car.vCurve);
        if (car.hitT > 0) { car.hitT -= dt; vt = 0; }
        // Ожидание: право проезда, пробка, игрок.
        if (v < 0.4 && vt < 0.5) {
            car.stuckT += dt;
            if (car.blk === 5) { car.waitT += dt; if (car.waitT > this.WAIT_FORCE) car.force = car.waitSeg; }
            if (car.blk === 2) car.blockT += dt; else car.blockT = 0;
        } else { car.waitT = 0; car.blockT = 0; if (v > 1) car.stuckT = 0; }
        // Взаимная блокировка внутри перекрёстка: уступающий (больший id) на 3 с «проходит сквозь» застрявших.
        if (car.ghostT > 0) car.ghostT -= dt;
        else if (car.blk === 1 && car.blkCar && car.plan[0].junc && car.stuckT > 6 && car.blkCar.stuckT > 6 && car.id > car.blkCar.id) car.ghostT = 3;
        if (car.hornT > 0) car.hornT -= dt;
        if (car.blockT > 2.5 && car.hornT <= 0) { car.hornT = 3.5; this._horn(car); }
        // Разгон и торможение.
        let a;
        if (vt >= v) a = Math.min((vt - v) / dt, this.ACCEL * Math.max(0.25, 1 - (v / car.cruise) * (v / car.cruise)));
        else a = -Math.min((v - vt) / dt, (v - vt) > 1 ? this.EMERGENCY : this.BRAKE);
        car.acc += (a - car.acc) * Math.min(1, dt * 8);
        car.speed = Math.max(0, v + a * dt);
    },

    // Перекрёсток впереди: светофор, «коробка», право проезда.
    _junction(car, seg, dFront, pl) {
        const claim = this._claimFor(car, seg);
        if (dFront < 30) { car.comm = seg.id; return; }           // передок уже у края: проезжаем
        if (car.pass === seg.id) return;
        const gapLine = dFront - this.LINE_MARGIN, v = car.speed;
        const sig = seg.piece.signal ? Roads.signalFor(seg.piece, seg.piece.ports[seg.a].d) : null;
        if (sig === 'red' || sig === 'yellow') {
            // Жёлтый: не успеть без резкого торможения (5.5 м/с²) — проезжаем; красный: не успеть и аварийно (8 м/с²).
            if (v > 2.5 && gapLine / 100 < v * v / (2 * (sig === 'red' ? this.EMERGENCY : 5.5)) - 0.3) { car.pass = seg.id; return; }
            this._cap(car, gapLine, 0, 0, 4);
            return;
        }
        // Не вставать посреди перекрёстка, если за ним стоит хвост.
        if (car.gapCar < 1e8 && car.gapCarV < 1.5 && car.gapCar >= dFront - 50 && car.gapCar - (dFront + seg.len) < car.len + 100) {
            this._cap(car, gapLine, 0, 0, 6);
            return;
        }
        if (!this._rights(car, claim, dFront + car.hl, pl)) { this._cap(car, gapLine, 0, 0, 5); car.waitSeg = seg.id; }
    },

    // Пешеходы на дороге в коридоре полосы.
    _scanPeds(car) {
        const list = GamePeds.list, N = car.nLook, step = this.LOOK_STEP;
        const lat = car.hw + 70;
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (!p.crossing && !p.onRoad) continue;
            const dx = p.x - car.x, dy = p.y - car.y;
            if (dx * dx + dy * dy > 4300 * 4300) continue;
            const qx = p.x + (p.vx || 0) * 0.7, qy = p.y + (p.vy || 0) * 0.7;
            for (let k = 0; k < N; k++) {
                const d1 = Math.hypot(car.lx[k] - p.x, car.ly[k] - p.y), d2 = Math.hypot(car.lx[k] - qx, car.ly[k] - qy);
                if (d1 > lat && d2 > lat) continue;
                this._cap(car, k * step, 0, 180, 3);
                break;
            }
        }
    },

    _horn(car) {
        if (typeof Game !== 'undefined' && Game._event) Game._event({ type: 'trafficHorn', x: car.x, y: car.y });
    },

    // Удар игрока: стоять ~2 с, лёгкий толчок, гудок и событие.
    _onHit(car, impact, pc) {
        car.hitT = 2;
        car.speed = 0;
        if (pc) {
            const dx = car.x - pc.x, dy = car.y - pc.y, d = Math.hypot(dx, dy) || 1;
            const p = Math.min(2.5, 0.25 * impact + 0.2) * 100;
            car.ovx = dx / d * p; car.ovy = dy / d * p;
        }
        if (this.time - car.hitEv > 0.7 && impact > 0.3) {
            car.hitEv = this.time;
            car.pitch += 0.03;
            if (typeof Game !== 'undefined' && Game._event) {
                Game._event({ type: 'trafficHit', impact, x: car.x, y: car.y, car });
                this._horn(car);
            }
        }
    },

    // Движение по полосе, смена плитки, курс, коробка столкновений.
    _move(car, dt) {
        const plan = car.plan;
        car.s += car.speed * 100 * dt;
        while (car.s >= plan[0].len) {
            const seg = plan.shift();
            car.s -= seg.len;
            this._release(car, seg);
            if (!this._extend(car)) { car.dead = true; return; }
        }
        car.piece = plan[0].piece;
        const o = Roads.pointOn(plan[0].path, car.s, this._tmp);
        // Толчок: смещение от полосы, плавно возвращается.
        if (car.ovx || car.ovy || car.ox || car.oy) {
            const kv = Math.exp(-5 * dt), ko = car.hitT > 0 ? 1 : Math.exp(-1.2 * dt);
            car.ovx *= kv; car.ovy *= kv;
            if (Math.abs(car.ovx) + Math.abs(car.ovy) < 1) { car.ovx = 0; car.ovy = 0; }
            car.ox = (car.ox + car.ovx * dt) * ko; car.oy = (car.oy + car.ovy * dt) * ko;
            if (Math.abs(car.ox) + Math.abs(car.oy) < 0.5 && !car.ovx && !car.ovy) { car.ox = 0; car.oy = 0; }
        }
        car.x = o.x + car.ox; car.y = o.y + car.oy;
        const target = Math.atan2(o.dy, o.dx);
        let d = target - car.heading;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        const dh = d * Math.min(1, 1 - Math.exp(-dt * 14));
        car.heading += dh;
        car.yawRate += (dh / dt - car.yawRate) * Math.min(1, dt * 6);
        car.cs = Math.cos(car.heading); car.sn = Math.sin(car.heading);
        car.h = Roads.heightAt(car.x, car.y);
        const k = Math.min(1, dt * 8);
        car.pitch += (Math.max(-0.045, Math.min(0.045, -car.acc * 0.0065)) - car.pitch) * k;
        car.roll += (Math.max(-0.06, Math.min(0.06, car.yawRate * car.speed * 0.012)) - car.roll) * k;
        this._sync(car);
    },

    // Коробка столкновения и скорость для GameCar.dynamic.
    _sync(car) {
        const b = car.box;
        b.x = car.x; b.y = car.y; b.c = car.cs; b.s = car.sn; b.a = car.heading;
        car.mover.vx = car.cs * car.speed + car.ovx / 100;
        car.mover.vy = car.sn * car.speed + car.ovy / 100;
    },

    // --- Отрисовка ------------------------------------------------------------------------------------

    _render() {
        const models = this.models;
        for (const m of models) m.n = 0;
        for (const c of this.cars) {
            const m = models[c.model];
            if (!m || !m.buf || m.n * 16 + 16 > m.buf.length) continue;
            this._writeMat(m.buf, m.n * 16, c, m.scale);
            m.n++;
        }
        for (const m of models) {
            if (!m.gfx) continue;
            for (const p of m.gfx.parts) {
                p.thinInstanceCount = m.n;
                p.isVisible = m.n > 0;
                if (m.n > 0) { p.thinInstanceBufferUpdated('matrix'); p.thinInstanceRefreshBoundingInfo(false); }
            }
        }
    },

    // Матрица v·S·Rx(тангаж)·Rz(крен)·Ry(курс модели = π/2 − θ)·T (строки Babylon).
    _writeMat(buf, o, c, s) {
        const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), cr = Math.cos(c.roll), sr = Math.sin(c.roll);
        const cy = c.sn, sy = c.cs;                  // cos и sin угла π/2 − θ
        buf[o] = s * cr * cy;                  buf[o + 1] = s * sr;            buf[o + 2] = -s * cr * sy;           buf[o + 3] = 0;
        buf[o + 4] = s * (-cp * sr * cy + sp * sy); buf[o + 5] = s * cp * cr;  buf[o + 6] = s * (cp * sr * sy + sp * cy); buf[o + 7] = 0;
        buf[o + 8] = s * (sp * sr * cy + cp * sy);  buf[o + 9] = -s * sp * cr; buf[o + 10] = s * (-sp * sr * sy + cp * cy); buf[o + 11] = 0;
        buf[o + 12] = c.x; buf[o + 13] = c.h; buf[o + 14] = c.y; buf[o + 15] = 1;
    },
};
