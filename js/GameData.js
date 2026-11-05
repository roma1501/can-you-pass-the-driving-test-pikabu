// GameData.js — данные игры: категории прав, каталог машин, экономика, экзамены, работы.
// Числа баланса — здесь, а не в коде систем; тексты — ключами Lang (GameLang.js).

/** Категории прав по порядку: индекс в сохранении `license` = число сданных (0 — ученик, 6 — S). */
const GAME_LICENSES = [
    { id: 'E', color: '#4fc46a', xp: 0,    reward: 600,   rewardXp: 120, minors: 8, time: 360 },
    { id: 'D', color: '#3fb6d6', xp: 250,  reward: 1500,  rewardXp: 220, minors: 7, time: 420 },
    { id: 'C', color: '#4f7cf0', xp: 800,  reward: 4000,  rewardXp: 380, minors: 6, time: 480 },
    { id: 'B', color: '#a35cf0', xp: 1900, reward: 9000,  rewardXp: 600, minors: 6, time: 480 },
    { id: 'A', color: '#f0883a', xp: 3600, reward: 20000, rewardXp: 900, minors: 5, time: 540 },
    { id: 'S', color: '#f04a5c', xp: 6200, reward: 50000, rewardXp: 1500, minors: 4, time: 600 },
];

/**
 * Каталог машин. license — сколько категорий нужно сдать (0 — без прав), price — деньги.
 * stats: power кВт, mass кг, top км/ч, grip (μ шин), steer — макс. угол руля °, drive fwd|rwd|awd,
 * cg — высота центра масс м, engine — i4|v8 (звук), brake — сила тормозов (1 — обычные).
 * Геометрия (колёса, сиденья) — GAME_CAR_GEOMETRY из Blender-спецификаций docs/cars/*.json.
 */
const GAME_CARS = [
    { id: 'learner', license: 0, price: 0,      model: 'assets/models/cars/learner.glb', wheel: 'assets/models/cars/learner_wheel.glb', preview: 'assets/ui/cars/learner.webp',
      stats: { power: 72,  mass: 1150, top: 160, grip: 1.0,  steer: 36, drive: 'fwd', cg: 0.52, engine: 'i4', brake: 1.0 } },
    { id: 'bee',     license: 1, price: 1200,   model: 'assets/models/cars/bee.glb', wheel: 'assets/models/cars/bee_wheel.glb', preview: 'assets/ui/cars/bee.webp',
      stats: { power: 60,  mass: 880,  top: 150, grip: 0.98, steer: 38, drive: 'fwd', cg: 0.55, engine: 'i4', brake: 1.0 } },
    { id: 'mule',    license: 1, price: 2500,   model: 'assets/models/cars/mule.glb', wheel: 'assets/models/cars/mule_wheel.glb', preview: 'assets/ui/cars/mule.webp',
      stats: { power: 95,  mass: 1500, top: 165, grip: 0.97, steer: 34, drive: 'rwd', cg: 0.62, engine: 'i4', brake: 1.0 } },
    { id: 'comfort', license: 2, price: 6000,   model: 'assets/models/cars/comfort.glb', wheel: 'assets/models/cars/comfort_wheel.glb', preview: 'assets/ui/cars/comfort.webp',
      stats: { power: 115, mass: 1350, top: 190, grip: 1.02, steer: 35, drive: 'fwd', cg: 0.52, engine: 'i4', brake: 1.05 } },
    { id: 'wagon',   license: 2, price: 9000,   model: 'assets/models/cars/wagon.glb', wheel: 'assets/models/cars/wagon_wheel.glb', preview: 'assets/ui/cars/wagon.webp',
      stats: { power: 130, mass: 1480, top: 195, grip: 1.03, steer: 34, drive: 'awd', cg: 0.55, engine: 'i4', brake: 1.05 } },
    { id: 'hornet',  license: 3, price: 15000,  model: 'assets/models/cars/hornet.glb', wheel: 'assets/models/cars/hornet_wheel.glb', preview: 'assets/ui/cars/hornet.webp',
      stats: { power: 175, mass: 1250, top: 225, grip: 1.1,  steer: 36, drive: 'fwd', cg: 0.48, engine: 'i4', brake: 1.15 } },
    { id: 'bison',   license: 3, price: 22000,  model: 'assets/models/cars/bison.glb', wheel: 'assets/models/cars/bison_wheel.glb', preview: 'assets/ui/cars/bison.webp',
      stats: { power: 200, mass: 2100, top: 185, grip: 1.0,  steer: 33, drive: 'awd', cg: 0.75, engine: 'v8', brake: 1.05 } },
    { id: 'thunder', license: 4, price: 36000,  model: 'assets/models/cars/thunder.glb', wheel: 'assets/models/cars/thunder_wheel.glb', preview: 'assets/ui/cars/thunder.webp',
      stats: { power: 340, mass: 1700, top: 255, grip: 1.04, steer: 33, drive: 'rwd', cg: 0.5,  engine: 'v8', brake: 1.15 } },
    { id: 'monarch', license: 4, price: 52000,  model: 'assets/models/cars/monarch.glb', wheel: 'assets/models/cars/monarch_wheel.glb', preview: 'assets/ui/cars/monarch.webp',
      stats: { power: 310, mass: 1900, top: 250, grip: 1.1,  steer: 33, drive: 'awd', cg: 0.5,  engine: 'v8', brake: 1.2 } },
    { id: 'falcon',  license: 5, price: 85000,  model: 'assets/models/cars/falcon.glb', wheel: 'assets/models/cars/falcon_wheel.glb', preview: 'assets/ui/cars/falcon.webp',
      stats: { power: 360, mass: 1450, top: 280, grip: 1.18, steer: 34, drive: 'rwd', cg: 0.44, engine: 'v8', brake: 1.3 } },
    { id: 'titan',   license: 5, price: 120000, model: 'assets/models/cars/titan.glb', wheel: 'assets/models/cars/titan_wheel.glb', preview: 'assets/ui/cars/titan.webp',
      stats: { power: 430, mass: 2400, top: 250, grip: 1.08, steer: 33, drive: 'awd', cg: 0.7,  engine: 'v8', brake: 1.25 } },
    { id: 'phantom', license: 6, price: 220000, model: 'assets/models/cars/phantom.glb', wheel: 'assets/models/cars/phantom_wheel.glb', preview: 'assets/ui/cars/phantom.webp',
      stats: { power: 560, mass: 1450, top: 320, grip: 1.28, steer: 33, drive: 'rwd', cg: 0.4,  engine: 'v8', brake: 1.4 } },
    { id: 'aurora',  license: 6, price: 380000, model: 'assets/models/cars/aurora.glb', wheel: 'assets/models/cars/aurora_wheel.glb', preview: 'assets/ui/cars/aurora.webp',
      stats: { power: 820, mass: 1350, top: 360, grip: 1.36, steer: 33, drive: 'awd', cg: 0.38, engine: 'v8', brake: 1.5 } },
];

