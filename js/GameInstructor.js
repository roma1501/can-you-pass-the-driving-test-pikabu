// GameInstructor.js — инструктор на пассажирском сиденье.
//
// РЕЧЬ — очередь с приоритетами, чтобы реплики не перебивали друг друга и ничего важного не терялось:
//   3 КРИТИЧНО  — грубая ошибка, опасность (перебивает всё, что звучит дольше 0.4 с);
//   2 ВАЖНО     — мелкая ошибка, предупреждение, подсказка навигатора, этап экзамена (ждёт своей очереди);
//   1 ПОХВАЛА   — правильное действие (только если инструктор молчит);
//   0 БОЛТОВНЯ  — в тишине, не на экзамене.
// Каждая реплика держится на экране не меньше MIN_SHOW с; очередь — не больше двух, устаревшее выбрасывается.
// Повтор одного ключа — не чаще его cooldown.
// РЕАКЦИЯ — вместе с репликой: лицо (Face_*), клип рига (показывает, злится, хлопает по лбу, радуется), свисток при
// критичном. Портрет и субтитр в HUD — GameUI.say.

/** @satisfies {Record<string, any>} */
const GameInstructor = {
    /** @type {any} */ rig: null,
    /** @type {any} */ driver: null,
    mood: 'calm',
    moodT: 0,
    chatterT: 25,
    idleT: 0,
    hornT: 0, hornN: 0,
    driftT: 0,
    brakeT: 0,
    /** @type {Record<string, number>} */ cool: {},
    lastSay: -99,
    /** @type {any} */ cur: null,          // { key, text, mood, prio, t, dur }
    /** @type {any[]} */ queue: [],

    MIN_SHOW: 1.6,
    FACES: ['Face_calm', 'Face_happy', 'Face_angry', 'Face_shock'],
    CLIP: { calm: 'sit_clipboard', happy: 'sit_cheer', angry: 'sit_angry', shock: 'sit_facepalm', point: 'sit_point', idle: 'sit_idle' },

    attach(rig, driver) {
        this.rig = rig; this.driver = driver;
        this.cur = null; this.queue.length = 0;
        this.setMood('calm', 0);
    },

    _face(rig, name, all) {
        if (!rig || !rig.setPartVisible) return;
        for (const f of all) { try { rig.setPartVisible(f, f === name); } catch (e) { /* нет части */ } }
    },

    setMood(mood, hold) {
        if (this.mood === mood && hold === undefined) return;
        this.mood = mood;
        this.moodT = hold === undefined ? 3.5 : hold;
        const face = { happy: 'Face_happy', angry: 'Face_angry', shock: 'Face_shock' }[mood] || 'Face_calm';
        this._face(this.rig, face, this.FACES);
        if (this.rig && this.rig.play) this.rig.play(this.CLIP[mood] || 'sit_clipboard', { fade: 0.25 });
        if (this.driver) {
            const d = { angry: 'Face_scared', shock: 'Face_shock', happy: 'Face_happy' }[mood] || 'Face_calm';
            this._face(this.driver, d, ['Face_calm', 'Face_happy', 'Face_shock', 'Face_scared']);
        }
    },

    // Общий вход: ключ реплики (GameLang.lines), настроение, подстановки, cooldown ключа, приоритет.
    speak(key, mood, params, cooldown, prio) {
        const now = Game.time;
        const cd = cooldown === undefined ? 5 : cooldown;
        if (this.cool[key] && now < this.cool[key]) return false;
        const text = GameLang.line(key, params);
        if (!text) return false;
        const p = prio === undefined ? 2 : prio;
        const item = { key, text, mood: mood || 'calm', prio: p, t: now, dur: Math.min(6.5, Math.max(this.MIN_SHOW + 0.6, 1.4 + text.length * 0.05)) };
        const cur = this.cur;
        const busy = cur && now - cur.t < cur.dur;
        if (!busy || (p >= 3 && p > cur.prio && now - cur.t > 0.4) || (p > cur.prio && now - cur.t > this.MIN_SHOW)) {
            this.cool[key] = now + cd;
            this._show(item);
            return true;
        }
        if (p <= 1) return false;                                   // похвала и болтовня не ждут
        this.cool[key] = now + cd;
        const same = this.queue.findIndex(q => q.key === key);
        if (same >= 0) this.queue[same] = item; else this.queue.push(item);
        this.queue.sort((a, b) => b.prio - a.prio || a.t - b.t);
        if (this.queue.length > 2) this.queue.length = 2;
        return true;
    },

    _show(item) {
        this.cur = item;
        this.lastSay = Game.time;
        this.setMood(item.mood);
        if (typeof GameUI !== 'undefined') GameUI.say(item.text, item.mood, item.dur);
        if (item.prio >= 3) Game._sfx('whistle');
    },

    // Совместимость: прежний вызов say(key, mood, params, cooldown) — важная реплика.
    say(key, mood, params, cooldown) {
        const prio = (mood === 'shock') ? 3 : 2;
        return this.speak(key, mood, params, cooldown, prio);
    },

    coach(key, params, cooldown) { return this.speak(key, 'point', params, cooldown === undefined ? 8 : cooldown, 2); },
    praise(key, cooldown) { return this.speak(key, 'happy', null, cooldown === undefined ? 30 : cooldown, 1); },

    greet() { this.speak('greet', 'happy', null, 0, 2); },

    // Реакция на ошибку: грубая — критично (шок/злость), мелкая — важно.
    onFault(f) {
        const map = {
            speed: ['speed', 'angry'], speedBig: ['speedBig', 'shock'], redLight: ['redLight', 'shock'], overLine: ['overLine', 'angry'],
            curb: ['curb', 'angry'], grass: ['grass', 'angry'], island: ['island', 'angry'], wrongLane: ['wrongLane', 'shock'],
            crash: ['crash', 'angry'], crashBig: ['crashBig', 'shock'], pedestrian: ['pedestrian', 'shock'], zebra: ['zebra', 'angry'],
            cone: ['cone', 'angry'], noSignal: ['noSignal', 'point'], rollback: ['rollback', 'angry'], stopLine: ['stopLineMiss', 'angry'],
            timeout: ['timeout', 'angry'], garageDir: ['garageDir', 'angry'],
        };
        const m = map[f.code];
        if (!m) return;
        this.speak(m[0], m[1], { n: GameRules.limit }, 2, f.major ? 3 : 2);
    },

    // Объяснение этапа экзамена при его начале.
    explainStep(step) {
        const key = { indicator: 'stepIndicator', circuit: 'stepCircuit', slalom: 'stepSlalom', stop: 'stepStop', hill: 'stepHill', route: 'stepRoute', return: 'stepReturn' }[step.t]
            || (step.t === 'park' ? ({ ppark: 'stepPpark', garage: 'stepGarage', valet: 'stepValet' }[step.kind] || 'stepPark') : null);
        if (key) this.speak(key, 'point', { place: step.place ? Lang.t('place.' + step.place) : '' }, 0, 2);
    },

    event(ev) {
        if (Game.state !== 'drive') return;
        if (ev.type === 'horn') {
            this.hornN++; this.hornT = 3;
            if (this.hornN >= 3) { this.speak('horn', 'angry', null, 10, 2); this.hornN = 0; }
        }
    },

    update(dt) {
        const now = Game.time;
        // Очередь: следующая реплика, когда текущая отзвучала; ждавшие дольше 6 с — уже не к месту, выбрасываются.
        if (this.queue.length && (!this.cur || now - this.cur.t >= Math.max(this.MIN_SHOW, this.cur.dur))) {
            while (this.queue.length && now - this.queue[0].t > 6) this.queue.shift();
            const next = this.queue.shift();
            if (next) this._show(next);
        }
        if (this.moodT > 0) { this.moodT -= dt; if (this.moodT <= 0 && this.mood !== 'idle') this.setMood('idle', 0); }
        if (this.hornT > 0) { this.hornT -= dt; if (this.hornT <= 0) this.hornN = 0; }
        const car = Game.car;
        if (!car || Game.state !== 'drive' || Pause.active) return;
        // Занос / ручник на скорости.
        if ((car.slip > 0.55 || (car.handbrake && car.speed > 6)) && car.speed > 5) { this.driftT += dt; if (this.driftT > 0.6) { this.speak('drift', 'angry', null, 12, 2); this.driftT = 0; } }
        else this.driftT = 0;
        // Резкое торможение (не экстренное перед пешеходом/красным — там инструктор сам просил).
        if (car.ax < -7.5 && car.speed > 4) { this.brakeT += dt; if (this.brakeT > 0.2) { this.speak('hardBrake', 'shock', null, 15, 1); this.brakeT = 0; } } else this.brakeT = 0;
        // Простой.
        if (car.speed < 0.3) { this.idleT += dt; if (this.idleT > 35) { this.speak('idle', 'point', null, 40, 1); this.idleT = 0; } } else this.idleT = 0;
        // Болтовня в тишине (не на экзамене).
        this.chatterT -= dt;
        if (this.chatterT <= 0) {
            this.chatterT = 50 + Math.random() * 40;
            const busy = typeof GameExam !== 'undefined' && GameExam.active;
            if (!busy && now - this.lastSay > 20 && car.speed > 2) this.speak('chatter', 'calm', null, 0, 0);
        }
    },
};
