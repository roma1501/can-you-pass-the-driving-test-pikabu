// GameExam.js — экзамены на категории E → D → C → B → A → S. Этапы (упражнения автодрома и маршруты по городу)
// по маркерам карты; ошибки считает GameRules (мелкие — лимит, грубые — сразу «не сдал»), таймер, оценка
// «N / 15», звёзды, награда, новая категория.

/** @satisfies {Record<string, any>} */
const GameExam = {
    active: false,
    _praisedStep: false,
    lic: 0,                   // индекс сдаваемой категории в GAME_LICENSES
    /** @type {any[]} */ steps: [],
    idx: 0,
    time: 0,
    limit: 0,
    minors: 0,
    maxMinors: 8,
    /** @type {any[]} */ faults: [],
    failed: null,
    /** @type {any} */ st: null,       // состояние текущего этапа
    /** @type {any} */ restore: null,
    // «Вернуться к ошибке» за рекламу: снимки экзамена по ходу (начало этапа и каждые 3 с спокойной езды), при провале —
    // снимок за несколько секунд до ошибки. Один раз за попытку (правило площадок: восстановление — не чаще раза за попытку).
    /** @type {any[]} */ snaps: [],
    /** @type {any} */ resumeSnap: null,
    resumeUsed: false,
    lastFaultT: -99,
    _snapT: 3,
    _failReason: '',
    SNAP_EVERY: 3,            // с между снимками
    SNAP_BEFORE: 3,           // снимок не позже чем за столько секунд до провала
    SNAP_KEEP: 8,
    RESUME_EXTRA_TIME: 60,    // провал по времени — после возврата ещё столько секунд

    // Этапы экзаменов.
    PLANS: [
        [{ t: 'indicator', side: -1 }, { t: 'circuit', a: 1, b: 4 }, { t: 'slalom' }, { t: 'stop' }, { t: 'park', kind: 'park' }, { t: 'circuit', a: 5, b: 8 }, { t: 'return' }],
        [{ t: 'hill' }, { t: 'park', kind: 'ppark' }, { t: 'park', kind: 'garage', reverse: true }, { t: 'route', to: ['curb'], min: 2500, max: 11000 }, { t: 'return' }],
        [{ t: 'route', to: ['shop-pizza', 'shop-post', 'shop-bakery', 'shop-flowers', 'shop-cafe', 'shop-market'], min: 4000 }, { t: 'park', kind: 'valet', near: true }, { t: 'route', to: ['house'], min: 5000 }, { t: 'return' }],
        [{ t: 'route', to: ['house'], min: 14000 }, { t: 'route', to: ['curb'], min: 9000 }, { t: 'return' }],
        [{ t: 'route', to: ['school'], min: 0 }, { t: 'park', kind: 'valet', near: true }, { t: 'route', to: ['curb'], min: 8000 }, { t: 'return' }],
        [{ t: 'hill' }, { t: 'park', kind: 'ppark' }, { t: 'route', to: ['shop-pizza', 'shop-post', 'shop-bakery', 'shop-flowers', 'shop-cafe', 'shop-market'], min: 6000 },
            { t: 'park', kind: 'valet', near: true }, { t: 'route', to: ['house'], min: 12000 }, { t: 'return' }],
    ],

    canTake(lic) {
        const L = GAME_LICENSES[lic];
        return !!L && Game.save.license === lic && Game.save.xp >= L.xp;
    },

    start(lic) {
        const L = GAME_LICENSES[lic];
        if (!L) return false;
        if (typeof GameJobs !== 'undefined' && GameJobs.active) GameJobs.cancel(true);
        this.active = true;
        this.lic = lic;
        this.steps = this.PLANS[lic].map(s => Object.assign({}, s));
        this.idx = -1;
        this.time = 0;
        this.limit = L.time;
        this.minors = 0;
        this.maxMinors = L.minors;
        this.faults = [];
        this.failed = null;
        this.snaps = []; this.resumeSnap = null; this.resumeUsed = false; this.lastFaultT = -99; this._snapT = this.SNAP_EVERY;
        Game.toSchool();
        GameWorld.resetCones();
        GameRules.reset();
        GameWorld.setGateOpen(Game.save.license >= 1);
        this.restore = { density: 1 };
        this._env();
        GameInstructor.say('examStart', 'point', null, 0);
        this._next();
        return true;
    },

    // Обстановка экзамена: трафик, погода категории, режим игры, музыка.
    _env() {
        const lic = this.lic;
        if (typeof GameTraffic !== 'undefined' && GameTraffic.setDensity) GameTraffic.setDensity(lic === 3 || lic === 5 ? 1.7 : 1);
        if (lic === 4 || lic === 5) this._weather(lic === 4 ? 'night' : 'rain');
        if (typeof GameTraffic !== 'undefined' && GameTraffic.clearAround) GameTraffic.clearAround(Game.car.x, Game.car.y, 2500);
        Game.mode = 'exam';
        Game.state = 'drive';
        Platform.gameplay(true);
        if (typeof GameAudio !== 'undefined') GameAudio.setExam(true);
    },

    // Снимок для «вернуться к ошибке»: этап и его состояние, время, ошибки, место машины.
    _snap() {
        const car = Game.car;
        if (!car || !this.st) return;
        this.snaps.push({ idx: this.idx, time: this.time, minors: this.minors, nFaults: this.faults.length,
            st: Object.assign({}, this.st), x: car.x, y: car.y, heading: car.heading });
        if (this.snaps.length > this.SNAP_KEEP) this.snaps.splice(1, 1);   // первый (начало экзамена) не выкидываем
    },

    // Спокойное место для снимка: асфальт или площадка, не перекрёсток и не горка, без свежих ошибок и без заноса.
    _calm() {
        const car = Game.car;
        if (this.time - this.lastFaultT < this.SNAP_BEFORE) return false;
        const surf = Roads.surfaceAt(car.x, car.y);
        if (surf !== 'road' && surf !== 'lot') return false;
        const p = Roads.pieceAt(car.x, car.y);
        if (p && (p.kind === 'cross' || p.kind === 'tee' || p.kind === 'round')) return false;
        return Math.abs(car.omega) < 0.6 && car.slip < 0.3;
    },

    canResume() { return !!this.resumeSnap && !this.resumeUsed && !this.active; },

    // Вернуться к месту чуть раньше ошибки и продолжить ту же попытку (после досмотренной рекламы).
    resume() {
        const snap = this.resumeSnap;
        if (!this.canResume()) return false;
        this.resumeUsed = true;
        this.resumeSnap = null;
        this.active = true;
        this.failed = null;
        this.idx = snap.idx;
        this.time = snap.time;
        this.minors = snap.minors;
        this.faults = this.faults.slice(0, snap.nFaults);
        this.st = Object.assign({}, snap.st);
        if (this._failReason === 'timeout') this.limit = Math.max(this.limit, this.time + this.RESUME_EXTRA_TIME);
        this.snaps = [snap];
        this.lastFaultT = -99;
        this._snapT = this.SNAP_EVERY;
        GameRules.reset();
        if (this.steps.slice(this.idx).some(s => s.t === 'slalom')) GameWorld.resetCones();
        GameWorld.setGateOpen(Game.save.license >= 1 || this.steps.slice(0, this.idx + 1).some(s => s.t === 'route'));
        Game.teleport(snap.x, snap.y, snap.heading);
        this._env();
        GameNav.clear();
        if (this.st.nav) GameNav.set(Object.assign({}, this.st.nav));
        GameInstructor.say('examResume', 'calm', null, 0);
        return true;
    },

    // Цель навигатора этапа — запоминается в состоянии этапа (для возврата к ошибке).
    _nav(o) {
        this.st.nav = o;
        GameNav.set(Object.assign({}, o));
    },

    _weather(kind) {
        GameCar.weatherGrip = 0.78;
        GameCar.night = kind === 'night';
        if (typeof Sky3D !== 'undefined' && Sky3D.view) {
            try { if (kind === 'night') Sky3D.setHour(22); Sky3D.setWeather('rain'); } catch (e) { /* небо не готово */ }
        }
        GameInstructor.say(kind === 'night' ? 'night' : 'rain', 'calm', null, 0);
    },

    _clearWeather() {
        GameCar.weatherGrip = 1; GameCar.night = false;
        if (typeof Sky3D !== 'undefined' && Sky3D.view) { try { Sky3D.setWeather('clear'); Sky3D.setHour(13); } catch (e) { /* */ } }
    },

    // Метка этапа для списка.
    label(s) {
        const place = s.place ? Lang.t('place.' + s.place) : '';
        switch (s.t) {
            case 'indicator': return Lang.t('step.indicator');
            case 'circuit': return Lang.t('step.circuit', { a: s.a, b: s.b });
            case 'slalom': return Lang.t('step.slalom');
            case 'stop': return Lang.t('step.stop');
            case 'park': return Lang.t(s.kind === 'ppark' ? 'step.ppark' : s.kind === 'garage' ? 'step.garage' : s.kind === 'valet' ? 'step.valet' : 'step.park');
            case 'hill': return Lang.t('step.hill');
            case 'route': return Lang.t('step.route', { place: place || '…' });
            case 'return': return Lang.t('step.return');
        }
        return '';
    },

    view() {
        if (!this.active) return null;
        return {
            title: Lang.t('exam.title', { c: GAME_LICENSES[this.lic].id }),
            steps: this.steps.map((s, i) => ({ text: this.label(s), state: i < this.idx ? 'done' : i === this.idx ? 'active' : 'todo' })),
            time: Math.max(0, this.limit - this.time), minors: this.minors, maxMinors: this.maxMinors, stage: this.idx + 1, total: this.steps.length,
        };
    },

    marker(name) { return Game.app.location.marker(name); },
    markers(name) { return Game.app.location.markers(name); },

    _next() {
        if (this.idx >= 0 && !this._praisedStep) GameInstructor.speak('stepDone', 'happy', null, 1.5, 2);
        this._praisedStep = false;
        this.idx++;
        GameNav.clear();
        if (this.idx >= this.steps.length) { this._finish(true); return; }
        const s = this.steps[this.idx];
        this.st = { t: 0, phase: 0, hold: 0 };
        const car = Game.car;
        const R = Roads;
        switch (s.t) {
            case 'circuit': this.st.cp = s.a; this._aimGate('cp-' + s.a); break;
            case 'slalom': this.st.phase = 0; this._aimGate('slalom-in'); break;
            case 'stop': {
                const ramps = R.ramps;
                const lines = this.markers('stopline').filter(d => !ramps.some(q => R.inRect(q, d.x, d.y, 50)));
                this.st.q = lines.length ? R.rect(lines[0]) : null;
                if (this.st.q) this._nav({ x: this.st.q.x, y: this.st.q.y, direct: true, stop: false, radius: 60 });
                break;
            }
            case 'park': {
                let list = this.markers(s.kind);
                if (s.near) list = list.slice().sort((a, b) => Math.hypot(a.x - car.x, a.y - car.y) - Math.hypot(b.x - car.x, b.y - car.y)).slice(0, 3);
                const d = list.length ? list[Math.floor(Math.random() * list.length)] : null;
                this.st.q = d ? R.rect(d) : null;
                if (this.st.q) { this._nav({ x: this.st.q.x, y: this.st.q.y, rot: d.rot[1], direct: s.kind !== 'valet' ? true : false, stop: false, radius: 80 }); this.st.mark = d; }
                break;
            }
            case 'hill': {
                this.st.q = R.ramps[0] || null;
                if (this.st.q) this._nav({ x: this.st.q.x, y: this.st.q.y, direct: true, stop: false, radius: 60 });
                break;
            }
            case 'route': {
                const pool = [];
                for (const n of s.to) for (const d of this.markers(n)) pool.push({ d, place: n.indexOf('shop-') === 0 ? n : n });
                let cand = pool.filter(p => { const dist = Math.hypot(p.d.x - car.x, p.d.y - car.y); return dist >= (s.min || 0) && dist <= (s.max || 1e9); });
                if (!cand.length) cand = pool;
                const pick = cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
                if (pick) {
                    s.place = pick.place;
                    const q = R.rect(pick.d);
                    this.st.q = q;
                    this._nav({ x: q.x, y: q.y, rot: pick.d.rot[1], stop: true, radius: Math.max(320, q.hx + 120) });
                }
                if (Game.save.license >= 1 || this.lic >= 1) GameWorld.setGateOpen(true);
                break;
            }
            case 'return': {
                const sp = this.marker('spawn');
                if (sp) this._nav({ x: sp.x, y: sp.y, direct: true, stop: true, radius: 900, label: 'spawn' });
                break;
            }
        }
        if (s.t !== 'route' && s.t !== 'return' && !this.st.q && s.t !== 'indicator' && s.t !== 'circuit' && s.t !== 'slalom') {
            // нет маркера на карте — этап пропускается
            this._next();
            return;
        }
        GameInstructor.explainStep(s);
        this._snap();
    },

    _aimGate(name) {
        const d = this.marker(name);
        this.st.gate = d ? Roads.rect(d) : null;
        if (this.st.gate) this._nav({ x: d.x, y: d.y, direct: true, stop: false, radius: 1 });
    },

    _throughGate(q) { return !!q && !!Roads.inRect(q, Game.car.x, Game.car.y, 120); },

    // Все углы машины в прямоугольнике (с запасом pad).
    _inside(q, pad) {
        for (const c of Game.car.corners()) if (!Roads.inRect(q, c.x, c.y, pad)) return false;
        return true;
    },

    update(dt) {
        if (!this.active || this.failed !== null) return;
        this.time += dt;
        if (this.time > this.limit) { GameRules.fault('timeout', { major: true, cooldown: 0 }); return; }
        const s = this.steps[this.idx];
        if (!s) return;
        const st = this.st, car = Game.car;
        st.t += dt;
        switch (s.t) {
            case 'indicator':
                if (car.indicator === s.side || car.indicator === 2) this._next();
                break;
            case 'circuit':
                if (!st.gate) { this._next(); break; }
                if (this._throughGate(st.gate)) {
                    st.cp++;
                    if (st.cp > s.b) this._next();
                    else { Game._sfx('checkpoint'); this._aimGate('cp-' + st.cp); }
                }
                break;
            case 'slalom':
                if (!st.gate) { this._next(); break; }
                if (this._throughGate(st.gate)) {
                    if (st.phase === 0) { st.phase = 1; Game._sfx('checkpoint'); this._aimGate('slalom-out'); }
                    else this._next();
                }
                break;
            case 'stop': {
                const q = st.q;
                const fx = car.x + Math.cos(car.heading) * car.P.hl * 100, fy = car.y + Math.sin(car.heading) * car.P.hl * 100;
                const u = (fx - q.x) * q.c + (fy - q.y) * q.s;
                if (car.speed < 0.25 && u > -260 && u < 50 && Math.abs(-(fx - q.x) * q.s + (fy - q.y) * q.c) < q.hy + 150) {
                    st.hold += dt;
                    if (st.hold > 1.2) { this._praisedStep = GameInstructor.speak('praiseStop', 'happy', null, 0, 2); this._next(); }
                } else st.hold = 0;
                if (u > 220 && car.vLong > 0.5) { GameRules.fault('stopLine', { cooldown: 0 }); this._next(); }
                break;
            }
            case 'park': {
                const q = st.q;
                const inside = this._inside(q, s.kind === 'valet' ? 40 : 30);
                if (!st.entered && Roads.inRect(q, car.x, car.y)) { st.entered = true; st.enterGear = car.gear; }
                const aligned = Math.abs(Math.cos(car.heading - q.a)) > (s.kind === 'ppark' ? 0.95 : 0.93);
                if (inside && aligned && car.speed < 0.2) {
                    st.hold += dt;
                    if (st.hold > 1.3) {
                        if (s.reverse && st.enterGear !== 'R') GameRules.fault('garageDir', { cooldown: 0 });
                        else this._praisedStep = GameInstructor.speak('praisePark', 'happy', null, 0, 2);
                        this._next();
                    }
                } else st.hold = 0;
                break;
            }
            case 'hill': {
                const q = st.q;
                const r = Roads.rampAt(car.x, car.y);
                const u = r ? r.l.u : -1e9;
                const plateau = r && Math.abs(u) < q.hx * 0.2;
                if (st.phase === 0 && plateau && car.speed < 0.2) { st.hold += dt; if (st.hold > 1.5) { st.phase = 1; st.u0 = u; Game._sfx('checkpoint'); } }
                else if (st.phase === 0) st.hold = 0;
                if (st.phase === 1) {
                    if (r && u < st.u0 - 45 && !st.rolled) { st.rolled = true; GameRules.fault('rollback', { cooldown: 0 }); }
                    if (!r || u > q.hx * 0.45) this._next();
                }
                if (st.phase === 0 && !r && st.t > 5 && st.left) { GameRules.fault('stopLine', { cooldown: 0 }); this._next(); }
                if (r) st.left = true;
                break;
            }
            case 'route':
            case 'return':
                if (GameNav.arrived) this._next();
                break;
        }
        this._snapT -= dt;
        if (this._snapT <= 0 && this.active && this.failed === null) {
            this._snapT = this.SNAP_EVERY;
            if (this._calm()) this._snap();
        }
    },

    fault(f) {
        if (!this.active || this.failed !== null) return;
        this.lastFaultT = this.time;
        this.faults.push(f);
        if (f.major) { this._finish(false, f.code); return; }
        this.minors++;
        if (this.minors > this.maxMinors) this._finish(false, 'minors');
    },

    event(ev) { void ev; },

    _finish(ok, reason) {
        this.failed = ok ? false : (reason || 'fail');
        const score = Math.max(0, 15 - this.minors);
        const stars = ok ? (this.minors === 0 ? 3 : this.minors <= this.maxMinors / 2 ? 2 : 1) : 0;
        const L = GAME_LICENSES[this.lic];
        let money = 0, xp = 0;
        if (ok) {
            const bonus = stars === 3 ? 1.25 : 1;
            money = Math.round(L.reward * bonus); xp = Math.round(L.rewardXp * bonus);
            Game.save.license = Math.max(Game.save.license, this.lic + 1);
            Game.save.stats.exams++;
            Game.save.stars = Game.save.stars || {};
            Game.save.stars[L.id] = Math.max(Game.save.stars[L.id] || 0, stars);
            Game.addMoney(money); Game.addXp(xp);
            GameWorld.setGateOpen(true);
            GameInstructor.say('examPass', 'happy', null, 0);
        } else {
            Game.addXp(10);
            GameInstructor.say('examFail', 'angry', null, 0);
        }
        Game.persist();
        // провал: снимок за SNAP_BEFORE с до ошибки (раньше — самый поздний из ранних) — для «вернуться к ошибке»
        this.resumeSnap = null;
        this._failReason = ok ? '' : (reason || 'fail');
        if (!ok && !this.resumeUsed && this.snaps.length) {
            let pick = this.snaps[0];
            for (const sn of this.snaps) if (sn.time <= this.time - this.SNAP_BEFORE) pick = sn;
            this.resumeSnap = pick;
        }
        const result = { ok, score, stars, money, xp, lic: this.lic, reason, faults: this.faults.slice(), time: this.time, canResume: !!this.resumeSnap };
        this._end();
        if (typeof GameUI !== 'undefined') GameUI.examResult(result);
        if (typeof GameAudio !== 'undefined') GameAudio.jingle(ok ? 'pass' : 'fail');
        Platform.ads.roundEnded(ok);
        Game.scoreRound();
    },

    cancel() {
        if (!this.active) return;
        this._end();
        if (typeof GameUI !== 'undefined') GameUI.toast(Lang.t('exam.cancelled'), 'warn');
    },

    _end() {
        this.active = false;
        Game.mode = null;
        GameNav.clear();
        this._clearWeather();
        if (typeof GameTraffic !== 'undefined' && GameTraffic.setDensity) GameTraffic.setDensity(1);
        if (typeof GameAudio !== 'undefined') GameAudio.setExam(false);
        GameWorld.setGateOpen(Game.save.license >= 1);
    },
};
