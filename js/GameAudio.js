// GameAudio.js — звук машины (мотор по оборотам, визг шин, ветер), гудок, поворотники, удары, радио
// (свои синтезированные треки: tools/music), музыка меню и экзамена, джинглы. Пути — литералами.

/** @satisfies {Record<string, any>} */
const GameAudio = {
    /** @type {any} */ game: null,
    /** @type {any} */ engine: null,
    /** @type {any} */ skid: null,
    /** @type {any} */ wind: null,
    station: 1,
    exam: false,
    lastTick: 0,
    track: '',

    STATIONS: [null, 'assets/sounds/music/radio_pop.ogg', 'assets/sounds/music/radio_synth.ogg', 'assets/sounds/music/radio_lofi.ogg'],
    STATION_KEYS: ['radio.off', 'radio.pop', 'radio.synth', 'radio.lofi'],

    init(game) {
        this.game = game;
        this.station = Number.isFinite(game.save.settings.radio) ? game.save.settings.radio : 1;
        Sound.preload(['assets/sounds/sfx/crash_1.ogg', 'assets/sounds/sfx/cone_1.ogg', 'assets/sounds/sfx/indicator_tick.ogg']);
    },

    vol(kind) { const s = this.game.save.settings; return kind === 'music' ? s.music : s.sfx; },

    // Мотор и шины — по состоянию машины; музыка — по экрану.
    frame(dt) {
        const g = this.game, car = g.car;
        if (!car) return;
        const sfx = this.vol('sfx');
        const driving = g.state === 'drive';
        if (!this.engine) {
            this.engine = car.def.stats.engine === 'v8' ? Sound.loop('assets/sounds/sfx/engine_sport_loop.ogg', { volume: 0 }) : Sound.loop('assets/sounds/sfx/engine_loop.ogg', { volume: 0 });
            this.engineKind = car.def.stats.engine;
            this.skid = Sound.loop('assets/sounds/sfx/skid_loop.ogg', { volume: 0 });
            this.wind = Sound.loop('assets/sounds/sfx/wind_loop.ogg', { volume: 0 });
        }
        if (this.engineKind !== car.def.stats.engine) { this.engine.stop(); this.engine = null; return; }
        const thr = Math.max(g.input.fwd, car.gear === 'R' ? g.input.back : 0);
        const rate = Math.max(0.55, Math.min(2.6, car.rpm / 2400));
        this.engine.set(sfx * (0.22 + thr * 0.3) * (driving ? 1 : 0.5), rate);
        this.skid.set(sfx * Math.min(0.55, car.slip * 0.7), 0.9 + car.slip * 0.2);
        this.wind.set(sfx * Math.min(0.35, Math.max(0, car.speed - 8) / 60), 0.8 + car.speed / 80);
        // Поворотник: тик-так.
        if (car.indicator !== 0 && driving) {
            const ph = Math.floor(car.indT * 2.6);
            if (ph !== this.lastTick) {
                this.lastTick = ph;
                if (ph % 2 === 0) Sound.play('assets/sounds/sfx/indicator_tick.ogg', { volume: 0.45 * sfx });
                else Sound.play('assets/sounds/sfx/indicator_tock.ogg', { volume: 0.4 * sfx });
            }
        }
        // Музыка: меню / экзамен / радио.
        let want = 'assets/sounds/music/menu.ogg';
        if (g.state === 'drive') want = this.exam ? 'assets/sounds/music/exam.ogg' : (this.STATIONS[this.station] || '');
        if (want !== this.track) {
            this.track = want;
            if (want) Sound.music(want, { volume: this.vol('music') * (g.state === 'drive' ? 0.7 : 1), fade: 1.2 });
            else Sound.stopMusic();
        }
    },

    applyVolumes() {
        const m = /** @type {any} */ (Sound)._music;
        if (m && m.gain && Sound.ctx) m.gain.gain.setTargetAtTime(this.vol('music') * (this.game.state === 'drive' ? 0.7 : 1), Sound.ctx.currentTime, 0.1);
    },

    nextStation() {
        this.station = (this.station + 1) % this.STATIONS.length;
        this.game.save.settings.radio = this.station;
        this.game.persist();
        this.sfx('camera');
        if (typeof GameUI !== 'undefined') GameUI.toast(Lang.t(this.STATION_KEYS[this.station]), 'info');
    },

    setExam(on) { this.exam = !!on; },

    jingle(kind) {
        const v = this.vol('music');
        Sound.duck(0.15, 0.2, kind === 'pass' ? 4.5 : 2.2, 1);
        if (kind === 'pass') Sound.play('assets/sounds/music/jingle_pass.ogg', { volume: v });
        else if (kind === 'fail') Sound.play('assets/sounds/music/jingle_fail.ogg', { volume: v });
        else Sound.play('assets/sounds/music/jingle_job.ogg', { volume: v });
    },

    sfx(name, opts) {
        const o = opts || {};
        const v = this.vol('sfx');
        switch (name) {
            case 'crash': Sound.play(['assets/sounds/sfx/crash_1.ogg', 'assets/sounds/sfx/crash_2.ogg', 'assets/sounds/sfx/crash_3.ogg'], { volume: v * (0.35 + 0.65 * (o.power || 0.5)) }); break;
            case 'cone': Sound.play(['assets/sounds/sfx/cone_1.ogg', 'assets/sounds/sfx/cone_2.ogg'], { volume: v * 0.8 }); break;
            case 'bump': Sound.play('assets/sounds/sfx/curb_bump.ogg', { volume: v * Math.min(0.8, 0.25 + (o.power || 0.3)) }); break;
            case 'shift': Sound.play('assets/sounds/sfx/gear_shift.ogg', { volume: v * 0.35 }); break;
            case 'indicator': Sound.play('assets/sounds/sfx/indicator_tick.ogg', { volume: v * 0.5 }); break;
            case 'camera': Sound.play('assets/sounds/sfx/camera_switch.ogg', { volume: v * 0.5 }); break;
            case 'horn': Sound.play('assets/sounds/sfx/horn.ogg', { volume: v * 0.8 }); break;
            case 'checkpoint': Sound.play('assets/sounds/sfx/checkpoint.ogg', { volume: v * 0.7 }); break;
            case 'cash': Sound.play('assets/sounds/sfx/cash.ogg', { volume: v * 0.8 }); break;
            case 'success': Sound.play('assets/sounds/sfx/success.ogg', { volume: v * 0.8 }); break;
            case 'fail': Sound.play('assets/sounds/sfx/fail_buzz.ogg', { volume: v * 0.7 }); break;
            case 'whistle': Sound.play('assets/sounds/sfx/whistle.ogg', { volume: v * 0.45 }); break;
            case 'notify': Sound.play('assets/sounds/sfx/notify.ogg', { volume: v * 0.6 }); break;
            case 'click': Sound.play('assets/sounds/sfx/ui_click.ogg', { volume: v * 0.6 }); break;
            case 'open': Sound.play('assets/sounds/sfx/ui_open.ogg', { volume: v * 0.6 }); break;
            case 'close': Sound.play('assets/sounds/sfx/ui_close.ogg', { volume: v * 0.6 }); break;
            case 'door': Sound.play('assets/sounds/sfx/door.ogg', { volume: v * 0.7 }); break;
            case 'trafficHorn': Sound.play(['assets/sounds/sfx/traffic_horn_1.ogg', 'assets/sounds/sfx/traffic_horn_2.ogg'], { volume: v * 0.4 * (o.near || 1) }); break;
        }
    },

    event(ev) {
        if (ev.type === 'horn') this.sfx('horn');
        else if (ev.type === 'trafficHorn' || ev.type === 'trafficHit') {
            const car = this.game.car;
            const d = car ? Math.hypot(ev.x - car.x, ev.y - car.y) : 0;
            if (d < 4000) this.sfx('trafficHorn', { near: Math.max(0.2, 1 - d / 4000) });
        } else if (ev.type === 'pedHit') this.sfx('crash', { power: 0.2 });
    },
};
