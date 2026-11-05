// GameCar.js — машина игрока: физика (2D-модель «велосипед» с шинами, перенос веса, ручник,
// автомат P R N D, уклон горки) + столкновения без повреждений + вид (кузов, 4 колеса, стоп-сигналы,
// поворотники, водитель и инструктор в салоне).
//
// Единицы: позиция в px (100 px = 1 м), скорость внутри физики — м/с. Курс θ: нос (cos θ, sin θ),
// y вниз по карте; правая сторона (−sin θ, cos θ); ω > 0 — поворот вправо (по часовой на виде сверху).

const CAR_G = 9.81;

class GameCar {
    /** @param {any} def запись GAME_CARS @param {any} geom геометрия (м, оси Blender) */
    constructor(def, geom) {
        this.def = def;
        this.geom = geom || GAME_CAR_DEFAULT_GEOMETRY;
        this.setup();
        this.x = 0; this.y = 0; this.heading = 0; this.h = 0;
        this.vx = 0; this.vy = 0; this.omega = 0;     // м/с, рад/с
        this.steer = 0;                               // рад, + вправо
        this.gear = 'P';                              // P R N D
        this.gearNum = 1;
        this.rpm = 850;
        this.shiftT = 0;
        this.reverseHold = 0; this.driveHold = 0;
        this.ax = 0; this.ay = 0;                     // ускорение в осях кузова (м/с²)
        this.pitch = 0; this.roll = 0;                // наклон по земле (рад)
        this.swayP = 0; this.swayR = 0; this.swayPv = 0; this.swayRv = 0;
        this.wheelSpin = 0;
        this.slip = 0;                                // визг шин 0..1
        this.handbrake = false;
        this.throttle = 0; this.brakeIn = 0;
        this.brakeLight = false;
        this.indicator = 0;                           // −1 лево, 0, 1 право, 2 аварийка
        this.indT = 0;
        this.surface = 'road';
        this.events = [];                             // { type: 'hit'|'cone'|'bump'|'curb', ... } за кадр
        this.view = null;
        /** @type {any} */ this.driver = null;
        /** @type {any} */ this.instructor = null;
        this.frozen = false;
        this.lastWheelH = [0, 0, 0, 0];
    }

    setup() {
        const g = this.geom, s = this.def.stats;
        const P = {};
        P.m = s.mass;
        P.a = Math.abs(g.wheels.fl[0]);                // м: центр -> передняя ось
        P.b = Math.abs(g.wheels.rl[0]);                // центр -> задняя ось
        P.L = P.a + P.b;
        // Центр масс ближе к мотору: передний привод — заметно вперёд (недостаточная поворачиваемость, как в жизни).
        const shift = (s.drive === 'fwd' ? 0.08 : s.drive === 'awd' ? 0.04 : 0.02) * P.L;
        P.a -= shift; P.b += shift;
        P.esc = s.drive === 'rwd' && s.power > 300 ? 0.55 : 1;   // система стабилизации: у мощных заднеприводных — мягче
        P.track = Math.abs(g.wheels.fl[1]) * 2;
        P.r = g.wheelRadius;
        P.hl = g.length / 2; P.hw = g.width / 2;
        P.I = P.m * (g.length * g.length + g.width * g.width) / 12 * 1.05;
        P.h = s.cg;
        P.mu = s.grip;
        P.power = s.power * 1000 * 0.62;               // эффективная мощность на колёсах, Вт
        P.vTop = s.top / 3.6;
        P.crr = 0.013;
        P.air = Math.max(0.05, (P.power - P.crr * P.m * CAR_G * P.vTop) / Math.pow(P.vTop, 3));
        P.steerMax = s.steer * Math.PI / 180;
        P.brake = 0.92 * s.brake;                       // доля m·g
        P.drive = s.drive;
        P.revMax = 7.5;                                 // м/с задним ходом
        P.gears = [3.5, 2.12, 1.45, 1.1, 0.88, 0.72];
        P.final = 3.9 * (0.34 / P.r);
        P.redline = s.engine === 'v8' ? 6800 : 6400;
        P.idle = 850;
        this.P = P;
    }

    get speed() { return Math.hypot(this.vx, this.vy); }                       // м/с
    get kmh() { return this.speed * 3.6; }
    get vLong() { return this.vx * Math.cos(this.heading) + this.vy * Math.sin(this.heading); }

