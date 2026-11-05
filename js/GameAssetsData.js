// Сгенерировано tools/build-data.mjs из docs/props/*.json и docs/cars/*.json — не править руками.
/** Коллизии своих декораций: имя модели -> [[cx, cy, w, d], ...] в метрах (оси Blender). */
/** @type {Record<string, number[][]>} */
const GAME_PROP_BOXES = {"barrier_gate":[[0,0,0.6,0.6]],"billboard_school":[[-0.27,-2.6,0.46,0.5],[-0.27,2.6,0.46,0.5]],"bus_stop":[[0,0,2,5]],"dealership":[[-8.9,0,11.8,19.6],[4.75,0,15.5,19.6],[14,-9,0.6,0.6],[14,9,0.6,0.6]],"driving_school":[[-0.925,0,23.85,15.6],[12,0,2,9]],"gas_station":[[3.4,-2.2,0.42,0.42],[3.4,2.2,0.42,0.42],[8.6,-2.2,0.42,0.42],[8.6,2.2,0.42,0.42],[3.4,0,1.2,5.8],[8.6,0,1.2,5.8],[-7.925,0,5.85,8],[10.4,-7.1,0.9,1.7]],"school":[[-0.9,0,29.8,17.6],[15,0,2,7]],"sign_crosswalk":[[0,0,0.3,0.3]],"sign_school":[[0,0,0.3,0.3]],"sign_speed30":[[0,0,0.3,0.3]],"sign_speed60":[[0,0,0.3,0.3]],"sign_speed90":[[0,0,0.3,0.3]],"traffic_light":[[0,0,0.34,0.34]]};