/** Геометрия по умолчанию (м, оси Blender: x вперёд, y влево, z вверх), пока нет спецификации машины. */
const GAME_CAR_DEFAULT_GEOMETRY = {
    length: 4.2, width: 1.85, height: 1.5, wheelRadius: 0.34, wheelWidth: 0.24,
    wheels: { fl: [1.3, 0.78, 0.34], fr: [1.3, -0.78, 0.34], rl: [-1.3, 0.78, 0.34], rr: [-1.3, -0.78, 0.34] },
    seats: { driver: [0.05, 0.38, 0.5], passenger: [0.05, -0.38, 0.5] }, steeringWheel: [0.45, 0.38, 0.95], color: '#ffffff',
};

/** Rewarded-реклама: сколько просмотров стоит машина (1–7, по цене; прогресс по каждой машине копится в сохранении),
 *  деньги за просмотр по категории прав (save.license: 0 — ученик … 6 — S), сколько секунд висит «×2 за работу». */
const GAME_ADS = {
    car: { bee: 1, mule: 1, comfort: 2, wagon: 2, hornet: 3, bison: 3, thunder: 4, monarch: 4, falcon: 5, titan: 5, phantom: 6, aurora: 7 },
    cash: [300, 600, 1200, 2500, 5000, 9000, 15000],
    offerSec: 9,
};

/** Стартовые значения сохранения. */
const GAME_START = { money: 400, xp: 0, license: 0, car: 'learner', owned: ['learner'] };

/** Работы от инструктора. minLicense — с какой категории доступна; pay — база + за км маршрута; xp — очки. */
const GAME_JOBS = [
    { id: 'taxi',     icon: '🚕', minLicense: 1, pay: 120, perKm: 260, xp: 45,  time: 1.5 },
    { id: 'delivery', icon: '📦', minLicense: 1, pay: 150, perKm: 240, xp: 50,  time: 1.6 },
    { id: 'fragile',  icon: '🎂', minLicense: 2, pay: 260, perKm: 320, xp: 80,  time: 2.2 },
    { id: 'valet',    icon: '🅿️', minLicense: 2, pay: 220, perKm: 180, xp: 70,  time: 1.8 },
    { id: 'school',   icon: '🎒', minLicense: 3, pay: 300, perKm: 300, xp: 90,  time: 1.3 },
    { id: 'testdrive',icon: '🏁', minLicense: 4, pay: 600, perKm: 420, xp: 140, time: 1.4 },
];

/** Множитель оплаты работ от категории прав (лучше права — дороже заказы). */
const GAME_JOB_TIER_MULT = [1, 1, 1.4, 2.0, 3.0, 4.5, 6.5];

/** Ограничения скорости км/ч. */
const GAME_SPEED = { city: 60, zone30: 30, zone90: 90, tolerance: 6 };