    place(x, y, heading) {
        this.x = x; this.y = y; this.heading = heading;
        this.vx = this.vy = this.omega = 0; this.steer = 0;
        this.gear = 'P'; this.gearNum = 1;
        this.h = Roads.heightAt(x, y);
        this.swayP = this.swayR = this.swayPv = this.swayRv = 0;
        this.syncView(0);
    }

    // Углы кузова в мире (px): [fl, fr, rl, rr] по колёсам.
    wheelWorld(k, out) {
        const g = this.geom.wheels, w = [g.fl, g.fr, g.rl, g.rr][k];
        const lx = w[0] * 100, lz = -w[1] * 100;     // Blender y (лево) -> правая ось +z
        const c = Math.cos(this.heading), s = Math.sin(this.heading);
        const o = out || { x: 0, y: 0 };
        o.x = this.x + lx * c - lz * s; o.y = this.y + lx * s + lz * c;
        return o;
    }

    // Шаг физики. inp: { fwd 0..1, back 0..1, steer −1..1, handbrake bool }.
    step(dt, inp) {
        this.events.length = 0;
        if (this.frozen) { this.vx = this.vy = this.omega = 0; return; }
        const n = Math.max(1, Math.ceil(dt / (1 / 120)));
        const h = dt / n;
        this._gearLogic(dt, inp);
        for (let i = 0; i < n; i++) { this._integrate(h, inp); this._collide(h); }
        this._ground(dt);
        this._engine(dt, inp);
        this.indT += dt;
    }

    _gearLogic(dt, inp) {
        const v = this.vLong;
        const stopped = Math.abs(v) < 0.5;
        if (this.gear === 'P' || this.gear === 'N') {
            if (inp.fwd > 0.1) this.gear = 'D';
            else if (inp.back > 0.1 && stopped) { this.reverseHold += dt; if (this.reverseHold > 0.25) { this.gear = 'R'; this.reverseHold = 0; this._ev('gear'); } }
            return;
        }
        if (this.gear === 'D') {
            if (inp.back > 0.1 && stopped && !inp.handbrake) {
                this.reverseHold += dt;
                if (this.reverseHold > 0.35) { this.gear = 'R'; this.reverseHold = 0; this._ev('gear'); }
            } else this.reverseHold = 0;
        } else if (this.gear === 'R') {
            if (inp.fwd > 0.1 && stopped) {
                this.driveHold += dt;
                if (this.driveHold > 0.2) { this.gear = 'D'; this.driveHold = 0; this.gearNum = 1; this._ev('gear'); }
            } else this.driveHold = 0;
        }
    }

    _ev(type, data) { this.events.push(Object.assign({ type }, data || {})); }

