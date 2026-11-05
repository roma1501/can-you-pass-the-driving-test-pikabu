// GamePeds.js — пешеходы города: ходят по тротуарам плиток GameRoads, переходят дорогу на зебрах
// (плитки road-crossing и перекрёстки со светофором *-path), ждут красного для машин, отскакивают от
// быстрой машины игрока, при касании мягко отлетают и на секунду садятся (без крови и урона).
//
// Граф пешеходных дорожек строится один раз из плиток (Roads.surfaceAt — только логика, инвариант 4):
// узлы — углы клетки на расстоянии 0.45 T от центра (середина полосы тротуара, 0.4–0.5 T от оси дороги),
// рёбра — отрезки по тротуару («walk») и переходы через проезжую часть («cross», только на зебрах).
// Пешеход идёт от узла к узлу, на развилке выбирает ребро (чаще прямо), иногда стоит или машет рукой
// (чаще у магазинов `shop-*`).
//
// Вид: жёсткий риг персонажей person_a…h (папка people) с клипами people_clips (idle, walk,
// wave, sit); нет файлов — блочный человечек из боксов с качающимися ногами. Ригов в пуле max + 4,
// Rig.updateAll(dt) зовёт GamePeds.update (если это не делает игра: GamePeds.driveRig = false).

/** @typedef {{ id: number, x: number, y: number, edges: number[], shop: boolean }} PedNode */
/** @typedef {{ id: number, a: number, b: number, cross: boolean, piece: any, arm: number, len: number }} PedEdge */

