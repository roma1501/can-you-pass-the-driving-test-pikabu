// GameCarFx.js — эффекты машины игрока: выхлоп при газе, дым из-под колёс и чёрные следы шин в заносе,
// пыль на газоне, искры и пыль при ударе, облачко от конуса, хлопок выхлопа при переключении у V8.
//
// Постоянные системы частиц (выхлоп, дым задних колёс, пыль) создаются один раз и только меняют темп эмиссии и точку —
// без пересоздания. Удары — короткие всплески app.fx (не чаще раза в 0.12 с). Следы шин — ОДИН меш квадратов с thin
// instances в кольцевом буфере: старые следы перезаписываются новыми, на GPU уходит только изменившийся буфер.
// Мир: x вправо, y вниз (= z Babylon), 100 px = 1 м.

/** @satisfies {Record<string, any>} */
const GameCarFx = {
    /** @type {any} */ app: null,
    /** @type {any} */ fx: null,
    /** @type {any[]} */ exhaust: [],
    /** @type {any[]} */ smoke: [],
    /** @type {any} */ dust: null,
    /** @type {any} */ skid: null,
    /** @type {Float32Array | null} */ skidBuf: null,
    skidCap: 0, skidN: 0, skidHead: 0, skidDirty: false,
    /** @type {any[]} */ lastMark: [null, null, null, null],
    burstT: 0, puffT: 0, thrPrev: 0, flip: 0, quality: 1,
    HARD: { road: true, lot: true, walk: true, ramp: true },

    init(app) {
        this.app = app;
        this.fx = app.fx || null;
        const lvl = typeof Quality !== 'undefined' ? Quality.level : 2;
        this.quality = lvl <= 0 ? 0.45 : lvl === 1 ? 0.75 : 1;
        this._buildSkid(app.location.view.scene);
        if (!this.fx) return;
        const smoke = (name) => this.fx.create({
            name, rate: 0, capacity: 240, life: [1.0, 2.2], size: [55, 120], speed: [15, 55], blend: 'standard',
            direction: [[-0.35, 0.35, -0.35], [0.35, 1, 0.35]], gravity: [0, 18, 0], spin: [-0.6, 0.6],
            color: '#e9e9ec', sizeGradient: [[0, 0.45], [0.25, 1], [1, 2.4]],
            colorGradient: [[0, '#f2f2f4', 0], [0.08, '#ececef', 0.5], [0.6, '#dcdce0', 0.28], [1, '#d0d0d4', 0]],
        });
        this.smoke = [smoke('tire-smoke-l'), smoke('tire-smoke-r')];
        this.dust = this.fx.create({
            name: 'wheel-dust', rate: 0, capacity: 160, life: [0.7, 1.6], size: [40, 90], speed: [20, 70], blend: 'standard',
            direction: [[-0.5, 0.3, -0.5], [0.5, 1, 0.5]], gravity: [0, -30, 0],
            color: '#a48a62', sizeGradient: [[0, 0.5], [1, 1.9]],
            colorGradient: [[0, '#a8906a', 0], [0.1, '#a48a62', 0.45], [1, '#b8a385', 0]],
        });
        const exhaust = (name) => this.fx.create({
            name, rate: 4, capacity: 90, life: [0.5, 1.2], size: [10, 22], speed: [10, 35], blend: 'standard',
            direction: [[-0.2, 0.2, -0.2], [0.2, 0.6, 0.2]], gravity: [0, 25, 0],
            color: '#b9b9be', sizeGradient: [[0, 0.6], [1, 3]],
            colorGradient: [[0, '#a6a6ab', 0.0], [0.1, '#9c9ca2', 0.38], [1, '#c9c9ce', 0]],
        });
        this.exhaust = [exhaust('exhaust-l'), exhaust('exhaust-r')];
    },

    // --- Следы шин ------------------------------------------------------------------------------

    _buildSkid(scene) {
        this.skidCap = Math.round((typeof IS_MOBILE !== 'undefined' && IS_MOBILE ? 420 : 900) * Math.max(0.5, this.quality));
        this.skidBuf = new Float32Array(this.skidCap * 16);
        const mesh = BABYLON.MeshBuilder.CreateGround('skid-marks', { width: 1, height: 1 }, scene);
        const mat = new BABYLON.StandardMaterial('skid-marks', scene);
        mat.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.06);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mat.alpha = 0.5;
        mat.zOffset = -4;
        mat.backFaceCulling = false;
        mat.metadata = { toonGroup: 'ground' };
        mesh.material = mat;
        mesh.isPickable = false;
        mesh.receiveShadows = true;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.thinInstanceSetBuffer('matrix', this.skidBuf, 16, false);
        mesh.thinInstanceCount = 0;
        mesh.isVisible = false;
        this.skid = mesh;
        this._m = new BABYLON.Matrix();
        this._S = new BABYLON.Vector3(); this._P = new BABYLON.Vector3(); this._Q = new BABYLON.Quaternion();
    },

    _mark(x0, y0, x1, y1, w) {
        const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
        if (len < 1) return;
        const h = Math.max(Roads.heightAt(x0, y0), Roads.heightAt(x1, y1)) + 0.9;
        this._S.set(len, 1, w);                        // без нахлёста: иначе полупрозрачные стыки темнее и след «в полоску»
        BABYLON.Quaternion.RotationAxisToRef(BABYLON.Axis.Y, -Math.atan2(dy, dx), this._Q);
        this._P.set((x0 + x1) / 2, h, (y0 + y1) / 2);
        BABYLON.Matrix.ComposeToRef(this._S, this._Q, this._P, this._m);
        this.skidBuf.set(this._m.m, this.skidHead * 16);
        this.skidHead = (this.skidHead + 1) % this.skidCap;
        this.skidN = Math.min(this.skidCap, this.skidN + 1);
        this.skidDirty = true;
    },

    clearMarks() {
        this.skidN = 0; this.skidHead = 0; this.lastMark = [null, null, null, null];
        if (this.skid) { this.skid.thinInstanceCount = 0; this.skid.isVisible = false; }
    },

    // --- Кадр -----------------------------------------------------------------------------------

    update(dt) {
        const car = typeof Game !== 'undefined' ? Game.car : null;
        if (!car || dt <= 0) return;
        const c = Math.cos(car.heading), s = Math.sin(car.heading);
        const g = car.geom, spd = car.speed;
        const local = (fx, fy, fz, out) => {           // точка кузова (м, оси Blender) -> Babylon
            const lx = fx * 100, lz = -fy * 100;
            out.x = car.x + lx * c - lz * s; out.z = car.y + lx * s + lz * c; out.y = car.h + fz * 100;
            return out;
        };
        const P = this._tmp || (this._tmp = { x: 0, y: 0, z: 0 });

        // Выхлоп: темп — от газа и оборотов; резкий газ — плотное облачко.
        const thr = car.throttle || 0;
        const dual = car.def && car.def.stats && car.def.stats.engine === 'v8';
        const rpmK = Math.min(1, Math.max(0, ((car.rpm || 850) - 800) / 5200));
        let rate = car.gear === 'P' && thr < 0.05 ? 3 : 4 + thr * (22 + rpmK * 40);
        if (thr - this.thrPrev > 0.5) rate += 140;           // «плевок» при резком газе
        this.thrPrev += (thr - this.thrPrev) * Math.min(1, dt * 6);
        if (car.frozen) rate = 0;
        for (let k = 0; k < this.exhaust.length; k++) {
            const h = this.exhaust[k];
            if (!h) continue;
            const side = k === 0 ? -1 : 1;                  // 0 — справа (ось y Blender влево), 1 — слева у V8
            if (k === 1 && !dual) { h.setRate(0); continue; }
            local(-g.length / 2 + 0.06, side * -g.width * 0.27, Math.max(0.2, g.wheelRadius * 0.7), P);
            h.system.emitter.set(P.x, P.y, P.z);
            // струя назад и чуть в сторону выхода
            const bx = -c, bz = -s;
            h.system.direction1.set(bx * 0.9 - 0.2, 0.15, bz * 0.9 - 0.2);
            h.system.direction2.set(bx * 1.1 + 0.2, 0.55, bz * 1.1 + 0.2);
            h.setRate(rate * this.quality);
        }

        // Колёса: занос на твёрдом — дым и следы, на газоне — пыль.
        const slip = car.slip || 0;
        const hardBrake = (car.brakeIn || 0) > 0.85 && spd > 7 && !car.handbrake;
        const w = (g.wheelWidth || 0.24) * 100;
        const W = this._w || (this._w = { x: 0, y: 0 });
        let dustRate = 0;
        for (let k = 0; k < 4; k++) {
            car.wheelWorld(k, W);
            const surf = Roads.surfaceAt(W.x, W.y);
            const hard = !!this.HARD[surf];
            const rear = k >= 2;
            const marking = hard && spd > 1.5 && (rear ? slip > 0.32 : (hardBrake && slip > 0.25) || slip > 0.7);
            const last = this.lastMark[k];
            if (marking) {
                if (!last) this.lastMark[k] = { x: W.x, y: W.y };
                else {
                    const d = Math.hypot(W.x - last.x, W.y - last.y);
                    if (d > 160) { last.x = W.x; last.y = W.y; }
                    else if (d > 28) { this._mark(last.x, last.y, W.x, W.y, w); last.x = W.x; last.y = W.y; }
                }
            } else this.lastMark[k] = null;
            if (rear) {
                const sm = this.smoke[k - 2];
                if (sm) {
                    const sr = hard && spd > 1 ? Math.max(0, (slip - 0.3) / 0.7) * 95 : 0;
                    sm.system.emitter.set(W.x, Roads.heightAt(W.x, W.y) + 14, W.y);
                    sm.setRate(sr * this.quality);
                }
                if (surf === 'grass' && spd > 2) dustRate += Math.min(45, spd * 2.2) + slip * 60;
            }
        }
        if (this.dust) {
            // одна система на два задних колеса: точка через кадр — то левое, то правое
            this.flip ^= 1;
            car.wheelWorld(2 + this.flip, W);
            this.dust.system.emitter.set(W.x, Roads.heightAt(W.x, W.y) + 10, W.y);
            this.dust.setRate(dustRate * this.quality);
        }
        if (this.skidDirty && this.skid) {
            this.skidDirty = false;
            this.skid.thinInstanceBufferUpdated('matrix');
            this.skid.thinInstanceCount = this.skidN;
            this.skid.isVisible = this.skidN > 0;
        }
        this.burstT -= dt; this.puffT -= dt;
    },

    // --- События --------------------------------------------------------------------------------

    event(ev) {
        if (!this.fx) return;
        const car = Game.car;
        if (!car) return;
        if (ev.type === 'hit' && ev.impact > 1.2 && this.burstT <= 0) {
            this.burstT = 0.12;
            const p = Math.min(1, ev.impact / 9);
            const x = ev.x != null ? ev.x : car.x, y = ev.y != null ? ev.y : car.y;
            const h = car.h + 35 + p * 15;
            // нормаль удара: от точки контакта к машине — искры летят назад и в стороны от препятствия
            let nx = car.x - x, ny = car.y - y; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
            this.fx.create({
                name: 'sparks', position: [x, h, y], burst: Math.round((14 + p * 46) * this.quality), capacity: 64,
                life: [0.18, 0.6], size: [5, 13], speed: [180, 420 + p * 300],
                direction: [[nx - 0.9, 0.15, ny - 0.9], [nx + 0.9, 1.1, ny + 0.9]], gravity: [0, -1500, 0],
                color: '#ffe08a', color2: '#ff7a1a', sizeGradient: [[0, 1], [1, 0.25]],
            });
            this.fx.create({
                name: 'hit-dust', position: [x, car.h + 25, y], burst: Math.round((4 + p * 10) * this.quality), capacity: 16,
                life: [0.6, 1.4], size: [40, 90], speed: [20, 80], blend: 'standard',
                direction: [[-1, 0.2, -1], [1, 0.8, 1]], gravity: [0, 10, 0],
                color: '#9d968c', sizeGradient: [[0, 0.5], [1, 1.8]],
                colorGradient: [[0, '#a29b91', 0.55], [1, '#b5afa6', 0]],
            });
        } else if (ev.type === 'cone' && ev.cone) {
            const k = ev.cone;
            this.fx.create({
                name: 'cone-puff', position: [k.x, Roads.heightAt(k.x, k.y) + 10, k.y], burst: Math.round(8 * this.quality), capacity: 10,
                life: [0.5, 1.1], size: [30, 60], speed: [30, 90], blend: 'standard',
                direction: [[-1, 0.3, -1], [1, 0.9, 1]], gravity: [0, -40, 0],
                color: '#b4a68c', sizeGradient: [[0, 0.6], [1, 1.6]],
                colorGradient: [[0, '#b4a68c', 0.5], [1, '#c4b9a3', 0]],
            });
        } else if (ev.type === 'bump' && ev.power > 0.35 && this.puffT <= 0) {
            this.puffT = 0.3;
            const W = car.wheelWorld(car.vx * Math.cos(car.heading) + car.vy * Math.sin(car.heading) >= 0 ? 0 : 2, { x: 0, y: 0 });
            this.fx.create({
                name: 'bump-dust', position: [W.x, Roads.heightAt(W.x, W.y) + 8, W.y], burst: Math.round(6 * this.quality), capacity: 8,
                life: [0.4, 0.9], size: [30, 60], speed: [20, 60], blend: 'standard',
                direction: [[-1, 0.3, -1], [1, 0.8, 1]], gravity: [0, -20, 0],
                color: '#a9a39a', colorGradient: [[0, '#a9a39a', 0.45], [1, '#bab5ad', 0]],
            });
        } else if (ev.type === 'shift' && car.def && car.def.stats && car.def.stats.engine === 'v8' && (car.throttle || 0) > 0.7 && (car.rpm || 0) > 4500) {
            // хлопок в выхлопе: короткая вспышка у патрубков
            const c = Math.cos(car.heading), s = Math.sin(car.heading), g = car.geom;
            for (const side of [-1, 1]) {
                const lx = (-g.length / 2 + 0.02) * 100, lz = side * g.width * 0.27 * 100;
                this.fx.create({
                    name: 'backfire', position: [car.x + lx * c - lz * s, car.h + Math.max(0.2, g.wheelRadius * 0.7) * 100, car.y + lx * s + lz * c],
                    burst: 7, capacity: 8, life: [0.06, 0.16], size: [14, 30], speed: [60, 160],
                    direction: [[-c - 0.25, 0, -s - 0.25], [-c + 0.25, 0.3, -s + 0.25]],
                    color: '#ffd36a', color2: '#ff5a14', sizeGradient: [[0, 1], [1, 0.3]],
                });
            }
        }
    },
};