    _integrate(dt, inp) {
        const P = this.P;
        const c = Math.cos(this.heading), s = Math.sin(this.heading);
        let vl = this.vx * c + this.vy * s;
        let vt = -this.vx * s + this.vy * c;
        const spd = Math.hypot(vl, vt);
        const rev = this.gear === 'R';
        const throttle = this.gear === 'D' ? inp.fwd : rev ? inp.back : 0;
        const brake = this.gear === 'D' ? inp.back : rev ? inp.fwd : Math.max(inp.back, 0);
        this.handbrake = !!inp.handbrake;
        this.throttle = throttle; this.brakeIn = brake;    // для эффектов (выхлоп, следы торможения)
        this.brakeLight = brake > 0.05 || this.gear === 'P';

        // Руль: чем быстрее, тем меньше угол; плавный поворот и самовозврат.
        const lim = P.steerMax / (1 + spd / 16);
        const target = (inp.steer || 0) * lim;
        const rate = (Math.abs(target) > Math.abs(this.steer) ? 2.6 : 4.2);
        this.steer += Math.max(-rate * dt, Math.min(rate * dt, target - this.steer));

        // Поверхность.
        const surf = this.surface;
        const surfMu = surf === 'grass' ? 0.62 : surf === 'walk' ? 0.92 : surf === 'water' ? 0.4 : 1;
        const crr = surf === 'grass' ? 0.07 : surf === 'water' ? 0.3 : P.crr;
        const mu = P.mu * surfMu * (GameCar.weatherGrip || 1);

        // Нагрузка на оси с переносом веса.
        const W = P.m * CAR_G;
        let Fzf = W * P.b / P.L - P.m * this.ax * P.h / P.L;
        let Fzr = W * P.a / P.L + P.m * this.ax * P.h / P.L;
        Fzf = Math.max(W * 0.15, Fzf); Fzr = Math.max(W * 0.15, Fzr);

        // Тяга.
        let Ff = 0, Fr = 0;     // продольные силы на осях (+ вперёд)
        if (throttle > 0) {
            const shiftCut = this.shiftT > 0 ? 0.35 : 1;
            let F = rev ? throttle * P.m * 3.2 : throttle * Math.min(P.power / Math.max(Math.abs(vl), 3.2), P.m * 9) * shiftCut;
            if (rev) { if (-vl > P.revMax) F = 0; F = -F; }
            if (P.drive === 'fwd') Ff += F;
            else if (P.drive === 'rwd') Fr += F;
            else { Ff += F * 0.4; Fr += F * 0.6; }
        }
        // Тормоза (не дают сменить знак скорости) и ручник.
        const dirv = Math.abs(vl) > 0.05 ? Math.sign(vl) : 0;
        if (brake > 0 && dirv) {
            const Fb = brake * P.brake * W;
            Ff -= dirv * Fb * 0.66; Fr -= dirv * Fb * 0.34;
        }
        if (this.handbrake && dirv) Fr -= dirv * mu * Fzr * 0.85;
        // Ограничение тяги сцеплением (продольно).
        const capF = mu * Fzf, capR = mu * Fzr;
        Ff = Math.max(-capF, Math.min(capF, Ff));
        Fr = Math.max(-capR, Math.min(capR, Fr));

        // Боковые силы шин (упрощённая формула Пасейки).
        const mf = (al) => Math.sin(1.22 * Math.atan(12 * al));
        const d = this.steer;
        const cd = Math.cos(d), sd = Math.sin(d);
        const vfl = vl, vft = vt + P.a * this.omega;
        const wl = vfl * cd + vft * sd, wt = -vfl * sd + vft * cd;
        const den = (x) => Math.max(Math.abs(x), 1.6);
        const alf = Math.atan2(wt, den(wl));
        const alr = Math.atan2(vt - P.b * this.omega, den(vl));
        const latCapF = Math.sqrt(Math.max(0, capF * capF - Ff * Ff));
        const latCapR = Math.sqrt(Math.max(0, capR * capR - Fr * Fr)) * (this.handbrake ? 0.42 : 1.1);
        const Fyf = -latCapF * mf(alf);
        const Fyr = -latCapR * mf(alr);
        this.slip = Math.min(1, Math.max(Math.abs(alr) > 0.14 ? (Math.abs(alr) - 0.14) * 5 : 0,
            Math.abs(alf) > 0.2 ? (Math.abs(alf) - 0.2) * 4 : 0, (this.handbrake && spd > 3) ? 0.6 : 0,
            (brake > 0.85 && spd > 8) ? 0.3 : 0) * Math.min(1, spd / 5));

        // Сопротивление: качение + воздух + торможение двигателем.
        let Fres = -(dirv * crr * W) - P.air * vl * Math.abs(vl);
        if (throttle < 0.05 && this.gear === 'D') Fres -= vl * P.m * 0.06;
        // Уклон: сила тяжести вдоль кузова.
        const Fslope = -W * Math.sin(this.pitch);

        const Flong = Ff * cd - Fyf * sd + Fr + Fres + Fslope;
        const Flat = Ff * sd + Fyf * cd + Fyr;
        const torque = P.a * (Fyf * cd + Ff * sd) - P.b * Fyr;

        // Стабилизация (ESC): при заметном заносе без ручника тянем рыскание к допустимому сцеплением.
        let tq = torque;
        const beta = Math.atan2(vt, Math.max(1, Math.abs(vl)));
        if (!this.handbrake && spd > 4 && Math.abs(beta) > 0.07) {
            const wMax = mu * CAR_G / spd;
            const wGoal = Math.max(-wMax, Math.min(wMax, vl * Math.tan(d) / P.L));
            tq += (wGoal - this.omega) * P.I * 4 * P.esc * Math.min(1, (Math.abs(beta) - 0.07) * 6);
        }
        let al = Flong / P.m, at = Flat / P.m;
        this.ax += (al - this.ax) * Math.min(1, dt * 8);
        this.ay += (at - this.ay) * Math.min(1, dt * 8);

        // Интегрирование в мировых осях (базис кузова этого шага; поворот рамы учтётся на следующем шаге).
        const vlPrev = vl;
        vl += al * dt;
        vt += at * dt;
        this.omega += tq / P.I * dt;
        // Тормоз не разгоняет назад.
        if (brake > 0 && vlPrev !== 0 && Math.sign(vl) !== Math.sign(vlPrev) && Math.abs(Fslope) < Math.abs(brake * P.brake * W)) vl = 0;
        if (this.handbrake && Math.abs(vl) < 0.4) vl *= Math.max(0, 1 - dt * 12);

        // Малые скорости: кинематика вместо шин (иначе дрожание).
        const k = Math.min(1, Math.max(0, (Math.abs(vl) - 0.6) / 2.4));
        if (k < 1) {
            const wKin = vl * Math.tan(d) / P.L;
            this.omega = this.omega * k + wKin * (1 - k);
            vt *= 1 - (1 - k) * Math.min(1, dt * 14);
        }
        // Удержание на месте (статическое трение) при торможении или без газа на ровном.
        const holding = (brake > 0.1 || this.handbrake || this.gear === 'P') && Math.abs(vl) < 0.25 && Math.abs(vt) < 0.25;
        if (holding && Math.abs(Fslope) < (brake * P.brake * W + (this.handbrake ? mu * Fzr : 0) + (this.gear === 'P' ? W : 0))) {
            vl = 0; vt = 0; this.omega = 0;
        } else if (throttle < 0.02 && brake < 0.02 && Math.abs(vl) < 0.08 && Math.abs(this.pitch) < 0.01) {
            vl = 0; vt *= 0.5; this.omega *= 0.5;
        }

        this.vx = vl * c - vt * s;
        this.vy = vl * s + vt * c;
        this.x += this.vx * 100 * dt;
        this.y += this.vy * 100 * dt;
        this.heading += this.omega * dt;
        this.wheelSpin -= vl / P.r * dt;
    }

