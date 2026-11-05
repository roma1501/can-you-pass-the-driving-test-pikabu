// GameSignals.js — светофоры на перекрёстках со светофором (плитки *-path): столб на правом углу каждого
// въезда, лицом к подъезжающим. Столбы — пачкой модели props/traffic_light.glb (нет — примитивы),
// горящие лампы — три светящиеся пачки (красный, жёлтый, зелёный), пересчёт при смене фаз.

/** @satisfies {Record<string, any>} */
const GameSignals = {
    /** @type {any[]} */ heads: [],
    /** @type {any} */ lamps: null,
    _key: '',
    // Положение ламп в модели (px, оси модели: x — к водителю, y — вверх); уточняется по частям модели.
    LAMP: { red: [18, 400, 0], yellow: [18, 368, 0], green: [18, 336, 0] },

    async build(app) {
        const T = Roads.T, list = [];
        for (const piece of Roads.signals) {
            const cx = (piece.cells[0].i + 0.5) * T, cy = (piece.cells[0].j + 0.5) * T;
            for (const port of piece.ports) {
                const d = port.d;
                const x = cx + Roads.DX[d] * 0.45 * T + Roads.DY[d] * 0.45 * T;
                const y = cy + Roads.DY[d] * 0.45 * T - Roads.DX[d] * 0.45 * T;
                list.push({ piece, d, x, y, heading: Math.atan2(Roads.DY[d], Roads.DX[d]), state: '' });
            }
        }
        this.heads = list;
        if (!list.length) return;
        const mats = list.map(h => GameGfx.matrix(h.x, h.y, Roads.WALK_H, h.heading, 1));
        let gfx = await GameGfx.instanced('assets/models/props/traffic_light.glb', 'traffic-lights', mats, { kind: 'prop' });
        if (gfx && gfx.model) {
            // Лампы модели: центр частей LampRed/Yellow/Green, чуть впереди лица.
            for (const p of gfx.model.parts) {
                const key = /LampRed/i.test(p.name) ? 'red' : /LampYellow/i.test(p.name) ? 'yellow' : /LampGreen/i.test(p.name) ? 'green' : null;
                if (!key) continue;
                let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
                for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p.positions[i + k]); mx[k] = Math.max(mx[k], p.positions[i + k]); }
                this.LAMP[key] = [mx[0] + 1.5, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
            }
        } else {
            this._fallback(list);
        }
        // Светящиеся лампы: диск лицом к +x модели.
        const scene = GameGfx.view.scene;
        const mk = (name, hex) => {
            const m = BABYLON.MeshBuilder.CreateDisc(name, { radius: 11, tessellation: 14 }, scene);
            m.bakeTransformIntoVertices(BABYLON.Matrix.RotationY(-Math.PI / 2));
            const mat = new BABYLON.StandardMaterial(name, scene);
            mat.disableLighting = true;
            mat.emissiveColor = BABYLON.Color3.FromHexString(hex);
            mat.diffuseColor = BABYLON.Color3.Black();
            mat.backFaceCulling = false;
            m.material = mat;
            /** @type {any} */ (mat).metadata = { toon: false };
            return m;
        };
        this.lamps = { red: mk('lamp-red', '#ff3b30'), yellow: mk('lamp-yellow', '#ffcc00'), green: mk('lamp-green', '#3dff6e') };
        this._mats = { red: [], yellow: [], green: [] };
        this.update(0, true);
    },

    _fallback(list) {
        const scene = GameGfx.view.scene;
        const pole = BABYLON.MeshBuilder.CreateCylinder('tl-pole', { diameter: 16, height: 420, tessellation: 8 }, scene);
        pole.bakeTransformIntoVertices(BABYLON.Matrix.Translation(0, 210, 0));
        const head = BABYLON.MeshBuilder.CreateBox('tl-head', { width: 26, height: 100, depth: 34 }, scene);
        head.bakeTransformIntoVertices(BABYLON.Matrix.Translation(4, 368, 0));
        const m = BABYLON.Mesh.MergeMeshes([pole, head], true, true);
        if (!m) return;
        m.material = GameGfx.mat('tl', '#2c2f36');
        const buf = new Float32Array(list.length * 16);
        list.forEach((h, i) => GameGfx.matrix(h.x, h.y, Roads.WALK_H, h.heading, 1).copyToArray(buf, i * 16));
        m.thinInstanceSetBuffer('matrix', buf, 16, true);
        World3D.addObject(GameGfx.view, m, 'prop', { ink: false, outline: false });
    },

    update(dt, force) {
        if (!this.lamps) return;
        let key = '';
        for (const h of this.heads) { h.state = Roads.signalFor(h.piece, h.d) || ''; key += h.state[0] || '-'; }
        if (!force && key === this._key) return;
        this._key = key;
        const out = { red: this._mats.red, yellow: this._mats.yellow, green: this._mats.green };
        out.red.length = out.yellow.length = out.green.length = 0;
        for (const h of this.heads) {
            if (!h.state) continue;
            const L = this.LAMP[h.state];
            const c = Math.cos(h.heading), s = Math.sin(h.heading);
            const x = h.x + L[0] * c - L[2] * s, y = h.y + L[0] * s + L[2] * c;
            out[h.state].push(GameGfx.matrix(x, y, Roads.WALK_H + L[1], h.heading, 1));
        }
        for (const k of ['red', 'yellow', 'green']) {
            const mesh = this.lamps[k], list = out[k];
            const buf = new Float32Array(Math.max(1, list.length) * 16);
            list.forEach((m, i) => m.copyToArray(buf, i * 16));
            mesh.thinInstanceSetBuffer('matrix', buf, 16, false);
            mesh.thinInstanceCount = list.length;
            mesh.thinInstanceRefreshBoundingInfo(false);
            mesh.isVisible = list.length > 0;
        }
    },
};
