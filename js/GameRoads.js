// GameRoads.js — дорожная сеть из плиток Kenney на карте (docs/DESIGN.md, «Сетка дорог»).
// Плитки — обычные объекты карты (assets/models/roads/<имя>.glb); по их модели и курсу строится
// сетка клеток T×T, порты, связи соседей, полосы движения (ломаные), поверхности (асфальт /
// тротуар / площадка / трава), светофоры и маршруты A*. Логика не спрашивает Babylon (инвариант 4).
//
// Направления: 0 E (+x), 1 S (+y), 2 W (−x), 3 N (−y). Поворот плитки на 90° переводит E→S→W→N.
// Правостороннее движение: правая сторона хода (dx, dy) — (−dy, dx). Полоса — 0.18 T от оси.

/** @satisfies {Record<string, any>} */
const Roads = {
    T: 1200,
    LANE: 216,            // смещение центра полосы от оси дороги
    ROAD_H: 12,           // высота асфальта плитки (px)
    WALK_H: 24,           // высота тротуара плитки
    LOT_H: 8,             // высота площадок (lot)
    DX: [1, 0, -1, 0],
    DY: [0, 1, 0, -1],

    // Плитки: size — клеток по стороне; ports — [ci, cj, dir] в локальных клетках при r = 0
    // (для 1×1 — просто список направлений); kind — форма поверхности и полос.
    PIECES: {
        'road-straight': { kind: 'straight', ports: [0, 2] },
        'road-crossing': { kind: 'straight', ports: [0, 2], zebra: true },
        'road-driveway-single': { kind: 'straight', ports: [0, 2], notch: 0.14 },
        'road-driveway-double': { kind: 'straight', ports: [0, 2], notch: 0.3 },
        'road-bridge': { kind: 'straight', ports: [1, 3] },
        'road-intersection': { kind: 'tee', ports: [0, 1, 2] },
        'road-intersection-line': { kind: 'tee', ports: [0, 1, 2] },
        'road-intersection-path': { kind: 'tee', ports: [0, 1, 2], signal: true },
        'road-crossroad': { kind: 'cross', ports: [0, 1, 2, 3] },
        'road-crossroad-line': { kind: 'cross', ports: [0, 1, 2, 3] },
        'road-crossroad-path': { kind: 'cross', ports: [0, 1, 2, 3], signal: true },
        'road-bend': { kind: 'bend', ports: [2, 1] },
        'road-bend-sidewalk': { kind: 'bend', ports: [2, 1] },
        'road-end': { kind: 'end', ports: [0] },
        'road-end-round': { kind: 'endround', ports: [0] },
        'road-curve': { kind: 'curve', size: 2, ports: [[0, 0, 2], [1, 1, 1]] },
        'road-roundabout': { kind: 'round', size: 3, ports: [[1, 0, 3], [2, 1, 0], [1, 2, 1], [0, 1, 2]] },
    },

    // Сигнал: зелёный, жёлтый, все красные (с) — на группу; две группы (E-W и N-S).
    SIG_GREEN: 13, SIG_YELLOW: 3, SIG_ALLRED: 1.5,

    /** @type {any[]} */ pieces: [],
    /** @type {Map<number, any>} */ cells: new Map(),
    /** @type {any[]} */ lots: [],
    /** @type {any[]} */ ramps: [],
    /** @type {any[]} */ zones: [],
    /** @type {any[]} */ signals: [],
    time: 0,
    location: null,
    W: 0, H: 0,

    key(i, j) { return j * 4096 + i; },

    // Повернуть вектор на r четвертей (E→S): (x, y) → (−y, x).
    rot(x, y, r) {
        for (let k = 0; k < (r & 3); k++) { const t = x; x = -y; y = t; }
        return { x, y };
    },

    // Сборка по карте: плитки, площадки, горки, зоны скорости. Зовётся после loadMap.
    build(location) {
        this.location = location;
        this.W = location.width; this.H = location.height;
        this.pieces = []; this.cells = new Map(); this.signals = [];
        const T = this.T;
        for (const def of location.map.objects) {
            if (!def.model || def.kind === 'marker') continue;
            const m = /models\/roads\/([a-z0-9-]+)\.glb$/i.exec(def.model);
            if (!m) continue;
            const spec = this.PIECES[m[1]];
            if (!spec) continue;
            const size = spec.size || 1;
            const r = ((Math.round(((def.rot && def.rot[1]) || 0) / 90) % 4) + 4) % 4;
            const piece = { id: this.pieces.length, name: m[1], spec, kind: spec.kind, size, x: def.x, y: def.y, r,
                cells: [], ports: [], links: [], paths: new Map(), signal: null };
            const half = (size - 1) / 2;
            const cellOf = (ci, cj) => {
                const o = this.rot(ci - half, cj - half, r);
                return { i: Math.floor((def.x + o.x * T) / T), j: Math.floor((def.y + o.y * T) / T) };
            };
            for (let cj = 0; cj < size; cj++) for (let ci = 0; ci < size; ci++) {
                const c = cellOf(ci, cj);
                piece.cells.push(c);
                this.cells.set(this.key(c.i, c.j), piece);
            }
            const ports = size === 1 ? spec.ports.map(d => [0, 0, d]) : spec.ports;
            for (const p of ports) {
                const c = cellOf(p[0], p[1]);
                piece.ports.push({ i: c.i, j: c.j, d: (p[2] + r) & 3, link: null });
            }
            this.pieces.push(piece);
        }
        // Связи портов с соседями.
        for (const piece of this.pieces) {
            for (const port of piece.ports) {
                const ni = port.i + this.DX[port.d], nj = port.j + this.DY[port.d];
                const other = this.cells.get(this.key(ni, nj));
                if (!other || other === piece) continue;
                const back = other.ports.findIndex(q => q.i === ni && q.j === nj && q.d === ((port.d + 2) & 3));
                if (back >= 0) port.link = { piece: other, port: back };
            }
        }
        // Светофоры.
        for (const piece of this.pieces) {
            if (!piece.spec.signal) continue;
            const c = piece.cells[0];
            const seed = (c.i * 73856093) ^ (c.j * 19349663);
            const cycle = 2 * (this.SIG_GREEN + this.SIG_YELLOW + this.SIG_ALLRED);
            piece.signal = { offset: Math.abs(seed % 1000) / 1000 * cycle, cycle };
            this.signals.push(piece);
        }
        // Площадки, горки, зоны скорости — маркеры.
        const rect = (d) => this.rect(d);
        this.lots = location.markers('lot').map(rect);
        this.ramps = location.markers('ramp').map(rect);
        this.zones = location.markers('zone30').map(d => Object.assign(rect(d), { limit: GAME_SPEED.zone30 }))
            .concat(location.markers('zone90').map(d => Object.assign(rect(d), { limit: GAME_SPEED.zone90 })));
        this._lotGrid = this._gridIndex(this.lots);
        this._rampGrid = this._gridIndex(this.ramps);
        return this;
    },

    // Прямоугольник маркера: центр, курс, полудлина вдоль (scale[0]·100) и полуширина поперёк (scale[2]·100).
    rect(d) {
        const a = ((d.rot && d.rot[1]) || 0) * Math.PI / 180;
        const s = d.scale || [1, 1, 1];
        return { x: d.x, y: d.y, c: Math.cos(a), s: Math.sin(a), a, hx: Math.abs(s[0]) * 100, hy: Math.abs(s[2]) * 100, h: d.h || 0, name: d.name, def: d };
    },

    // Индекс прямоугольников по клеткам T (быстрый поиск по точке).
    _gridIndex(list) {
        const g = new Map();
        for (const q of list) {
            const R = Math.hypot(q.hx, q.hy);
            for (let j = Math.floor((q.y - R) / this.T); j <= Math.floor((q.y + R) / this.T); j++)
                for (let i = Math.floor((q.x - R) / this.T); i <= Math.floor((q.x + R) / this.T); i++) {
                    const k = this.key(i, j);
                    if (!g.has(k)) g.set(k, []);
                    g.get(k).push(q);
                }
        }
        return g;
    },

    // Точка в прямоугольнике маркера -> локальные (u вдоль курса, v поперёк) или null.
    inRect(q, x, y, pad) {
        const dx = x - q.x, dy = y - q.y;
        const u = dx * q.c + dy * q.s, v = -dx * q.s + dy * q.c;
        const p = pad || 0;
        return Math.abs(u) <= q.hx + p && Math.abs(v) <= q.hy + p ? { u, v } : null;
    },

    pieceAt(x, y) { return this.cells.get(this.key(Math.floor(x / this.T), Math.floor(y / this.T))) || null; },

    // Локальные координаты точки в плитке (доли T от центра плитки, оси плитки при r = 0).
    local(piece, x, y) {
        const p = this.rot((x - piece.x) / this.T, (y - piece.y) / this.T, (4 - piece.r) & 3);
        return { u: p.x, v: p.y };
    },

    // Поверхность плитки в локальных координатах: 'road' | 'walk' | 'island'.
    pieceSurface(piece, u, v) {
        const a = Math.abs(u), b = Math.abs(v), H = 0.4;
        switch (piece.kind) {
            case 'straight': {
                if (piece.name === 'road-bridge') return a < H ? 'road' : 'walk';
                if (b < H) return 'road';
                if (piece.spec.notch && (v > 0 || piece.name === 'road-driveway-double') && a < piece.spec.notch) return 'road';
                return 'walk';
            }
            case 'tee': return (b < H || (a < H && v > 0)) ? 'road' : 'walk';
            case 'cross': return (a < H || b < H) ? 'road' : 'walk';
            case 'bend': { const r = Math.hypot(u + 0.5, v - 0.5); return r > 0.1 && r < 0.9 ? 'road' : 'walk'; }
            case 'end': return (b < H && u > -H) ? 'road' : 'walk';
            case 'endround': return ((u > 0 && b < H) || Math.hypot(u, v) < H) ? 'road' : 'walk';
            case 'curve': { const r = Math.hypot(u + 1, v - 1); return r > 1.1 && r < 1.9 ? 'road' : 'walk'; }
            case 'round': {
                const r = Math.hypot(u, v);
                if (r < 0.38) return 'island';
                return (r < 1.2 || a < H || b < H) ? 'road' : 'walk';
            }
        }
        return 'walk';
    },

    lotAt(x, y) {
        const list = this._lotGrid && this._lotGrid.get(this.key(Math.floor(x / this.T), Math.floor(y / this.T)));
        if (list) for (const q of list) if (this.inRect(q, x, y)) return q;
        return null;
    },

    // Поверхность в точке карты: 'road' | 'walk' | 'island' | 'lot' | 'ramp' | 'water' | 'grass'.
    surfaceAt(x, y) {
        const piece = this.pieceAt(x, y);
        if (piece) {
            const l = this.local(piece, x, y);
            const s = this.pieceSurface(piece, l.u, l.v);
            if (s !== 'walk') return s;
            if (this.lotAt(x, y)) return 'lot';
            return s;
        }
        if (this.rampAt(x, y)) return 'ramp';
        if (this.lotAt(x, y)) return 'lot';
        const loc = this.location;
        if (loc && loc.waterAt && loc.waterAt(x, y) !== null) return 'water';
        return 'grass';
    },

    rampAt(x, y) {
        const list = this._rampGrid && this._rampGrid.get(this.key(Math.floor(x / this.T), Math.floor(y / this.T)));
        if (list) for (const q of list) { const l = this.inRect(q, x, y); if (l) return { q, l }; }
        return null;
    },

    // Высота горки: подъём 40% длины, плато 20%, спуск 40%.
    rampHeight(q, u) {
        const L = q.hx, t = (u + L) / (2 * L);
        if (t < 0 || t > 1) return 0;
        if (t < 0.4) return q.h * t / 0.4;
        if (t < 0.6) return q.h;
        return q.h * (1 - t) / 0.4;
    },

    // Высота поверхности для физики (px над уровнем моря).
    heightAt(x, y) {
        const piece = this.pieceAt(x, y);
        if (piece) {
            const l = this.local(piece, x, y);
            const s = this.pieceSurface(piece, l.u, l.v);
            if (s === 'road') return this.ROAD_H;
            if (this.lotAt(x, y)) return this.LOT_H;
            return this.WALK_H;
        }
        const ramp = this.rampAt(x, y);
        if (ramp) return this.LOT_H + this.rampHeight(ramp.q, ramp.l.u);
        if (this.lotAt(x, y)) return this.LOT_H;
        const t = this.location && this.location.terrain;
        return t && t.fieldHeight ? t.fieldHeight(x, y) : 0;
    },

    // Ограничение скорости в точке (км/ч).
    speedLimitAt(x, y) {
        let lim = GAME_SPEED.city;
        for (const z of this.zones) if (this.inRect(z, x, y)) lim = z.limit === GAME_SPEED.zone30 ? Math.min(lim, z.limit) : (lim === GAME_SPEED.city ? z.limit : lim);
        return lim;
    },

    // --- Светофоры ----------------------------------------------------------------------

    // Цвет для въезда в перекрёсток через порт с направлением d (наружу): 'green' | 'yellow' | 'red' | null.
    signalFor(piece, d) {
        const s = piece && piece.signal;
        if (!s) return null;
        const t = ((this.time + s.offset) % s.cycle + s.cycle) % s.cycle;
        const G = this.SIG_GREEN, Y = this.SIG_YELLOW, R = this.SIG_ALLRED, half = G + Y + R;
        const group = (d & 1) ? 1 : 0;       // 0 — E/W, 1 — N/S
        const tt = group === 0 ? t : (t + half) % s.cycle;
        if (tt < G) return 'green';
        if (tt < G + Y) return 'yellow';
        return 'red';
    },

    update(dt) { this.time += dt; },

    // --- Полосы ----------------------------------------------------------------------------

    edgeMid(port) {
        const T = this.T;
        return { x: (port.i + 0.5) * T + this.DX[port.d] * T / 2, y: (port.j + 0.5) * T + this.DY[port.d] * T / 2 };
    },

    // Точка въезда через порт (едем внутрь плитки) и выезда через порт — на правой полосе.
    entryPoint(port) {
        const e = this.edgeMid(port), L = this.LANE;
        return { x: e.x + this.DY[port.d] * L, y: e.y - this.DX[port.d] * L };
    },
    exitPoint(port) {
        const e = this.edgeMid(port), L = this.LANE;
        return { x: e.x - this.DY[port.d] * L, y: e.y + this.DX[port.d] * L };
    },

    // Ломаная полосы внутри плитки от порта a до порта b (индексы в piece.ports). Кэш в piece.paths.
    lanePath(piece, a, b) {
        const k = a * 8 + b;
        let path = piece.paths.get(k);
        if (path) return path;
        const pa = piece.ports[a], pb = piece.ports[b];
        const p0 = this.entryPoint(pa), p3 = this.exitPoint(pb);
        const tin = { x: -this.DX[pa.d], y: -this.DY[pa.d] }, tout = { x: this.DX[pb.d], y: this.DY[pb.d] };
        let pts = [];
        if (piece.kind === 'round') {
            pts = this._roundPath(piece, p0, p3);
        } else if (piece.kind === 'curve') {
            const c = this.rot(-1, 1, piece.r);
            const cx = piece.x + c.x * this.T, cy = piece.y + c.y * this.T;
            pts = this._arc(cx, cy, p0, p3, null);
        } else if (a === b) {
            // Разворот в тупике.
            const d = this.T * 0.42;
            pts = this._bezier(p0, { x: p0.x + tin.x * d, y: p0.y + tin.y * d }, { x: p3.x - tout.x * d, y: p3.y - tout.y * d }, p3, 14);
        } else if (tin.x * tout.x + tin.y * tout.y > 0.9) {
            pts = [p0, p3];
        } else {
            // Поворот: квадратичная Безье с вершиной на пересечении осей полос.
            const den = tin.x * tout.y - tin.y * tout.x;
            const t = ((p3.x - p0.x) * tout.y - (p3.y - p0.y) * tout.x) / den;
            const ctl = { x: p0.x + tin.x * t, y: p0.y + tin.y * t };
            pts = this._bezier(p0, ctl, ctl, p3, 10);
        }
        path = this._measure(pts);
        piece.paths.set(k, path);
        return path;
    },

    _bezier(p0, p1, p2, p3, n) {
        const out = [];
        for (let i = 0; i <= n; i++) {
            const t = i / n, u = 1 - t;
            out.push({ x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
                       y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y });
        }
        return out;
    },

    // Дуга вокруг центра от p0 до p3 (кратчайший обход), радиус плавно меняется.
    _arc(cx, cy, p0, p3) {
        const a0 = Math.atan2(p0.y - cy, p0.x - cx), r0 = Math.hypot(p0.x - cx, p0.y - cy);
        let a1 = Math.atan2(p3.y - cy, p3.x - cx); const r1 = Math.hypot(p3.x - cx, p3.y - cy);
        let da = a1 - a0;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        const n = Math.max(4, Math.ceil(Math.abs(da) / 0.12));
        const out = [];
        for (let i = 0; i <= n; i++) {
            const t = i / n, a = a0 + da * t, r = r0 + (r1 - r0) * t;
            out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
        return out;
    },

    // Кольцо: въезд -> кольцо радиуса 0.8 T против часовой (на виде сверху угол убывает) -> выезд.
    _roundPath(piece, p0, p3) {
        const T = this.T, cx = piece.x, cy = piece.y, R = 0.8 * T;
        const ang = (p) => Math.atan2(p.y - cy, p.x - cx);
        const toRing = (p) => { const a = ang(p); return { a, x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R }; };
        const e0 = toRing(p0), e3 = toRing(p3);
        const a0 = e0.a - 0.18;
        let a1 = e3.a + 0.18;
        while (a1 > a0) a1 -= 2 * Math.PI;
        while (a0 - a1 > 2 * Math.PI) a1 += 2 * Math.PI;
        const out = [p0];
        const mid0 = { x: (p0.x + e0.x) / 2, y: (p0.y + e0.y) / 2 };
        out.push(mid0);
        const n = Math.max(4, Math.ceil((a0 - a1) / 0.14));
        for (let i = 0; i <= n; i++) {
            const a = a0 + (a1 - a0) * i / n;
            out.push({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R });
        }
        out.push({ x: (p3.x + e3.x) / 2, y: (p3.y + e3.y) / 2 });
        out.push(p3);
        return out;
    },

    _measure(pts) {
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
        return { pts, cum, len: cum[cum.length - 1] };
    },

    // Точка и направление на ломаной по расстоянию s.
    pointOn(path, s, out) {
        const o = out || { x: 0, y: 0, dx: 1, dy: 0 };
        const pts = path.pts, cum = path.cum;
        if (s <= 0) { s = 0; }
        if (s >= path.len) s = path.len;
        let i = 1;
        while (i < pts.length - 1 && cum[i] < s) i++;
        const seg = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / seg;
        const a = pts[i - 1], b = pts[i];
        o.x = a.x + (b.x - a.x) * t; o.y = a.y + (b.y - a.y) * t;
        o.dx = (b.x - a.x) / seg; o.dy = (b.y - a.y) / seg;
        return o;
    },

    // Варианты выезда из плитки при въезде через порт a (без разворота, кроме тупика).
    exits(piece, a) {
        const out = [];
        for (let b = 0; b < piece.ports.length; b++) if (b !== a && piece.ports[b].link) out.push(b);
        if (!out.length) out.push(a);
        return out;
    },

    // Манёвр: 'straight' | 'left' | 'right' | 'uturn' по направлениям портов.
    turnOf(piece, a, b) {
        if (a === b) return 'uturn';
        const din = (piece.ports[a].d + 2) & 3, dout = piece.ports[b].d;
        const diff = (dout - din + 4) & 3;
        return diff === 0 ? 'straight' : diff === 1 ? 'right' : diff === 3 ? 'left' : 'uturn';
    },

    // Номер съезда на кольце (1 — первый справа).
    roundExit(piece, a, b) {
        let n = 0, k = a;
        for (let i = 0; i < 4; i++) {
            // против часовой на виде сверху: E(0) -> N(3) -> W(2) -> S(1)
            const nextDir = (piece.ports[k].d + 3) & 3;
            k = piece.ports.findIndex(p => p.d === nextDir);
            n++;
            if (k === b) return n;
            if (k < 0) break;
        }
        return n;
    },

    // --- Маршруты ---------------------------------------------------------------------------

    // Состояние «въехал в плитку через порт» для машины в точке (x, y) с курсом heading.
    stateAt(x, y, heading) {
        let piece = this.pieceAt(x, y);
        if (!piece) {
            // Ближайшая плитка в радиусе 3 клеток.
            let best = null, bd = Infinity;
            const ci = Math.floor(x / this.T), cj = Math.floor(y / this.T);
            for (let j = cj - 3; j <= cj + 3; j++) for (let i = ci - 3; i <= ci + 3; i++) {
                const p = this.cells.get(this.key(i, j));
                if (!p) continue;
                const d = Math.hypot((i + 0.5) * this.T - x, (j + 0.5) * this.T - y);
                if (d < bd) { bd = d; best = p; }
            }
            piece = best;
            if (!piece) return null;
        }
        // Порт въезда — тот, что сзади по ходу.
        const hx = Math.cos(heading), hy = Math.sin(heading);
        let best = 0, bs = Infinity;
        piece.ports.forEach((p, k) => {
            const s = this.DX[p.d] * hx + this.DY[p.d] * hy;   // порт смотрит назад → s ≈ −1
            if (s < bs) { bs = s; best = k; }
        });
        return { piece, port: best };
    },

    // Состояние цели по маркеру у тротуара: плитка под маркером, въезд против его курса.
    targetState(marker) {
        const piece = this.pieceAt(marker.x, marker.y);
        if (!piece) return null;
        const a = ((marker.rot && marker.rot[1]) || 0) * Math.PI / 180;
        return this.stateAt(marker.x, marker.y, a);
    },

    // A* от состояния до плитки цели (въезд через нужный порт, если задан). -> [{ piece, a, b }] | null
    route(from, to) {
        if (!from || !to) return null;
        const key = (piece, a) => piece.id * 8 + a;
        const tx = to.piece.x, ty = to.piece.y;
        const open = [{ piece: from.piece, a: from.port, g: 0, f: 0, prev: null }];
        const best = new Map([[key(from.piece, from.port), 0]]);
        let guard = 0;
        while (open.length && guard++ < 20000) {
            let bi = 0;
            for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
            const cur = open.splice(bi, 1)[0];
            if (cur.piece === to.piece && (to.port === undefined || to.port === null || cur.a === to.port)) {
                const steps = [];
                for (let n = cur; n; n = n.prev) steps.unshift(n);
                return steps.map((n, i) => ({ piece: n.piece, a: n.a, b: i < steps.length - 1 ? steps[i + 1].fromPort : null }));
            }
            for (const b of this.exits(cur.piece, cur.a)) {
                const link = cur.piece.ports[b].link;
                if (!link) continue;
                const path = this.lanePath(cur.piece, cur.a, b);
                const g = cur.g + path.len + (b === cur.a ? 3000 : 0);
                const k = key(link.piece, link.port);
                if (best.has(k) && best.get(k) <= g) continue;
                best.set(k, g);
                const h = Math.hypot(link.piece.x - tx, link.piece.y - ty);
                open.push({ piece: link.piece, a: link.port, g, f: g + h, prev: cur, fromPort: b });
            }
        }
        return null;
    },

    // Маршрут -> ломаная для мини-карты и стрелок (последний шаг — до точки цели).
    routePolyline(steps, target) {
        const pts = [];
        for (const s of steps) {
            if (s.b === null || s.b === undefined) {
                // последняя плитка: от въезда к цели
                const e = this.entryPoint(s.piece.ports[s.a]);
                pts.push(e);
                if (target) pts.push({ x: target.x, y: target.y });
                break;
            }
            const p = this.lanePath(s.piece, s.a, s.b).pts;
            for (let i = pts.length ? 1 : 0; i < p.length; i++) pts.push(p[i]);
        }
        return this._measure(pts);
    },
};