    // --- Столкновения (OBB машины против коллайдеров мира, трафика, конусов) ----------------------

    corners(out) {
        const P = this.P, c = Math.cos(this.heading), s = Math.sin(this.heading);
        const L = P.hl * 100, Wd = P.hw * 100;
        const o = out || [{}, {}, {}, {}];
        const pts = [[L, Wd], [L, -Wd], [-L, -Wd], [-L, Wd]];
        for (let i = 0; i < 4; i++) { o[i].x = this.x + pts[i][0] * c - pts[i][1] * s; o[i].y = this.y + pts[i][0] * s + pts[i][1] * c; }
        return o;
    }

    _collide(dt) {
        const P = this.P;
        const R = Math.hypot(P.hl, P.hw) * 100 + 40;
        const list = GameWorld.near(this.x, this.y, R, this._near || (this._near = []));
        for (const col of list) this._resolve(col, null);
        if (GameCar.dynamic) for (const o of GameCar.dynamic(this.x, this.y, R)) this._resolve(o.box, o);
        // Конусы.
        for (const cone of GameWorld.cones) {
            const dx = cone.x - this.x, dy = cone.y - this.y;
            if (dx * dx + dy * dy > (R + 40) * (R + 40)) continue;
            if (cone.z > 120) continue;                                  // подброшенный конус пролетает над капотом
            const hit = this._circleHit(cone.x, cone.y, cone.r);
            if (!hit) continue;
            // Скорость точки кузова в месте касания (px/с); нормаль hit.n — от машины к конусу.
            const rx = (hit.px - this.x) / 100, ry = (hit.py - this.y) / 100;
            const pvx = (this.vx - this.omega * ry) * 100, pvy = (this.vy + this.omega * rx) * 100;
            cone.x += hit.nx * hit.depth; cone.y += hit.ny * hit.depth;   // конус — от машины
            const dv = GameWorld.hitCone(cone, hit.nx, hit.ny, pvx, pvy);
            // машине — отдача по массе конуса (заметна только на малой скорости)
            const k = GameWorld.CONE.mass / this.P.m * dv / 100;
            this.vx -= hit.nx * k; this.vy -= hit.ny * k;
            if (!cone.hit && dv > 60) { cone.hit = true; this._ev('cone', { cone }); }
        }
    }

