// GameRules.js — судья: правила дорожного движения, как их видит инструктор на экзамене.
//
// Что проверяется (и как — чтобы не было ложных срабатываний):
//   · светофор — по СТОП-ЛИНИИ (внешний край зебры), а не по клетке перекрёстка. Сигнал запоминается в миг, когда
//     передний бампер пересёк линию: пересёк на красный и въехал в перекрёсток — грубая ошибка; встал за линией —
//     мелкая; пересёк на зелёный/жёлтый — всё честно, даже если потом загорелся красный;
//   · скорость — после знака с меньшим лимитом есть время сбросить скорость; сначала устное предупреждение, ошибка —
//     если превышение держится; грубое превышение (+25 км/ч) — грубая ошибка;
//   · пешеходы — на зебре или проезжей части у тебя по курсу: не сбавил и подъехал вплотную — ошибка; наезд — грубая;
//   · полоса — встречная на прямой дольше двух секунд (объезд стоящей машины не считается);
//   · бордюр/газон/кольцо — колёсами, кроме выездов с площадок и вырезов в бордюре;
//   · поворотник — включён до въезда на перекрёсток в сторону поворота (на экзамене и работе);
//   · столкновения — по силе удара, повтор с тем же препятствием не считается дважды.
// Инструктор заранее предупреждает (красный впереди, пешеход, поворот без поворотника, скорость) и хвалит за
// правильное (ждёшь зелёный, пропустил пешехода, поворотник вовремя, долго без ошибок).
// Нарушение -> GameRules.fault(code): экзамен считает ошибки, работа — качество, вне экзамена в городе — штраф.

