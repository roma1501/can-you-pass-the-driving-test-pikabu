// Game.js — поток игры «Can You Pass The Driving Test?»: загрузка сохранения, сборка мира (дороги, коллизии, светофоры,
// трафик, пешеходы), машина игрока с инструктором, камера «за машиной», ввод, экзамены, работы, магазин.
// Модули игры: GameData, GameRoads (Roads), GameWorld (+GameGfx), GameCar, GameSignals, GameTraffic,
// GamePeds, GameNav, GameRules, GameInstructor, GameExam, GameJobs, GameAudio, GameUI.

// Сборка playgama (GAME_PLATFORM ставит build.bat): прогресс и настройки — только через Bridge storage (требование 3.2.1
// и шаг 4 Bridge). Движок кое-что пишет в Store сам (выбор графики, звук) — здесь Store живёт в памяти вкладки, а всё,
// что нужно сохранить, лежит в сохранении игры (Platform.save). Код выполняется до main.js — раньше Quality.init и Sound.init.
const GAME_IS_PLAYGAMA = typeof GAME_PLATFORM !== 'undefined' && String(GAME_PLATFORM) === 'playgama';
if (GAME_IS_PLAYGAMA) {
    const mem = new Map();
    Store.get = (key) => (mem.has(key) ? mem.get(key) : null);
    Store.set = (key, value) => { mem.set(key, String(value)); return true; };
    Store.remove = (key) => { mem.delete(key); };
}