    // Пересечение с кругом -> { nx, ny (от машины к препятствию), depth, px, py } | null
    _circleHit(cx, cy, r) {
        const P = this.P, c = Math.cos(this.heading), s = Math.sin(this.heading);
        const dx = cx - this.x, dy = cy - this.y;
        const lu = dx * c + dy * s, lv = -dx * s + dy * c;
        const L = P.hl * 100, Wd = P.hw * 100;
        const qu = Math.max(-L, Math.min(L, lu)), qv = Math.max(-Wd, Math.min(Wd, lv));
        let nu = lu - qu, nv = lv - qv;
        let dist = Math.hypot(nu, nv);
        let depth;
        if (dist < 1e-6) {
            // центр внутри кузова
            const pu = L - Math.abs(lu), pv = Wd - Math.abs(lv);
            if (pu < pv) { nu = Math.sign(lu) || 1; nv = 0; depth = pu + r; } else { nu = 0; nv = Math.sign(lv) || 1; depth = pv + r; }
        } else {
            if (dist >= r) return null;
            depth = r - dist; nu /= dist; nv /= dist;
        }
        const px = this.x + qu * c - qv * s, py = this.y + qu * s + qv * c;
        return { nx: nu * c - nv * s, ny: nu * s + nv * c, depth, px, py };
    }

    // Пересечение OBB машины с OBB коллайдера (SAT) -> то же или null.
    _boxHit(b) {
        const P = this.P, c = Math.cos(this.heading), s = Math.sin(this.heading);
        const A = { x: this.x, y: this.y, ux: c, uy: s, vx: -s, vy: c, hl: P.hl * 100, hw: P.hw * 100 };
        const B = { x: b.x, y: b.y, ux: b.c, uy: b.s, vx: -b.s, vy: b.c, hl: b.hx, hw: b.hy };
        const dx = B.x - A.x, dy = B.y - A.y;
        const axes = [[A.ux, A.uy], [A.vx, A.vy], [B.ux, B.uy], [B.vx, B.vy]];
        let best = Infinity, bn = null, bi = 0;
        for (let i = 0; i < 4; i++) {
            const ax = axes[i][0], ay = axes[i][1];
            const ra = A.hl * Math.abs(A.ux * ax + A.uy * ay) + A.hw * Math.abs(A.vx * ax + A.vy * ay);
            const rb = B.hl * Math.abs(B.ux * ax + B.uy * ay) + B.hw * Math.abs(B.vx * ax + B.vy * ay);
            const dist = dx * ax + dy * ay;
            const o = ra + rb - Math.abs(dist);
            if (o <= 0) return null;
            if (o < best) { best = o; bn = dist > 0 ? [ax, ay] : [-ax, -ay]; bi = i; }
        }
        // точка контакта: ось машины — угол препятствия внутри машины; ось препятствия — угол машины
        let px, py;
        const supp = (O, nx, ny) => {
            const su = (O.ux * nx + O.uy * ny) > 0 ? 1 : -1, sv = (O.vx * nx + O.vy * ny) > 0 ? 1 : -1;
            return { x: O.x + O.ux * O.hl * su + O.vx * O.hw * sv, y: O.y + O.uy * O.hl * su + O.vy * O.hw * sv };
        };
        if (bi >= 2) { const p = supp(A, bn[0], bn[1]); px = p.x; py = p.y; }
        else { const p = supp(B, -bn[0], -bn[1]); px = p.x; py = p.y; }
        return { nx: bn[0], ny: bn[1], depth: best, px, py };
    }

