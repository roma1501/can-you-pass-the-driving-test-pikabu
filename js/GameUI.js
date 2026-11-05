// GameUI.js — интерфейс «Can You Pass The Driving Test?». Образ — «салон учебной машины»:
//   · приборная панель: стрелочные тахометр и спидометр, ЖК-экран с цифрами скорости, P R N D и лампы;
//   · зеркало заднего вида: в нём инструктор, его реплика — субтитром под зеркалом;
//   · смартфон-навигатор на держателе: полоса манёвра, карта в стиле навигатора, знак лимита, приложения
//     (задания, права, атлас, пауза);
//   · планшет с протоколом экзамена (галочки ручкой, засечки ошибок) или чек заказа на работе;
//   · брелок-права: кольцо очков вокруг категории, деньги, стикер с целью;
//   · меню — указатель из дорожных знаков, права — пластиковая карточка, автосалон — витрина со светом,
//     задания — диспетчерская доска с чеками, настройки — экран мультимедиа, большая карта — атлас;
//   · на телефоне: руль (левая/правая половина, центр — сигнал), педали газа и тормоза, ручник, подрулевые.
// Иконки — свой набор SVG (линии), без эмодзи. Шрифты — Rubik (UI, кириллица) и Lilita One (название).

/** @satisfies {Record<string, any>} */
const GameUI = {
    /** @type {any} */ game: null,
    /** @type {HTMLElement | null} */ root: null,
    /** @type {Record<string, any>} */ el: {},
    /** @type {null | (() => void)} */ contextAction: null,
    ctxKey: '',
    sayT: 0,
    /** @type {HTMLCanvasElement | null} */ mapCanvas: null,
    mapScale: 0.03,
    modal: '',
    menuOrbit: 0,
    touch: false,
    gaugeMax: 200,
    _clipSig: '',
    _mapT: 0,
    /** @type {() => boolean} */ _walletOff: () => false,
    _navKey: '',

    // --- Иконки (24×24, линии currentColor) ------------------------------------------------------
    ICONS: {
        clipboard: '<path d="M9 4h6v3H9z"/><path d="M15 5h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3"/><path d="M8.5 11.5l1.5 1.5 3-3M8.5 17h7"/>',
        card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8" cy="11" r="2.2"/><path d="M4.8 16.4c.8-1.8 5.6-1.8 6.4 0M14 10h5M14 13h5M14 16h3"/>',
        map: '<path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
        pause: '<rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/>',
        sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
        help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
        coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.2c-.4-.9-1.4-1.4-2.6-1.4-1.6 0-2.7.8-2.7 2 0 2.8 5.5 1.5 5.5 4.3 0 1.2-1.2 2.1-2.8 2.1-1.3 0-2.4-.6-2.8-1.6M12 6.3v1.5M12 16.3v1.5"/>',
        star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z"/>',
        car: '<path d="M4 16.5V13l2-5.2A2 2 0 0 1 7.9 6.5h8.2a2 2 0 0 1 1.9 1.3L20 13v3.5"/><path d="M3 13h18v4a1 1 0 0 1-1 1h-2v-2H6v2H4a1 1 0 0 1-1-1z"/><circle cx="7" cy="15" r="1"/><circle cx="17" cy="15" r="1"/>',
        pin: '<path d="M12 21.5s6.5-6.3 6.5-11.2a6.5 6.5 0 0 0-13 0c0 4.9 6.5 11.2 6.5 11.2z"/><circle cx="12" cy="10.3" r="2.4"/>',
        left: '<path d="M16 20v-6.5A4.5 4.5 0 0 0 11.5 9H5"/><path d="M9 4.5L4.5 9 9 13.5"/>',
        right: '<path d="M8 20v-6.5A4.5 4.5 0 0 1 12.5 9H19"/><path d="M15 4.5L19.5 9 15 13.5"/>',
        straight: '<path d="M12 20V5"/><path d="M7 9.5L12 4.5l5 5"/>',
        uturn: '<path d="M7 20V10a5 5 0 0 1 10 0v4"/><path d="M13 11l4 4 4-4"/>',
        round: '<circle cx="12" cy="13" r="3.5"/><path d="M12 9.5V3.5M8.5 4.5l3.5-1 1 3.5M12 16.5V21"/>',
        flag: '<path d="M5 21V4"/><path d="M5 4h13l-2.5 4L18 12H5"/>',
        check: '<path d="M4.5 12.5l5 5 10-11"/>',
        cross: '<path d="M6 6l12 12M18 6L6 18"/>',
        lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
        taxi: '<path d="M9.5 5h5l.5 2"/><path d="M4 16.5V13l2-5h12l2 5v3.5"/><path d="M3 13h18v4H3z"/><circle cx="7" cy="15" r="1"/><circle cx="17" cy="15" r="1"/>',
        box: '<path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5L12 11.5l8.5-4M12 11.5v9M7.8 5.5l8.4 4"/>',
        cake: '<path d="M4 20h16v-6.5a1.5 1.5 0 0 0-1.5-1.5h-13A1.5 1.5 0 0 0 4 13.5z"/><path d="M4 16c2.7 1.6 5.3-1.6 8 0s5.3 1.6 8 0M12 12V8.5"/><path d="M12 4.5c.9 1 .9 2.4 0 3.2-.9-.8-.9-2.2 0-3.2z"/>',
        parking: '<rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M9.5 16.5V7.5h3.2a2.8 2.8 0 0 1 0 5.6H9.5"/>',
        backpack: '<path d="M7 9a5 5 0 0 1 10 0v11H7z"/><path d="M10 4.5h4M9 14h6v3H9zM7 12H5.5v6H7M17 12h1.5v6H17"/>',
        horn: '<path d="M4 10v4h3l7 4.5V5.5L7 10z"/><path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a7.5 7.5 0 0 1 0 11"/>',
        camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
        radio: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8l10-4.5"/><circle cx="8" cy="14" r="2.5"/><path d="M14 12h4M14 15h4"/>',
        watch: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 2.5h4M18.5 6.5l1.3-1.3"/>',
        hand: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6.5 6.5 0 0 1-6.5 6.5H10a5 5 0 0 1-4.3-2.4L3.8 15a1.5 1.5 0 0 1 2.5-1.6L8 15.5"/>',
        warn: '<path d="M12 3.5l9.5 17h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.5" r=".7" fill="currentColor"/>',
        key: '<circle cx="8" cy="15" r="4.5"/><path d="M11.2 11.8L20 3M16.5 6.5l2.5 2.5M14 9l2 2"/>',
        music: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
        sound: '<path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z"/><path d="M16.5 9a4 4 0 0 1 0 6"/>',
        screen: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>',
        home: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
        play: '<path d="M7 4.5v15l12.5-7.5z"/>',
        ad: '<rect x="3" y="5" width="18" height="13.5" rx="2.5"/><path d="M10 9v6l5-3z"/><path d="M8 21h8"/>',
        trophy: '<path d="M8 4h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4.5M16 6h3a3 3 0 0 1-3 4.5"/><path d="M12 13.5V17M9 20.5h6M10 17h4v3.5h-4z"/>',
        arrow: '<path d="M4 12h15M14 6.5l5.5 5.5-5.5 5.5"/>',
    },

    icon(name, cls) {
        const p = this.ICONS[name] || '';
        return `<svg class="ico ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
    },

    JOB_ICON: { taxi: 'taxi', delivery: 'box', fragile: 'cake', valet: 'parking', school: 'backpack', testdrive: 'flag' },

    FONT_CSS: `@font-face { font-family: 'GRubik'; src: url('assets/fonts/rubik.ttf') format('truetype'); font-weight: 300 900; font-display: swap; }
@font-face { font-family: 'GLilita'; src: url('assets/fonts/lilitaone.ttf') format('truetype'); font-weight: 400; font-display: swap; }`,

    CSS: `
:root { --ink:#151821; --orange:#ff7a1a; --amber:#ffb340; --red:#e5372f; --green:#1fae5b; --blue:#1f5fd6; --sign-green:#0f6a3a; --paper:#fbf6e8; --pen:#c62f2f;
  --lcdtxt:#c9fff4; --font:'GRubik', system-ui, sans-serif; --logo:'GLilita','GRubik',sans-serif; }
#gui { position:fixed; inset:0; pointer-events:none; font-family:var(--font); color:var(--ink); z-index:20; -webkit-tap-highlight-color:transparent; }
#gui * { box-sizing:border-box; }
#gui .hide { display:none !important; }
.ico { width:1em; height:1em; display:inline-block; vertical-align:-0.15em; flex:none; }
.gk { transform:scale(var(--hl-k,1)); transform-origin:top left; }
.num { font-variant-numeric:tabular-nums; }

/* ===== зеркало заднего вида с инструктором ===== */
.mirror-wrap { width:calc(var(--hl-say-w, 520px) / var(--hl-k, 1)); display:flex; flex-direction:column; align-items:center; }
.mirror-stem { width:16px; height:14px; background:linear-gradient(90deg,#3b4150,#6d7484,#3b4150); border-radius:0 0 4px 4px; }
.mirror { width:min(300px, 100%); height:88px; border-radius:44px 44px 38px 38px / 38px 38px 50px 50px; padding:6px; position:relative;
  background:linear-gradient(180deg,#f4f6fa,#9aa3b2 55%,#5c6474); box-shadow:0 6px 16px rgba(0,0,0,.35), inset 0 1px 0 #fff; }
.mirror-glass { width:100%; height:100%; border-radius:inherit; overflow:hidden; position:relative;
  background:linear-gradient(170deg,#cfe6f7 0%,#9cc2df 38%,#6c8fb0 39%,#86a4bf 70%,#5d7a96 100%); box-shadow:inset 0 0 0 2px #1b1f28, inset 0 6px 18px rgba(0,0,0,.35); }
.mirror-glass:after { content:''; position:absolute; inset:0; background:linear-gradient(115deg, transparent 30%, rgba(255,255,255,.45) 34%, transparent 40%, transparent 62%, rgba(255,255,255,.25) 64%, transparent 68%); }
.mirror-face { position:absolute; left:50%; bottom:-8px; width:100px; height:100px; transform:translateX(-50%); background:url('assets/ui/instructor_calm.webp') center/contain no-repeat; }
.mirror.angry .mirror-face, .mirror.shock .mirror-face { animation:mshake .4s; }
@keyframes mshake { 0%,100%{transform:translateX(-50%)} 25%{transform:translateX(-57%) rotate(-5deg)} 65%{transform:translateX(-43%) rotate(5deg)} }
.mirror .tag { position:absolute; left:18px; top:50%; transform:translateY(-50%); font:900 10px var(--font); letter-spacing:.14em; color:#fff; background:var(--orange); padding:3px 7px; border-radius:6px; box-shadow:0 2px 0 #b5520c; text-transform:uppercase; }
.mirror .mood { position:absolute; right:18px; top:50%; transform:translateY(-50%); width:30px; height:30px; border-radius:50%; display:grid; place-items:center; color:#fff; font-size:17px; background:#4f6c8c; box-shadow:0 2px 0 rgba(0,0,0,.3); }
.mirror.angry .mood { background:var(--red); } .mirror.shock .mood { background:#8a4fd6; } .mirror.happy .mood { background:var(--green); } .mirror.point .mood { background:var(--blue); }
.caption { margin-top:8px; max-width:100%; background:rgba(14,16,22,.86); color:#fff; border-radius:12px; padding:8px 14px 9px; font:700 17px/1.3 var(--font);
  box-shadow:0 6px 18px rgba(0,0,0,.3); border-left:5px solid var(--orange); transition:opacity .3s, transform .3s; }
.caption b { color:var(--amber); font-weight:900; margin-right:6px; text-transform:uppercase; font-size:12px; letter-spacing:.08em; }
.caption.off { opacity:0; transform:translateY(-6px); }
.caption.angry, .caption.shock { border-left-color:var(--red); } .caption.happy { border-left-color:var(--green); }

/* ===== смартфон-навигатор ===== */
.phone { width:230px; position:relative; }
.phone .clamp { position:absolute; top:40%; width:14px; height:64px; background:linear-gradient(90deg,#2b2f38,#4a505d); border-radius:4px; }
.phone .clamp.l { left:-8px; } .phone .clamp.r { right:-8px; }
.phone .body { position:relative; background:#0b0d12; border-radius:30px; padding:8px; box-shadow:0 10px 24px rgba(0,0,0,.45), inset 0 0 0 2px #2c313c; }
.phone .scr { border-radius:23px; overflow:hidden; background:#e8eee3; position:relative; }
.phone .notch { position:absolute; top:6px; left:50%; transform:translateX(-50%); width:54px; height:13px; background:#0b0d12; border-radius:8px; z-index:3; }
.navbar { background:var(--green); color:#fff; display:grid; grid-template-columns:42px 1fr; gap:8px; align-items:center; padding:24px 12px 9px; min-height:78px; transition:background .3s; }
.navbar.idle { background:#2f3644; }
.navbar .ar { font-size:42px; line-height:0; }
.navbar .d { font:900 22px/1 var(--font); }
.navbar .t { font:700 12px/1.2 var(--font); opacity:.92; margin-top:3px; }
.mapbox { position:relative; height:184px; }
.mapbox canvas { width:100%; height:100%; display:block; }
.mapbox .compass { position:absolute; width:26px; height:26px; margin:-13px 0 0 -13px; border-radius:50%; background:#fff; color:var(--red); font:900 12px/26px var(--font); text-align:center; box-shadow:0 2px 6px rgba(0,0,0,.3); }
.mapbox .eta { position:absolute; left:8px; bottom:8px; background:#fff; border-radius:10px; padding:4px 8px; font:800 12px var(--font); box-shadow:0 2px 6px rgba(0,0,0,.25); color:#1f2a3a; }
.mapbox .lim { position:absolute; right:8px; bottom:8px; width:40px; height:40px; border-radius:50%; background:#fff; border:5px solid var(--red); display:grid; place-items:center; font:900 14px var(--font); box-shadow:0 2px 6px rgba(0,0,0,.25); }
.mapbox .lim.over { animation:limblink .5s infinite; }
@keyframes limblink { 50% { background:#ffd0cc; transform:scale(1.1); } }
.dock { display:grid; grid-template-columns:repeat(4,1fr); gap:7px; padding:9px 10px 12px; background:rgba(255,255,255,.82); border-top:1px solid #d5dbe4; }
.app { pointer-events:auto; border:0; aspect-ratio:1; border-radius:13px; display:grid; place-items:center; color:#fff; font-size:23px; cursor:pointer; position:relative;
  box-shadow:inset 0 -3px 0 rgba(0,0,0,.18), 0 2px 4px rgba(0,0,0,.2); transition:transform .1s; }
.app:active { transform:scale(.9); }
.app.a1 { background:linear-gradient(160deg,#ff9c3d,#f2661b); } .app.a2 { background:linear-gradient(160deg,#4d8dff,#1f5fd6); }
.app.a3 { background:linear-gradient(160deg,#36c977,#169b4d); } .app.a4 { background:linear-gradient(160deg,#69707f,#3a404d); }
.app .badge { position:absolute; top:-5px; right:-5px; width:18px; height:18px; border-radius:9px; background:var(--red); border:2px solid #fff; font:900 10px/14px var(--font); color:#fff; }

/* ===== протокол экзамена / чек заказа ===== */
.board { width:300px; position:relative; padding:22px 12px 14px; border-radius:14px; background:linear-gradient(135deg,#a8703c,#8b5a2b); box-shadow:0 10px 22px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.25); }
.board .clipm { position:absolute; top:-10px; left:50%; transform:translateX(-50%); width:110px; height:32px; border-radius:8px 8px 14px 14px; background:linear-gradient(180deg,#f3f5f9,#a9b0bd); box-shadow:0 3px 6px rgba(0,0,0,.35); z-index:2; }
.board .clipm:after { content:''; position:absolute; left:42px; top:6px; width:26px; height:10px; border-radius:5px; background:#596070; }
.sheet { background:var(--paper); border-radius:3px; padding:14px 12px 8px; transform:rotate(-1.2deg); box-shadow:0 2px 6px rgba(0,0,0,.25);
  background-image:linear-gradient(90deg, transparent 26px, #f2b3b3 26px, #f2b3b3 27.5px, transparent 27.5px), repeating-linear-gradient(transparent 0 25px, #cfdcf0 25px 26px); }
.sheet .hd { display:flex; justify-content:space-between; align-items:baseline; gap:6px; font:900 12px var(--font); letter-spacing:.05em; text-transform:uppercase; color:#2c3346; padding-left:22px; }
.sheet .hd small { font:800 11px var(--font); color:#7a8193; letter-spacing:0; text-transform:none; white-space:nowrap; }
.sheet ul { list-style:none; margin:8px 0 6px; padding:0; }
.sheet li { position:relative; padding:0 0 0 28px; min-height:26px; font:700 13px/26px var(--font); color:#8c93a3; }
.sheet li .bx { position:absolute; left:2px; top:6px; width:15px; height:15px; border:2px solid #7e8698; border-radius:2px; }
.sheet li.done { color:#4d5568; text-decoration:line-through; text-decoration-color:rgba(198,47,47,.6); }
.sheet li .tick { position:absolute; left:-1px; top:-1px; width:24px; height:24px; color:var(--pen); }
.sheet li.active { color:#1d2333; font-weight:900; }
.sheet li.active span { background:linear-gradient(transparent 55%, rgba(255,214,64,.75) 55%, rgba(255,214,64,.75) 92%, transparent 92%); }
.sheet .ft { display:flex; justify-content:space-between; align-items:center; padding:6px 0 0 22px; border-top:1.5px dashed #c4c9d6; }
.sheet .tmr { display:flex; align-items:center; gap:5px; font:900 18px var(--font); color:#1d2333; }
.sheet .tmr.low { color:var(--pen); }
.tally { display:flex; gap:3px; align-items:center; }
.tally i { width:9px; height:9px; border-radius:50%; border:2px solid #b7bdca; }
.tally i.x { border-color:var(--pen); background:var(--pen); }
.quit { pointer-events:auto; border:0; background:none; font:800 11px var(--font); color:#7a8193; text-decoration:underline; cursor:pointer; padding:5px 0 0 22px; }
.ticket { width:290px; background:#fffdf7; padding:16px 16px 12px; position:relative; box-shadow:0 10px 22px rgba(0,0,0,.35); transform:rotate(var(--r,1deg)); }
.ticket:before, .ticket:after { content:''; position:absolute; left:0; right:0; height:10px; background:radial-gradient(circle at 6px 0, transparent 6px, #fffdf7 6.5px) 0 0/12px 10px repeat-x; }
.ticket:before { top:-10px; transform:rotate(180deg); } .ticket:after { bottom:-10px; }
.ticket .no { font:800 10px var(--font); letter-spacing:.2em; color:#9aa0ae; text-transform:uppercase; }
.ticket .tt { display:flex; gap:10px; align-items:center; font:900 18px var(--font); margin:4px 0 8px; }
.ticket .tt .ico { font-size:30px; color:var(--orange); }
.ticket .st { font:800 14px/1.3 var(--font); padding:7px 9px; border:2px dashed #d7dbe4; border-radius:8px; }
.ticket .row { display:flex; justify-content:space-between; align-items:center; font:900 15px var(--font); margin-top:8px; }
.ticket .row .pay { color:var(--green); font-size:18px; }
.ticket .cargo { margin-top:8px; display:flex; align-items:center; gap:6px; font:800 12px var(--font); }
.ticket .cargo b { flex:1; height:10px; border-radius:5px; background:#eceff4; overflow:hidden; display:block; }
.ticket .cargo b i { display:block; height:100%; background:linear-gradient(90deg,#ff6d8d,#ffb0c4); }

/* ===== брелок: категория, деньги, цель ===== */
.fob { display:grid; grid-template-columns:62px 1fr; gap:2px 10px; align-items:center; width:270px; }
.ring { width:62px; height:62px; position:relative; grid-row:1/3; }
.ring svg { width:100%; height:100%; transform:rotate(-90deg); }
.ring .c { position:absolute; inset:9px; border-radius:50%; display:grid; place-items:center; color:#fff; font:900 22px var(--font); box-shadow:inset 0 -3px 0 rgba(0,0,0,.2), 0 3px 8px rgba(0,0,0,.3); background:var(--orange); }
.cash { display:flex; align-items:center; gap:6px; font:900 22px var(--font); color:#fff; text-shadow:0 2px 3px rgba(0,0,0,.55); align-self:end; }
.cash .ico { color:#ffd257; filter:drop-shadow(0 2px 2px rgba(0,0,0,.45)); font-size:24px; }
.pts { font:800 12px var(--font); color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.8); display:flex; gap:5px; align-items:center; align-self:start; }
.pts .ico { color:#7fc8ff; }
.sticky { grid-column:1/3; margin-top:8px; background:#ffe873; padding:7px 10px 9px; font:800 12px/1.3 var(--font); color:#3b3200; transform:rotate(-1.5deg);
  box-shadow:0 4px 8px rgba(0,0,0,.25); clip-path:polygon(0 0,100% 0,100% 80%,92% 100%,0 100%); }

/* ===== приборная панель ===== */
.cluster { width:460px; height:182px; position:relative; }
.binn { position:absolute; inset:18px 0 0 0; border-radius:120px 120px 26px 26px / 110px 110px 26px 26px; background:linear-gradient(180deg,#2c323e,#141820 60%); box-shadow:0 -2px 0 #3f4756, 0 10px 24px rgba(0,0,0,.5), inset 0 2px 0 rgba(255,255,255,.08); }
.gauge { position:absolute; top:4px; width:172px; height:172px; border-radius:50%; background:radial-gradient(circle at 50% 40%, #232a36 0%, #0d1016 70%);
  box-shadow:0 0 0 5px #3a414f, 0 0 0 7px #11141a, inset 0 0 18px rgba(0,0,0,.8); }
.gauge.l { left:6px; } .gauge.r { right:6px; }
.gauge svg { width:100%; height:100%; display:block; }
.lcd { position:absolute; left:50%; top:38px; transform:translateX(-50%); width:112px; height:122px; border-radius:14px; background:linear-gradient(180deg,#123638,#0a1e20);
  box-shadow:inset 0 0 0 2px #050a0b, inset 0 0 18px rgba(0,255,220,.12), 0 0 0 3px #2b313d; color:var(--lcdtxt); text-align:center; padding-top:12px; }
.lcd .s { font:800 40px/1 var(--font); text-shadow:0 0 10px rgba(120,255,230,.55); }
.lcd .u { font:700 9px var(--font); letter-spacing:.2em; opacity:.7; text-transform:uppercase; }
.lcd .gears { display:flex; justify-content:center; align-items:baseline; gap:6px; margin-top:12px; font:900 14px var(--font); color:rgba(201,255,244,.28); }
.lcd .gears b.on { color:#ffd257; text-shadow:0 0 8px rgba(255,210,87,.8); }
.lcd .gnum { font:800 10px var(--font); color:#ffd257; margin-left:-4px; min-width:6px; }
.lamps { position:absolute; left:50%; top:12px; transform:translateX(-50%); display:flex; gap:62px; }
.lamp { font-size:21px; color:#2e3644; }
.lamp.on { color:#3dff8a; filter:drop-shadow(0 0 6px #3dff8a); }
.hb { position:absolute; left:50%; bottom:6px; transform:translateX(-50%); font:900 11px var(--font); color:#4a1c1f; border:2px solid #4a1c1f; border-radius:50%; width:22px; height:22px; display:grid; place-items:center; }
.hb.on { color:#ff3b30; border-color:#ff3b30; box-shadow:0 0 8px rgba(255,59,48,.6); }
.keycap { position:absolute; left:calc(100% + 14px); bottom:46px; pointer-events:auto; display:flex; align-items:center; gap:10px; background:linear-gradient(180deg,#ffd257,#ff9c1a); border:0; border-radius:16px;
  padding:10px 16px 10px 10px; font:900 16px var(--font); color:#2b1a00; cursor:pointer; box-shadow:0 5px 0 #b05f00, 0 10px 18px rgba(0,0,0,.35); white-space:nowrap; text-transform:uppercase; letter-spacing:.03em; }
.keycap kbd { width:30px; height:30px; border-radius:8px; background:#fff; display:grid; place-items:center; font:900 15px var(--font); box-shadow:inset 0 -3px 0 #c9cfdb; }
.keycap:active { transform:translateY(3px); box-shadow:0 2px 0 #b05f00; }
.hl-tall .keycap, .hl-touch .keycap { left:50%; bottom:auto; top:-60px; transform:translateX(-50%); }

/* ===== всплывающие знаки ===== */
#g-toasts { position:fixed; left:50%; top:32%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:8px; pointer-events:none; z-index:25; max-width:92vw; }
.toast { display:flex; align-items:center; gap:10px; background:#fff; border-radius:10px; padding:7px 14px 7px 8px; font:900 16px var(--font); box-shadow:0 8px 18px rgba(0,0,0,.3), inset 0 0 0 3px #fff, inset 0 0 0 5px #1d2333;
  animation:tin .3s cubic-bezier(.2,1.5,.5,1), tout .4s ease-in 2.3s forwards; }
.toast .ico { font-size:26px; }
.toast.bad .ico { color:var(--red); } .toast.warn .ico { color:#e68a00; } .toast.good { background:#e8fff1; } .toast.good .ico { color:var(--green); } .toast.info .ico { color:var(--blue); }
@keyframes tin { from { transform:scale(.5) rotate(-6deg); opacity:0; } }
@keyframes tout { to { opacity:0; transform:translateY(-16px); } }

/* ===== меню-указатель: сцена фиксированного размера, масштабируется целиком под экран ===== */
#g-menu { position:fixed; inset:0; pointer-events:auto; overflow:hidden;
  background:radial-gradient(ellipse at 75% 60%, rgba(10,12,18,0) 30%, rgba(10,12,18,.55) 100%), linear-gradient(90deg, rgba(10,12,18,.72), rgba(10,12,18,0) 58%); }
#g-menu.port { background:linear-gradient(180deg, rgba(10,12,18,.62), rgba(10,12,18,0) 38%, rgba(10,12,18,0) 52%, rgba(10,12,18,.78)); }
.mstage { position:absolute; left:50%; top:50%; display:flex; transform-origin:center center; }
.mstage.land { width:1280px; height:720px; flex-direction:row; align-items:center; justify-content:space-between; padding:40px 64px; }
.mstage.port { width:440px; height:900px; flex-direction:column; align-items:center; justify-content:flex-start; gap:16px; padding:46px 20px 26px; }
.mstage.port .menu-side { margin-top:auto; }
.post-wrap { position:relative; display:flex; flex-direction:column; align-items:flex-start; }
.mstage.land .post-wrap:before { content:''; position:absolute; left:40px; top:60px; bottom:-120px; width:14px; background:linear-gradient(90deg,#7d8594,#d7dbe3,#7d8594); border-radius:3px; }
.hwsign { position:relative; z-index:1; background:var(--sign-green); border-radius:16px; padding:6px; box-shadow:0 14px 30px rgba(0,0,0,.45); width:600px; }
.mstage.port .hwsign { width:400px; }
.hwsign .in { border:4px solid #fff; border-radius:11px; padding:14px 24px 16px; }
.hwsign .tab { position:absolute; top:-30px; left:20px; background:var(--orange); color:#fff; font:900 13px var(--font); letter-spacing:.14em; padding:6px 12px; border-radius:8px 8px 0 0; text-transform:uppercase; }
.hwsign h1 { margin:0; font:400 62px/0.98 var(--logo); color:#fff; }
.mstage.port .hwsign h1 { font-size:42px; }
.hwsign h1 em { font-style:normal; color:#ffd257; }
.hwsign .sub { margin-top:10px; display:flex; align-items:center; gap:8px; font:800 15px var(--font); color:#cfeedd; text-transform:uppercase; letter-spacing:.1em; }
.hwsign .sub .ico { font-size:1.4em; }
.signs { position:relative; z-index:1; display:flex; flex-direction:column; align-items:flex-start; gap:12px; margin-top:34px; }
.mstage.port .signs { align-items:stretch; width:400px; margin-top:0; }
.sbtn { pointer-events:auto; border:0; cursor:pointer; display:flex; align-items:center; gap:12px; padding:11px 42px 11px 14px; border-radius:10px; font:900 17px var(--font); text-transform:uppercase; letter-spacing:.05em;
  box-shadow:0 8px 16px rgba(0,0,0,.35); transition:transform .12s; clip-path:polygon(0 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 0 100%); white-space:nowrap; }
.sbtn:hover { transform:translateX(6px); } .sbtn:active { transform:translateX(3px) scale(.98); }
.sbtn .ico { font-size:1.3em; }
.sbtn.go { background:#ffd257; color:#2a1d00; font-size:30px; padding:14px 60px 14px 18px; }
.sbtn.blue { background:var(--blue); color:#fff; } .sbtn.white { background:#f4f6fa; color:#1d2333; } .sbtn.green { background:var(--sign-green); color:#fff; }
.sbtn-row { display:flex; gap:12px; }
.mstage.port .sbtn-row .sbtn { flex:1; font-size:15px; padding-right:34px; }
.menu-side { display:flex; flex-direction:column; gap:14px; align-items:flex-end; }
.mstage.port .menu-side { align-items:center; }
.mstage .lic { width:420px; }
.mstage.port .lic { width:330px; }
.wallet-pill { display:flex; gap:14px; background:rgba(12,14,20,.75); border-radius:14px; padding:8px 14px; color:#fff; font:900 18px var(--font); }
.wallet-pill span { display:flex; gap:6px; align-items:center; } .wallet-pill .ico { color:#ffd257; } .wallet-pill .p .ico { color:#7fc8ff; }

/* ===== пластиковые права ===== */
.lic { width:min(380px, 40vw); aspect-ratio:1.586; border-radius:16px; position:relative; overflow:hidden; padding:12px 14px 10px; display:grid; grid-template-columns:31% 1fr; grid-template-rows:auto 1fr auto; gap:6px 12px;
  background:linear-gradient(125deg,#fbe9f0 0%,#e8f0fb 35%,#dff3ea 70%,#f6f0dc 100%); box-shadow:0 18px 40px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.8); color:#2a3046; }
.lic:before { content:''; position:absolute; inset:0; background:repeating-linear-gradient(115deg, rgba(31,95,214,.05) 0 2px, transparent 2px 9px); }
.lic:after { content:''; position:absolute; right:-30px; bottom:-40px; width:150px; height:150px; border-radius:50%; background:conic-gradient(#ff9ad5, #9ad2ff, #b5ffb0, #ffe08a, #ff9ad5); opacity:.28; }
.lic .hd { grid-column:1/3; display:flex; justify-content:space-between; align-items:center; position:relative; z-index:1; gap:6px; }
.lic .hd b { font:900 12px var(--font); letter-spacing:.1em; text-transform:uppercase; color:#b2202d; }
.lic .hd span { font:900 10px var(--font); color:#fff; background:var(--blue); border-radius:5px; padding:2px 6px; letter-spacing:.06em; white-space:nowrap; text-transform:uppercase; }
.lic .ph { border-radius:8px; background:#f2d9a8 center bottom/cover no-repeat; box-shadow:inset 0 0 0 2px rgba(0,0,0,.08); position:relative; z-index:1; }
.lic .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; align-content:center; position:relative; z-index:1; }
.cat { border-radius:8px; text-align:center; padding:4px 0 3px; background:rgba(255,255,255,.65); box-shadow:inset 0 0 0 2px rgba(42,48,70,.12); font:900 20px/1 var(--font); color:#c3c8d4; }
.cat small { display:block; font:800 8px var(--font); text-transform:uppercase; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:0 2px; }
.cat.on { background:var(--c); color:#fff; box-shadow:none; }
.cat.next { color:#2a3046; background:#fff; box-shadow:inset 0 0 0 2px var(--c); }
.lic .ft { grid-column:1/3; display:flex; justify-content:space-between; font:800 11px var(--font); color:#5b6278; position:relative; z-index:1; }
.lic .sig { font:italic 700 13px var(--font); color:#2a4aa8; }

/* ===== окна ===== */
#g-modal { position:fixed; inset:0; background:rgba(8,10,16,.66); backdrop-filter:blur(3px); pointer-events:auto; display:flex; align-items:center; justify-content:center; padding:10px; z-index:30; }
.x { pointer-events:auto; position:absolute; right:10px; top:10px; width:40px; height:40px; border-radius:50%; border:0; background:rgba(255,255,255,.16); color:#fff; font-size:20px; display:grid; place-items:center; cursor:pointer; z-index:3; }
.btn { pointer-events:auto; border:0; cursor:pointer; border-radius:12px; padding:11px 18px; font:900 15px var(--font); text-transform:uppercase; letter-spacing:.04em; display:inline-flex; align-items:center; gap:8px; justify-content:center;
  background:#e9edf3; color:#1d2333; box-shadow:0 4px 0 #b9c0cc; transition:transform .08s, box-shadow .08s; }
.btn:active { transform:translateY(3px); box-shadow:0 1px 0 #b9c0cc; }
.btn.go { background:#ffd257; color:#2a1d00; box-shadow:0 4px 0 #c08a00; } .btn.ok { background:var(--green); color:#fff; box-shadow:0 4px 0 #0f7a3c; }
.btn.blue { background:var(--blue); color:#fff; box-shadow:0 4px 0 #123f95; } .btn.red { background:var(--red); color:#fff; box-shadow:0 4px 0 #94201a; }
.btn[disabled] { opacity:.5; cursor:default; filter:grayscale(.5); }
.btnrow { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:10px; }
.show { position:relative; width:min(1060px,97vw); max-height:94vh; display:flex; flex-direction:column; border-radius:22px; overflow:hidden; color:#fff;
  background:radial-gradient(ellipse at 50% -10%, #3c4458 0%, #151820 60%), #151820; box-shadow:0 20px 50px rgba(0,0,0,.6); }
.show .top { display:flex; align-items:center; gap:16px; padding:14px 60px 8px 20px; flex-wrap:wrap; }
.show h2 { margin:0; font:400 clamp(24px,3.4vw,40px) var(--logo); }
.show .bal { margin-left:auto; display:flex; gap:6px; align-items:center; font:900 20px var(--font); color:#ffd257; }
.show .note { padding:0 20px 8px; font:700 13px var(--font); color:#aab2c4; }
.rack { overflow:auto; padding:8px 16px 18px; display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:14px; }
.stand { position:relative; border-radius:16px; background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02)); box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); padding:10px 12px 12px; display:flex; flex-direction:column; gap:8px; }
.stand .spot { position:relative; height:124px; display:grid; place-items:center; }
.stand .spot:before { content:''; position:absolute; left:6%; right:6%; bottom:4px; height:34px; border-radius:50%; background:radial-gradient(ellipse, rgba(255,240,200,.5), rgba(255,240,200,0) 70%); }
.stand .spot:after { content:''; position:absolute; top:-10px; left:50%; width:70%; height:120%; transform:translateX(-50%); background:linear-gradient(180deg, rgba(255,245,215,.16), transparent 80%); clip-path:polygon(40% 0,60% 0,100% 100%,0 100%); pointer-events:none; }
.stand img { position:relative; width:100%; height:100%; object-fit:contain; z-index:1; filter:drop-shadow(0 8px 8px rgba(0,0,0,.5)); }
.stand .nm { font:900 17px var(--font); display:flex; align-items:center; gap:8px; }
.stand .cl { font:900 11px var(--font); padding:3px 7px; border-radius:6px; color:#fff; }
.specs { display:grid; grid-template-columns:auto 1fr auto; gap:3px 8px; font:700 11px var(--font); color:#aab2c4; align-items:center; }
.specs i { height:6px; border-radius:3px; background:rgba(255,255,255,.1); overflow:hidden; display:block; } .specs i b { display:block; height:100%; background:linear-gradient(90deg,#ffb340,#ff7a1a); }
.specs em { font-style:normal; color:#fff; font-weight:900; }
.ptag { position:absolute; top:10px; right:10px; z-index:2; background:#fff6dc; color:#2a1d00; font:900 14px var(--font); padding:5px 10px 5px 18px; border-radius:4px 8px 8px 4px; transform:rotate(6deg); box-shadow:0 4px 8px rgba(0,0,0,.4); }
.ptag:before { content:''; position:absolute; left:6px; top:50%; width:6px; height:6px; margin-top:-3px; border-radius:50%; background:#151820; }
.stand.lock img { filter:grayscale(1) brightness(.45); }
.stand .lk { position:absolute; z-index:2; font-size:40px; color:#fff; }
.stand.cur { box-shadow:inset 0 0 0 2px #36c977, 0 0 24px rgba(54,201,119,.3); }
.btn.ad { background:linear-gradient(180deg,#9b6bff,#7444f2); color:#fff; box-shadow:0 4px 0 #46239e; text-transform:none; letter-spacing:0; }
.btn.ad .ico { color:#fff; }
.btn.ad.sm { padding:8px 12px; font-size:13px; }
.btn.ad.done { background:#2b3142; box-shadow:0 4px 0 #161a24; opacity:.8; }
.stand .ad { width:100%; }
.madcash:empty { display:none; }
.recbtn { pointer-events:auto; display:flex; gap:8px; align-items:center; background:rgba(12,14,20,.75); color:#ffd257; border:0; border-radius:14px; padding:9px 16px; font:900 16px var(--font); cursor:pointer; }
.recbtn .ico { font-size:20px; }
.rec .rlist { display:flex; flex-direction:column; gap:6px; min-height:120px; }
.rec .rnote { color:#aab2c4; font:800 15px var(--font); text-align:center; padding:30px 10px; }
.rec .rrow { display:grid; grid-template-columns:34px 38px 1fr auto; gap:10px; align-items:center; background:rgba(255,255,255,.05); border-radius:12px; padding:6px 12px; font:800 15px var(--font); }
.rec .rrow.me { background:rgba(255,122,26,.22); box-shadow:inset 0 0 0 2px #ff7a1a; }
.rec .rrow .rk { color:#ffd257; font:900 16px var(--font); text-align:center; }
.rec .rrow img, .rec .rrow .av { width:38px; height:38px; border-radius:50%; object-fit:cover; background:#2b3142; display:grid; place-items:center; font:900 16px var(--font); color:#aab2c4; font-style:normal; }
.rec .rrow .nm { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rec .rrow .sc { color:#fff; }
.offer { pointer-events:auto; display:flex; align-items:center; gap:10px; background:#1b1430; color:#fff; border-radius:14px; padding:8px 8px 8px 14px; font:900 15px var(--font); box-shadow:0 10px 24px rgba(0,0,0,.45), inset 0 0 0 2px #9b6bff; position:relative; overflow:hidden; }
.offer .ico { color:#ffd257; font-size:22px; }
.offer i.tm { position:absolute; left:0; bottom:0; height:3px; background:#9b6bff; animation:offerT var(--t,9s) linear forwards; }
@keyframes offerT { from { width:100%; } to { width:0; } }
.dmv { position:relative; width:min(980px,97vw); max-height:94vh; overflow:auto; border-radius:22px; background:#eef1f6; padding:18px; display:grid; grid-template-columns:minmax(240px,380px) 1fr; gap:18px; align-items:start; box-shadow:0 20px 50px rgba(0,0,0,.6); }
.dmv .x { background:rgba(0,0,0,.1); color:#1d2333; }
.dmv h2 { margin:0 0 8px; font:400 28px var(--logo); color:#1d2333; }
.dmv .lic { width:100%; }
.dmv p.n { font:700 13px/1.4 var(--font); color:#4a5370; margin:10px 0 0; }
.depart { background:#101318; border-radius:14px; padding:10px; color:#ffcf3f; box-shadow:inset 0 0 0 3px #2a2f3a; }
.depart .row { display:grid; grid-template-columns:42px 1fr auto; gap:10px; align-items:center; padding:8px 6px; border-bottom:1px dashed rgba(255,207,63,.18); }
.depart .row:last-child { border-bottom:0; }
.depart .k { width:40px; height:40px; border-radius:8px; display:grid; place-items:center; font:900 22px var(--font); color:#fff; }
.depart h5 { margin:0; font:900 14px var(--font); letter-spacing:.06em; text-transform:uppercase; }
.depart p { margin:2px 0 0; font:600 12px/1.3 var(--font); color:#c9c3a6; }
.depart .stt { font:900 12px var(--font); letter-spacing:.06em; text-transform:uppercase; text-align:right; }
.depart .stt.ok { color:#3dff8a; } .depart .stt.no { color:#ff8b80; max-width:120px; } .depart .stt .stars { color:#ffcf3f; font-size:16px; letter-spacing:2px; }
.cork { position:relative; width:min(1000px,97vw); max-height:94vh; overflow:auto; border-radius:20px; padding:18px 18px 26px;
  background:radial-gradient(circle at 20% 30%, rgba(0,0,0,.08) 1px, transparent 2px) 0 0/9px 9px, linear-gradient(135deg,#c9955c,#b57d45); box-shadow:inset 0 0 0 10px #6b4423, 0 20px 50px rgba(0,0,0,.6); }
.cork h2 { margin:4px 0 20px 8px; font:400 30px var(--logo); color:#fff; text-shadow:0 3px 0 #6b4423; }
.tickets { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:26px 18px; padding:0 4px; }
.cork .ticket { width:auto; }
.cork .ticket .pin { position:absolute; top:-14px; left:50%; width:18px; height:18px; margin-left:-9px; border-radius:50%; background:radial-gradient(circle at 35% 35%, #ff8b80, #c52b20); box-shadow:0 3px 4px rgba(0,0,0,.4); z-index:2; }
.cork .ticket p { margin:0; font:600 13px/1.35 var(--font); color:#4a5370; }
.cork .ticket .meta { display:flex; gap:10px; font:800 12px var(--font); color:#5b6278; margin-top:8px; flex-wrap:wrap; }
.cork .ticket .meta span { display:flex; align-items:center; gap:4px; }
.cork .ticket.off { opacity:.62; filter:grayscale(.6); }
.cork .empty { background:#fffdf7; padding:16px; font:800 16px/1.4 var(--font); border-radius:6px; max-width:520px; }
.ivi { position:relative; width:min(640px,96vw); max-height:94vh; overflow:auto; border-radius:26px; background:linear-gradient(160deg,#20252f,#0f1217); padding:20px; color:#e8ecf3;
  box-shadow:0 0 0 6px #2a303b, 0 0 0 8px #0a0c10, 0 20px 50px rgba(0,0,0,.6); }
.ivi h2 { margin:0 0 14px; font:900 20px var(--font); display:flex; gap:10px; align-items:center; letter-spacing:.04em; text-transform:uppercase; }
.ivi .rowset { display:grid; grid-template-columns:auto 1fr; gap:12px 16px; align-items:center; font:800 15px var(--font); }
.ivi .rowset label { display:flex; gap:8px; align-items:center; color:#aab2c4; }
.ivi input[type=range] { width:100%; accent-color:#ff7a1a; height:26px; }
.seg { display:flex; background:#0b0d12; border-radius:12px; padding:4px; gap:4px; flex-wrap:wrap; }
.seg button { pointer-events:auto; flex:1; border:0; border-radius:9px; padding:8px 10px; background:transparent; color:#aab2c4; font:800 13px var(--font); cursor:pointer; }
.seg button.on { background:#ff7a1a; color:#fff; }
.keys { display:grid; grid-template-columns:auto 1fr auto 1fr; gap:6px 10px; font:700 13px var(--font); color:#aab2c4; margin-top:16px; align-items:center; }
.keys kbd { background:#e8ecf3; color:#151821; border-radius:6px; padding:2px 8px; font:900 12px var(--font); text-align:center; box-shadow:inset 0 -2px 0 #9aa3b2; white-space:nowrap; }
.hl-touch .keys { display:none; }
.proto { position:relative; width:min(560px,95vw); max-height:94vh; overflow:auto; overflow-x:hidden; background:var(--paper); padding:24px 26px 22px; box-shadow:0 20px 50px rgba(0,0,0,.6); transform:rotate(-.6deg);
  background-image:repeating-linear-gradient(transparent 0 27px, #d9e3f2 27px 28px); text-align:center; }
.proto .hd { font:900 12px var(--font); letter-spacing:.18em; color:#7a8193; text-transform:uppercase; }
.proto h3 { margin:2px 0 6px; font:400 28px var(--logo); color:#1d2333; }
.proto .score { font:900 clamp(52px,11vw,92px)/1 var(--font); color:#1d2333; }
.proto .score small { font-size:.36em; color:#7a8193; }
.stamp { position:absolute; right:16px; top:70px; font:900 clamp(24px,5vw,40px) var(--font); border:5px solid currentColor; border-radius:10px; padding:2px 12px; transform:rotate(-12deg);
  opacity:.88; animation:stamp .45s cubic-bezier(.2,1.6,.4,1); text-transform:uppercase; }
.stamp.ok { color:#1d9a52; } .stamp.no { color:var(--pen); }
@keyframes stamp { from { transform:rotate(-12deg) scale(2.6); opacity:0; } }
.proto .stars { font-size:38px; color:#ffb340; letter-spacing:6px; } .proto .stars .e { color:#d8dce4; }
.proto .rw { font:900 20px var(--font); color:var(--green); } .proto .nl { font:900 17px var(--font); }
.proto ul { list-style:none; padding:0; margin:12px 0 0; display:flex; flex-wrap:wrap; justify-content:center; gap:6px; }
.proto li { font:800 13px var(--font); color:var(--pen); border:2px solid rgba(198,47,47,.4); border-radius:6px; padding:2px 8px; }
.proto .sign { display:flex; justify-content:space-between; gap:10px; margin-top:14px; font:700 12px var(--font); color:#7a8193; border-top:1.5px solid #c4c9d6; padding-top:6px; flex-wrap:wrap; }
.proto .sign i { font:italic 800 16px var(--font); color:#2a4aa8; }
.atlas { position:relative; background:#f3ead6; padding:14px; border-radius:6px; box-shadow:0 20px 50px rgba(0,0,0,.6); max-width:96vw; }
.atlas canvas { display:block; max-width:min(1100px, 90vw); max-height:84vh; border-radius:3px; }
.atlas .x { background:#1d2333; }
.legend { position:absolute; left:24px; bottom:24px; background:rgba(255,253,244,.94); border-radius:10px; padding:8px 10px; display:grid; grid-template-columns:auto auto; gap:4px 10px; font:800 12px var(--font); box-shadow:0 4px 12px rgba(0,0,0,.25); }
.legend span { display:flex; align-items:center; gap:6px; } .legend i { width:12px; height:12px; border-radius:50%; display:inline-block; }
@media (max-width: 700px) { .dmv { grid-template-columns:1fr; } .keys { grid-template-columns:auto 1fr; } }

/* ===== сенсорное управление ===== */
.tc { display:none; }
.hl-touch .tc { display:block; }
.wheelpad { width:260px; height:230px; position:relative; }
.wheel { position:absolute; left:10px; bottom:0; width:220px; height:220px; pointer-events:auto; touch-action:none; }
.wheel svg { width:100%; height:100%; filter:drop-shadow(0 8px 10px rgba(0,0,0,.45)); }
.stalk { position:absolute; top:0; width:62px; height:40px; border-radius:20px; pointer-events:auto; touch-action:none; display:grid; place-items:center; color:#fff; font-size:22px;
  background:linear-gradient(180deg,#3a414f,#1d2129); box-shadow:0 4px 8px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.15); }
.stalk.l { left:20px; } .stalk.r { left:168px; }
.stalk.on { color:#3dff8a; }
.pedals { width:270px; height:240px; position:relative; }
.ped { position:absolute; bottom:0; pointer-events:auto; touch-action:none; transition:transform .06s; transform-origin:50% 100%; }
.ped svg { width:100%; height:100%; filter:drop-shadow(0 8px 10px rgba(0,0,0,.45)); }
.ped.on { transform:perspective(300px) rotateX(20deg) scale(.97); }
.ped.gas { right:4px; width:92px; height:176px; } .ped.brk { right:108px; width:118px; height:118px; }
.mini-btn { position:absolute; width:52px; height:52px; border-radius:50%; pointer-events:auto; touch-action:none; display:grid; place-items:center; color:#fff; font-size:23px;
  background:linear-gradient(180deg,#3a414f,#1d2129); box-shadow:0 4px 8px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.15); }
.mini-btn.on { background:linear-gradient(180deg,#ff8a3d,#d4570c); }
.mini-btn.hbk { right:140px; bottom:128px; } .mini-btn.cm { right:20px; bottom:186px; } .mini-btn.rd { right:78px; bottom:186px; }
`,

    // --- Сборка DOM -----------------------------------------------------------------------------------

    init(game) {
        this.game = game;
        const st = document.createElement('style');
        st.textContent = this.FONT_CSS + this.CSS;
        document.head.appendChild(st);
        const I = (n, c) => this.icon(n, c);
        const ribs = (ys, x, w, h) => ys.map(y => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#161a21"/>`).join('');
        const root = document.createElement('div');
        root.id = 'gui';
        root.innerHTML = `
<div id="g-hud" class="hide">
  <div id="g-wallet"><div class="gk fob">
    <div class="ring"><svg viewBox="0 0 62 62"><circle cx="31" cy="31" r="27" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="6"/><circle id="g-xpring" cx="31" cy="31" r="27" fill="none" stroke="#7fc8ff" stroke-width="6" stroke-linecap="round" stroke-dasharray="0 200"/></svg>
      <div class="c" id="g-licbadge">У</div></div>
    <div class="cash">${I('coin')}<span class="num" id="g-money">0</span></div>
    <div class="pts">${I('star')}<span id="g-xptxt"></span></div>
    <div class="sticky" id="g-goal"></div>
  </div></div>
  <div id="g-clip" class="hide"><div class="gk" id="g-clipin"></div></div>
  <div id="g-say"><div class="gk mirror-wrap">
    <div class="mirror-stem"></div>
    <div class="mirror" id="g-mirror"><div class="mirror-glass"><div class="mirror-face" id="g-face"></div></div><div class="tag" data-t="who.instr"></div><div class="mood" id="g-mood">${I('clipboard')}</div></div>
    <div class="caption off" id="g-sayin"><b data-t="who.instr"></b><span id="g-saytxt"></span></div>
  </div></div>
  <div id="g-mini"><div class="gk phone">
    <div class="clamp l"></div><div class="clamp r"></div>
    <div class="body"><div class="scr"><div class="notch"></div>
      <div class="navbar idle" id="g-navbar"><span class="ar" id="g-navar">${I('car')}</span><div><div class="d num" id="g-navd"></div><div class="t" id="g-navt"></div></div></div>
      <div class="mapbox"><canvas id="g-minicv" width="420" height="368"></canvas><div class="compass" id="g-north">N</div><div class="eta num hide" id="g-dist"></div><div class="lim num" id="g-limit">60</div></div>
      <div class="dock">
        <button class="app a1" id="g-bjobs" title="J">${I('clipboard')}<span class="badge hide" id="g-jobdot">!</span></button>
        <button class="app a2" id="g-blic">${I('card')}</button>
        <button class="app a3" id="g-bmap" title="M">${I('map')}</button>
        <button class="app a4" id="g-bpause" title="Esc">${I('pause')}</button>
      </div>
    </div></div>
  </div></div>
  <div id="g-dash"><div class="gk cluster">
    <button class="keycap hide" id="g-ctx"><kbd id="g-ctxkey">F</kbd><span id="g-ctxtxt"></span></button>
    <div class="binn"></div>
    <div class="gauge l" id="g-tacho"></div>
    <div class="gauge r" id="g-speedo"></div>
    <div class="lamps"><span class="lamp" id="g-indl">${I('left')}</span><span class="lamp" id="g-indr">${I('right')}</span></div>
    <div class="lcd"><div class="s num" id="g-spd">0</div><div class="u" data-t="hud.kmh"></div>
      <div class="gears"><b data-g="P">P</b><b data-g="R">R</b><b data-g="N">N</b><b data-g="D">D</b><span class="gnum" id="g-gnum"></span></div></div>
    <div class="hb" id="g-hb">P</div>
  </div></div>
  <div id="g-steer" class="tc"><div class="gk wheelpad">
    <div class="stalk l" id="g-stl">${I('left')}</div><div class="stalk r" id="g-str">${I('right')}</div>
    <div class="wheel" id="g-wheel"><svg viewBox="0 0 220 220" id="g-wheelsvg">
      <circle cx="110" cy="110" r="96" fill="none" stroke="#11141a" stroke-width="24"/><circle cx="110" cy="110" r="96" fill="none" stroke="#353c49" stroke-width="16"/>
      <path d="M40 40 A96 96 0 0 1 180 40" fill="none" stroke="#ff7a1a" stroke-width="5" opacity=".8"/>
      <path d="M18 104 H202" stroke="#2a303b" stroke-width="22"/><path d="M110 110 V204" stroke="#2a303b" stroke-width="24"/>
      <circle cx="110" cy="110" r="40" fill="#11141a"/><circle cx="110" cy="110" r="33" fill="#ff7a1a"/>
      <g transform="translate(92 92) scale(1.5)" stroke="#fff" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${this.ICONS.horn}</g>
    </svg></div>
  </div></div>
  <div id="g-pedals" class="tc"><div class="gk pedals">
    <div class="mini-btn cm" data-act="camera">${I('camera')}</div><div class="mini-btn rd" data-act="radio">${I('radio')}</div>
    <div class="mini-btn hbk" data-hold="handbrake">${I('hand')}</div>
    <div class="ped brk" data-hold="back"><svg viewBox="0 0 118 118"><rect x="4" y="4" width="110" height="110" rx="18" fill="#2a303b" stroke="#11141a" stroke-width="4"/>${ribs([18, 36, 54, 72, 90], 18, 82, 8)}
      <text x="59" y="66" text-anchor="middle" font-family="GRubik" font-weight="900" font-size="14" fill="#ff8a80" data-t="ped.brake"></text></svg></div>
    <div class="ped gas" data-hold="forward"><svg viewBox="0 0 92 176"><rect x="4" y="4" width="84" height="168" rx="16" fill="#2a303b" stroke="#11141a" stroke-width="4"/>${ribs([20, 42, 64, 86, 108, 130, 152], 16, 60, 9)}
      <text x="46" y="94" text-anchor="middle" font-family="GRubik" font-weight="900" font-size="14" fill="#8fffbc" data-t="ped.gas"></text></svg></div>
  </div></div>
</div>
<div id="g-menu" class="hide"><div class="mstage land" id="g-mstage">
  <div class="post-wrap">
    <div class="hwsign"><div class="tab" data-t="menu.tab"></div><div class="in"><h1>Can You Pass<br>The <em>Driving</em> Test?</h1><div class="sub">${I('flag')}<span data-t="menu.sub"></span></div></div></div>
    <div class="signs">
      <button class="sbtn go" id="g-play">${I('play')}<span data-t="menu.play"></span></button>
      <div class="sbtn-row">
        <button class="sbtn blue" id="g-mlic">${I('card')}<span data-t="menu.license"></span></button>
        <button class="sbtn green" id="g-mcars">${I('car')}<span data-t="menu.cars"></span></button>
      </div>
      <div class="sbtn-row">
        <button class="sbtn white" id="g-mset">${I('sliders')}<span data-t="menu.settings"></span></button>
        <button class="sbtn white" id="g-mhow">${I('help')}<span data-t="menu.howto"></span></button>
      </div>
    </div>
  </div>
  <div class="menu-side">
    <div class="wallet-pill"><span>${I('coin')}<b class="num" id="g-mmoney">0</b></span><span class="p">${I('star')}<b class="num" id="g-mxp">0</b></span></div>
    <div id="g-madcash" class="madcash"></div>
    <button class="recbtn hide" id="g-mrec">${I('trophy')}<span data-t="menu.records"></span></button>
    <div id="g-mcard"></div>
  </div>
</div></div>
<div id="g-toasts"></div>
<div id="g-modal" class="hide"></div>`;
        document.body.appendChild(root);
        this.root = root;
        // Playables: межстраничная реклама по каждому нажатию кнопки интерфейса — только вне езды (меню, окна, пауза)
        // и никогда во время rewarded. Показывать ли ролик, решает YouTube (requestInterstitialAd ничего не гарантирует).
        this._clickAdsOn = this.clickAds();
        if (this._clickAdsOn) document.addEventListener('click', (e) => this._clickAd(e), true);
        const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
        for (const id of ['g-hud', 'g-menu', 'g-money', 'g-xptxt', 'g-xpring', 'g-licbadge', 'g-goal', 'g-clip', 'g-clipin', 'g-mirror', 'g-face', 'g-mood',
            'g-sayin', 'g-saytxt', 'g-navbar', 'g-navar', 'g-navd', 'g-navt', 'g-minicv', 'g-north', 'g-dist', 'g-limit', 'g-jobdot', 'g-ctx', 'g-ctxkey', 'g-ctxtxt',
            'g-tacho', 'g-speedo', 'g-indl', 'g-indr', 'g-spd', 'g-gnum', 'g-hb', 'g-wheelsvg', 'g-stl', 'g-str', 'g-modal', 'g-toasts', 'g-mmoney', 'g-mxp', 'g-mcard', 'g-mstage', 'g-madcash', 'g-mrec']) {
            this.el[id.slice(2)] = $(id);
        }
        this.el.gears = [...root.querySelectorAll('.lcd .gears b')];
        if (typeof Lang !== 'undefined') Lang.apply();
        for (const t of root.querySelectorAll('text[data-t]')) t.textContent = Lang.t(/** @type {HTMLElement} */ (t).dataset.t);
        this._gauges();
        this._bind();
        this._layout();
        this._buildMap();
        this._tutorial();
        this.refreshStats();
    },

    // Стрелочный прибор: шкала 270°, деления и цифры — SVG, стрелка — группа с поворотом.
    _gaugeSvg(max, step, minor, red, label) {
        const cx = 100, cy = 100, R = 84, a0 = -225, sweep = 270;
        const pt = (v, r) => { const a = (a0 + sweep * v / max) * Math.PI / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
        let s = '';
        if (red) {
            const p1 = pt(red, R - 3), p2 = pt(max, R - 3);
            s += `<path d="M${p1[0].toFixed(1)} ${p1[1].toFixed(1)} A${R - 3} ${R - 3} 0 0 1 ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}" fill="none" stroke="#e5372f" stroke-width="7"/>`;
        }
        for (let v = 0; v <= max + 1e-6; v += minor) {
            const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
            const a = pt(v, R), b = pt(v, R - (major ? 13 : 7));
            s += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${red && v >= red ? '#ff6b5e' : '#e9eef6'}" stroke-width="${major ? 3 : 1.5}" stroke-linecap="round"/>`;
            if (major) { const t = pt(v, R - 27); s += `<text x="${t[0].toFixed(1)}" y="${(t[1] + 5).toFixed(1)}" text-anchor="middle" font-family="GRubik" font-weight="800" font-size="${max >= 100 ? 13 : 15}" fill="#dfe6f1">${Math.round(v)}</text>`; }
        }
        s += `<text x="100" y="150" text-anchor="middle" font-family="GRubik" font-weight="800" font-size="10" fill="#7f8aa0" letter-spacing="2">${label}</text>`;
        s += `<g class="needle"><path d="M96.5 104 L100 22 L103.5 104 Z" fill="#ff5a1f"/></g><circle cx="100" cy="100" r="10" fill="#2a303b" stroke="#596172" stroke-width="2"/>`;
        return `<svg viewBox="0 0 200 200">${s}</svg>`;
    },

    _gauges() {
        const car = this.game.car;
        const top = car ? car.def.stats.top : 200;
        const max = Math.max(160, Math.ceil(top / 40) * 40);
        this.gaugeMax = max;
        const step = max > 240 ? 40 : 20;
        this.el.speedo.innerHTML = this._gaugeSvg(max, step, step / 2, 0, Lang.t('hud.kmh').toUpperCase());
        const red = car ? Math.round(car.P.redline / 100) / 10 : 6.5;
        this.el.tacho.innerHTML = this._gaugeSvg(8, 1, 0.5, red, 'RPM ×1000');
        this.el.needleS = this.el.speedo.querySelector('.needle');
        this.el.needleT = this.el.tacho.querySelector('.needle');
    },

    _bind() {
        const click = (id, fn) => { const e = document.getElementById(id); if (e) e.addEventListener('click', () => { this.sfx('click'); fn(); }); };
        click('g-play', () => this.startDriving());
        click('g-mlic', () => this.openLicense());
        click('g-mcars', () => this.openDealer());
        click('g-mset', () => this.openSettings(false));
        click('g-mhow', () => this.howTo());
        click('g-mrec', () => this.openRecords());
        click('g-bjobs', () => this.toggleJobs());
        click('g-blic', () => this.openLicense());
        click('g-bmap', () => this.toggleBigMap());
        click('g-bpause', () => this.openPause());
        click('g-ctx', () => { if (this.contextAction) this.contextAction(); });
        // Педали, ручник, кнопки: удержание -> Input.setVirtual, нажатие -> действие.
        for (const b of /** @type {NodeListOf<HTMLElement>} */ (this.root.querySelectorAll('[data-hold],[data-act]'))) {
            const hold = b.dataset.hold, act = b.dataset.act;
            const on = (e) => { e.preventDefault(); b.classList.add('on'); if (hold) Input.setVirtual(hold, true); if (act) this._touchAct(act); };
            const off = (e) => { e.preventDefault(); b.classList.remove('on'); if (hold) Input.setVirtual(hold, false); };
            b.addEventListener('pointerdown', on);
            for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, off);
        }
        // Подрулевые переключатели — поворотники.
        for (const [id, side] of /** @type {[string, number][]} */ ([['g-stl', -1], ['g-str', 1]])) {
            document.getElementById(id).addEventListener('pointerdown', (e) => {
                e.preventDefault();
                const c = this.game.car; c.indicator = c.indicator === side ? 0 : side; c.indT = 0; this.sfx('indicator');
            });
        }
        // Руль: левая/правая половина — поворот (палец можно вести), центр — сигнал.
        const wheel = document.getElementById('g-wheel');
        /** @type {Map<number, string>} */
        const fingers = new Map();
        const apply = () => { const v = [...fingers.values()]; Input.setVirtual('left', v.includes('left')); Input.setVirtual('right', v.includes('right')); };
        const zone = (e) => {
            const r = wheel.getBoundingClientRect();
            const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
            if (Math.hypot(dx, dy) < r.width * 0.17) return 'horn';
            return dx < 0 ? 'left' : 'right';
        };
        wheel.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            try { wheel.setPointerCapture(e.pointerId); } catch (err) { /* нет захвата */ }
            const z = zone(e);
            if (z === 'horn') { this.game._event({ type: 'horn' }); return; }
            fingers.set(e.pointerId, z); apply();
        });
        wheel.addEventListener('pointermove', (e) => { if (!fingers.has(e.pointerId)) return; const z = zone(e); if (z !== 'horn') { fingers.set(e.pointerId, z); apply(); } });
        const up = (e) => { fingers.delete(e.pointerId); apply(); };
        wheel.addEventListener('pointerup', up);
        wheel.addEventListener('pointercancel', up);
        window.addEventListener('lory-release-input', () => { fingers.clear(); for (const b of this.root.querySelectorAll('.on')) b.classList.remove('on'); });
        this.el.modal.addEventListener('pointerdown', (e) => { if (e.target === this.el.modal && this.modal !== 'result') this.closeModal(); });
        window.addEventListener('resize', () => this.fitMenu());
    },

    _touchAct(act) {
        if (act === 'camera') { this.game.camMode = (this.game.camMode + 1) % 2; this.sfx('camera'); }
        else if (act === 'radio') GameAudio.nextStation();
    },

    _layout() {
        if (typeof HudLayout === 'undefined') return;
        // самый низкий альбомный экран (568×320): машине нужны руль, педали и навигатор — разрешаем масштаб чуть меньше, чем у движка по умолчанию
        const baseCfg = HudLayout.cfg.bind(HudLayout);
        HudLayout.cfg = () => Object.assign(baseCfg(), { kMin: 0.44 });
        HudLayout.init({ app: this.game.app });
        // стандартные стик и кнопка Input не используются (свой руль и педали) — их места не держим
        HudLayout.remove('input-stick'); HudLayout.remove('input-action');
        const clipOn = () => !!(GameExam.active || GameJobs.active) && this.game.state === 'drive';
        // низкий альбомный экран: во время экзамена/работы брелок уступает место протоколу
        this._walletOff = () => clipOn() && (HudLayout.mode === 'low' || window.innerHeight < 420);
        HudLayout.block('clip', { dock: 'tl', w: 310, h: 330, el: '#g-clip', order: 0, visible: clipOn });
        HudLayout.block('wallet', { dock: 'tl', w: 280, h: 122, el: '#g-wallet', order: 1, visible: () => !this._walletOff() });
        HudLayout.block('mini', { dock: 'tr', w: 236, h: 380, el: '#g-mini', order: 0 });
        HudLayout.block('say', { dock: 'tc', w: 520, h: 168, el: '#g-say', minW: 320 });
        HudLayout.block('dash', { dock: 'bc', w: 460, h: 182, el: '#g-dash' });
        HudLayout.block('steer', { dock: 'bl', w: 260, h: 230, el: '#g-steer', touchOnly: true, min: 0.55 });
        HudLayout.block('pedals', { dock: 'br', w: 270, h: 240, el: '#g-pedals', touchOnly: true, min: 0.55 });
    },

    sfx(n) { if (typeof GameAudio !== 'undefined') GameAudio.sfx(n); },

    // --- Меню -------------------------------------------------------------------------------------

    // Меню — сцена фиксированного размера (альбом 1280×720, портрет 440×900), масштаб — чтобы влезла целиком.
    fitMenu() {
        const st = this.el.mstage;
        if (!st) return;
        const W = window.innerWidth || 800, H = window.innerHeight || 600;
        const port = H > W * 1.05;
        st.classList.toggle('port', port); st.classList.toggle('land', !port);
        this.el.menu.classList.toggle('port', port);
        const rw = port ? 440 : 1280, rh = port ? 900 : 720;
        const k = Math.min(W / rw, H / rh);
        st.style.transform = `translate(-50%, -50%) scale(${k.toFixed(4)})`;
        // в портрете права — между знаком и кнопками
        const side = st.querySelector('.menu-side'), signs = st.querySelector('.signs'), post = st.querySelector('.post-wrap');
        if (port && side && signs && signs.parentElement !== st) { st.appendChild(signs); st.insertBefore(side, signs); }
        if (!port && side && signs && signs.parentElement !== post) { post.appendChild(signs); st.appendChild(side); }
    },

    showMenu() {
        this.fitMenu();
        this.el.menu.classList.remove('hide');
        this.el.hud.classList.add('hide');
        this.el.mcard.innerHTML = this._licCard();
        this.refreshStats();
        this._cashOffer(this.el.madcash);
        this.el.mrec.classList.toggle('hide', !this.recordsOn());
    },

    startDriving() {
        this.el.menu.classList.add('hide');
        this.el.hud.classList.remove('hide');
        this.game.play();
        this._gauges();
        if (typeof HudLayout !== 'undefined') HudLayout.refresh();
        if (typeof Tutorial !== 'undefined' && !this.game.save.tutorialDone) Tutorial.autoStart();
    },

    howTo() {
        this.closeModal();
        if (this.game.state !== 'drive') this.startDriving();
        if (typeof Tutorial !== 'undefined') Tutorial.start({ replay: true });
    },

    _tutorial() {
        if (typeof Tutorial === 'undefined') return;
        const g = this.game;
        Tutorial.init({
            app: g.app,
            steps: [
                { id: 'drive', title: 'tut.drive.t', hint: { keyboard: 'tut.drive.h', touch: 'tut.drive.touch' }, target: { touch: '#g-pedals .gas' }, check: () => g.car.speed > 3 ? true : g.car.speed / 3 },
                { id: 'steer', title: 'tut.steer.t', hint: { keyboard: 'tut.steer.h', touch: 'tut.steer.touch' }, target: { touch: '#g-wheel' }, check: (c) => { c.step._s = (c.step._s || 0) + (Math.abs(g.car.steer) > 0.15 && g.car.speed > 1 ? c.dt : 0); return Math.min(1, c.step._s / 1.2); } },
                { id: 'reverse', title: 'tut.reverse.t', hint: { keyboard: 'tut.reverse.h', touch: 'tut.reverse.touch' }, target: { touch: '#g-pedals .brk' }, check: () => g.car.gear === 'R' && g.car.speed > 0.5 },
                { id: 'signal', title: 'tut.signal.t', hint: { keyboard: 'tut.signal.h', touch: 'tut.signal.touch' }, target: { touch: '#g-stl' }, check: () => g.car.indicator !== 0 },
                { id: 'goal', title: 'tut.goal.t', hint: 'tut.goal.h', target: '#g-wallet', check: (c) => c.time > 5 },
            ],
            state: () => g.save, field: 'tutorialDone', persist: () => g.persist(),
            onFinish: () => { g.persist(); },
            css: `:root { --tut-bg: rgba(14,16,22,.94); --tut-fg: #fff; --tut-accent: #ff7a1a; --tut-border: #ff7a1a; --tut-font: 'GRubik', system-ui, sans-serif; --tut-radius: 14px; }`,
        });
    },

    _licCard() {
        const s = this.game.save;
        const cats = GAME_LICENSES.map((L, i) => {
            const cls = i < s.license ? 'on' : i === s.license ? 'next' : '';
            const stars = s.stars && s.stars[L.id] ? '★'.repeat(s.stars[L.id]) : '';
            return `<div class="cat ${cls}" style="--c:${L.color}">${L.id}<small>${i < s.license ? (stars || '✓') : Lang.t('lic.' + L.id)}</small></div>`;
        }).join('');
        const cur = s.license ? GAME_LICENSES[s.license - 1] : null;
        return `<div class="lic"><div class="hd"><b>${Lang.t('lic.title')}</b><span>${cur ? Lang.t('hud.license', { c: cur.id }) : Lang.t('hud.learner')}</span></div>
          <div class="ph" style="background-image:url('assets/ui/driver_calm.webp')"></div><div class="grid">${cats}</div>
          <div class="ft"><span class="num">№ ${String(7700 + ((s.stats && s.stats.exams) || 0) * 13).padStart(6, '0')}</span><span class="sig">${Lang.t('lic.sig')}</span></div></div>`;
    },

    // --- Статы -------------------------------------------------------------------------------------

    refreshStats() {
        const s = this.game.save;
        if (!this.el.money) return;
        this.el.money.textContent = s.money.toLocaleString();
        const cur = s.license ? GAME_LICENSES[s.license - 1] : null;
        const next = GAME_LICENSES[s.license];
        this.el.licbadge.textContent = cur ? cur.id : 'У';
        this.el.licbadge.style.background = cur ? cur.color : '#ff7a1a';
        const prev = s.license ? GAME_LICENSES[s.license - 1].xp : 0;
        let f = 1;
        if (next) f = Math.max(0, Math.min(1, (s.xp - prev) / Math.max(1, next.xp - prev)));
        this.el.xpring.setAttribute('stroke-dasharray', (f * 169.6).toFixed(1) + ' 200');
        this.el.xpring.setAttribute('stroke', next && s.xp >= next.xp ? '#3dff8a' : '#7fc8ff');
        this.el.xptxt.textContent = next ? (s.xp >= next.xp ? Lang.t('lic.ready') : s.xp + ' / ' + next.xp + ' ' + Lang.t('hud.pts')) : String(s.xp);
        let goal;
        if (!next) goal = Lang.t('goal.legend');
        else if (s.license === 0) goal = Lang.t('goal.first');
        else if (s.xp < next.xp) goal = Lang.t('goal.points', { n: next.xp - s.xp });
        else goal = Lang.t('goal.exam', { c: next.id });
        this.el.goal.textContent = goal;
        this.el.mmoney.textContent = s.money.toLocaleString();
        this.el.mxp.textContent = String(s.xp);
    },

    // --- Реплики и всплывающие знаки -----------------------------------------------------------------

    say(text, mood, dur) {
        const m = mood || 'calm';
        const cap = this.el.sayin;
        if (!cap) return;
        cap.className = 'caption ' + m;
        this.el.saytxt.textContent = text;
        this.el.mirror.className = 'mirror ' + m;
        const img = { happy: 'assets/ui/instructor_happy.webp', angry: 'assets/ui/instructor_angry.webp', shock: 'assets/ui/instructor_shock.webp' }[m] || 'assets/ui/instructor_calm.webp';
        this.el.face.style.backgroundImage = `url('${img}')`;
        this.el.mood.innerHTML = this.icon({ angry: 'warn', shock: 'warn', happy: 'check', point: 'arrow' }[m] || 'clipboard');
        void cap.offsetWidth;
        this.sayT = dur || Math.min(7, 2.4 + text.length * 0.055);
    },

    toast(text, kind) {
        const t = document.createElement('div');
        const k = kind || 'info';
        t.className = 'toast ' + k;
        t.innerHTML = this.icon({ bad: 'warn', warn: 'warn', good: 'check', info: 'radio' }[k] || 'radio') + '<span></span>';
        /** @type {HTMLElement} */ (t.lastChild).textContent = text;
        this.el.toasts.appendChild(t);
        while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
        setTimeout(() => t.remove(), 2900);
    },

    // --- Кадр HUD -------------------------------------------------------------------------------------

    frame(dt) {
        const g = this.game, car = g.car;
        this._adT -= dt;
        if (this._adT <= 0) { this._adT = 0.4; this._adTick(); }
        if (!car || g.state !== 'drive') {
            if (g.state === 'menu' && g.app.camera) this._menuCamera(dt);
            return;
        }
        if (this.sayT > 0) { this.sayT -= dt; if (this.sayT <= 0) this.el.sayin.classList.add('off'); }
        const kmh = Math.round(car.kmh);
        const sp = String(kmh);
        if (this.el.spd.textContent !== sp) this.el.spd.textContent = sp;
        if (this.el.needleS) this.el.needleS.setAttribute('transform', `rotate(${(-135 + 270 * Math.min(1.02, car.kmh / this.gaugeMax)).toFixed(1)} 100 100)`);
        if (this.el.needleT) this.el.needleT.setAttribute('transform', `rotate(${(-135 + 270 * Math.min(1.02, car.rpm / 8000)).toFixed(1)} 100 100)`);
        for (const b of this.el.gears) b.classList.toggle('on', b.dataset.g === car.gear);
        this.el.gnum.textContent = car.gear === 'D' ? String(car.gearNum) : '';
        const blink = car.blinkOn;
        this.el.indl.classList.toggle('on', blink && (car.indicator === -1 || car.indicator === 2));
        this.el.indr.classList.toggle('on', blink && (car.indicator === 1 || car.indicator === 2));
        this.el.stl.classList.toggle('on', car.indicator === -1 || car.indicator === 2);
        this.el.str.classList.toggle('on', car.indicator === 1 || car.indicator === 2);
        this.el.hb.classList.toggle('on', car.handbrake || car.gear === 'P');
        if (this.el.wheelsvg) this.el.wheelsvg.style.transform = `rotate(${(car.steer / (car.P.steerMax || 0.6) * 110).toFixed(1)}deg)`;
        const lim = GameRules.limit;
        this.el.limit.textContent = String(lim);
        this.el.limit.classList.toggle('over', kmh > lim + GAME_SPEED.tolerance);
        this._clip();
        this._context();
        // мини-карта — 20 раз в секунду: на телефоне перерисовка большого холста каждый кадр заметна
        this._mapT = (this._mapT || 0) + dt;
        if (this._mapT >= 0.05) { this._mapT = 0; this._minimap(); }
        this._navbar();
        this.el.jobdot.classList.toggle('hide', !(g.save.license >= 1 && !GameJobs.active && !GameExam.active));
        const w = document.getElementById('g-wallet');
        if (w) w.style.visibility = this._walletOff && this._walletOff() ? 'hidden' : '';
    },

    _clip() {
        const ex = GameExam.view(), jb = GameJobs.view();
        const clip = this.el.clip;
        if (!ex && !jb) { if (!clip.classList.contains('hide')) { clip.classList.add('hide'); this._clipSig = ''; HudLayout.refresh(); } return; }
        if (clip.classList.contains('hide')) { clip.classList.remove('hide'); HudLayout.refresh(); }
        const t = Math.ceil(ex ? ex.time : jb.time);
        const time = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
        // Дешёвая подпись содержимого: разметку строим, только когда что-то сменилось (иначе — только таймер).
        const sig = ex ? 'e' + ex.stage + '|' + ex.minors + '|' + (t < 30) + '|' + ex.title
            : 'j' + jb.step + '|' + jb.cargo + '|' + jb.pay + '|' + jb.title;
        if (sig === this._clipSig) {
            const c = this.el.ctime;
            if (c && c.textContent !== time) c.textContent = time;
            return;
        }
        this._clipSig = sig;
        let html;
        if (ex) {
            const tally = Array.from({ length: ex.maxMinors }, (_, i) => `<i class="${i < ex.minors ? 'x' : ''}"></i>`).join('');
            html = `<div class="board"><div class="clipm"></div><div class="sheet">
              <div class="hd"><span>${ex.title}</span><small>${Lang.t('exam.test', { n: ex.stage, m: ex.total })}</small></div>
              <ul>${ex.steps.map(s => `<li class="${s.state}"><i class="bx"></i>${s.state === 'done' ? this.icon('check', 'tick') : ''}<span>${s.text}</span></li>`).join('')}</ul>
              <div class="ft"><div class="tmr num ${t < 30 ? 'low' : ''}">${this.icon('watch')}<span id="g-ctime">${time}</span></div><div class="tally" title="${Lang.t('exam.minors', { n: ex.minors, m: ex.maxMinors })}">${tally}</div></div>
              <button class="quit" id="g-quit">${Lang.t('exam.cancel')}</button></div></div>`;
        } else {
            html = `<div class="ticket"><div class="no">${Lang.t('jobs.order')} № ${1000 + (this.game.save.stats.jobs || 0) * 7 + 3}</div>
              <div class="tt">${this.icon(this.JOB_ICON[GameJobs.job.def.id] || 'box')}<span>${jb.title}</span></div>
              <div class="st">${jb.step}</div>
              ${jb.cargo !== null ? `<div class="cargo">${this.icon('cake')}<b><i style="width:${jb.cargo}%"></i></b><span class="num">${jb.cargo}%</span></div>` : ''}
              <div class="row"><span class="num" style="display:flex;gap:5px;align-items:center">${this.icon('watch')}<span id="g-ctime">${time}</span></span><span class="pay num">$${jb.pay}</span></div>
              <button class="quit" id="g-quit" style="padding-left:0">${Lang.t('btn.cancel')}</button></div>`;
        }
        this.el.clipin.innerHTML = html;
        this.el.ctime = document.getElementById('g-ctime');
        const q = document.getElementById('g-quit');
        if (q) q.addEventListener('click', () => { if (GameExam.active) GameExam.cancel(); else if (GameJobs.active) GameJobs.cancel(); });
    },

    _context() {
        const g = this.game, car = g.car, loc = g.app.location;
        let key = '', fn = null;
        const sp = loc.marker('spawn');
        const dealer = loc.marker('dealer');
        if (!GameExam.active && car.speed < 1) {
            if (sp && Math.hypot(car.x - sp.x, car.y - sp.y) < 1600) { key = 'ctx.exam'; fn = () => this.openLicense(); }
            else if (dealer && Roads.inRect(Roads.rect(dealer), car.x, car.y, 300)) { key = 'ctx.dealer'; fn = () => this.openDealer(); }
        }
        this.contextAction = fn;
        const touch = document.documentElement.classList.contains('hl-touch');
        if (key !== this.ctxKey || touch !== this.touch) {
            const was = this.ctxKey;
            this.ctxKey = key; this.touch = touch;
            this.el.ctx.classList.toggle('hide', !key);
            this.el.ctxkey.classList.toggle('hide', touch);
            if (key) {
                this.el.ctxtxt.textContent = Lang.t(key);
                if (key !== was && key === 'ctx.exam') GameInstructor.say('school', 'point', null, 60);
                if (key !== was && key === 'ctx.dealer') GameInstructor.say('dealer', 'point', null, 60);
            }
        }
    },

    _menuCamera(dt) {
        const g = this.game, cam = g.app.camera, car = g.car;
        if (!car) return;
        this.menuOrbit += dt * 0.12;
        const portrait = window.innerHeight > window.innerWidth;
        cam.azimuth = car.heading + (portrait ? 3.1 : 2.4) + Math.sin(this.menuOrbit) * 0.5;
        cam.pitch = portrait ? 0.32 : 0.2;
        // в портрете цель камеры ближе к ней, чем машина: машина выше центра — в просвете между знаком и правами
        const near = portrait ? 520 : 0;
        g.camFollow.x = car.x - Math.cos(cam.azimuth) * near; g.camFollow.y = car.y - Math.sin(cam.azimuth) * near; g.camFollow.h = car.h + 90;
        const H = g.app.location.view.world.canvas.clientHeight || 600;
        cam.zoom = cam.zoomTarget = H / (2 * Math.tan(cam.cam.fov / 2) * (portrait ? 1500 : 1150));
    },

    // --- Карта в стиле навигатора -----------------------------------------------------------------

    MAPC: { bg: '#e8eee3', park: '#cfe8c4', water: '#a9d3f2', lot: '#dfe2e8', bld: '#d6d3cc', bldEdge: '#c3bfb5', walk: '#f5f6f8', road: '#ffffff', roadEdge: '#c9ced8', island: '#cfe8c4' },

    _buildMap() {
        const loc = this.game.app.location;
        const W = loc.width, H = loc.height, C = this.MAPC;
        const s = Math.min(2400 / W, 2400 / H);
        this.mapScale = s;
        const cv = document.createElement('canvas');
        cv.width = Math.ceil(W * s); cv.height = Math.ceil(H * s);
        const c = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
        c.fillStyle = C.bg; c.fillRect(0, 0, cv.width, cv.height);
        c.fillStyle = C.park;
        for (const col of GameWorld.colliders) if (col.kind === 'circle' && !col.water && col.r < 80 && col.h > 300) { c.beginPath(); c.arc(col.x * s, col.y * s, Math.max(2, 380 * s), 0, Math.PI * 2); c.fill(); }
        c.fillStyle = C.water;
        for (const w of loc.markers('water')) { c.beginPath(); c.arc(w.x * s, w.y * s, Math.abs(w.scale[0]) * 100 * s, 0, Math.PI * 2); c.fill(); }
        const rect = (q, fill, stroke) => {
            c.save(); c.translate(q.x * s, q.y * s); c.rotate(q.a);
            c.fillStyle = fill; c.fillRect(-q.hx * s, -q.hy * s, q.hx * 2 * s, q.hy * 2 * s);
            if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.strokeRect(-q.hx * s, -q.hy * s, q.hx * 2 * s, q.hy * 2 * s); }
            c.restore();
        };
        for (const q of Roads.lots) rect(q, C.lot);
        for (const col of GameWorld.colliders) {
            if (col.kind !== 'box' || col.car || col.gate || (col.h || 0) < 200 || col.hx > 20000) continue;
            rect({ x: col.x, y: col.y, a: col.a, hx: col.hx, hy: col.hy }, C.bld, C.bldEdge);
        }
        const T = Roads.T;
        const draw = (h, color) => {
            for (const p of Roads.pieces) {
                c.save();
                c.translate(p.x * s, p.y * s); c.rotate(p.r * Math.PI / 2); c.scale(T * s, T * s);
                c.fillStyle = color; c.strokeStyle = color;
                const R = (x, y, w, hh) => c.fillRect(x, y, w, hh);
                switch (p.kind) {
                    case 'straight': if (p.name === 'road-bridge') R(-h, -0.5, h * 2, 1); else R(-0.5, -h, 1, h * 2); break;
                    case 'tee': R(-0.5, -h, 1, h * 2); R(-h, -h, h * 2, 0.5 + h); break;
                    case 'cross': R(-0.5, -h, 1, h * 2); R(-h, -0.5, h * 2, 1); break;
                    case 'bend': c.lineWidth = h * 2; c.beginPath(); c.arc(-0.5, 0.5, 0.5, -Math.PI / 2, 0); c.stroke(); break;
                    case 'end': R(-h, -h, 0.5 + h, h * 2); break;
                    case 'endround': R(0, -h, 0.5, h * 2); c.beginPath(); c.arc(0, 0, h, 0, Math.PI * 2); c.fill(); break;
                    case 'curve': c.lineWidth = h * 2; c.beginPath(); c.arc(-1, 1, 1.5, -Math.PI / 2, 0); c.stroke(); break;
                    case 'round': R(-1.5, -h, 3, h * 2); R(-h, -1.5, h * 2, 3); c.beginPath(); c.arc(0, 0, 0.8 + h, 0, Math.PI * 2); c.fill(); break;
                }
                c.restore();
            }
        };
        draw(0.5, C.walk);
        draw(0.43, C.roadEdge);
        draw(0.38, C.road);
        c.fillStyle = C.island;
        for (const p of Roads.pieces) if (p.kind === 'round') { c.beginPath(); c.arc(p.x * s, p.y * s, 0.4 * T * s, 0, Math.PI * 2); c.fill(); }
        this.mapCanvas = cv;
    },

    _minimap() {
        const g = this.game, car = g.car, cv = /** @type {HTMLCanvasElement} */ (this.el.minicv);
        const c = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
        const s = this.mapScale, W = cv.width, H = cv.height;
        const zoom = (W * 0.5) / (8000 * s);
        const ox = W / 2, oy = H * 0.66;
        c.save();
        c.fillStyle = this.MAPC.bg; c.fillRect(0, 0, W, H);
        c.translate(ox, oy);
        c.rotate(-g.camAz - Math.PI / 2);
        c.scale(zoom, zoom);
        c.translate(-car.x * s, -car.y * s);
        if (this.mapCanvas) c.drawImage(this.mapCanvas, 0, 0);
        const poly = GameNav.poly;
        if (poly && GameNav.target) {
            c.lineCap = 'round'; c.lineJoin = 'round';
            const st = GameNav._nearIdx || 0;
            const path = () => { c.beginPath(); for (let i = st; i < poly.pts.length; i++) { const p = poly.pts[i]; if (i === st) c.moveTo(p.x * s, p.y * s); else c.lineTo(p.x * s, p.y * s); } };
            c.strokeStyle = '#0d4fb8'; c.lineWidth = 15 / zoom; path(); c.stroke();
            c.strokeStyle = '#3d8bff'; c.lineWidth = 10 / zoom; path(); c.stroke();
            const t = GameNav.target;
            c.fillStyle = '#e5372f'; c.strokeStyle = '#fff'; c.lineWidth = 4 / zoom;
            c.beginPath(); c.arc(t.x * s, t.y * s, 13 / zoom, 0, Math.PI * 2); c.fill(); c.stroke();
        }
        if (typeof GameTraffic !== 'undefined' && GameTraffic.cars) {
            c.fillStyle = '#8a93a6';
            const d = 9 / zoom;
            for (const o of GameTraffic.cars) c.fillRect(o.x * s - d / 2, o.y * s - d / 2, d, d);
        }
        c.restore();
        c.save();
        c.translate(ox, oy);
        c.rotate(car.heading - g.camAz);
        c.fillStyle = 'rgba(26,115,232,.18)'; c.beginPath(); c.arc(0, 0, 38, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#1a73e8'; c.strokeStyle = '#fff'; c.lineWidth = 5;
        c.beginPath(); c.moveTo(0, -24); c.lineTo(17, 18); c.lineTo(0, 9); c.lineTo(-17, 18); c.closePath(); c.fill(); c.stroke();
        c.restore();
        const a = -g.camAz - Math.PI;
        const n = this.el.north;
        n.style.left = (50 + Math.cos(a) * 40) + '%';
        n.style.top = (50 + Math.sin(a) * 40) + '%';
        this.el.dist.classList.toggle('hide', !GameNav.target);
        if (GameNav.target) this.el.dist.textContent = this._fmtDist(GameNav.distLeft) + ' · ' + Math.max(1, Math.round(GameNav.distLeft / 100 / 11 / 60)) + ' ' + Lang.t('hud.min');
    },

    _fmtDist(px) {
        return px > 100000 ? (px / 100000).toFixed(1) + ' ' + Lang.t('hud.km') : (Math.round(px / 1000) * 10) + ' ' + Lang.t('hud.m');
    },

    // Полоса манёвра навигатора.
    _navbar() {
        const n = GameNav.next, t = GameNav.target;
        let icon = 'car', d = '', txt = Lang.t('nav.free');
        if (t) {
            if (n && n.dist < 6000) {
                icon = { left: 'left', right: 'right', round: 'round', uturn: 'uturn', straight: 'straight' }[n.turn] || 'straight';
                d = this._fmtDist(Math.max(0, n.dist - 600));
                txt = n.turn === 'round' ? Lang.t('nav.round', { n: n.n }) : Lang.t('nav.' + n.turn);
            } else {
                const near = GameNav.distLeft < 1500;
                icon = near ? 'flag' : 'straight';
                d = this._fmtDist(GameNav.distLeft);
                txt = near ? Lang.t('nav.arrive') : Lang.t('nav.follow');
            }
        }
        const key = icon + '|' + d + '|' + txt + '|' + !!t;
        if (key === this._navKey) return;
        this._navKey = key;
        this.el.navbar.classList.toggle('idle', !t);
        this.el.navar.innerHTML = this.icon(icon);
        this.el.navd.textContent = d;
        this.el.navt.textContent = txt;
    },

    toggleBigMap() {
        if (this.modal === 'map') { this.closeModal(); return; }
        const L = (k) => Lang.t(k);
        this.openModal('map', `<div class="atlas"><button class="x" data-close>${this.icon('cross')}</button><canvas id="g-bigcv"></canvas>
          <div class="legend"><span><i style="background:#ff7a1a"></i>${L('place.spawn')}</span><span><i style="background:#1f5fd6"></i>${L('btn.dealer')}</span>
          <span><i style="background:#1fae5b"></i>${L('legend.shops')}</span><span><i style="background:#e5372f"></i>${L('legend.target')}</span></div></div>`);
        const cv = /** @type {HTMLCanvasElement} */ (document.getElementById('g-bigcv'));
        const src = this.mapCanvas;
        if (!src) return;
        cv.width = src.width; cv.height = src.height;
        const c = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
        c.drawImage(src, 0, 0);
        const s = this.mapScale, loc = this.game.app.location, car = this.game.car;
        const dot = (x, y, color, r) => { c.fillStyle = color; c.strokeStyle = '#fff'; c.lineWidth = 5; c.beginPath(); c.arc(x * s, y * s, r || 16, 0, Math.PI * 2); c.fill(); c.stroke(); };
        const poly = GameNav.poly;
        if (poly && GameNav.target) {
            c.strokeStyle = '#3d8bff'; c.lineWidth = 10; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
            poly.pts.forEach((p, i) => (i ? c.lineTo(p.x * s, p.y * s) : c.moveTo(p.x * s, p.y * s))); c.stroke();
        }
        for (const k of ['shop-pizza', 'shop-post', 'shop-bakery', 'shop-flowers', 'shop-cafe', 'shop-market', 'school']) for (const d of loc.markers(k)) dot(d.x, d.y, '#1fae5b', 12);
        const sp = loc.marker('spawn'); if (sp) dot(sp.x, sp.y, '#ff7a1a', 22);
        const dl = loc.marker('dealer'); if (dl) dot(dl.x, dl.y, '#1f5fd6', 22);
        if (GameNav.target) dot(GameNav.target.x, GameNav.target.y, '#e5372f', 20);
        c.save(); c.translate(car.x * s, car.y * s); c.rotate(car.heading + Math.PI / 2);
        c.fillStyle = '#1a73e8'; c.strokeStyle = '#fff'; c.lineWidth = 6;
        c.beginPath(); c.moveTo(0, -30); c.lineTo(21, 22); c.lineTo(0, 11); c.lineTo(-21, 22); c.closePath(); c.fill(); c.stroke(); c.restore();
    },

    // --- Реклама в интерфейсе ---------------------------------------------------------------------

    _clickAdsOn: false,
    _breakBusy: false,

    // Реклама по кнопкам интерфейса — только сборка Playables (локально для проверки: ?mockads&uiads).
    clickAds() {
        if (Platform.name === 'playables') return Platform.interstitialSupported();
        return Platform.name === 'local' && /[?&]uiads(&|$)/.test(location.search);
    },

    // Нажатие в фазе capture — раньше обработчика кнопки: реклама ставит игру на паузу, действие кнопки выполняется под ней.
    _clickAd(e) {
        const t = e.target instanceof Element ? e.target.closest('button, [role="button"]') : null;
        if (!t || !this.root.contains(t) || /** @type {HTMLButtonElement} */ (t).disabled) return;
        if (t.closest('[data-rewarded]')) return;                     // кнопка «за рекламу» показывает свою рекламу
        if (this.game.state === 'drive' && !this.modal) return;      // идёт езда: кнопки HUD без рекламы
        if (Platform.adActive || Platform._adBusy) return;             // реклама уже идёт (в том числе rewarded)
        Platform.interstitial();
    },

    // Переход после результата или из паузы («Продолжить», «Ещё раз», «В меню»): web и Яндекс — правило двух раундов
    // (Platform.ads.next); Playgama — каждый раз, интервалы решает Bridge (шаг 7 Bridge: своих таймеров и счётчиков нет);
    // Playables — реклама уже запрошена самим нажатием (clickAds). Повторный клик во время показа игнорируется.
    adBreak(go) {
        if (this._breakBusy) return;
        if (this._clickAdsOn) { go(); return; }
        if (Platform.name === 'playgama') {
            this._breakBusy = true;
            Platform.interstitial().finally(() => { this._breakBusy = false; go(); });
            return;
        }
        Platform.ads.next(go);
    },

    // --- Rewarded-реклама ----------------------------------------------------------------------------
    // Только по кнопке игрока, с наградой в подписи; награда — ТОЛЬКО по true от площадки и один раз. Кнопки помечены
    // data-rewarded (их не трогает реклама по кнопкам Playables), площадка без rewarded — кнопок нет. Между успешными
    // просмотрами — пауза движка (REWARDED_COOLDOWN_SEC): кнопки пишут «Через N с» (_adTick).

    _adT: 0,
    _adRun: false,

    /** Кнопка «за рекламу»: attrs — свои атрибуты (id, data-*), label — что игрок получит. '' — площадка не умеет rewarded. */
    adBtn(attrs, label, cls) {
        if (!Platform.rewardedSupported()) return '';
        return `<button class="btn ad ${cls || ''}" data-rewarded ${attrs} data-label="${label.replace(/"/g, '&quot;')}">${this.icon('ad')}<span>${label}</span></button>`;
    },

    // Подписи и доступность кнопок: пауза между просмотрами или идёт реклама — кнопка серая с «Через N с».
    _adTick() {
        if (!this.root) return;
        const left = Platform.rewardedCooldownLeft(), busy = this._adRun || Platform.adActive;
        const wait = left > 0 ? Platform.rewardedCooldownLabel() : '';
        for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (this.root.querySelectorAll('[data-rewarded]'))) {
            if (b.classList.contains('done')) continue;
            b.disabled = busy || left > 0;
            const span = b.querySelector('span'), text = wait || b.dataset.label;
            if (span && span.textContent !== text) span.textContent = text;
        }
    },

    _adDone(btn, text) {
        btn.classList.add('done');
        btn.disabled = true;
        const span = btn.querySelector('span');
        if (span) span.textContent = text;
        const ico = btn.querySelector('svg');
        if (ico) ico.outerHTML = this.icon('check');
    },

    /** Показать rewarded и выдать награду только за досмотр. */
    async watchAd(id, btn, onReward) {
        if (this._adRun || !Platform.rewardedReady()) { this._adTick(); return; }
        this._adRun = true;
        this._adTick();
        let ok = false;
        try { ok = await Platform.rewarded(id); } catch (e) { ok = false; }
        this._adRun = false;
        if (ok) onReward();
        else this.toast(Lang.t('ads.noReward'), 'warn');
        this._adTick();
    },

    // «+$N за рекламу» — деньги по категории прав (меню и автосалон).
    _cashOffer(host, small) {
        if (!host) return;
        const s = this.game.save, n = GAME_ADS.cash[Math.min(s.license, GAME_ADS.cash.length - 1)];
        host.innerHTML = this.adBtn('data-cash', Lang.t('ads.cash', { n: n.toLocaleString() }), small ? 'sm' : '');
        const b = /** @type {HTMLButtonElement} */ (host.querySelector('[data-cash]'));
        if (b) b.addEventListener('click', () => this.watchAd('cash-bonus', b, () => {
            this.game.addMoney(n);
            this.sfx('cash');
            this.toast('+$' + n.toLocaleString(), 'good');
            if (this.modal === 'dealer') this.openDealer();
        }));
        this._adTick();
    },

    // После работы: «×2 за рекламу» на несколько секунд (во время ролика машина плавно встанет — Game.tick).
    _jobOffer(money) {
        if (!Platform.rewardedSupported()) return;
        const el = document.createElement('div');
        el.className = 'offer';
        el.style.setProperty('--t', GAME_ADS.offerSec + 's');
        el.innerHTML = `${this.icon('coin')}<span>${Lang.t('ads.jobDouble', { n: money.toLocaleString() })}</span>${this.adBtn('data-joboffer', Lang.t('ads.watch'), 'sm')}<i class="tm"></i>`;
        this.el.toasts.appendChild(el);
        let gone = false;
        const close = () => { if (!gone) { gone = true; el.remove(); } };
        const t = setTimeout(() => { if (!this._adRun) close(); }, GAME_ADS.offerSec * 1000);
        const b = /** @type {HTMLButtonElement} */ (el.querySelector('[data-joboffer]'));
        if (b) b.addEventListener('click', () => this.watchAd('job-double', b, () => {
            this.game.addMoney(money);
            this.sfx('cash');
            this.toast('+$' + money.toLocaleString(), 'good');
        }).then(() => { clearTimeout(t); close(); }));
        this._adTick();
    },

    // --- Рекорды (лидерборд площадки «Score») ---------------------------------------------------------
    // Таблица — по кнопке «Рекорды» (только где площадка умеет лидерборд; на Playgama он не заявлен). Ник и аватар —
    // из профиля площадки, ввода ника нет. Запросы кэшируются на минуту (у Яндекса лимит запросов).

    /** @type {{ t: number, list: any[] | null } | null} */
    _lb: null,

    recordsOn() {
        const a = /** @type {any} */ (Platform).adapter;
        return !GAME_IS_PLAYGAMA && !!(a && a.leaderboard);
    },

    _esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); },

    async openRecords(force) {
        const login = Platform.canLogin() ? `<div class="btnrow"><button class="btn blue" id="g-rlogin">${this.icon('key')}${Lang.t('lb.login')}</button></div>` : '';
        this.openModal('records', `<div class="ivi rec"><button class="x" data-close>${this.icon('cross')}</button>
          <h2>${this.icon('trophy')}${Lang.t('lb.title')}</h2><div class="rlist" id="g-rlist"><div class="rnote">${Lang.t('lb.loading')}</div></div>${login}</div>`);
        const lb = document.getElementById('g-rlogin');
        if (lb) lb.addEventListener('click', async () => {
            const ok = await Platform.login();
            if (!ok) return;
            this._lb = null;
            await this.game.afterLogin();
            if (this.modal === 'records') this.openRecords(true);
        });
        const now = Date.now();
        if (force || !this._lb || now - this._lb.t > 60000) this._lb = { t: now, list: await Platform.leaderboard({ avatarSize: 'medium' }) };
        const box = document.getElementById('g-rlist');
        if (!box || this.modal !== 'records') return;
        const list = this._lb.list;
        if (!list) { box.innerHTML = `<div class="rnote">${Lang.t('lb.error')}</div>`; this._lb = null; return; }
        if (!list.length) { box.innerHTML = `<div class="rnote">${Lang.t('lb.empty')}</div>`; return; }
        box.innerHTML = list.map((e) => {
            const name = e.name ? this._esc(e.name) : Lang.t('lb.anon');
            const av = e.avatar ? `<img src="${this._esc(e.avatar)}" alt="">` : `<i class="av">${(e.name || '?').trim().charAt(0).toUpperCase() || '?'}</i>`;
            return `<div class="rrow ${e.me ? 'me' : ''}"><b class="rk num">${e.rank}</b>${av}<span class="nm">${name}</span><b class="sc num">${Number(e.score || 0).toLocaleString()}</b></div>`;
        }).join('');
    },

    // --- Окна --------------------------------------------------------------------------------------

    openModal(name, html) {
        this.modal = name;
        const m = this.el.modal;
        m.innerHTML = html;
        m.classList.remove('hide');
        for (const b of m.querySelectorAll('[data-close]')) b.addEventListener('click', () => { this.sfx('close'); this.closeModal(); });
        if (this.game.state === 'drive') Pause.set('manual', true);
        Input.setEnabled(false);
        this.sfx('open');
    },

    closeModal() {
        if (!this.modal) return;
        const was = this.modal;
        this.modal = '';
        this.el.modal.classList.add('hide');
        this.el.modal.innerHTML = '';
        Pause.set('manual', false);
        Input.setEnabled(true);
        if (was === 'settings' || was === 'pause') this.game.persist();
        if (was === 'result' && this.game.state === 'menu') this.showMenu();
    },

    openPause() {
        if (this.modal === 'pause') { this.closeModal(); return; }
        this.openSettings(true);
    },

    openSettings(inGame) {
        const s = this.game.save.settings;
        const q = s.quality || 'auto';
        const seg = ['auto', 'low', 'medium', 'high'].map(k => `<button class="${q === k ? 'on' : ''}" data-q="${k}">${Lang.t('settings.' + k)}</button>`).join('');
        const snd = `<button class="${s.muted ? '' : 'on'}" data-snd="1">${Lang.t('settings.on')}</button><button class="${s.muted ? 'on' : ''}" data-snd="0">${Lang.t('settings.off')}</button>`;
        const keys = [['W / ↑', 'key.gas'], ['S / ↓', 'key.brake'], ['A D', 'key.steer'], ['Space', 'key.hand'], ['Q / E', 'key.ind'], ['H', 'key.horn'],
            ['C', 'key.cam'], ['R', 'key.radio'], ['J', 'key.jobs'], ['M', 'key.map'], ['F', 'key.act'], [GAME_IS_PLAYGAMA ? 'P' : 'Esc', 'key.pause']]
            .map(k => `<kbd>${k[0]}</kbd><span>${Lang.t(k[1])}</span>`).join('');
        this.openModal(inGame ? 'pause' : 'settings', `<div class="ivi"><button class="x" data-close>${this.icon('cross')}</button>
          <h2>${this.icon(inGame ? 'pause' : 'sliders')}${inGame ? Lang.t('btn.pause') : Lang.t('menu.settings')}</h2>
          <div class="rowset">
            <label>${this.icon('sound')}${Lang.t('settings.sound')}</label><div class="seg">${snd}</div>
            <label>${this.icon('music')}${Lang.t('settings.music')}</label><input type="range" min="0" max="1" step="0.05" value="${s.music}" id="g-smusic">
            <label>${this.icon('sound')}${Lang.t('settings.sfx')}</label><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" id="g-ssfx">
            <label>${this.icon('screen')}${Lang.t('settings.quality')}</label><div class="seg">${seg}</div>
          </div>
          <div class="keys">${keys}</div>
          <div class="btnrow">${inGame ? `<button class="btn ok" id="g-pcont">${this.icon('play')}${Lang.t('btn.continue')}</button><button class="btn" id="g-ptoschool">${this.icon('home')}${Lang.t('btn.toSchool')}</button><button class="btn" id="g-phow">${this.icon('help')}${Lang.t('menu.howto')}</button><button class="btn red" id="g-pmenu">${Lang.t('btn.menu')}</button>` : `<button class="btn ok" data-close>OK</button>`}</div></div>`);
        const mus = /** @type {HTMLInputElement} */ (document.getElementById('g-smusic')), sx = /** @type {HTMLInputElement} */ (document.getElementById('g-ssfx'));
        mus.addEventListener('input', () => { s.music = Number(mus.value); GameAudio.applyVolumes(); });
        sx.addEventListener('input', () => { s.sfx = Number(sx.value); });
        // ползунок отпустили — сразу в сохранение (раньше громкость ждала автосохранения и терялась при перезагрузке)
        mus.addEventListener('change', () => this.game.persist());
        sx.addEventListener('change', () => { this.game.persist(); this.sfx('click'); });
        for (const b of /** @type {NodeListOf<HTMLElement>} */ (this.el.modal.querySelectorAll('[data-q]'))) b.addEventListener('click', () => {
            s.quality = b.dataset.q;
            if (typeof Quality !== 'undefined') Quality.set(/** @type {any} */ (s.quality));
            this.game.persist();
            this.openSettings(inGame);
        });
        // кнопка звука: вкл/выкл весь звук игры (требование площадок), запоминается в сохранении
        for (const b of /** @type {NodeListOf<HTMLElement>} */ (this.el.modal.querySelectorAll('[data-snd]'))) b.addEventListener('click', () => {
            s.muted = b.dataset.snd === '0';
            if (typeof Sound !== 'undefined') Sound.setMuted(s.muted);
            this.game.persist();
            this.openSettings(inGame);
            if (!s.muted) this.sfx('click');
        });
        const on = (id, fn) => { const e = document.getElementById(id); if (e) e.addEventListener('click', fn); };
        on('g-pcont', () => this.adBreak(() => { this.sfx('close'); this.closeModal(); }));
        on('g-pmenu', () => this.adBreak(() => { this.closeModal(); if (GameExam.active) GameExam.cancel(); if (GameJobs.active) GameJobs.cancel(true); this.game.toMenu(); this.showMenu(); }));
        on('g-ptoschool', () => this.adBreak(() => { this.closeModal(); if (GameExam.active) GameExam.cancel(); this.game.toSchool(); }));
        on('g-phow', () => this.howTo());
    },

    openDealer() {
        const g = this.game, s = g.save;
        const stands = GAME_CARS.map(c => {
            const owned = s.owned.includes(c.id), cur = s.car === c.id;
            const lockLic = c.license > s.license;
            const tag = c.license ? GAME_LICENSES[c.license - 1] : null;
            const st = c.stats;
            const bar = (v, max) => `<i><b style="width:${Math.min(100, Math.max(4, v / max * 100))}%"></b></i>`;
            let btn;
            if (cur) btn = `<button class="btn ok" disabled>${this.icon('check')}${Lang.t('btn.selected')}</button>`;
            else if (owned) btn = `<button class="btn blue" data-sel="${c.id}">${this.icon('key')}${Lang.t('btn.select')}</button>`;
            else if (lockLic) btn = `<button class="btn" disabled>${this.icon('lock')}${Lang.t('dealer.need', { c: tag ? tag.id : '' })}</button>`;
            else btn = `<button class="btn go" data-buy="${c.id}" ${s.money < c.price ? 'disabled' : ''}>${this.icon('coin')}${s.money < c.price ? Lang.t('dealer.notEnough') : Lang.t('btn.buy')}</button>`;
            // машина за рекламу: N просмотров (1–7), прогресс копится; категория прав для этого не нужна
            const need = GAME_ADS.car[c.id];
            if (!owned && need) btn += this.adBtn(`data-adcar="${c.id}"`, Lang.t('ads.car', { n: s.adCars[c.id] || 0, m: need }));
            return `<div class="stand ${lockLic && !owned ? 'lock' : ''} ${cur ? 'cur' : ''}">
              ${!owned && c.price ? `<div class="ptag num">$${c.price.toLocaleString()}</div>` : ''}
              <div class="spot"><img src="${c.preview}" alt="">${lockLic && !owned ? this.icon('lock', 'lk') : ''}</div>
              <div class="nm">${this.carName(c.id)}<span class="cl" style="background:${tag ? tag.color : '#ff7a1a'}">${tag ? tag.id : 'У'}</span></div>
              <div class="specs"><span>${Lang.t('dealer.power')}</span>${bar(st.power, 820)}<em class="num">${Math.round(st.power * 1.36)}</em>
                <span>${Lang.t('dealer.speed')}</span>${bar(st.top, 360)}<em class="num">${st.top}</em>
                <span>${Lang.t('dealer.grip')}</span>${bar(st.grip - 0.7, 0.7)}<em class="num">${st.grip.toFixed(2)}</em></div>
              ${btn}</div>`;
        }).join('');
        this.openModal('dealer', `<div class="show"><button class="x" data-close>${this.icon('cross')}</button>
          <div class="top"><h2>${Lang.t('dealer.title')}</h2><div class="bal">${this.icon('coin')}<span class="num">${s.money.toLocaleString()}</span></div><span id="g-dcash"></span></div>
          <div class="note">${Lang.t('dealer.anyCar')}</div><div class="rack">${stands}</div></div>`);
        for (const b of /** @type {NodeListOf<HTMLElement>} */ (this.el.modal.querySelectorAll('[data-buy]'))) b.addEventListener('click', () => this.buyCar(b.dataset.buy));
        for (const b of /** @type {NodeListOf<HTMLElement>} */ (this.el.modal.querySelectorAll('[data-sel]'))) b.addEventListener('click', () => this.selectCar(b.dataset.sel));
        for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (this.el.modal.querySelectorAll('[data-adcar]'))) b.addEventListener('click', () => this.adCar(b.dataset.adcar, b));
        this._cashOffer(document.getElementById('g-dcash'), true);
    },

    // Просмотр рекламы за машину: +1 к счётчику; набрали нужное число — машина ваша и сразу выбрана.
    adCar(id, btn) {
        const g = this.game, s = g.save, need = GAME_ADS.car[id];
        if (!need || s.owned.includes(id)) return;
        this.watchAd('car-unlock', btn, () => {
            s.adCars[id] = Math.min(need, (s.adCars[id] || 0) + 1);
            if (s.adCars[id] >= need) {
                delete s.adCars[id];
                s.owned.push(id);
                this.sfx('cash');
                this.toast(Lang.t('ads.carGot', { c: this.carName(id) }), 'good');
                this.selectCar(id);
                return;
            }
            g.persist();
            this.toast(Lang.t('ads.carLeft', { c: this.carName(id), k: need - s.adCars[id] }), 'good');
            this.openDealer();
        });
    },

    CAR_NAMES: {
        ru: { learner: 'Учебка «Ученица»', bee: '«Пчёлка»', mule: '«Мул»', comfort: '«Комфорт»', wagon: '«Странник»', hornet: '«Шершень»', bison: '«Бизон»', thunder: '«Гроза»', monarch: '«Монарх»', falcon: '«Сокол»', titan: '«Титан»', phantom: '«Фантом»', aurora: '«Аврора»' },
        en: { learner: 'Learner Hatch', bee: 'Bee', mule: 'Mule', comfort: 'Comfort', wagon: 'Wanderer', hornet: 'Hornet', bison: 'Bison', thunder: 'Thunder', monarch: 'Monarch', falcon: 'Falcon', titan: 'Titan', phantom: 'Phantom', aurora: 'Aurora' },
    },
    carName(id) { return (this.CAR_NAMES[GameLang.code()] || this.CAR_NAMES.ru)[id] || id; },

    buyCar(id) {
        const g = this.game, c = g.carDef(id);
        if (g.save.money < c.price || c.license > g.save.license) { this.toast(Lang.t('dealer.notEnough'), 'bad'); return; }
        g.save.money -= c.price;
        g.save.owned.push(id);
        this.sfx('cash');
        this.selectCar(id);
    },

    async selectCar(id) {
        const g = this.game;
        g.save.car = id;
        g.persist();
        this.closeModal();
        if (typeof GameAudio !== 'undefined' && GameAudio.engine) { GameAudio.engine.stop(); GameAudio.engine = null; }
        await g.spawnCar(id, false);
        this._gauges();
        this.refreshStats();
        if (this.game.state === 'menu') this.showMenu();
        this.toast(this.carName(id), 'good');
    },

    openLicense() {
        const g = this.game, s = g.save;
        const rows = GAME_LICENSES.map((L, i) => {
            const passed = i < s.license, next = i === s.license;
            const can = next && s.xp >= L.xp;
            const n = (s.stars && s.stars[L.id]) || 1;
            let stt;
            if (passed) stt = `<div class="stt ok">${Lang.t('board.passed')}<div class="stars">${'★'.repeat(n)}${'☆'.repeat(3 - n)}</div></div>`;
            else if (can) stt = `<button class="btn go" data-exam="${i}">${this.icon('flag')}${Lang.t('btn.start')}</button>`;
            else if (next) stt = `<div class="stt no">${Lang.t('board.need', { n: L.xp - s.xp })}</div>`;
            else stt = `<div class="stt" style="color:#6c7080;font-size:20px">${this.icon('lock')}</div>`;
            return `<div class="row"><div class="k" style="background:${passed || next ? L.color : '#3a3f4b'}">${L.id}</div>
              <div><h5>${L.id} · ${Lang.t('lic.' + L.id)}</h5><p>${Lang.t('lic.' + L.id + '.d')}</p></div>${stt}</div>`;
        }).join('');
        this.openModal('license', `<div class="dmv"><button class="x" data-close>${this.icon('cross')}</button>
          <div><h2>${Lang.t('menu.license')}</h2>${this._licCard()}<p class="n">${s.license >= GAME_LICENSES.length ? Lang.t('lic.all') : Lang.t('exam.atSchool')}</p></div>
          <div><h2>${Lang.t('board.title')}</h2><div class="depart">${rows}</div></div></div>`);
        for (const b of /** @type {NodeListOf<HTMLElement>} */ (this.el.modal.querySelectorAll('[data-exam]'))) b.addEventListener('click', () => {
            this.closeModal();
            if (this.game.state !== 'drive') { this.el.menu.classList.add('hide'); this.el.hud.classList.remove('hide'); this._gauges(); }
            GameExam.start(Number(b.dataset.exam));
            if (typeof HudLayout !== 'undefined') HudLayout.refresh();
        });
    },

    toggleJobs() {
        if (this.modal === 'jobs') { this.closeModal(); return; }
        const g = this.game;
        const rot = (i) => `--r:${[-2, 1.5, -1, 2.2][i % 4]}deg`;
        let body;
        if (g.save.license < 1) body = `<div class="empty">${Lang.t('jobs.none')}</div>`;
        else if (GameExam.active) body = `<div class="empty">${Lang.t('exam.title', { c: GAME_LICENSES[GameExam.lic].id })}</div>`;
        else if (GameJobs.active) {
            const v = GameJobs.view();
            body = `<div class="tickets"><div class="ticket" style="${rot(0)}"><div class="pin"></div><div class="no">${Lang.t('jobs.active')}</div>
              <div class="tt">${this.icon(this.JOB_ICON[GameJobs.job.def.id])}<span>${v.title}</span></div><div class="st">${v.step}</div>
              <div class="row"><span></span><span class="pay num">$${v.pay}</span></div><div class="btnrow"><button class="btn red" id="g-jcancel">${Lang.t('btn.cancel')}</button></div></div></div>`;
        } else {
            const offers = GameJobs.refreshOffers(false);
            const locked = GAME_JOBS.filter(j => j.minLicense > g.save.license).map((j, i) => `<div class="ticket off" style="${rot(i + 1)}"><div class="pin"></div><div class="no">${Lang.t('jobs.need', { c: GAME_LICENSES[j.minLicense - 1].id })}</div>
              <div class="tt">${this.icon(this.JOB_ICON[j.id])}<span>${Lang.t('job.' + j.id)}</span></div><p>${Lang.t('job.' + j.id + '.d')}</p></div>`).join('');
            body = `<div class="tickets">${offers.map((o, i) => `<div class="ticket" style="${rot(i)}"><div class="pin"></div><div class="no">${Lang.t('jobs.order')} № ${2000 + i * 17 + (g.save.stats.jobs || 0)}</div>
              <div class="tt">${this.icon(this.JOB_ICON[o.def.id])}<span>${Lang.t('job.' + o.def.id)}</span></div><p>${Lang.t('job.' + o.def.id + '.d')}</p>
              <div class="meta"><span>${this.icon('pin')}${o.km.toFixed(1)} ${Lang.t('hud.km')}</span><span>${this.icon('watch')}${Math.floor(o.limit / 60)}:${String(o.limit % 60).padStart(2, '0')}</span><span>${this.icon('star')}${o.xp}</span></div>
              <div class="row"><span></span><span class="pay num">$${o.pay}</span></div>
              <div class="btnrow"><button class="btn go" data-job="${i}">${this.icon('arrow')}${Lang.t('btn.take')}</button></div></div>`).join('')}${locked}</div>`;
        }
        this.openModal('jobs', `<div class="cork"><button class="x" data-close>${this.icon('cross')}</button><h2>${Lang.t('jobs.title')}</h2>${body}</div>`);
        for (const b of /** @type {NodeListOf<HTMLElement>} */ (this.el.modal.querySelectorAll('[data-job]'))) b.addEventListener('click', () => {
            const o = GameJobs.offers[Number(b.dataset.job)];
            this.closeModal();
            GameJobs.start(o);
        });
        const c = document.getElementById('g-jcancel');
        if (c) c.addEventListener('click', () => { GameJobs.cancel(); this.closeModal(); });
    },

    examResult(r) {
        const L = GAME_LICENSES[r.lic];
        const names = r.faults.map(f => `<li>${Lang.t('fault.' + f.code)}${f.major ? ' !' : ''}</li>`).join('');
        const stars = r.ok ? '★'.repeat(r.stars) + `<span class="e">${'★'.repeat(3 - r.stars)}</span>` : '';
        const t = Math.round(r.time);
        this.openModal('result', `<div class="proto">
            <div class="hd">${Lang.t('exam.protocol')} · ${Lang.t('exam.title', { c: L.id })}</div>
            <h3>${Lang.t('exam.score')}</h3>
            <div class="score num">${r.score}<small> / 15</small></div>
            <div class="stamp ${r.ok ? 'ok' : 'no'}">${Lang.t(r.ok ? 'exam.pass' : 'exam.fail')}</div>
            ${r.ok ? `<div class="stars">${stars}</div><div class="nl" style="color:${L.color}">${Lang.t('exam.newLicense', { c: L.id + ' · ' + Lang.t('lic.' + L.id) })}</div>
              <div class="rw num">${Lang.t('exam.reward', { n: r.money.toLocaleString(), x: r.xp })}</div>` : ''}
            ${names ? `<ul>${names}</ul>` : ''}
            <div class="sign"><span>${Lang.t('exam.time')}: ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span><span>${Lang.t('who.instr')}: <i>${Lang.t('exam.signature')}</i></span></div>
            <div class="btnrow">${r.ok && r.money > 0 ? this.adBtn('id="g-rdouble"', Lang.t('ads.double', { n: r.money.toLocaleString() })) : ''}${!r.ok && r.canResume ? this.adBtn('id="g-rresume"', Lang.t('ads.resume')) : ''}${r.ok ? `<button class="btn ok" id="g-rok">${Lang.t('btn.continue')}</button>` : `<button class="btn go" id="g-rretry">${Lang.t('btn.retry')}</button><button class="btn" id="g-rok">${Lang.t('btn.continue')}</button>`}</div>
          </div>`);
        this.sfx(r.ok ? 'success' : 'fail');
        const ok = document.getElementById('g-rok'), retry = document.getElementById('g-rretry');
        if (ok) ok.addEventListener('click', () => this.adBreak(() => { this.closeModal(); this.refreshStats(); }));
        if (retry) retry.addEventListener('click', () => this.adBreak(() => { this.closeModal(); GameExam.start(r.lic); }));
        const res = /** @type {HTMLButtonElement} */ (document.getElementById('g-rresume'));
        if (res) res.addEventListener('click', () => this.watchAd('exam-continue', res, () => {
            this.closeModal();
            GameExam.resume();
        }));
        const dbl = /** @type {HTMLButtonElement} */ (document.getElementById('g-rdouble'));
        if (dbl) dbl.addEventListener('click', () => this.watchAd('exam-double', dbl, () => {
            this.game.addMoney(r.money);
            this._adDone(dbl, '+$' + r.money.toLocaleString());
            this.sfx('cash');
        }));
    },

    jobResult(r) {
        if (r.ok) {
            this.toast(Lang.t('job.done') + ' ' + Lang.t('jobs.reward', { n: r.money, x: r.xp }), 'good'); this.sfx('cash');
            if (r.money > 0) this._jobOffer(r.money);
        }
        else this.toast(Lang.t('job.failed') + (r.reason === 'broken' ? ' — ' + Lang.t('job.broken') : r.reason === 'timeout' ? ' — ' + Lang.t('job.timeout') : ''), 'bad');
    },
};