/** Геометрия машин (м, оси Blender: x вперёд, y влево, z вверх). */
/** @type {Record<string, any>} */
const GAME_CAR_GEOMETRY = {
 "aurora": {
  "length": 4.971,
  "width": 2.203,
  "height": 1.135,
  "wheelRadius": 0.38,
  "wheelWidth": 0.31,
  "wheels": {
   "fl": [
    1.45,
    0.86,
    0.38
   ],
   "fr": [
    1.45,
    -0.86,
    0.38
   ],
   "rl": [
    -1.4,
    0.88,
    0.38
   ],
   "rr": [
    -1.4,
    -0.88,
    0.38
   ]
  },
  "seats": {
   "driver": [
    -0.18,
    0.4,
    0.3
   ],
   "passenger": [
    -0.18,
    -0.4,
    0.3
   ]
  },
  "steeringWheel": [
   0.27,
   0.4,
   0.58
  ],
  "color": "#6c2bd9"
 },
 "bee": {
  "length": 3.6,
  "width": 1.8,
  "height": 1.961,
  "wheelRadius": 0.36,
  "wheelWidth": 0.24,
  "wheels": {
   "fl": [
    1.2,
    0.755,
    0.36
   ],
   "fr": [
    1.2,
    -0.755,
    0.36
   ],
   "rl": [
    -1.2,
    0.755,
    0.36
   ],
   "rr": [
    -1.2,
    -0.755,
    0.36
   ]
  },
  "seats": {
   "driver": [
    -0.01,
    0.357,
    0.56
   ],
   "passenger": [
    -0.01,
    -0.357,
    0.56
   ]
  },
  "steeringWheel": [
   0.41,
   0.357,
   0.98
  ],
  "color": "#ffc21a"
 },
 "bison": {
  "length": 4.831,
  "width": 2.14,
  "height": 2.022,
  "wheelRadius": 0.42,
  "wheelWidth": 0.34,
  "wheels": {
   "fl": [
    1.45,
    0.82,
    0.42
   ],
   "fr": [
    1.45,
    -0.82,
    0.42
   ],
   "rl": [
    -1.38,
    0.82,
    0.42
   ],
   "rr": [
    -1.38,
    -0.82,
    0.42
   ]
  },
  "seats": {
   "driver": [
    -0.05,
    0.42,
    0.92
   ],
   "passenger": [
    -0.05,
    -0.42,
    0.92
   ]
  },
  "steeringWheel": [
   0.4,
   0.42,
   1.24
  ],
  "color": "#c9b07a"
 },
 "comfort": {
  "length": 4.621,
  "width": 1.892,
  "height": 1.465,
  "wheelRadius": 0.37,
  "wheelWidth": 0.24,
  "wheels": {
   "fl": [
    1.45,
    0.785,
    0.37
   ],
   "fr": [
    1.45,
    -0.785,
    0.37
   ],
   "rl": [
    -1.37,
    0.785,
    0.37
   ],
   "rr": [
    -1.37,
    -0.785,
    0.37
   ]
  },
  "seats": {
   "driver": [
    0.19,
    0.392,
    0.54
   ],
   "passenger": [
    0.19,
    -0.392,
    0.54
   ]
  },
  "steeringWheel": [
   0.61,
   0.392,
   0.97
  ],
  "color": "#9db4d0"
 },
 "falcon": {
  "length": 4.68,
  "width": 2.111,
  "height": 1.25,
  "wheelRadius": 0.37,
  "wheelWidth": 0.27,
  "wheels": {
   "fl": [
    1.36,
    0.82,
    0.37
   ],
   "fr": [
    1.36,
    -0.82,
    0.37
   ],
   "rl": [
    -1.3,
    0.845,
    0.37
   ],
   "rr": [
    -1.3,
    -0.845,
    0.37
   ]
  },
  "seats": {
   "driver": [
    -0.3,
    0.4,
    0.38
   ],
   "passenger": [
    -0.3,
    -0.4,
    0.38
   ]
  },
  "steeringWheel": [
   0.16,
   0.4,
   0.68
  ],
  "color": "#1f6bff"
 },
 "hornet": {
  "length": 4.151,
  "width": 2.02,
  "height": 1.414,
  "wheelRadius": 0.37,
  "wheelWidth": 0.3,
  "wheels": {
   "fl": [
    1.33,
    0.835,
    0.37
   ],
   "fr": [
    1.33,
    -0.835,
    0.37
   ],
   "rl": [
    -1.33,
    0.835,
    0.37
   ],
   "rr": [
    -1.33,
    -0.835,
    0.37
   ]
  },
  "seats": {
   "driver": [
    0.09,
    0.416,
    0.5
   ],
   "passenger": [
    0.09,
    -0.416,
    0.5
   ]
  },
  "steeringWheel": [
   0.51,
   0.416,
   0.95
  ],
  "color": "#d61f1f"
 },
 "learner": {
  "length": 4.095,
  "width": 1.872,
  "height": 2.016,
  "wheelRadius": 0.38,
  "wheelWidth": 0.25,
  "wheels": {
   "fl": [
    1.31,
    0.77,
    0.38
   ],
   "fr": [
    1.31,
    -0.77,
    0.38
   ],
   "rl": [
    -1.34,
    0.77,
    0.38
   ],
   "rr": [
    -1.34,
    -0.77,
    0.38
   ]
  },
  "seats": {
   "driver": [
    -0.03,
    0.387,
    0.56
   ],
   "passenger": [
    -0.03,
    -0.387,
    0.56
   ]
  },
  "steeringWheel": [
   0.39,
   0.387,
   1.01
  ],
  "color": "#f3f3ef"
 },
 "monarch": {
  "length": 5.313,
  "width": 2.179,
  "height": 1.505,
  "wheelRadius": 0.38,
  "wheelWidth": 0.27,
  "wheels": {
   "fl": [
    1.62,
    0.82,
    0.38
   ],
   "fr": [
    1.62,
    -0.82,
    0.38
   ],
   "rl": [
    -1.52,
    0.82,
    0.38
   ],
   "rr": [
    -1.52,
    -0.82,
    0.38
   ]
  },
  "seats": {
   "driver": [
    -0.1,
    0.4,
    0.56
   ],
   "passenger": [
    -0.1,
    -0.4,
    0.56
   ]
  },
  "steeringWheel": [
   0.38,
   0.4,
   0.88
  ],
  "color": "#1b1e25"
 },
 "mule": {
  "length": 4.397,
  "width": 2,
  "height": 1.92,
  "wheelRadius": 0.4,
  "wheelWidth": 0.28,
  "wheels": {
   "fl": [
    1.42,
    0.835,
    0.4
   ],
   "fr": [
    1.42,
    -0.835,
    0.4
   ],
   "rl": [
    -1.38,
    0.835,
    0.4
   ],
   "rr": [
    -1.38,
    -0.835,
    0.4
   ]
  },
  "seats": {
   "driver": [
    0.07,
    0.411,
    0.68
   ],
   "passenger": [
    0.07,
    -0.411,
    0.68
   ]
  },
  "steeringWheel": [
   0.49,
   0.411,
   1.13
  ],
  "color": "#6f7d3c"
 },
 "phantom": {
  "length": 4.833,
  "width": 2.169,
  "height": 1.268,
  "wheelRadius": 0.37,
  "wheelWidth": 0.3,
  "wheels": {
   "fl": [
    1.4,
    0.83,
    0.37
   ],
   "fr": [
    1.4,
    -0.83,
    0.37
   ],
   "rl": [
    -1.3,
    0.885,
    0.37
   ],
   "rr": [
    -1.3,
    -0.885,
    0.37
   ]
  },
  "seats": {
   "driver": [
    -0.3,
    0.4,
    0.31
   ],
   "passenger": [
    -0.3,
    -0.4,
    0.31
   ]
  },
  "steeringWheel": [
   0.15,
   0.4,
   0.6
  ],
  "color": "#9be22d"
 },
 "thunder": {
  "length": 5.15,
  "width": 2.13,
  "height": 1.36,
  "wheelRadius": 0.37,
  "wheelWidth": 0.32,
  "wheels": {
   "fl": [
    1.5,
    0.8,
    0.37
   ],
   "fr": [
    1.5,
    -0.8,
    0.37
   ],
   "rl": [
    -1.38,
    0.84,
    0.37
   ],
   "rr": [
    -1.38,
    -0.84,
    0.37
   ]
  },
  "seats": {
   "driver": [
    -0.15,
    0.4,
    0.46
   ],
   "passenger": [
    -0.15,
    -0.4,
    0.46
   ]
  },
  "steeringWheel": [
   0.3,
   0.4,
   0.82
  ],
  "color": "#e8601a"
 },
 "titan": {
  "length": 5.358,
  "width": 2.191,
  "height": 1.845,
  "wheelRadius": 0.42,
  "wheelWidth": 0.3,
  "wheels": {
   "fl": [
    1.62,
    0.85,
    0.42
   ],
   "fr": [
    1.62,
    -0.85,
    0.42
   ],
   "rl": [
    -1.55,
    0.85,
    0.42
   ],
   "rr": [
    -1.55,
    -0.85,
    0.42
   ]
  },
  "seats": {
   "driver": [
    -0.28,
    0.42,
    0.88
   ],
   "passenger": [
    -0.28,
    -0.42,
    0.88
   ]
  },
  "steeringWheel": [
   0.2,
   0.42,
   1.18
  ],
  "color": "#f1eee6"
 },
 "wagon": {
  "length": 4.807,
  "width": 1.914,
  "height": 1.641,
  "wheelRadius": 0.37,
  "wheelWidth": 0.245,
  "wheels": {
   "fl": [
    1.55,
    0.792,
    0.37
   ],
   "fr": [
    1.55,
    -0.792,
    0.37
   ],
   "rl": [
    -1.45,
    0.792,
    0.37
   ],
   "rr": [
    -1.45,
    -0.792,
    0.37
   ]
  },
  "seats": {
   "driver": [
    0.27,
    0.401,
    0.54
   ],
   "passenger": [
    0.27,
    -0.401,
    0.54
   ]
  },
  "steeringWheel": [
   0.69,
   0.401,
   1.03
  ],
  "color": "#2d5e3c"
 }
};