    _resolve(col, mover) {
        if (col.low && this.h > (col.h || 0) + 20) return;
        const hit = col.kind === 'circle' ? this._circleHit(col.x, col.y, col.r) : this._boxHit(col);
        if (!hit) return;
        if (col.water && Roads.pieceAt(hit.px, hit.py)) return;     // мост над водой
        // вытолкнуть
        this.x -= hit.nx * hit.depth; this.y -= hit.ny * hit.depth;
        // импульс в точке контакта (м)
        const P = this.P;
        const rx = (hit.px - this.x) / 100, ry = (hit.py - this.y) / 100;
        const ovx = mover ? mover.vx || 0 : 0, ovy = mover ? mover.vy || 0 : 0;
        const pvx = this.vx - this.omega * ry - ovx, pvy = this.vy + this.omega * rx - ovy;
        const nx = -hit.nx, ny = -hit.ny;                  // нормаль от препятствия к машине
        const vn = pvx * nx + pvy * ny;
        if (vn >= 0) return;
        const e = 0.18;
        const rn = rx * ny - ry * nx;
        const j = -(1 + e) * vn / (1 / P.m + rn * rn / P.I);
        this.vx += j * nx / P.m; this.vy += j * ny / P.m;
        this.omega += rn * j / P.I;
        const tx = -ny, ty = nx;
        const vtn = pvx * tx + pvy * ty;
        const rt = rx * ty - ry * tx;
        let jt = -vtn / (1 / P.m + rt * rt / P.I);
        const lim = 0.35 * j;
        jt = Math.max(-lim, Math.min(lim, jt));
        this.vx += jt * tx / P.m; this.vy += jt * ty / P.m;
        this.omega += rt * jt / P.I;
        const impact = -vn;
        if (impact > 0.6) this._ev('hit', { impact, col, mover, x: hit.px, y: hit.py });
        if (mover && mover.onHit) mover.onHit(impact, this);
    }

    // --- Земля под колёсами: высота, наклон, удары о бордюр -------------------------------------

    _ground(dt) {
        const hs = [0, 0, 0, 0], p = { x: 0, y: 0 };
        for (let k = 0; k < 4; k++) {
            this.wheelWorld(k, p);
            hs[k] = Roads.heightAt(p.x, p.y);
            const jump = hs[k] - this.lastWheelH[k];
            if (Math.abs(jump) > 7 && this.speed > 1) this._ev('bump', { power: Math.min(1, Math.abs(jump) / 20 * this.speed / 6) });
            this.lastWheelH[k] = hs[k];
        }
        const P = this.P;
        const front = (hs[0] + hs[1]) / 2, rear = (hs[2] + hs[3]) / 2;
        const left = (hs[0] + hs[2]) / 2, right = (hs[1] + hs[3]) / 2;
        const target = (front + rear) / 2;
        this.h += (target - this.h) * Math.min(1, dt * 18);
        const tp = Math.atan2(front - rear, P.L * 100);
        const tr = Math.atan2(left - right, P.track * 100);
        this.pitch += (tp - this.pitch) * Math.min(1, dt * 14);
        this.roll += (tr - this.roll) * Math.min(1, dt * 14);
        this.surface = Roads.surfaceAt(this.x, this.y);
        // Раскачка кузова (вид): тангаж от продольного, крен от бокового ускорения.
        const kP = 60, dP = 9;
        this.swayPv += (-this.ax * 0.006 - this.swayP) * kP * dt - this.swayPv * dP * dt;
        this.swayP += this.swayPv * dt;
        this.swayRv += (this.ay * 0.007 - this.swayR) * kP * dt - this.swayRv * dP * dt;
        this.swayR += this.swayRv * dt;
        this.swayP = Math.max(-0.07, Math.min(0.07, this.swayP));
        this.swayR = Math.max(-0.08, Math.min(0.08, this.swayR));
    }