/** @satisfies {Record<string, any>} */
const GamePeds = {
    max: (typeof IS_MOBILE !== 'undefined' && IS_MOBILE) ? 10 : 20,
    RADIUS: 15000, SPAWN_MIN: 4000, DESPAWN: 19000,
    SPEED_MIN: 1.1, SPEED_MAX: 1.6,
    NODE_INSET: 540, PED_R: 28,
    driveRig: true,
    PEOPLE: ['assets/models/people/person_a.glb', 'assets/models/people/person_b.glb', 'assets/models/people/person_c.glb', 'assets/models/people/person_d.glb',
        'assets/models/people/person_e.glb', 'assets/models/people/person_f.glb', 'assets/models/people/person_g.glb', 'assets/models/people/person_h.glb'],
    CLIPS: 'assets/models/people/people_clips.glb',

    /** @type {any[]} */ list: [],
    /** @type {{ nodes: PedNode[], edges: PedEdge[], grid: Map<number, number[]>, ok: boolean }} */
    graph: { nodes: [], edges: [], grid: new Map(), ok: false },
    /** @type {any} */ player: null,
    /** @type {any} */ app: null,
    /** @type {any[]} */ views: [],
    ready: false,
    time: 0,
    _id: 0, _mgT: 0,
    _pl: { x: 0, y: 0, vx: 0, vy: 0, speed: 0, hl: 220, hw: 90, cs: 1, sn: 0, ok: false },
    /** @type {Map<string, any>} */ _mats: new Map(),

    // --- Старт ------------------------------------------------------------------------------------

    // Граф и пустой список — без графики (тесты, init).
    initSim() {
        this.list = [];
        this.time = 0; this._mgT = 0;
        this.graph = this._build();
        this.ready = true;
    },

    async init(app) {
        this.app = app;
        this.initSim();
        await this._makeViews(app);
        this._fill();
    },

    async _makeViews(app) {
        const view = app.location.view, n = this.max + 4;
        /** @type {any[]} */ const models = [];
        let lib = null;
        if (typeof Rig !== 'undefined') {
            try {
                lib = await Rig.load(this.CLIPS);
                for (const k of this.PEOPLE) {
                    try { models.push(await Rig.load(k)); } catch (e) { /* нет варианта */ }
                }
            } catch (e) { lib = null; }
        }
        const useRig = !!lib && models.length > 0 && !!lib.nodes;
        if (!useRig) console.warn('GamePeds: модели людей не найдены — блочные пешеходы');
        for (let i = 0; i < n; i++) {
            let v = null;
            try {
                v = useRig ? this._rigView(models[i % models.length], lib, view, i) : this._blockView(view, i);
            } catch (e) { console.warn('GamePeds: вид пешехода', e); v = null; }
            if (v) { v.show(false); this.views.push(v); }
        }
    },

    _rigView(model, lib, view, i) {
        const rig = Rig.create(model, view, { name: 'ped', clips: [lib], kind: 'prop' });
        rig.root.setEnabled(false);
        const k = rig.height > 0 && (rig.height < 150 || rig.height > 200) ? 172 / rig.height : 1;
        const sc = k * (0.94 + (i % 4) * 0.035);
        rig.root.scaling.setAll(sc);
        let pose = '';
        return {
            used: false, blocky: false,
            show(on) { rig.root.setEnabled(on); },
            put(x, h, y, heading) { rig.root.position.set(x, h, y); rig.root.rotation.y = -heading; },
            pose(name, rate) {
                if (pose !== name) { pose = name; rig.play(rig.has(name) ? name : 'idle', { fade: 0.2 }); }
                rig.speed = rate;
            },
            dispose() { rig.dispose(); },
        };
    },

    _mat(hex) {
        let m = this._mats.get(hex);
        if (!m) { m = GameGfx.mat('ped-' + hex, hex); this._mats.set(hex, m); }
        return m;
    },

    // Блочный человечек: ноги и руки на шарнирах, качаются при ходьбе.
    _blockView(view, i) {
        const scene = view.scene, B = BABYLON;
        const shirts = ['#e4572e', '#2e86ab', '#f6c445', '#6a994e', '#9b5de5', '#f28482', '#ffffff', '#3d405b'];
        const pants = ['#264653', '#3a3a52', '#6b4f3a', '#1d3557'];
        const skins = ['#f1c9a5', '#d9a273', '#8d5a3b', '#f7d7bd'];
        const root = new B.Mesh('ped-block', scene);
        const box = (name, w, h, d, hex, parent, x, y, z) => {
            const m = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
            m.material = this._mat(hex);
            m.parent = parent; m.position.set(x, y, z);
            return m;
        };
        const hip = (z) => { const n = new B.TransformNode('hip', scene); n.parent = root; n.position.set(0, 82, z); return n; };
        const sho = (z) => { const n = new B.TransformNode('sho', scene); n.parent = root; n.position.set(0, 140, z); return n; };
        const legL = hip(-11), legR = hip(11), armL = sho(-27), armR = sho(27);
        box('legL', 16, 82, 16, pants[i % pants.length], legL, 0, -41, 0);
        box('legR', 16, 82, 16, pants[i % pants.length], legR, 0, -41, 0);
        box('torso', 22, 60, 40, shirts[i % shirts.length], root, 0, 112, 0);
        box('armL', 12, 56, 12, shirts[i % shirts.length], armL, 0, -26, 0);
        box('armR', 12, 56, 12, shirts[i % shirts.length], armR, 0, -26, 0);
        box('head', 28, 28, 28, skins[i % skins.length], root, 0, 158, 0);
        World3D.addObject(view, root, 'prop', { ink: false, outline: false });
        root.setEnabled(false);
        let phase = i * 1.7, name = '';
        return {
            used: false, blocky: true,
            show(on) { root.setEnabled(on); },
            put(x, h, y, heading) { root.position.set(x, h, y); root.rotation.y = -heading; },
            pose(n, rate) {
                name = n;
                if (n === 'walk') phase += rate * 0.28 * 6.5;
                const sw = n === 'walk' ? Math.sin(phase) * 0.6 : 0;
                legL.rotation.z = sw; legR.rotation.z = -sw; armL.rotation.z = -sw * 0.8; armR.rotation.z = sw * 0.8;
                root.scaling.y = n === 'sit' ? 0.62 : 1;
                if (n === 'wave') armR.rotation.z = 2.6 + Math.sin(phase += 0.25) * 0.4;
            },
            dispose() { root.dispose(); },
        };
    },

    // --- Граф дорожек ---------------------------------------------------------------------------------

    // Можно ли стоять в точке: тротуар, площадка, вырез подъездной дорожки.
    _walkable(x, y) {
        const s = Roads.surfaceAt(x, y);
        if (s === 'walk' || s === 'lot') return true;
        if (s !== 'road') return false;
        const p = Roads.pieceAt(x, y);
        if (!p || !p.spec.notch) return false;
        const l = Roads.local(p, x, y);
        return Math.abs(l.v) >= 0.4;
    },

    // Отрезок: 'walk' — весь по тротуару (три параллельные линии ±25 px), 'cross' — концы на тротуаре, середина на дороге, '' — нельзя.
    _edgeKind(ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
        const n = Math.max(2, Math.ceil(len / 100));
        const nx = -dy / len, ny = dx / len;
        let allWalk = true;
        for (const off of [0, -25, 25]) {
            for (let i = 0; i <= n; i++) {
                const t = i / n;
                if (!this._walkable(ax + dx * t + nx * off, ay + dy * t + ny * off)) { allWalk = false; break; }
            }
            if (!allWalk) break;
        }
        if (allWalk) return 'walk';
        if (!this._walkable(ax, ay) || !this._walkable(bx, by)) return '';
        let road = 0;
        for (let i = 1; i < n; i++) {
            const t = i / n, s = Roads.surfaceAt(ax + dx * t, ay + dy * t);
            if (s === 'road') road++;
            else if (!this._walkable(ax + dx * t, ay + dy * t)) return '';
        }
        return road > 0 ? 'cross' : '';
    },

    _build() {
        const T = Roads.T, I = this.NODE_INSET;
        /** @type {PedNode[]} */ const nodes = [];
        /** @type {PedEdge[]} */ const edges = [];
        /** @type {Map<string, number>} */ const keys = new Map();
        const node = (x, y) => {
            x = Math.round(x); y = Math.round(y);
            const k = x + ',' + y;
            let id = keys.get(k);
            if (id === undefined) {
                if (!this._walkable(x, y)) return -1;
                id = nodes.length;
                nodes.push({ id, x, y, edges: [], shop: false });
                keys.set(k, id);
            }
            return id;
        };
        const link = (n1, n2, allowCross, piece) => {
            if (n1 < 0 || n2 < 0 || n1 === n2) return;
            const A = nodes[n1], B = nodes[n2];
            for (const ei of A.edges) { const e = edges[ei]; if ((e.a === n1 && e.b === n2) || (e.a === n2 && e.b === n1)) return; }
            const kind = this._edgeKind(A.x, A.y, B.x, B.y);
            if (!kind || (kind === 'cross' && !allowCross)) return;
            let arm = -1;
            if (kind === 'cross') {
                const mx = (A.x + B.x) / 2 - piece.x, my = (A.y + B.y) / 2 - piece.y;
                arm = Math.abs(mx) > Math.abs(my) ? (mx > 0 ? 0 : 2) : (my > 0 ? 1 : 3);
            }
            const e = { id: edges.length, a: n1, b: n2, cross: kind === 'cross', piece, arm, len: Math.hypot(B.x - A.x, B.y - A.y) };
            edges.push(e);
            A.edges.push(e.id); B.edges.push(e.id);
        };
        const cellPiece = (i, j) => Roads.cells.get(Roads.key(i, j)) || null;
        for (const piece of Roads.pieces) {
            const zebra = piece.kind === 'straight' && piece.spec.zebra;
            const sig = !!piece.signal;
            for (const c of piece.cells) {
                const cx = (c.i + 0.5) * T, cy = (c.j + 0.5) * T;
                const nw = node(cx - I, cy - I), ne = node(cx + I, cy - I), sw = node(cx - I, cy + I), se = node(cx + I, cy + I);
                if (zebra) {
                    const ax = Roads.DX[piece.ports[0].d], ay = Roads.DY[piece.ports[0].d];     // ось дороги
                    const px = -ay, py = ax;
                    const m1 = node(cx + px * I, cy + py * I), m2 = node(cx - px * I, cy - py * I);
                    // углы каждой стороны соединяем через середину (зебра по центру плитки)
                    for (const [n1, n2] of [[nw, ne], [sw, se]]) {
                        if (n1 < 0 || n2 < 0) continue;
                        const mid = (px * (nodes[n1].x - cx) + py * (nodes[n1].y - cy) > 0) ? m1 : m2;
                        link(n1, mid, false, piece); link(mid, n2, false, piece);
                    }
                    link(m1, m2, true, piece);
                } else {
                    link(nw, ne, sig, piece); link(sw, se, sig, piece);
                    link(nw, sw, sig, piece); link(ne, se, sig, piece);
                }
                // соседние клетки: тротуар продолжается
                const east = cellPiece(c.i + 1, c.j), south = cellPiece(c.i, c.j + 1);
                if (east) { link(ne, node(cx + T - I, cy - I), false, piece); link(se, node(cx + T - I, cy + I), false, piece); }
                if (south) { link(sw, node(cx - I, cy + T - I), false, piece); link(se, node(cx + I, cy + T - I), false, piece); }
            }
        }
        // Сетка узлов (клетка T) и узлы у магазинов.
        /** @type {Map<number, number[]>} */ const grid = new Map();
        for (const n of nodes) {
            const k = Roads.key(Math.floor(n.x / T), Math.floor(n.y / T));
            let l = grid.get(k);
            if (!l) { l = []; grid.set(k, l); }
            l.push(n.id);
        }
        const g = { nodes, edges, grid, ok: nodes.length > 0 };
        const loc = Roads.location;
        if (loc && loc.markers) {
            for (const name of ['shop-pizza', 'shop-post', 'shop-bakery', 'shop-flowers', 'shop-cafe', 'shop-market']) {
                for (const d of loc.markers(name)) { const n = this._nearest(g, d.x, d.y, 900); if (n >= 0) nodes[n].shop = true; }
            }
        }
        return g;
    },

    // Ближайший узел в радиусе r (px) или −1.
    _nearest(g, x, y, r) {
        const T = Roads.T, ci = Math.floor(x / T), cj = Math.floor(y / T), reach = Math.ceil(r / T);
        let best = -1, bd = r * r;
        for (let j = cj - reach; j <= cj + reach; j++) for (let i = ci - reach; i <= ci + reach; i++) {
            const l = g.grid.get(Roads.key(i, j));
            if (!l) continue;
            for (const id of l) {
                const n = g.nodes[id], d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
                if (d < bd) { bd = d; best = id; }
            }
        }
        return best;
    },

    // --- Игрок ------------------------------------------------------------------------------------

    _player() {
        const pl = this._pl;
        const src = this.player || (typeof Game !== 'undefined' ? Game.car : null);
        if (!src) { pl.ok = false; return pl; }
        pl.ok = true;
        pl.x = src.x; pl.y = src.y; pl.vx = src.vx || 0; pl.vy = src.vy || 0;
        pl.speed = Math.hypot(pl.vx, pl.vy);
        const hd = src.heading || 0;
        pl.cs = Math.cos(hd); pl.sn = Math.sin(hd);
        pl.hl = src.P ? src.P.hl * 100 : 220; pl.hw = src.P ? src.P.hw * 100 : 90;
        return pl;
    },

    // Круг (cx, cy, r) против прямоугольника машины игрока -> { nx, ny (от машины к кругу), depth } | null.
    _circleHit(pl, cx, cy, r) {
        const dx = cx - pl.x, dy = cy - pl.y;
        const lu = dx * pl.cs + dy * pl.sn, lv = -dx * pl.sn + dy * pl.cs;
        const qu = Math.max(-pl.hl, Math.min(pl.hl, lu)), qv = Math.max(-pl.hw, Math.min(pl.hw, lv));
        let nu = lu - qu, nv = lv - qv;
        const dist = Math.hypot(nu, nv);
        let depth;
        if (dist < 1e-6) {
            const pu = pl.hl - Math.abs(lu), pv = pl.hw - Math.abs(lv);
            if (pu < pv) { nu = Math.sign(lu) || 1; nv = 0; depth = pu + r; } else { nu = 0; nv = Math.sign(lv) || 1; depth = pv + r; }
        } else {
            if (dist >= r) return null;
            depth = r - dist; nu /= dist; nv /= dist;
        }
        return { nx: nu * pl.cs - nv * pl.sn, ny: nu * pl.sn + nv * pl.cs, depth };
    },

    // --- Появление ------------------------------------------------------------------------------------

    _rnd(a, b) { return a + Math.random() * (b - a); },

    _newPed(x, y) {
        const p = {
            id: ++this._id, x, y, h: Roads.heightAt(x, y), heading: Math.random() * 6.28,
            vx: 0, vy: 0, speed: this._rnd(this.SPEED_MIN, this.SPEED_MAX),
            node: -1, prev: -1, next: -1, edge: null, state: 'walk', t: 0,
            tx: x, ty: y, jx: this._rnd(-22, 22), jy: this._rnd(-22, 22),
            crossing: false, onRoad: false, piece: Roads.pieceAt(x, y), ghost: false, hitT: 0, special: false,
            roadT: 0, waitT: 0, kx: 0, ky: 0, pose: '', view: null, getTarget: null, onArrive: null, life: 0,
        };
        this.list.push(p);
        this._attach(p);
        return p;
    },

    _attach(p) {
        for (const v of this.views) if (!v.used) { v.used = true; p.view = v; return; }
        // пул кончился: забираем вид у самого дальнего обычного пешехода
        const pl = this._pl;
        let far = null, fd = 0;
        for (const q of this.list) {
            if (q === p || !q.view || q.special) continue;
            const d = (q.x - pl.x) * (q.x - pl.x) + (q.y - pl.y) * (q.y - pl.y);
            if (d > fd) { fd = d; far = q; }
        }
        if (far && !p.special) return;
        if (far) { p.view = far.view; far.view = null; this._remove(far, true); }
    },

    _remove(p, keepView) {
        const i = this.list.indexOf(p);
        if (i >= 0) this.list.splice(i, 1);
        if (p.view && !keepView) { p.view.show(false); p.view.used = false; }
        p.view = null;
    },

    // Поставить пешехода на узел и выбрать первое ребро.
    _place(p, nodeId) {
        const n = this.graph.nodes[nodeId];
        p.x = n.x; p.y = n.y; p.node = nodeId; p.prev = -1; p.edge = null; p.state = 'walk';
        this._choose(p);
    },

    _spawnNear(pl, minD, maxD, avoidCone) {
        const g = this.graph;
        if (!g.ok) return false;
        for (let tries = 0; tries < 12; tries++) {
            const ang = Math.random() * 6.2832, r = this._rnd(minD, maxD);
            const x = pl.x + Math.cos(ang) * r, y = pl.y + Math.sin(ang) * r;
            const id = this._nearest(g, x, y, 900);
            if (id < 0) continue;
            const n = g.nodes[id], dx = n.x - pl.x, dy = n.y - pl.y, d = Math.hypot(dx, dy);
            if (pl.ok && avoidCone && d < 10000 && dx * pl.cs + dy * pl.sn > 0.55 * d) continue;
            let near = false;
            for (const q of this.list) if ((q.x - n.x) * (q.x - n.x) + (q.y - n.y) * (q.y - n.y) < 90 * 90) { near = true; break; }
            if (near) continue;
            const p = this._newPed(n.x, n.y);
            this._place(p, id);
            return true;
        }
        return false;
    },

    _fill() {
        const pl = this._player();
        let n = 0;
        while (this.list.length < this.max && n++ < this.max * 4) this._spawnNear(pl.ok ? pl : { x: Roads.W / 2, y: Roads.H / 2, ok: false, cs: 1, sn: 0 }, pl.ok ? 2500 : 0, this.RADIUS, false);
    },

    // Пешеход появляется у двери машины и уходит на ближайший тротуар, затем становится обычным.
    spawnLeaving(x, y, heading) {
        const p = this._newPed(x, y);
        p.special = true; p.ghost = true; p.life = 0;
        p.heading = heading;
        const id = this.graph.ok ? this._nearest(this.graph, x + Math.cos(heading) * 200, y + Math.sin(heading) * 200, 2500) : -1;
        if (id >= 0) {
            const n = this.graph.nodes[id];
            p.state = 'goto'; p.next = id; p.tx = n.x; p.ty = n.y;
        } else {
            p.state = 'goto'; p.next = -1; p.tx = x + Math.cos(heading) * 500; p.ty = y + Math.sin(heading) * 500;
        }
        p.cancel = () => { this._remove(p, false); };
        return p;
    },

    // Пассажир идёт к движущейся точке (дверь машины), исчезает и зовёт onArrive(true); по таймауту — onArrive(false).
    spawnPassenger(x, y, getTarget, onArrive) {
        const p = this._newPed(x, y);
        p.special = true; p.ghost = true; p.state = 'pass'; p.getTarget = getTarget; p.onArrive = onArrive;
        p.speed = 1.7;
        p.cancel = () => { p.onArrive = null; this._remove(p, false); };
        return p;
    },

    reset() {
        for (const p of this.list.slice()) this._remove(p, false);
        this.list.length = 0;
        this._mgT = 0;
    },

    // Кто-то идёт по зебре этой плитки.
    crossingAt(piece) {
        for (const p of this.list) if (p.crossing && p.edge && p.edge.piece === piece) return true;
        return false;
    },

    // --- Кадр -------------------------------------------------------------------------------------------

    update(dt) {
        if (!this.ready) return;
        dt = Math.min(dt, 0.05);
        if (!(dt > 0)) return;
        this.step(dt);
        this._render(dt);
        if (this.driveRig && typeof Rig !== 'undefined' && this.views.length) Rig.updateAll(dt);
    },

    // Логика без отрисовки.
    step(dt) {
        this.time += dt;
        const pl = this._player();
        this._manage(dt, pl);
        const list = this.list;
        for (let i = list.length - 1; i >= 0; i--) {
            const p = list[i];
            this._think(p, dt, pl);
        }
    },

    _manage(dt, pl) {
        this._mgT -= dt;
        if (this._mgT > 0) return;
        this._mgT = 0.5;
        if (!pl.ok) return;
        const D2 = this.DESPAWN * this.DESPAWN;
        for (const p of this.list.slice()) {
            if (p.special) continue;
            const dx = p.x - pl.x, dy = p.y - pl.y;
            if (dx * dx + dy * dy > D2) this._remove(p, false);
        }
        let normal = 0;
        for (const p of this.list) if (!p.special) normal++;
        if (normal < this.max) this._spawnNear(pl, this.SPAWN_MIN + 2000, this.RADIUS, true);
    },

    // Выбрать следующее ребро на узле p.node.
    _choose(p) {
        const g = this.graph, n = g.nodes[p.node];
        if (!n || !n.edges.length) { p.state = 'idle'; p.t = 3; return; }
        let tot = 0;
        const opts = [];
        for (const ei of n.edges) {
            const e = g.edges[ei];
            const to = e.a === p.node ? e.b : e.a;
            const B = g.nodes[to];
            let w = 1;
            if (to === p.prev) w = n.edges.length === 1 ? 1 : 0.05;
            else {
                const dx = B.x - n.x, dy = B.y - n.y, l = Math.hypot(dx, dy) || 1;
                if (dx / l * Math.cos(p.heading) + dy / l * Math.sin(p.heading) > 0.7) w = 2.2;
            }
            if (e.cross) w *= 0.3;
            opts.push({ e, to, w });
            tot += w;
        }
        let r = Math.random() * tot, pick = opts[opts.length - 1];
        for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
        p.edge = pick.e; p.next = pick.to; p.waitT = 0;
        const B = g.nodes[pick.to];
        if (pick.e.cross) { p.state = 'wait'; p.tx = B.x; p.ty = B.y; }
        else { p.state = 'walk'; p.tx = B.x + p.jx; p.ty = B.y + p.jy; }
    },

    // Безопасно ли выходить на переход: светофор (красный для машин этой дороги) или нет машин вблизи.
    _canCross(e, pl) {
        if (e.piece.signal && e.arm >= 0 && e.piece.ports.some((q) => q.d === e.arm)) {
            if (Roads.signalFor(e.piece, e.arm) !== 'red') return false;
        }
        const A = this.graph.nodes[e.a], B = this.graph.nodes[e.b];
        const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
        if (this._carNear(mx, my, 1)) return false;
        if (pl.ok && this._bodyNear(mx, my, pl.x, pl.y, pl.cs, pl.sn, pl.speed)) return false;
        return true;
    },

    _bodyNear(mx, my, x, y, cs, sn, speed) {
        const dx = mx - x, dy = my - y, d = Math.hypot(dx, dy);
        if (d > 4200) return false;
        if (speed < 0.5) return d < 300;
        const along = dx * cs + dy * sn, lat = Math.abs(-dx * sn + dy * cs);
        if (along < -250 || lat > 450) return d < 350;
        return Math.max(0, along) / (speed * 100) < 3.5 || d < 350;
    },

    _carNear(mx, my) {
        if (typeof GameTraffic === 'undefined' || !GameTraffic.cars) return false;
        for (const c of GameTraffic.cars) if (this._bodyNear(mx, my, c.x, c.y, c.cs, c.sn, c.speed)) return true;
        return false;
    },

    // Один шаг к точке; true — дошёл.
    _go(p, tx, ty, v, dt) {
        const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
        const step = v * 100 * dt;
        if (d <= Math.max(step, 12)) { p.vx = p.vy = 0; if (d > 1) { p.x = tx; p.y = ty; } return true; }
        const ux = dx / d, uy = dy / d;
        p.x += ux * step; p.y += uy * step;
        p.vx = ux * v * 100; p.vy = uy * v * 100;
        let da = Math.atan2(dy, dx) - p.heading;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        const lim = 9 * dt;
        p.heading += Math.max(-lim, Math.min(lim, da));
        return false;
    },

    _think(p, dt, pl) {
        p.life += dt;
        p.roadT -= dt;
        if (p.roadT <= 0) {
            p.roadT = 0.2;
            p.piece = Roads.pieceAt(p.x, p.y);
            p.onRoad = Roads.surfaceAt(p.x, p.y) === 'road';
        }
        const g = this.graph;
        switch (p.state) {
            case 'walk': {
                if (this._go(p, p.tx, p.ty, p.edge && p.edge.cross ? 1.5 : p.speed, dt)) this._arrive(p);
                break;
            }
            case 'wait': {
                p.vx = p.vy = 0;
                p.waitT += dt;
                if (p.waitT > 0.3 && Math.floor(p.waitT * 3.3) !== Math.floor((p.waitT - dt) * 3.3)) {
                    if (this._canCross(p.edge, pl)) { p.state = 'walk'; p.crossing = true; }
                    else if (p.waitT > 22) this._retreat(p);
                }
                break;
            }
            case 'idle': case 'wave': {
                p.vx = p.vy = 0;
                p.t -= dt;
                if (p.t <= 0) this._choose(p);
                break;
            }
            case 'goto': {
                if (this._go(p, p.tx, p.ty, 1.5, dt)) {
                    p.ghost = false; p.special = false;
                    if (p.next >= 0) this._place(p, p.next); else this._remove(p, false);
                }
                break;
            }
            case 'pass': {
                const t = p.getTarget ? p.getTarget() : null;
                if (!t) { this._finishPass(p, false); return; }
                if (this._go(p, t.x, t.y, p.speed, dt) || Math.hypot(t.x - p.x, t.y - p.y) < 45) { this._finishPass(p, true); return; }
                if (p.life > 40) this._finishPass(p, false);
                break;
            }
            case 'dodge': {
                p.x += p.kx * dt; p.y += p.ky * dt;
                p.vx = p.kx; p.vy = p.ky;
                p.t -= dt;
                if (p.t <= 0) { p.state = 'walk'; p.kx = p.ky = 0; }
                break;
            }
            case 'hit': {
                p.x += p.kx * dt; p.y += p.ky * dt;
                const k = Math.exp(-4 * dt);
                p.kx *= k; p.ky *= k;
                p.vx = p.vy = 0;
                p.hitT -= dt;
                if (p.hitT <= 0) { p.state = 'walk'; p.kx = p.ky = 0; if (!p.edge) this._choose(p); }
                break;
            }
        }
        p.crossing = !!(p.edge && p.edge.cross && (p.state === 'walk' || p.state === 'dodge' || p.state === 'hit') && p.crossing);
        if (!p.ghost && pl.ok) this._avoid(p, pl);
    },

    // Не дождались: вернуться от перехода — выбрать другое ребро.
    _retreat(p) {
        p.state = 'walk';
        const n = this.graph.nodes[p.node];
        const alt = n.edges.map(ei => this.graph.edges[ei]).filter(e => !e.cross);
        if (!alt.length) { p.state = 'idle'; p.t = 4; p.edge = null; return; }
        const e = alt[(Math.random() * alt.length) | 0];
        p.edge = e; p.next = e.a === p.node ? e.b : e.a;
        const B = this.graph.nodes[p.next];
        p.tx = B.x + p.jx; p.ty = B.y + p.jy;
    },

    _finishPass(p, ok) {
        const cb = p.onArrive;
        this._remove(p, false);
        p.onArrive = null;
        if (cb) { try { cb(ok); } catch (e) { console.error('GamePeds: onArrive', e); } }
    },

    // Дошёл до узла: решить, что дальше.
    _arrive(p) {
        p.crossing = false;
        p.prev = p.node; p.node = p.next;
        const n = this.graph.nodes[p.node];
        const r = Math.random();
        if (r < (n.shop ? 0.4 : 0.03)) {
            const wave = Math.random() < (n.shop ? 0.35 : 0.2);
            p.state = wave ? 'wave' : 'idle'; p.t = this._rnd(3, 9); p.edge = null;
            return;
        }
        this._choose(p);
    },

    // Скорая машина игрока: отскок в сторону или мягкий толчок при касании.
    _avoid(p, pl) {
        const dx = p.x - pl.x, dy = p.y - pl.y;
        if (dx * dx + dy * dy > 900 * 900) return;
        const hit = this._circleHit(pl, p.x, p.y, this.PED_R);
        if (hit) {
            if (p.hitT <= 0) {
                if (typeof Game !== 'undefined' && Game._event) Game._event({ type: 'pedHit', impact: pl.speed, x: p.x, y: p.y });
            }
            p.hitT = 2.6; p.state = 'hit';
            const push = Math.min(4.5, 1.2 + pl.speed * 0.5) * 100;
            p.x += hit.nx * hit.depth;  p.y += hit.ny * hit.depth;
            p.kx = hit.nx * push; p.ky = hit.ny * push;
            return;
        }
        if (pl.speed > 3 && p.state !== 'hit' && p.state !== 'dodge') {
            const along = dx * pl.cs + dy * pl.sn, lat = -dx * pl.sn + dy * pl.cs;
            if (along > 0 && along < pl.speed * 100 * 1.3 + 150 && Math.abs(lat) < pl.hw + 130) {
                const s = lat >= 0 ? 1 : -1;
                p.kx = -pl.sn * s * 450; p.ky = pl.cs * s * 450; p.t = 0.35; p.state = 'dodge';
            }
        }
    },

    // --- Отрисовка ----------------------------------------------------------------------------------------

    _render(dt) {
        for (const p of this.list) {
            const v = p.view;
            if (!v) continue;
            const th = Roads.heightAt(p.x, p.y);
            p.h += Math.max(-150 * dt, Math.min(150 * dt, th - p.h));
            v.show(true);
            let pose = 'idle', rate = 1;
            switch (p.state) {
                case 'walk': case 'goto': case 'pass': case 'dodge': pose = 'walk'; rate = (Math.hypot(p.vx, p.vy) / 100) / 1.4; break;
                case 'wave': pose = 'wave'; break;
                case 'hit': pose = p.hitT < 2.2 ? 'sit' : 'idle'; break;
            }
            v.pose(pose, Math.max(0.3, rate));
            v.put(p.x, p.h, p.y, p.heading);
        }
    },
};