/** @satisfies {Record<string, any>} */
const GameRules = {
    limit: 60,
    limitGrace: 0,
    speedT: 0, speedBigT: 0,
    walkT: 0, grassT: 0, islandT: 0, laneT: 0,
    cleanT: 0,
    /** @type {Record<string, number>} */ cool: {},
    /** @type {any} */ app: null,         // подход к светофору: { piece, port, s, crossedSig, ranRed, overLine, stopT }
    /** @type {any} */ junction: null,    // в перекрёстке: { piece, port, ind }
    /** @type {any} */ lastPiece: null,
    indSide: 0, indT: -99,
    /** @type {Map<any, number>} */ hits: new Map(),
    pedStopT: 0,
    _p: { x: 0, y: 0 },

    FINES: { redLight: 150, speed: 60, speedBig: 150, crash: 80, crashBig: 200, pedestrian: 300, zebra: 120, wrongLane: 50 },
    MAJOR: { redLight: 1, crashBig: 1, pedestrian: 1, speedBig: 1 },
    STOP_LINE: 0.47,       // доля T от центра перекрёстка: внешний край зебры

    reset() {
        this.speedT = this.speedBigT = this.walkT = this.grassT = this.islandT = this.laneT = this.cleanT = 0;
        this.cool = {}; this.app = null; this.junction = null; this.lastPiece = null; this.hits.clear();
        this.limitGrace = 0; this.indT = -99; this.indSide = 0;
    },

    judging() { return (typeof GameExam !== 'undefined' && GameExam.active) || (typeof GameJobs !== 'undefined' && GameJobs.active); },

    fault(code, opts) {
        const o = opts || {};
        const now = Game.time;
        const cd = o.cooldown === undefined ? 4 : o.cooldown;
        if (this.cool[code] && now < this.cool[code]) return false;
        this.cool[code] = now + cd;
        this.cleanT = 0;
        const major = !!(o.major || this.MAJOR[code]);
        const f = { code, major, x: Game.car.x, y: Game.car.y };
        let used = false;
        if (typeof GameExam !== 'undefined' && GameExam.active) { GameExam.fault(f); used = true; }
        if (typeof GameJobs !== 'undefined' && GameJobs.active) { GameJobs.fault(f); used = true; }
        if (typeof GameUI !== 'undefined') {
            if (!used && Game.save.license >= 1 && this.FINES[code] && !this._onTraining()) {
                const n = this.FINES[code];
                Game.addMoney(-n);
                Game.save.stats.fines += n;
                GameUI.toast(Lang.t('fine', { n }) + ' · ' + Lang.t('fault.' + code), 'bad');
            } else {
                GameUI.toast(Lang.t(major ? 'fault.major' : 'fault.minor') + ': ' + Lang.t('fault.' + code), major ? 'bad' : 'warn');
            }
        }
        if (typeof GameInstructor !== 'undefined') GameInstructor.onFault(f);
        return true;
    },

    coach(key, params, cooldown) { if (typeof GameInstructor !== 'undefined') GameInstructor.coach(key, params, cooldown); },
    praise(key, cooldown) { if (typeof GameInstructor !== 'undefined') GameInstructor.praise(key, cooldown); },

    _onTraining() {
        if (Game.save.license >= 1) return false;
        const sp = Game.app.location.marker('spawn'), car = Game.car;
        return !!(sp && Math.hypot(car.x - sp.x, car.y - sp.y) < 9000);
    },

    // --- Кадр -------------------------------------------------------------------------------------

    update(dt) {
        const car = Game.car;
        if (!car || car.frozen) return;
        const c = Math.cos(car.heading), s = Math.sin(car.heading);
        this._speed(dt, car);
        this._surfaces(dt, car);
        this._lane(dt, car, c, s);
        if (car.indicator === -1 || car.indicator === 1) { this.indSide = car.indicator; this.indT = Game.time; }
        this._signals(dt, car, c, s);
        this._junctions(car);
        this._peds(dt, car, c, s);
        this._turnCoach(car);
        // Долго без ошибок — похвала.
        if (car.speed > 3) this.cleanT += dt;
        if (this.cleanT > 80) { this.cleanT = 0; this.praise('praiseSmooth', 60); }
    },

    _speed(dt, car) {
        const lim = Roads.speedLimitAt(car.x, car.y);
        if (lim < this.limit) this.limitGrace = 4;          // новый знак с меньшим лимитом — время сбросить
        this.limit = lim;
        if (this.limitGrace > 0) this.limitGrace -= dt;
        const over = car.kmh - lim;
        if (this.limitGrace > 0) { this.speedT = 0; this.speedBigT = 0; return; }
        if (over > 3) this.coach('warnSpeed', { n: lim }, 12);
        if (over > GAME_SPEED.tolerance) {
            this.speedT += dt;
            if (this.speedT > 2) { this.fault('speed', { cooldown: 12 }); this.speedT = -4; }
        } else this.speedT = Math.max(0, this.speedT - dt * 2);
        if (over > 25) { this.speedBigT += dt; if (this.speedBigT > 1.5) { this.fault('speedBig', { cooldown: 15 }); this.speedBigT = -6; } }
        else this.speedBigT = Math.max(0, this.speedBigT - dt);
    },

    // Колесо стоит на выезде с площадки или в вырезе бордюра — это не тротуар.
    _driveway(x, y) {
        if (Roads.lotAt(x, y) || Roads.rampAt(x, y)) return true;
        const p = Roads.pieceAt(x, y);
        if (p && /driveway/.test(p.name)) return true;
        // площадка рядом (колесо на кромке тротуара у въезда)
        for (const q of Roads.lots) if (Roads.inRect(q, x, y, 160)) return true;
        return false;
    },

    _surfaces(dt, car) {
        let walk = 0, grass = 0, island = 0;
        const p = this._p;
        for (let k = 0; k < 4; k++) {
            car.wheelWorld(k, p);
            const s = Roads.surfaceAt(p.x, p.y);
            if (s === 'walk') { if (!this._driveway(p.x, p.y)) walk++; }
            else if (s === 'grass') { if (!this._driveway(p.x, p.y)) grass++; }
            else if (s === 'island') island++;
        }
        const moving = car.speed > 1;
        if (walk >= 2 && moving) { this.walkT += dt; if (this.walkT > 0.45) { this.fault('curb', { cooldown: 8 }); this.walkT = -3; } }
        else { this.walkT = Math.max(0, this.walkT - dt); if (walk === 1 && car.speed > 2) this.coach('curbTouch', null, 10); }
        if (grass >= 3 && moving) { this.grassT += dt; if (this.grassT > 1.2) { this.fault('grass', { cooldown: 12 }); this.grassT = -5; } }
        else this.grassT = Math.max(0, this.grassT - dt);
        if (island >= 2 && moving) { this.islandT += dt; if (this.islandT > 0.3) { this.fault('island', { cooldown: 10 }); this.islandT = -5; } }
        else this.islandT = Math.max(0, this.islandT - dt);
    },

    // Встречная полоса на прямой. Объезд стоящей впереди машины — можно.
    _lane(dt, car, c, s) {
        const piece = Roads.pieceAt(car.x, car.y);
        if (!piece || piece.kind !== 'straight' || car.kmh < 10) { this.laneT = Math.max(0, this.laneT - dt * 2); return; }
        const l = Roads.local(piece, car.x, car.y);
        const bridge = piece.name === 'road-bridge';
        const ax = Roads.rot(bridge ? 0 : 1, bridge ? 1 : 0, piece.r);
        const dirSign = Math.sign(car.vx * ax.x + car.vy * ax.y) || 1;
        const side = (bridge ? -l.u : l.v) * dirSign;     // > 0 — своя (правая) полоса
        if (side < -0.06 && !this._overtaking(car, c, s)) {
            this.laneT += dt;
            if (this.laneT > 0.8) this.coach('warnLane', null, 8);
            if (this.laneT > 2.2) { this.fault('wrongLane', { cooldown: 10 }); this.laneT = -4; }
        } else this.laneT = Math.max(0, this.laneT - dt * 2);
    },

    _overtaking(car, c, s) {
        if (typeof GameTraffic === 'undefined' || !GameTraffic.cars) return false;
        for (const o of GameTraffic.cars) {
            const dx = o.x - car.x, dy = o.y - car.y;
            const along = dx * c + dy * s, lat = -dx * s + dy * c;
            if (along > -300 && along < 2600 && lat > 150 && lat < 700 && (o.speed || 0) < 2.5) return true;
        }
        return false;
    },

    // --- Светофор: стоп-линия --------------------------------------------------------------------

    _signals(dt, car, c, s) {
        const T = Roads.T, hl = car.P.hl * 100;
        const fx = car.x + c * hl, fy = car.y + s * hl;
        const here = Roads.pieceAt(car.x, car.y);
        // Ближайший светофорный перекрёсток по курсу (до 26 м от бампера), в который мы въезжаем «в лоб».
        let J = null, port = null;
        for (let k = 0; k <= 26; k += 2) {
            const p = Roads.pieceAt(fx + c * k * 100, fy + s * k * 100);
            if (p && p.signal) {
                let best = null, bs = 0;
                for (const q of p.ports) { const dot = Roads.DX[q.d] * c + Roads.DY[q.d] * s; if (dot < bs) { bs = dot; best = q; } }
                if (best && bs < -0.7) { J = p; port = best; }
                break;
            }
        }
        const a = this.app;
        if (!J) {
            // уехали от перекрёстка (или уже внутри и выехали) — подход закрыт
            if (a && here !== a.piece) this.app = null;
            if (a && here === a.piece) this._inJunction(a, car);
            return;
        }
        if (!a || a.piece !== J || a.port !== port) {
            this.app = { piece: J, port, s: -1e9, crossedSig: null, ranRed: false, overLine: false, stopT: 0, praised: false };
        }
        const A = this.app;
        const ax = -Roads.DX[port.d], ay = -Roads.DY[port.d];                       // направление въезда
        const lx = J.x + Roads.DX[port.d] * this.STOP_LINE * T, ly = J.y + Roads.DY[port.d] * this.STOP_LINE * T;
        const sNow = (fx - lx) * ax + (fy - ly) * ay;                                // > 0 — бампер за линией
        const sig = Roads.signalFor(J, port.d);
        const v = car.speed;
        if (A.s <= 0 && sNow > 0 && car.vLong > 0.3) {
            A.crossedSig = sig;
            A.ranRed = sig === 'red';
        }
        A.s = sNow;
        // Предупреждение: впереди красный, а тормозить уже пора.
        if (sNow < -150 && sNow > -2600 && (sig === 'red' || sig === 'yellow') && v > 6) {
            const need = v * v / (2 * Math.max(0.5, -sNow / 100));
            if (need > 2.2) this.coach('warnRed', null, 7);
        }
        // Стоим перед линией на красный — правильно.
        if (v < 0.3 && sig === 'red' && sNow < 30 && sNow > -700) {
            A.stopT += dt;
            if (A.stopT > 1 && !A.praised) { A.praised = true; this.praise('praiseRed', 70); }
        }
        // Встал за стоп-линией на красный.
        if (A.ranRed && v < 0.3 && sNow > 40 && !A.overLine) {
            A.overLine = true;
            if (this.judging()) this.fault('overLine', { cooldown: 8 });
            else this.coach('overLineFree', null, 15);
        }
        if (A.ranRed && v < 0.3 && sig === 'green') A.ranRed = false;                  // дождался зелёного за линией
        this._inJunction(A, car);
    },

    // Проехал на красный: бампер пересёк линию на красный и центр машины въехал в перекрёсток.
    _inJunction(A, car) {
        if (!A.ranRed) return;
        const ax = -Roads.DX[A.port.d], ay = -Roads.DY[A.port.d];
        const lx = A.piece.x + Roads.DX[A.port.d] * this.STOP_LINE * Roads.T, ly = A.piece.y + Roads.DY[A.port.d] * this.STOP_LINE * Roads.T;
        const sc = (car.x - lx) * ax + (car.y - ly) * ay;
        if (sc > 120 && car.speed > 0.5) { A.ranRed = false; this.fault('redLight', { cooldown: 8 }); }
    },

    // --- Поворотник на перекрёстках ---------------------------------------------------------------

    _junctions(car) {
        const piece = Roads.pieceAt(car.x, car.y);
        if (piece === this.lastPiece) return;
        const prev = this.lastPiece;
        this.lastPiece = piece;
        if (this.junction && this.junction.piece !== piece) this._leaveJunction();
        void prev;
        if (piece && piece.ports.length >= 3 && piece.kind !== 'round') {
            const head = Math.atan2(car.vy, car.vx) || car.heading;
            const st = Roads.stateAt(car.x, car.y, head);
            const ind = (Game.time - this.indT < 3.5) ? this.indSide : 0;
            this.junction = { piece, port: st ? st.port : 0, ind };
        }
    },

    _leaveJunction() {
        const j = this.junction;
        this.junction = null;
        if (!j) return;
        const car = Game.car;
        const hx = Math.cos(car.heading), hy = Math.sin(car.heading);
        let out = -1, bs = -Infinity;
        j.piece.ports.forEach((p, k) => { const s = Roads.DX[p.d] * hx + Roads.DY[p.d] * hy; if (s > bs) { bs = s; out = k; } });
        if (out < 0 || out === j.port) return;
        const turn = Roads.turnOf(j.piece, j.port, out);
        const need = turn === 'left' ? -1 : turn === 'right' ? 1 : 0;
        if (!need) return;
        if (j.ind === need) { this.praise('praiseSignal', 60); return; }
        if (this.judging()) this.fault('noSignal', { cooldown: 3 });
        else this.coach('noSignalFree', null, 30);
    },

    // Подсказка поворотника по маршруту навигатора: за 35 м до поворота.
    _turnCoach(car) {
        if (typeof GameNav === 'undefined' || !GameNav.target || !GameNav.next) return;
        const n = GameNav.next;
        if (n.turn !== 'left' && n.turn !== 'right') return;
        const need = n.turn === 'left' ? -1 : 1;
        if (n.dist < 3800 && n.dist > 1200 && car.indicator !== need && car.indicator !== 2 && car.speed > 2) {
            if (this._signalCoachIdx !== n.idx) {
                this._signalCoachIdx = n.idx;
                this.coach('warnSignal', { dir: Lang.t(need < 0 ? 'nav.leftShort' : 'nav.rightShort') }, 0);
            }
        }
    },
    _signalCoachIdx: -1,

    // --- Пешеходы по курсу ---------------------------------------------------------------------------

    _peds(dt, car, c, s) {
        if (typeof GamePeds === 'undefined' || !GamePeds.list) return;
        const hl = car.P.hl * 100;
        const fx = car.x + c * hl, fy = car.y + s * hl;
        let nearest = Infinity;
        for (const p of GamePeds.list) {
            if (!(p.crossing || p.onRoad)) continue;
            const dx = p.x - fx, dy = p.y - fy;
            const along = dx * c + dy * s, lat = Math.abs(-dx * s + dy * c);
            if (along > -60 && along < 1800 && lat < 280) nearest = Math.min(nearest, along);
        }
        const v = car.speed;
        if (nearest === Infinity) { this.pedStopT = 0; return; }
        if (nearest < 1800 && v > 5) this.coach('warnPed', null, 6);
        if (nearest < 600 && v > 2.5) this.fault('zebra', { cooldown: 8 });
        if (v < 0.3) { this.pedStopT += dt; if (this.pedStopT > 0.8) { this.pedStopT = -60; this.praise('praisePed', 45); } }
    },

    // --- События машины -------------------------------------------------------------------------------

    event(ev) {
        if (Game.state !== 'drive') return;
        if (ev.type === 'hit') {
            const key = ev.mover || ev.col || 'x';
            const last = this.hits.get(key) || -9;
            this.hits.set(key, Game.time);
            if (this.hits.size > 40) this.hits.clear();
            if (Game.time - last < 1.5) return;                      // тот же забор/машина — уже засчитано
            const traffic = !!(ev.mover || (ev.col && ev.col.car));
            if (traffic) {
                if (ev.impact > 3.5) this.fault('crashBig', { cooldown: 3 });
                else if (ev.impact > 0.9) this.fault('crash', { cooldown: 3 });
                else this.coach('scrape', null, 5);
            } else if (ev.impact > 4.5) this.fault('crashBig', { cooldown: 3 });
            else if (ev.impact > 1.2) this.fault('crash', { cooldown: 3 });
            else this.coach('scrape', null, 5);
        } else if (ev.type === 'cone') this.fault('cone', { cooldown: 0.4 });
        else if (ev.type === 'pedHit') this.fault('pedestrian', { cooldown: 3 });
    },
};