    // Обороты и передачи автомата (для звука и приборов).
    _engine(dt, inp) {
        const P = this.P;
        if (this.shiftT > 0) this.shiftT -= dt;
        const v = Math.abs(this.vLong);
        const throttle = this.gear === 'D' ? inp.fwd : this.gear === 'R' ? inp.back : 0;
        if (this.gear === 'D') {
            const rpmAt = (g) => v / P.r * P.gears[g - 1] * P.final * 60 / (2 * Math.PI);
            if (this.gearNum < P.gears.length && rpmAt(this.gearNum) > P.redline * (throttle > 0.6 ? 0.9 : 0.62) && this.shiftT <= 0) {
                this.gearNum++; this.shiftT = 0.22; this._ev('shift');
            } else if (this.gearNum > 1 && rpmAt(this.gearNum - 1) < P.redline * (throttle > 0.6 ? 0.7 : 0.45) && this.shiftT <= 0) {
                this.gearNum--; this.shiftT = 0.16;
            }
            const target = Math.max(P.idle + throttle * 900, rpmAt(this.gearNum));
            this.rpm += (Math.min(P.redline, target) - this.rpm) * Math.min(1, dt * 9);
        } else if (this.gear === 'R') {
            const target = Math.max(P.idle + throttle * 700, v / P.r * 3.3 * P.final * 60 / (2 * Math.PI));
            this.rpm += (Math.min(P.redline * 0.7, target) - this.rpm) * Math.min(1, dt * 9);
        } else {
            const target = P.idle + (inp.fwd > 0.1 ? 2500 : 0);
            this.rpm += (target - this.rpm) * Math.min(1, dt * 6);
        }
    }

    // --- Вид -----------------------------------------------------------------------------------------

    async buildView(view) {
        const scene = view.scene;
        const root = new BABYLON.TransformNode('car', scene);
        const body = new BABYLON.TransformNode('car-body', scene);
        body.parent = root;
        this.view = { root, body, wheels: [], parts: {}, occupants: [], scene };
        let mesh = null;
        try {
            const model = await Model3D.load(this.def.model);
            mesh = Model3D.build(model, scene, { name: 'car-' + this.def.id });
        } catch (e) {
            mesh = this._placeholderBody(scene);
        }
        mesh.parent = body;
        World3D.addObject(view, mesh, 'actor', { ink: false, outline: false });
        this.view.mesh = mesh;
        for (const m of mesh.getChildMeshes(false)) {
            const name = m.metadata && m.metadata.part;
            if (!name) continue;
            if (/^(TailLights|HeadLights|IndicatorL|IndicatorR|Glow)/.test(name) && m.material) {
                m.material = m.material.clone(m.material.name + '-' + name);
                this.view.parts[name.replace(/[._].*$/, '')] = m;
            }
        }
        // Колёса.
        const g = this.geom;
        let wheelModel = null;
        try { wheelModel = await Model3D.load(this.def.wheel); } catch (e) { wheelModel = null; }
        const keys = ['fl', 'fr', 'rl', 'rr'];
        for (let k = 0; k < 4; k++) {
            const w = g.wheels[keys[k]];
            const holder = new BABYLON.TransformNode('wheel-' + keys[k], scene);
            holder.parent = root;
            holder.position.set(w[0] * 100, w[2] * 100, -w[1] * 100);
            const spin = new BABYLON.TransformNode('wheel-spin-' + keys[k], scene);
            spin.parent = holder;
            let wm;
            if (wheelModel) wm = Model3D.build(wheelModel, scene, { name: 'wheel' });
            else {
                wm = BABYLON.MeshBuilder.CreateCylinder('wheel', { diameter: g.wheelRadius * 200, height: g.wheelWidth * 100, tessellation: 14 }, scene);
                wm.rotation.x = Math.PI / 2;
                wm.material = GameGfx.mat('tyre', '#26272b');
            }
            wm.parent = spin;
            World3D.addObject(view, wm, 'actor', { ink: false, outline: false });
            const left = w[1] > 0;
            this.view.wheels.push({ holder, spin, left, front: k < 2, mesh: wm });
        }
        this.syncView(0);
    }

    _placeholderBody(scene) {
        const g = this.geom;
        const root = new BABYLON.Mesh('car-placeholder', scene);
        const b = BABYLON.MeshBuilder.CreateBox('Body', { width: g.length * 100, height: g.height * 50, depth: g.width * 100 }, scene);
        b.position.y = g.wheelRadius * 100 + g.height * 20;
        b.material = GameGfx.mat('car-body', this.geom.color || '#f2f2f2');
        b.parent = root;
        const t = BABYLON.MeshBuilder.CreateBox('Cabin', { width: g.length * 55, height: g.height * 40, depth: g.width * 90 }, scene);
        t.position.set(-g.length * 5, g.wheelRadius * 100 + g.height * 62, 0);
        t.material = GameGfx.mat('car-glass', '#9fc6e8');
        t.parent = root;
        return root;
    }

