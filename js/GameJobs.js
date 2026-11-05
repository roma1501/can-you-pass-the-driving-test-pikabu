// GameJobs.js — работы от инструктора: такси, доставка, хрупкий груз, парковщик, школьник, тест-драйв.
// Маршруты — по маркерам карты (curb, shop-*, house, kid, school, valet). Оплата: база + за км маршрута,
// множитель категории прав, качество езды (ошибки, плавность), чаевые.

/** @satisfies {Record<string, any>} */
const GameJobs = {
    active: false,
    /** @type {any} */ job: null,       // { def, legs: [...], leg, time, limit, faults, cargo, km, startX… }
    /** @type {any[]} */ offers: [],
    offerT: 0,

    SHOPS: ['shop-pizza', 'shop-post', 'shop-bakery', 'shop-flowers', 'shop-cafe', 'shop-market'],

    available() { return GAME_JOBS.filter(j => Game.save.license >= j.minLicense); },

    // Три предложения; обновляются раз в 90 с или после выполнения.
    refreshOffers(force) {
        if (!force && this.offers.length && this.offerT > 0) return this.offers;
        this.offerT = 90;
        const list = this.available();
        const out = [];
        const used = new Set();
        for (let k = 0; k < 3 && list.length; k++) {
            let def = list[Math.floor(Math.random() * list.length)];
            if (used.has(def.id) && list.length > used.size) def = list.find(j => !used.has(j.id)) || def;
            used.add(def.id);
            const plan = this._plan(def);
            if (plan) out.push(plan);
        }
        this.offers = out;
        return out;
    },

    _pick(names, from, minD, maxD) {
        const loc = Game.app.location;
        const pool = [];
        for (const n of names) for (const d of loc.markers(n)) pool.push({ d, place: n });
        let cand = pool.filter(p => { const dist = Math.hypot(p.d.x - from.x, p.d.y - from.y); return dist >= minD && dist <= maxD; });
        if (!cand.length) cand = pool;
        return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
    },

    // План работы: этапы-точки и оценка оплаты.
    _plan(def) {
        const car = Game.car;
        const here = { x: car.x, y: car.y };
        let legs = [];
        if (def.id === 'taxi') {
            const a = this._pick(['curb'], here, 1500, 12000), b = a && this._pick(['curb', 'house'], a.d, 6000, 30000);
            if (a && b) legs = [{ kind: 'pickup', m: a.d, place: 'curb' }, { kind: 'dropoff', m: b.d, place: b.place }];
        } else if (def.id === 'delivery' || def.id === 'fragile') {
            const a = this._pick(this.SHOPS, here, 1000, 20000), b = a && this._pick(['house', 'curb'], a.d, 5000, 26000);
            if (a && b) legs = [{ kind: 'load', m: a.d, place: a.place }, { kind: 'unload', m: b.d, place: b.place }];
        } else if (def.id === 'valet') {
            const a = this._pick(['valet'], here, 3000, 30000);
            if (a) legs = [{ kind: 'park', m: a.d, place: 'valet' }];
        } else if (def.id === 'school') {
            const a = this._pick(['kid'], here, 1500, 20000), b = a && this._pick(['school'], a.d, 0, 1e9);
            if (a && b) legs = [{ kind: 'pickup', m: a.d, place: 'kid', kid: true }, { kind: 'dropoff', m: b.d, place: 'school' }];
        } else if (def.id === 'testdrive') {
            const a = this._pick(['curb'], here, 4000, 15000), b = a && this._pick(['curb'], a.d, 4000, 15000), c = b && this._pick(['curb', 'house'], b.d, 4000, 15000);
            if (a && b && c) legs = [{ kind: 'route', m: a.d, place: 'curb' }, { kind: 'route', m: b.d, place: 'curb' }, { kind: 'route', m: c.d, place: c.place }];
        }
        if (!legs.length) return null;
        let km = 0, px = here.x, py = here.y;
        for (const l of legs) { km += Math.hypot(l.m.x - px, l.m.y - py) * 1.25 / 100000; px = l.m.x; py = l.m.y; }
        const mult = GAME_JOB_TIER_MULT[Math.min(GAME_JOB_TIER_MULT.length - 1, Game.save.license)] || 1;
        const pay = Math.round((def.pay + def.perKm * km) * mult / 5) * 5;
        const limit = Math.round(30 + km * 1000 / 9 * def.time);
        return { def, legs, km, pay, xp: Math.round(def.xp * (1 + km * 0.5)), limit };
    },

    start(plan) {
        if (!plan || (typeof GameExam !== 'undefined' && GameExam.active)) return;
        this.active = true;
        this.job = Object.assign({}, plan, { leg: -1, time: 0, faults: 0, cargo: 100, smooth: 0, wait: 0, done: false });
        Game.mode = 'job';
        GameInstructor.say('jobStart', 'point', null, 0);
        this.offers = this.offers.filter(o => o !== plan);
        this._nextLeg();
    },

    _nextLeg() {
        const j = this.job;
        j.leg++;
        j.wait = 0;
        if (j.leg >= j.legs.length) { this._finish(true); return; }
        const l = j.legs[j.leg];
        const q = Roads.rect(l.m);
        if (l.kind === 'park') GameNav.set({ x: q.x, y: q.y, rot: l.m.rot[1], stop: false, radius: 600 });
        else GameNav.set({ x: q.x, y: q.y, rot: l.m.rot[1], stop: true, radius: Math.max(330, q.hx + 130) });
        if (j.leg > 0) Game._sfx('checkpoint');
    },

    // Подпись этапа для HUD.
    stepText() {
        const j = this.job;
        if (!j) return '';
        const l = j.legs[j.leg];
        if (!l) return '';
        const place = Lang.t('place.' + l.place);
        if (j.wait > 0) return Lang.t(l.kind === 'pickup' ? 'jobstep.board' : l.kind === 'load' ? 'jobstep.load' : 'jobstep.unload');
        if (l.kind === 'park') return Lang.t('jobstep.park');
        if (l.kind === 'route') return Lang.t('jobstep.route', { n: j.leg + 1, m: j.legs.length });
        return Lang.t(l.kind === 'pickup' || l.kind === 'load' ? 'jobstep.pickup' : 'jobstep.dropoff', { place });
    },

    view() {
        const j = this.job;
        if (!this.active || !j) return null;
        return { icon: j.def.icon, title: Lang.t('job.' + j.def.id), step: this.stepText(), time: Math.max(0, j.limit - j.time),
            cargo: j.def.id === 'fragile' ? Math.round(j.cargo) : null, pay: j.pay, faults: j.faults };
    },

    update(dt) {
        this.offerT -= dt;
        if (!this.active) return;
        const j = this.job, car = Game.car;
        j.time += dt;
        if (j.time > j.limit) { this._finish(false, 'timeout'); return; }
        // Хрупкий груз: перегрузки бьют торт.
        if (j.def.id === 'fragile') {
            const g = Math.hypot(car.ax, car.ay);
            if (g > 5.5) j.cargo -= (g - 5.5) * dt * 9;
            if (j.cargo <= 0) { j.cargo = 0; this._finish(false, 'broken'); return; }
        }
        // Плавность для чаевых.
        j.smooth += Math.min(1, Math.hypot(car.ax, car.ay) / 8) * dt;
        const l = j.legs[j.leg];
        if (!l) return;
        if (l.kind === 'park') {
            const q = Roads.rect(l.m);
            let inside = true;
            for (const c of car.corners()) if (!Roads.inRect(q, c.x, c.y, 40)) { inside = false; break; }
            const aligned = Math.abs(Math.cos(car.heading - q.a)) > 0.93;
            if (inside && aligned && car.speed < 0.2) { j.wait += dt; if (j.wait > 1.2) this._nextLeg(); } else j.wait = 0;
            return;
        }
        if (GameNav.arrived && car.speed < 0.6) {
            if (l.kind === 'route') { this._nextLeg(); return; }
            if (!j.waitStarted) {
                j.waitStarted = true; j.wait = 0.01;
                if (l.kind === 'pickup' && typeof GamePeds !== 'undefined' && GamePeds.spawnPassenger) {
                    const side = this._curbSide(l.m);
                    j.pedOk = false;
                    GamePeds.spawnPassenger(side.x, side.y, () => this._doorPoint(), () => { j.pedOk = true; });
                }
                if (l.kind === 'dropoff' && typeof GamePeds !== 'undefined' && GamePeds.spawnLeaving) {
                    const d = this._doorPoint();
                    GamePeds.spawnLeaving(d.x, d.y, car.heading + Math.PI / 2);
                }
            }
            j.wait += dt;
            const need = l.kind === 'pickup' ? (j.pedOk === false ? 6 : 1.6) : 1.6;
            if (j.wait > need || (l.kind === 'pickup' && j.pedOk && j.wait > 0.8)) { j.waitStarted = false; this._nextLeg(); }
        } else if (j.waitStarted && car.speed > 1.5) { j.waitStarted = false; j.wait = 0; GameNav.arrived = false; }
    },

    _curbSide(m) {
        const q = Roads.rect(m);
        return { x: q.x - q.s * 380, y: q.y + q.c * 380 };
    },

    _doorPoint() {
        const car = Game.car;
        return { x: car.x - Math.sin(car.heading) * 150, y: car.y + Math.cos(car.heading) * 150 };
    },

    fault(f) {
        if (!this.active) return;
        const j = this.job;
        j.faults++;
        if (j.def.id === 'fragile' && (f.code === 'crash' || f.code === 'crashBig' || f.code === 'curb')) j.cargo -= f.code === 'crashBig' ? 60 : 25;
        if (j.def.id === 'testdrive' && f.major) this._finish(false, f.code);
    },

    event(ev) { void ev; },

    _finish(ok, reason) {
        const j = this.job;
        this.active = false;
        Game.mode = null;
        GameNav.clear();
        if (ok) {
            const quality = Math.max(0.3, 1 - j.faults * 0.15);
            const tip = j.def.id === 'taxi' || j.def.id === 'fragile' ? Math.round(j.pay * 0.3 * Math.max(0, 1 - j.smooth / Math.max(1, j.time) * 3)) : 0;
            const timeBonus = j.time < j.limit * 0.6 ? Math.round(j.pay * 0.1) : 0;
            const money = Math.round(j.pay * quality) + tip + timeBonus;
            const xp = Math.round(j.xp * quality);
            Game.addMoney(money); Game.addXp(xp);
            Game.save.stats.jobs++;
            GameInstructor.say('jobDone', 'happy', null, 0);
            if (typeof GameUI !== 'undefined') GameUI.jobResult({ ok, money, xp, tip, def: j.def });
            if (typeof GameAudio !== 'undefined') GameAudio.jingle('job');
        } else {
            GameInstructor.say('jobFail', 'angry', null, 0);
            if (typeof GameUI !== 'undefined') GameUI.jobResult({ ok, reason, def: j.def });
            if (typeof GameAudio !== 'undefined') GameAudio.jingle('fail');
        }
        this.job = null;
        this.refreshOffers(true);
        Game.persist();
        Platform.ads.roundEnded(ok);        // работа — тоже раунд: счёт рекламы (web/Яндекс) и итог площадке
        Game.scoreRound();
    },

    cancel(silent) {
        if (!this.active) return;
        this.active = false;
        this.job = null;
        Game.mode = null;
        GameNav.clear();
        if (!silent && typeof GameUI !== 'undefined') GameUI.toast(Lang.t('job.failed'), 'warn');
    },
};