/** @satisfies {Record<string, any>} */
const Game = {
    /** @type {LoryApp | null} */
    app: null,
    /** @type {any} */ save: null,
    /** @type {GameCar | null} */ car: null,
    state: 'boot',              // boot | menu | drive
    mode: null,                 // null | 'exam' | 'job'
    camMode: 0,                 // 0 — за машиной, 1 — дальше
    camAz: 0, camLook: 0, camLookT: 0, camDist: 1,
    camFollow: { x: 0, y: 0, h: 0 },
    input: { fwd: 0, back: 0, steer: 0, handbrake: false },
    time: 0,
    saveTimer: 0,
    _hitFx: -1,
    loadOk: true,

    async firstMap() { return /[?&]devmap/.test(location.search) ? 'dev' : 'world'; },

    async init(app) {
        this.app = app;
        let raw = null;
        try { raw = await Platform.load(); this.loadOk = true; }
        catch (e) { raw = null; this.loadOk = false; }
        const s = this.save = this._sanitize(raw);
        // Ушли со вкладки или закрыли страницу — сохранить сразу (на телефоне вкладку могут выгрузить без предупреждения).
        const flush = () => this.persist(true);
        window.addEventListener('pagehide', flush);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
        await this._initWorld(app, s);
    },

    // Проверка загруженного: битые или старые поля не ломают игру, массив стартовых машин — своя копия.
    _sanitize(raw) {
        const s = Object.assign({}, GAME_START, raw && typeof raw === 'object' ? raw : {});
        const num = (v, d, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
        s.money = num(s.money, GAME_START.money, 0, 1e9);
        s.xp = num(s.xp, GAME_START.xp, 0, 1e9);
        s.license = Math.round(num(s.license, 0, 0, GAME_LICENSES.length));
        s.owned = Array.isArray(s.owned) ? s.owned.filter(id => GAME_CARS.some(c => c.id === id)) : [];
        if (!s.owned.includes('learner')) s.owned.unshift('learner');
        if (!s.owned.includes(s.car)) s.car = 'learner';
        const st0 = s.settings || {};
        s.settings = Object.assign({ music: 0.6, sfx: 0.8, radio: 1, quality: 'auto', hints: true, muted: false }, st0);
        s.settings.muted = st0.muted === true;
        if (!['auto', 'low', 'medium', 'high'].includes(s.settings.quality)) s.settings.quality = 'auto';
        s.settings.music = num(st0.music, 0.6, 0, 1);
        s.settings.sfx = num(st0.sfx, 0.8, 0, 1);
        s.settings.radio = Math.round(num(st0.radio, 1, 0, 3));
        s.stats = Object.assign({ km: 0, exams: 0, jobs: 0, fines: 0 }, s.stats || {});
        if (!s.stars || typeof s.stars !== 'object') s.stars = {};
        // просмотры рекламы за машины: { id: сколько уже посмотрено }
        const ac = s.adCars && typeof s.adCars === 'object' ? s.adCars : {};
        s.adCars = {};
        for (const id in GAME_ADS.car) { const v = Math.round(num(ac[id], 0, 0, GAME_ADS.car[id])); if (v > 0) s.adCars[id] = v; }
        return s;
    },

    // Итог раунда (экзамен, работа) — в лидерборд «Рекорды»: всего очков. Playgama — без лидерборда (не заявлен).
    scoreRound() {
        if (!GAME_IS_PLAYGAMA) Platform.submitScore(this.save.xp);
    },

    // Игрок вошёл в аккаунт: облако могло прийти с другим прогрессом. Там больше — берём облако, иначе пишем своё.
    async afterLogin() {
        let raw = null;
        try { raw = await Platform.load(); this.loadOk = true; } catch (e) { return; }
        const cur = this.save, cloud = raw && typeof raw === 'object' ? raw : null;
        const better = cloud && ((Number(cloud.license) || 0) > cur.license || ((Number(cloud.license) || 0) === cur.license && (Number(cloud.xp) || 0) > cur.xp));
        if (!better) { this.persist(true); this.scoreRound(); return; }
        this.save = this._sanitize(cloud);
        if (typeof Sound !== 'undefined' && Sound.muted !== this.save.settings.muted) Sound.setMuted(this.save.settings.muted);
        if (this.car && this.car.def.id !== this.save.car) await this.spawnCar(this.save.car, false);
        GameWorld.setGateOpen(this.save.license >= 1);
        if (typeof GameUI !== 'undefined') { GameUI.refreshStats(); if (this.state === 'menu') GameUI.showMenu(); }
    },

    // Мир, машина, трафик, интерфейс — после загрузки сохранения (init).
    async _initWorld(app, s) {
        if (typeof GameLang !== 'undefined') GameLang.install();
        // Звук и графика — из сохранения игры (на Playgama Store не переживает перезагрузку).
        if (typeof Sound !== 'undefined' && Sound.muted !== s.settings.muted) Sound.setMuted(s.settings.muted);
        if (typeof Quality !== 'undefined' && s.settings.quality !== 'auto' && Quality.choice !== s.settings.quality) Quality.set(/** @type {any} */ (s.settings.quality));
        Roads.build(app.location);
        await GameWorld.build(app);
        if (typeof GameSignals !== 'undefined') await GameSignals.build(app);
        if (typeof GameDecor !== 'undefined') GameDecor.init(app);
        if (typeof Sky3D !== 'undefined') {
            // День по умолчанию (время стоит); ночь и дождь включают экзамены A и S.
            Sky3D.init(app.location.view, { fx: app.fx });
            Sky3D.frozen = true;
            Sky3D.setHour(13);
            app.onUpdate(dt => Sky3D.update(dt));
        }
        this._setupCamera(app);
        this._setupInput(app);
        await this.spawnCar(s.car, true);
        if (typeof GameTraffic !== 'undefined') await GameTraffic.init(app);
        if (typeof GamePeds !== 'undefined') await GamePeds.init(app);
        if (typeof GamePeds !== 'undefined') /** @type {any} */ (GamePeds).driveRig = false;   // риги обновляет Game.tick
        if (typeof GameAudio !== 'undefined') GameAudio.init(this);
        if (typeof GameCarFx !== 'undefined') GameCarFx.init(app);
        if (typeof GameUI !== 'undefined') GameUI.init(this);
        GameWorld.setGateOpen(s.license >= 1);
        app.onUpdate(dt => this.tick(dt));
        app.onFrame(dt => this.frame(dt));
        window.addEventListener('lory-release-input', () => { this.input.fwd = this.input.back = this.input.steer = 0; this.input.handbrake = false; });
    },

    async ready() {
        this.state = 'menu';
        if (typeof GameUI !== 'undefined') GameUI.showMenu();
        Platform.gameplay(false);
    },

    // --- Сохранение -------------------------------------------------------------------------

    // Записать сохранение. Заодно — где стоит машина (кроме экзамена: там игрока ставят на старт сами).
    /** @param {boolean} [now] записать сразу (уход со страницы), без слияния */
    persist(now) {
        if (!this.loadOk) return;
        const c = this.car;
        if (c && this.state === 'drive' && !(typeof GameExam !== 'undefined' && GameExam.active)) {
            this.save.pos = { x: Math.round(c.x), y: Math.round(c.y), a: Math.round(c.heading * 1000) / 1000 };
        }
        // Playgama: Bridge storage пишется одним вызовом и не на каждое действие — изменения подряд (награда: деньги,
        // опыт, итог экзамена) сливаются в одну запись через 1.5 с. Уход со страницы пишет сразу.
        if (GAME_IS_PLAYGAMA && !now) {
            if (!this._saveT) this._saveT = setTimeout(() => { this._saveT = 0; this.persist(true); }, 1500);
            return;
        }
        if (this._saveT) { clearTimeout(this._saveT); this._saveT = 0; }
        try { Platform.save(this.save); } catch (e) { console.warn('save', e); }
    },
    _saveT: 0,

    // Место из сохранения: только после первых прав (до них — автодром) и только на дороге или площадке.
    _savedPos() {
        const p = this.save.pos;
        if (!p || this.save.license < 1 || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.a)) return null;
        const loc = this.app.location;
        if (p.x < 0 || p.y < 0 || p.x > loc.width || p.y > loc.height) return null;
        const surf = Roads.surfaceAt(p.x, p.y);
        return surf === 'road' || surf === 'lot' ? p : null;
    },

    addMoney(n) { this.save.money = Math.max(0, Math.round(this.save.money + n)); this.persist(); if (typeof GameUI !== 'undefined') GameUI.refreshStats(); },
    addXp(n) { this.save.xp = Math.max(0, Math.round(this.save.xp + n)); this.persist(); if (typeof GameUI !== 'undefined') GameUI.refreshStats(); },

    carDef(id) { return GAME_CARS.find(c => c.id === id) || GAME_CARS[0]; },
    carGeom(id) { return (typeof GAME_CAR_GEOMETRY !== 'undefined' && GAME_CAR_GEOMETRY[id]) || GAME_CAR_DEFAULT_GEOMETRY; },

    // --- Машина -------------------------------------------------------------------------------

    async spawnCar(id, atSpawn) {
        const app = this.app;
        let x, y, a;
        const saved = atSpawn && !this.car ? this._savedPos() : null;
        if (this.car && !atSpawn) { x = this.car.x; y = this.car.y; a = this.car.heading; }
        else if (saved) { x = saved.x; y = saved.y; a = saved.a; }
        else {
            const sp = app.location.marker('spawn');
            x = sp ? sp.x : app.location.width / 2; y = sp ? sp.y : app.location.height / 2;
            a = sp ? (sp.rot[1] || 0) * Math.PI / 180 : 0;
        }
        if (this.car) this.car.dispose();
        const car = new GameCar(this.carDef(id), this.carGeom(id));
        this.car = car;
        await car.buildView(app.location.view);
        car.place(x, y, a);
        const g = car.geom;
        car.driver = await car.seat('assets/models/people/driver.glb', g.seats.driver, 'sit');
        car.instructor = await car.seat('assets/models/people/instructor.glb', g.seats.passenger, 'sit_idle');
        if (typeof GameInstructor !== 'undefined') GameInstructor.attach(car.instructor, car.driver);
        this.camAz = a;
        this._cameraFrame(0, true);
        if (app.camera) app.camera.snap();
        return car;
    },

    // Вернуть машину на стоянку автошколы (или к точке).
    teleport(x, y, heading) {
        const c = this.car;
        if (!c) return;
        c.place(x, y, heading);
        this.camAz = heading;
        this._cameraFrame(0, true);
        if (this.app.camera) this.app.camera.snap();
    },

    toSchool() {
        const sp = this.app.location.marker('spawn');
        if (sp) this.teleport(sp.x, sp.y, (sp.rot[1] || 0) * Math.PI / 180);
    },

    // --- Ввод ---------------------------------------------------------------------------------

    _setupInput(app) {
        Input.init({
            app, mouse: 'drag', controls: false,
            actions: {
                forward: { keys: ['KeyW', 'ArrowUp'], pad: [7, 12] },
                back: { keys: ['KeyS', 'ArrowDown'], pad: [6, 13] },
                left: { keys: ['KeyA', 'ArrowLeft'], pad: [14] },
                right: { keys: ['KeyD', 'ArrowRight'], pad: [15] },
                handbrake: { keys: ['Space'], pad: [0] },
                indLeft: { keys: ['KeyQ'], pad: [4] },
                indRight: { keys: ['KeyE'], pad: [5] },
                hazard: { keys: ['KeyX'], pad: [] },
                horn: { keys: ['KeyH'], pad: [3] },
                camera: { keys: ['KeyC'], pad: [8] },
                radio: { keys: ['KeyR'], pad: [] },
                jobs: { keys: ['KeyJ'], pad: [2] },
                map: { keys: ['KeyM'], pad: [] },
                interact: { keys: ['KeyF'], pad: [1] },
                // Playgama: Esc занят браузером (выход из полного экрана, требование 1.5.2) — пауза только на P
                pause: { keys: GAME_IS_PLAYGAMA ? ['KeyP'] : ['Escape', 'KeyP'], pad: [9] },
            },
        });
        Input.configure({ controls: false });
    },

    _readInput(dt) {
        const inp = this.input;
        const m = Input.move();
        const kFwd = Input.down('forward') ? 1 : 0, kBack = Input.down('back') ? 1 : 0;
        let steer = 0;
        if (Input.down('left')) steer -= 1;
        if (Input.down('right')) steer += 1;
        if (!steer && Math.abs(m.x) > 0.15) steer = m.x;
        // Клавиатура: газ и тормоз нарастают плавно (педаль), руль — сразу (сглаживает сама машина).
        const tf = Math.max(kFwd, m.y > 0.2 ? m.y : 0), tb = Math.max(kBack, m.y < -0.2 ? -m.y : 0);
        inp.fwd += (tf - inp.fwd) * Math.min(1, dt * (tf > inp.fwd ? 5 : 12));
        inp.back += (tb - inp.back) * Math.min(1, dt * (tb > inp.back ? 7 : 12));
        if (tf === 0 && inp.fwd < 0.02) inp.fwd = 0;
        if (tb === 0 && inp.back < 0.02) inp.back = 0;
        inp.steer = steer;
        inp.handbrake = Input.down('handbrake');
        const car = this.car;
        if (Input.pressed('indLeft')) { car.indicator = car.indicator === -1 ? 0 : -1; car.indT = 0; this._sfx('indicator'); }
        if (Input.pressed('indRight')) { car.indicator = car.indicator === 1 ? 0 : 1; car.indT = 0; this._sfx('indicator'); }
        if (Input.pressed('hazard')) { car.indicator = car.indicator === 2 ? 0 : 2; car.indT = 0; }
        if (Input.pressed('camera')) { this.camMode = (this.camMode + 1) % 2; this._sfx('camera'); }
        if (Input.pressed('horn')) this._event({ type: 'horn' });
        if (Input.pressed('radio') && typeof GameAudio !== 'undefined') GameAudio.nextStation();
        if (Input.pressed('jobs') && typeof GameUI !== 'undefined') GameUI.toggleJobs();
        if (Input.pressed('map') && typeof GameUI !== 'undefined') GameUI.toggleBigMap();
        if (Input.pressed('pause') && typeof GameUI !== 'undefined') GameUI.openPause();
        if (Input.pressed('interact')) this.interact();
        // Поворотник гаснет после завершённого поворота (как в жизни).
        if (car.indicator === -1 || car.indicator === 1) {
            car._indTurn = (car._indTurn || 0) + car.omega * dt * car.indicator;
            if (car._indTurn > 0.9 && Math.abs(car.steer) < 0.05) { car.indicator = 0; car._indTurn = 0; }
        } else car._indTurn = 0;
        // Взгляд мышью (ПКМ) / свайпом — оглядеться, камера возвращается сама.
        const look = Input.consumeLook();
        if (look.dx) { this.camLook = Math.max(-2.6, Math.min(2.6, this.camLook + look.dx * 0.006)); this.camLookT = 1.2; }
        const wheel = Input.consumeWheel();
        if (wheel) this.camDist = Math.max(0.6, Math.min(1.8, this.camDist * (wheel > 0 ? 1.08 : 0.93)));
    },

    _sfx(name, opts) { if (typeof GameAudio !== 'undefined') GameAudio.sfx(name, opts); },

    // Контекстное действие (F): у школы — экзамен, у автосалона — магазин, иначе шутка про выход.
    interact() {
        if (typeof GameUI !== 'undefined' && GameUI.contextAction) { GameUI.contextAction(); return; }
        if (typeof GameInstructor !== 'undefined') GameInstructor.say('exitNo', 'angry');
    },

    // --- Камера -------------------------------------------------------------------------------

    _setupCamera(app) {
        const cam = app.camera;
        if (!cam) return;
        // Камера «за машиной»: свои настройки поверх констант движка (их не трогаем — по ним проверяется сам движок).
        Object.assign(cam.c, { zoomMin: 0.05, zoomMax: 60, zoomLerp: 1, followLerp: 1, orbit: 0, pitchMin: 1, edgeGuard: 0, collide: 1, fade: 1 });
        cam.follow(this.camFollow);
        cam.detach();   // мышь и колесо камере движка не отдаём: панорама средней кнопкой, щипок и т.п. выключены — камерой правит игра
        if (cam.sight) {
            cam.sight.query = (from, to) => this._camRay(from, to);
            cam.sight.fadeFilter = rec => !!(rec.def && rec.def.model && /\/(nature|suburban)\//.test(rec.def.model));
        }
    },

    // Луч камеры по коллизиям мира (2D, высокие препятствия): расстояние от from до препятствия или null.
    _camRay(from, to) {
        const dx = to.x - from.x, dz = to.z - from.z;
        const len = Math.hypot(dx, dz);
        if (len < 1) return null;
        const steps = Math.ceil(len / 40);
        const list = GameWorld.near((from.x + to.x) / 2, (from.z + to.z) / 2, len / 2 + 60, this._camNear || (this._camNear = []));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps, x = from.x + dx * t, z = from.z + dz * t, y = from.y + (to.y - from.y) * t;
            for (const c of list) {
                if ((c.h || 0) < y - 20 || c.car || c.water) continue;
                if (c.kind === 'circle') { if ((x - c.x) * (x - c.x) + (z - c.y) * (z - c.y) < (c.r + 15) * (c.r + 15) && c.r > 60) return len * (i - 1) / steps; }
                else {
                    const ux = x - c.x, uz = z - c.y;
                    const u = ux * c.c + uz * c.s, v = -ux * c.s + uz * c.c;
                    if (Math.abs(u) < c.hx + 15 && Math.abs(v) < c.hy + 15 && c.hx + c.hy > 120) return len * (i - 1) / steps;
                }
            }
        }
        return null;
    },

    _cameraFrame(dt, snap) {
        const app = this.app, cam = app && app.camera, car = this.car;
        if (!cam || !car) return;
        const L = car.geom.length * 100;
        const spd = car.speed;
        // Азимут догоняет курс (при заднем ходе — тоже курс: смотрим вперёд по кузову).
        const goal = car.heading;
        let d = goal - this.camAz;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        const k = snap ? 1 : 1 - Math.exp(-dt * (2.6 + Math.min(3, spd / 8)));
        this.camAz += d * k;
        if (this.camLookT > 0) this.camLookT -= dt; else this.camLook *= Math.max(0, 1 - dt * 3);
        const az = this.camAz + this.camLook;
        const H = (app.location.view.world.canvas && app.location.view.world.canvas.clientHeight) || 600;
        const tanF = Math.tan(cam.cam.fov / 2);
        const fx = Math.cos(az), fy = Math.sin(az);
        // Только вид «за машиной»: ближе (0) или дальше (1). Вида из салона нет.
        const far = this.camMode === 1;
        // На низком экране приборка и педали занимают низ: машина должна стоять выше — цель ближе к ней, камера чуть выше.
        const cv = app.location.view.world.canvas;
        const low = cv && cv.clientHeight < 520;
        const dist = (far ? 3.1 : 2.15) * L * this.camDist * (low ? 1.12 : 1) + Math.min(260, spd * 6);
        const pitch = ((far ? 19 : 13) + (low ? 3 : 0)) * Math.PI / 180;
        const ahead = L * (low ? 0.05 : 0.3) + Math.min(low ? 160 : 300, spd * 8);
        const lift = car.geom.height * 100 * 0.75;
        this.camFollow.x = car.x + Math.cos(car.heading) * ahead * 0.5 + fx * ahead * 0.5;
        this.camFollow.y = car.y + Math.sin(car.heading) * ahead * 0.5 + fy * ahead * 0.5;
        this.camFollow.h = car.h + lift;
        cam.azimuth = az;
        cam.pitch = pitch;
        const z = H / (2 * tanF * dist);
        cam.zoom = cam.zoomTarget = z;
    },

    // --- Кадр -----------------------------------------------------------------------------------

    tick(dt) {
        dt = Math.min(dt, 0.05);
        this.time += dt;
        Roads.update(dt);
        const car = this.car;
        if (!car) return;
        // rewarded не ставит игру на паузу (молчит только звук) — на время ролика машина мягко останавливается сама
        const adHold = Platform.adActive && Platform.adKind === 'rewarded';
        if (this.state === 'drive' && !adHold) this._readInput(dt);
        else { this.input.fwd = this.input.back = this.input.steer = 0; this.input.handbrake = false; }
        if (adHold) { const k = Math.max(0, 1 - dt * 3); car.vx *= k; car.vy *= k; car.omega *= k; }
        car.step(dt, this.input);
        for (const ev of car.events) this._event(ev);
        GameWorld.update(dt);
        if (typeof GameTraffic !== 'undefined') GameTraffic.update(dt);
        if (typeof GamePeds !== 'undefined') GamePeds.update(dt);
        if (typeof Rig !== 'undefined') Rig.updateAll(dt);
        if (typeof GameSignals !== 'undefined') GameSignals.update(dt);
        if (typeof GameDecor !== 'undefined') GameDecor.update(dt);
        if (typeof GameCarFx !== 'undefined') GameCarFx.update(dt);
        if (this.state === 'drive') {
            if (typeof GameRules !== 'undefined') GameRules.update(dt);
            if (typeof GameNav !== 'undefined') GameNav.update(dt);
            if (typeof GameExam !== 'undefined') GameExam.update(dt);
            if (typeof GameJobs !== 'undefined') GameJobs.update(dt);
            this.save.stats.km += car.speed * dt / 1000;
        }
        if (typeof GameInstructor !== 'undefined') GameInstructor.update(dt);
        this.saveTimer += dt;
        // Автосохранение места раз в 20 с; на Playgama — нет: запись только по значимым событиям и при уходе со страницы.
        if (this.saveTimer > 20) { this.saveTimer = 0; if (!GAME_IS_PLAYGAMA) this.persist(); }
    },

    // Каждый кадр (и на паузе): вид машины, камера, звук, HUD.
    frame(dt) {
        const car = this.car;
        if (!car) return;
        if (!Pause.active) { car.syncView(dt); this._cameraFrame(dt, false); }
        if (typeof GameAudio !== 'undefined') GameAudio.frame(dt);
        if (typeof GameUI !== 'undefined') GameUI.frame(dt);
    },

    // События машины и мира -> правила, экзамен, работа, инструктор, звук.
    _event(ev) {
        if (ev.type === 'hit') {
            // скрежет о стену даёт удары каждый шаг физики: звук и тряска — не чаще 4 раз в секунду
            if (this.time - this._hitFx > 0.25 || ev.impact > 3) {
                this._hitFx = this.time;
                const p = Math.min(1, ev.impact / 8);
                if (this.app.camera && ev.impact > 1) this.app.camera.shake(150 + p * 250, 0.004 + p * 0.02);
                this._sfx('crash', { power: p });
            }
        } else if (ev.type === 'cone') this._sfx('cone');
        else if (ev.type === 'bump') this._sfx('bump', { power: ev.power });
        else if (ev.type === 'shift' || ev.type === 'gear') this._sfx('shift');
        if (typeof GameRules !== 'undefined') GameRules.event(ev);
        if (typeof GameExam !== 'undefined') GameExam.event(ev);
        if (typeof GameJobs !== 'undefined') GameJobs.event(ev);
        if (typeof GameInstructor !== 'undefined') GameInstructor.event(ev);
        if (typeof GameAudio !== 'undefined') GameAudio.event(ev);
        if (typeof GameCarFx !== 'undefined') GameCarFx.event(ev);
    },

    // Начать езду (из меню).
    play() {
        this.state = 'drive';
        Platform.gameplay(true);
        if (typeof GameInstructor !== 'undefined') GameInstructor.greet();
    },

    toMenu() {
        this.state = 'menu';
        Platform.gameplay(false);
        this.persist();
    },
};