    // Пассажиры: риг персонажа на точке сиденья (м, оси Blender).
    async seat(url, seatPoint, clip, opts) {
        if (!this.view || typeof Rig === 'undefined') return null;
        try {
            const o = opts || {};
            const lib = await Rig.load('assets/models/people/people_clips.glb');
            const model = await Rig.load(url);
            const rig = Rig.create(model, GameGfx.view, { name: 'occupant', clips: [lib], kind: 'actor', hide: ['Face_'] });
            rig.setPartVisible('Face_calm', true);
            rig.root.parent = this.view.body;
            const off = GameCar.SEAT_OFFSET;
            rig.root.position.set(seatPoint[0] * 100 - off[0] * 100, seatPoint[2] * 100 - off[2] * 100, -seatPoint[1] * 100 + off[1] * 100);
            rig.root.rotation.y = 0;
            if (o.scale) rig.root.scaling.setAll(o.scale);
            rig.play(clip || 'sit');
            this.view.occupants.push(rig);
            return rig;
        } catch (e) {
            console.warn('GameCar: пассажир не загружен', url, e);
            return null;
        }
    }

    syncView(dt) {
        const v = this.view;
        if (!v) return;
        v.root.position.set(this.x, this.h, this.y);
        const q = BABYLON.Quaternion.RotationYawPitchRoll(-this.heading, 0, 0);
        // наклон по земле: тангаж вокруг правой оси (z), крен вокруг продольной (x)
        const tilt = BABYLON.Quaternion.RotationYawPitchRoll(0, this.roll, this.pitch);
        v.root.rotationQuaternion = q.multiply(tilt);
        v.body.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(0, -this.swayR, this.swayP);
        for (const w of v.wheels) {
            const steer = w.front ? -this.steer : 0;
            w.holder.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(steer + (w.left ? Math.PI : 0), 0, 0);
            w.spin.rotation.z = w.left ? -this.wheelSpin : this.wheelSpin;
        }
        // Огни.
        const tail = v.parts.TailLights;
        if (tail && tail.material) tail.material.emissiveColor = this.brakeLight ? new BABYLON.Color3(0.9, 0.08, 0.05) : (this.gear === 'R' ? new BABYLON.Color3(0.45, 0.45, 0.45) : BABYLON.Color3.Black());
        const blink = Math.floor(this.indT * 2.6) % 2 === 0;
        const on = (side) => this.indicator === 2 || this.indicator === side;
        const L = v.parts.IndicatorL, Rr = v.parts.IndicatorR;
        if (L && L.material) L.material.emissiveColor = on(-1) && blink ? new BABYLON.Color3(1, 0.55, 0) : BABYLON.Color3.Black();
        if (Rr && Rr.material) Rr.material.emissiveColor = on(1) && blink ? new BABYLON.Color3(1, 0.55, 0) : BABYLON.Color3.Black();
        const head = v.parts.HeadLights;
        if (head && head.material) head.material.emissiveColor = GameCar.night ? new BABYLON.Color3(1, 0.95, 0.75) : new BABYLON.Color3(0.18, 0.18, 0.15);
        const glow = v.parts.Glow;
        if (glow && glow.material) { const t = 0.6 + 0.4 * Math.sin(this.indT * 3); glow.material.emissiveColor = new BABYLON.Color3(0.8 * t, 0.3 * t, 1 * t); }
    }

    get blinkOn() { return this.indicator !== 0 && Math.floor(this.indT * 2.6) % 2 === 0; }

    dispose() {
        const v = this.view;
        if (!v) return;
        for (const r of v.occupants) r.dispose();
        for (const w of v.wheels) World3D.removeObject(GameGfx.view, w.mesh);
        if (v.mesh) Model3D.dispose(GameGfx.view, v.mesh);
        v.root.dispose();
        this.view = null;
    }
}

/** Смещение таза над корнем рига во всех позах sit* (м, оси Blender) — docs/people/README.md. */
GameCar.SEAT_OFFSET = [0, 0, 0.51];
/** Множитель сцепления от погоды (дождь — 0.8). */
GameCar.weatherGrip = 1;
GameCar.night = false;
/** @type {null | ((x: number, y: number, r: number) => any[])} движущиеся препятствия (трафик): [{ box, vx, vy, onHit }] */
GameCar.dynamic = null;
