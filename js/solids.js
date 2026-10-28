// ============================================================================
// solids.js — Генератор многогранников и тел вращения с настройкой параметров
// ============================================================================

const SUBSCRIPTS = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
};

function formatLabel(str) {
  return String(str).replace(/_?(\d+)/g, (_, d) =>
    d.split('').map(c => SUBSCRIPTS[c] || c).join('')
  );
}

const BASE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// Завершает сборку многогранника: считает нормали граней (наружу), список рёбер и смежность
function finalizePolyhedron(raw) {
  const { id, title, category, vertices, vertexNames, faces, params, diagonals } = raw;
  const center = Vec3.centroid(vertices);

  const builtFaces = faces.map((f, idx) => {
    const fv = f.vertices;
    const p0 = vertices[fv[0]];
    const p1 = vertices[fv[1]];
    const p2 = vertices[fv[2]];
    let n = Vec3.normalize(Vec3.cross(Vec3.sub(p1, p0), Vec3.sub(p2, p0)));
    const fCenter = Vec3.centroid(fv.map(vi => vertices[vi]));
    // Направляем нормаль строго наружу от центра многогранника
    if (Vec3.dot(n, Vec3.sub(fCenter, center)) < 0) {
      n = Vec3.scale(n, -1);
    }
    const d = -Vec3.dot(n, p0);
    const name = f.name || `(${fv.map(vi => vertexNames[vi]).join('')})`;
    return {
      index: idx,
      vertices: fv,
      name,
      role: f.role || 'lateral',
      normal: n,
      plane: { n, d, origin: Vec3.clone(p0) },
      center: fCenter
    };
  });

  // Собираем уникальные рёбра и определяем, каким граням принадлежит каждое ребро
  const edgeMap = new Map();
  const edges = [];

  builtFaces.forEach((face, fIdx) => {
    const fv = face.vertices;
    for (let i = 0; i < fv.length; i++) {
      const a = fv[i];
      const b = fv[(i + 1) % fv.length];
      const minV = Math.min(a, b);
      const maxV = Math.max(a, b);
      const key = `${minV}_${maxV}`;
      if (!edgeMap.has(key)) {
        // Упорядочим вершины ребра: снизу вверх или по алфавиту
        let v1 = a, v2 = b;
        if (a > b) { v1 = b; v2 = a; }
        const edgeObj = {
          index: edges.length,
          v1,
          v2,
          name: `${vertexNames[v1]}${vertexNames[v2]}`,
          faces: [fIdx]
        };
        edgeMap.set(key, edgeObj);
        edges.push(edgeObj);
      } else {
        edgeMap.get(key).faces.push(fIdx);
      }
    }
  });

  return {
    id,
    title,
    type: 'polyhedron',
    category: category || 'polyhedron',
    vertices,
    vertexNames,
    faces: builtFaces,
    edges,
    center,
    params,
    diagonals: diagonals || []
  };
}

// Универсальный генератор n-угольной призмы
function buildNPrism(n, opts = {}) {
  const a = opts.radius || 2.0;
  const b = opts.depth || a;
  const H = opts.height || 2.6;
  const tiltX = opts.tiltX || 0;
  const tiltZ = opts.tiltZ || 0;
  const id = opts.id || `prism${n}`;
  const title = opts.title || `${n}-угольная призма`;

  const vertices = [];
  const vertexNames = [];
  const yBottom = -H / 2;
  const yTop = H / 2;

  if (n === 4 && opts.isBox) {
    // Куб или параллелепипед со сторонами 2*wx и 2*wz
    const wx = opts.width ? opts.width / 2 : 1.5;
    const wz = opts.depth ? opts.depth / 2 : 1.5;
    const baseCoords = [
      { x: -wx, z: wz },  // A (передняя левая)
      { x: wx, z: wz },   // B (передняя правая)
      { x: wx, z: -wz },  // C (задняя правая)
      { x: -wx, z: -wz }  // D (задняя левая)
    ];
    for (let i = 0; i < 4; i++) {
      vertices.push({ x: baseCoords[i].x - tiltX / 2, y: yBottom, z: baseCoords[i].z - tiltZ / 2 });
      vertexNames.push(BASE_LETTERS[i]);
    }
    for (let i = 0; i < 4; i++) {
      vertices.push({ x: baseCoords[i].x + tiltX / 2, y: yTop, z: baseCoords[i].z + tiltZ / 2 });
      vertexNames.push(formatLabel(`${BASE_LETTERS[i]}1`));
    }
  } else {
    // Правильный (или растянутый) n-угольник в основании
    const startAngle = n === 3 ? Math.PI / 2 + Math.PI / 6 : Math.PI / n + Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const ang = startAngle - (2 * Math.PI * i) / n;
      const x = a * Math.cos(ang);
      const z = b * Math.sin(ang);
      vertices.push({ x: x - tiltX / 2, y: yBottom, z: z - tiltZ / 2 });
      vertexNames.push(BASE_LETTERS[i]);
    }
    for (let i = 0; i < n; i++) {
      const ang = startAngle - (2 * Math.PI * i) / n;
      const x = a * Math.cos(ang);
      const z = b * Math.sin(ang);
      vertices.push({ x: x + tiltX / 2, y: yTop, z: z + tiltZ / 2 });
      vertexNames.push(formatLabel(`${BASE_LETTERS[i]}1`));
    }
  }

  const faces = [];
  // Нижнее основание
  const bottomLoop = [];
  for (let i = 0; i < n; i++) bottomLoop.push(i);
  faces.push({
    vertices: bottomLoop,
    name: `(${bottomLoop.map(i => vertexNames[i]).join('')})`,
    role: 'bottom'
  });

  // Верхнее основание
  const topLoop = [];
  for (let i = 0; i < n; i++) topLoop.push(n + i);
  faces.push({
    vertices: topLoop,
    name: `(${topLoop.map(i => vertexNames[i]).join('')})`,
    role: 'top'
  });

  // Боковые грани
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const loop = [i, j, n + j, n + i];
    faces.push({
      vertices: loop,
      name: `(${vertexNames[i]}${vertexNames[j]}${vertexNames[n + j]}${vertexNames[n + i]})`,
      role: 'lateral'
    });
  }

  // Диагонали для метода внутреннего проектирования (для 4- и 6-угольных призм)
  const diagonals = [];
  if (n === 4) {
    diagonals.push(
      { v1: 0, v2: 2, topV1: 4, topV2: 6, name: 'AC' },
      { v1: 1, v2: 3, topV1: 5, topV2: 7, name: 'BD' }
    );
  } else if (n === 6) {
    diagonals.push(
      { v1: 0, v2: 3, topV1: 6, topV2: 9, name: 'AD' },
      { v1: 1, v2: 4, topV1: 7, topV2: 10, name: 'BE' },
      { v1: 2, v2: 5, topV1: 8, topV2: 11, name: 'CF' }
    );
  }

  return finalizePolyhedron({
    id,
    title,
    vertices,
    vertexNames,
    faces,
    params: { n, a, b, H, tiltX, tiltZ },
    diagonals
  });
}

// Универсальный генератор n-угольной пирамиды S A B C ...
function buildNPyramid(n, opts = {}) {
  const a = opts.radius || 2.1;
  const b = opts.depth || a;
  const H = opts.height || 2.8;
  const apexX = opts.tiltX || 0;
  const apexZ = opts.tiltZ || 0;
  const id = opts.id || `pyramid${n}`;
  const title = opts.title || `${n}-угольная пирамида`;

  const vertices = [];
  const vertexNames = [];
  const yBottom = -H * 0.42;
  const yApex = H * 0.58;

  if (n === 4 && opts.isSquareBase) {
    const wx = opts.width ? opts.width / 2 : 1.65;
    const wz = opts.depth ? opts.depth / 2 : 1.65;
    const baseCoords = [
      { x: -wx, z: wz },
      { x: wx, z: wz },
      { x: wx, z: -wz },
      { x: -wx, z: -wz }
    ];
    for (let i = 0; i < 4; i++) {
      vertices.push({ x: baseCoords[i].x, y: yBottom, z: baseCoords[i].z });
      vertexNames.push(BASE_LETTERS[i]);
    }
  } else {
    const startAngle = n === 3 ? Math.PI / 2 + Math.PI / 6 : Math.PI / n + Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const ang = startAngle - (2 * Math.PI * i) / n;
      vertices.push({
        x: a * Math.cos(ang),
        y: yBottom,
        z: b * Math.sin(ang)
      });
      vertexNames.push(BASE_LETTERS[i]);
    }
  }

  // Вершина S имеет индекс n
  const sIdx = n;
  vertices.push({ x: apexX, y: yApex, z: apexZ });
  vertexNames.push('S');

  const faces = [];
  // Основание
  const baseLoop = [];
  for (let i = 0; i < n; i++) baseLoop.push(i);
  faces.push({
    vertices: baseLoop,
    name: `(${baseLoop.map(i => vertexNames[i]).join('')})`,
    role: 'bottom'
  });

  // Боковые грани (SAB), (SBC), ...
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push({
      vertices: [sIdx, i, j],
      name: `(S${vertexNames[i]}${vertexNames[j]})`,
      role: 'lateral'
    });
  }

  const diagonals = [];
  if (n === 4) {
    diagonals.push(
      { v1: 0, v2: 2, apex: sIdx, name: 'AC', planeName: '(SAC)' },
      { v1: 1, v2: 3, apex: sIdx, name: 'BD', planeName: '(SBD)' }
    );
  } else if (n === 6) {
    diagonals.push(
      { v1: 0, v2: 3, apex: sIdx, name: 'AD', planeName: '(SAD)' },
      { v1: 1, v2: 4, apex: sIdx, name: 'BE', planeName: '(SBE)' },
      { v1: 2, v2: 5, apex: sIdx, name: 'CF', planeName: '(SCF)' }
    );
  }

  return finalizePolyhedron({
    id,
    title,
    vertices,
    vertexNames,
    faces,
    params: { n, a, b, H, tiltX: apexX, tiltZ: apexZ },
    diagonals
  });
}

// Усечённая четырёхугольная пирамида
function buildFrustum4(opts = {}) {
  const wBottom = opts.width ? opts.width / 2 : 1.85;
  const ratioTop = opts.topRatio || 0.55;
  const wTop = wBottom * ratioTop;
  const H = opts.height || 2.3;
  const tiltX = opts.tiltX || 0;
  const tiltZ = opts.tiltZ || 0;

  const yBottom = -H / 2;
  const yTop = H / 2;

  const bCoords = [
    { x: -wBottom, z: wBottom },
    { x: wBottom, z: wBottom },
    { x: wBottom, z: -wBottom },
    { x: -wBottom, z: -wBottom }
  ];
  const tCoords = [
    { x: -wTop + tiltX, z: wTop + tiltZ },
    { x: wTop + tiltX, z: wTop + tiltZ },
    { x: wTop + tiltX, z: -wTop + tiltZ },
    { x: -wTop + tiltX, z: -wTop + tiltZ }
  ];

  const vertices = [];
  const vertexNames = [];
  for (let i = 0; i < 4; i++) {
    vertices.push({ x: bCoords[i].x, y: yBottom, z: bCoords[i].z });
    vertexNames.push(BASE_LETTERS[i]);
  }
  for (let i = 0; i < 4; i++) {
    vertices.push({ x: tCoords[i].x, y: yTop, z: tCoords[i].z });
    vertexNames.push(formatLabel(`${BASE_LETTERS[i]}1`));
  }

  const faces = [
    { vertices: [0, 1, 2, 3], name: '(ABCD)', role: 'bottom' },
    { vertices: [4, 5, 6, 7], name: '(A₁B₁C₁D₁)', role: 'top' },
    { vertices: [0, 1, 5, 4], name: '(ABB₁A₁)', role: 'lateral' },
    { vertices: [1, 2, 6, 5], name: '(BCC₁B₁)', role: 'lateral' },
    { vertices: [2, 3, 7, 6], name: '(CDD₁C₁)', role: 'lateral' },
    { vertices: [3, 0, 4, 7], name: '(DAA₁D₁)', role: 'lateral' }
  ];

  return finalizePolyhedron({
    id: 'frustum4',
    title: 'Усечённая четырёхугольная пирамида',
    vertices,
    vertexNames,
    faces,
    params: { n: 4, width: wBottom * 2, H, topRatio: ratioTop }
  });
}

// Правильный октаэдр ABCDEF (квадрат ABCD в экваториальной плоскости, E сверху, F снизу)
function buildOctahedron(opts = {}) {
  const r = opts.radius || 1.9;
  const H = opts.height || 2.7;
  const vertices = [
    { x: -r, y: 0, z: r },   // 0: A
    { x: r, y: 0, z: r },    // 1: B
    { x: r, y: 0, z: -r },   // 2: C
    { x: -r, y: 0, z: -r },  // 3: D
    { x: 0, y: H * 0.65, z: 0 },  // 4: E (верхняя вершина)
    { x: 0, y: -H * 0.65, z: 0 }  // 5: F (нижняя вершина)
  ];
  const vertexNames = ['A', 'B', 'C', 'D', 'E', 'F'];
  const faces = [
    { vertices: [4, 0, 1], name: '(EAB)', role: 'lateral' },
    { vertices: [4, 1, 2], name: '(EBC)', role: 'lateral' },
    { vertices: [4, 2, 3], name: '(ECD)', role: 'lateral' },
    { vertices: [4, 3, 0], name: '(EDA)', role: 'lateral' },
    { vertices: [5, 1, 0], name: '(FAB)', role: 'lateral' },
    { vertices: [5, 2, 1], name: '(FBC)', role: 'lateral' },
    { vertices: [5, 3, 2], name: '(FCD)', role: 'lateral' },
    { vertices: [5, 0, 3], name: '(FDA)', role: 'lateral' }
  ];

  return finalizePolyhedron({
    id: 'octahedron',
    title: 'Правильный октаэдр',
    vertices,
    vertexNames,
    faces,
    params: { r, H }
  });
}

// Тела вращения: Цилиндр, Конус, Шар
function buildRevolutionSolid(type, opts = {}) {
  const R = opts.radius || 1.65;
  const H = opts.height || 2.7;

  if (type === 'cylinder') {
    return {
      id: 'cylinder',
      title: 'Цилиндр',
      type: 'revolution',
      revType: 'cylinder',
      category: 'revolution',
      R,
      H,
      yBottom: -H / 2,
      yTop: H / 2,
      center: { x: 0, y: 0, z: 0 },
      params: { R, H }
    };
  }

  if (type === 'cone') {
    return {
      id: 'cone',
      title: 'Конус',
      type: 'revolution',
      revType: 'cone',
      category: 'revolution',
      R,
      H,
      yBottom: -H * 0.42,
      yApex: H * 0.58,
      center: { x: 0, y: 0, z: 0 },
      params: { R, H }
    };
  }

  if (type === 'sphere') {
    const rSphere = opts.radius || 1.95;
    return {
      id: 'sphere',
      title: 'Шар (Сфера)',
      type: 'revolution',
      revType: 'sphere',
      category: 'revolution',
      R: rSphere,
      H: rSphere * 2,
      center: { x: 0, y: 0, z: 0 },
      params: { R: rSphere }
    };
  }
}

// Каталог всех доступных шаблонов фигур
const SOLIDS_CATALOG = [
  { id: 'cube', title: 'Куб ABCDA₁B₁C₁D₁', group: 'Многогранники (Призмы)' },
  { id: 'parallelepiped', title: 'Прямоугольный параллелепипед', group: 'Многогранники (Призмы)' },
  { id: 'prism3', title: 'Правильная треугольная призма', group: 'Многогранники (Призмы)' },
  { id: 'prism4', title: 'Правильная четырёхугольная призма', group: 'Многогранники (Призмы)' },
  { id: 'prism6', title: 'Правильная шестиугольная призма', group: 'Многогранники (Призмы)' },
  { id: 'pyramid3', title: 'Тетраэдр (треугольная пирамида SABC)', group: 'Многогранники (Пирамиды)' },
  { id: 'pyramid4', title: 'Правильная четырёхугольная пирамида SABCD', group: 'Многогранники (Пирамиды)' },
  { id: 'pyramid6', title: 'Правильная шестиугольная пирамида SABCDEF', group: 'Многогранники (Пирамиды)' },
  { id: 'frustum4', title: 'Усечённая четырёхугольная пирамида', group: 'Многогранники (Пирамиды)' },
  { id: 'octahedron', title: 'Правильный октаэдр ABCDEF', group: 'Платоновы тела и конструктор' },
  { id: 'custom_prism', title: 'Своя n-угольная призма (n = 3..8)', group: 'Платоновы тела и конструктор' },
  { id: 'custom_pyramid', title: 'Своя n-угольная пирамида (n = 3..8)', group: 'Платоновы тела и конструктор' },
  { id: 'cylinder', title: 'Цилиндр (тело вращения)', group: 'Тела вращения' },
  { id: 'cone', title: 'Конус (тело вращения)', group: 'Тела вращения' },
  { id: 'sphere', title: 'Шар / Сфера (тело вращения)', group: 'Тела вращения' }
];

function createSolid(solidId, customOpts = {}) {
  const scaleW = customOpts.scaleW || 1.0;
  const scaleH = customOpts.scaleH || 1.0;
  const scaleD = customOpts.scaleD || 1.0;
  const tiltX = customOpts.tiltX || 0.0;
  const tiltZ = customOpts.tiltZ || 0.0;
  const customN = customOpts.customN || 5;

  switch (solidId) {
    case 'cube':
      return buildNPrism(4, {
        id: 'cube',
        title: 'Куб ABCDA₁B₁C₁D₁',
        isBox: true,
        width: 3.0 * scaleW,
        depth: 3.0 * scaleW,
        height: 3.0 * scaleW,
        tiltX,
        tiltZ
      });

    case 'parallelepiped':
      return buildNPrism(4, {
        id: 'parallelepiped',
        title: 'Параллелепипед ABCDA₁B₁C₁D₁',
        isBox: true,
        width: 3.4 * scaleW,
        depth: 2.3 * scaleD,
        height: 2.7 * scaleH,
        tiltX,
        tiltZ
      });

    case 'prism3':
      return buildNPrism(3, {
        id: 'prism3',
        title: 'Треугольная призма ABCA₁B₁C₁',
        radius: 2.1 * scaleW,
        depth: 2.1 * scaleD,
        height: 2.8 * scaleH,
        tiltX,
        tiltZ
      });

    case 'prism4':
      return buildNPrism(4, {
        id: 'prism4',
        title: 'Правильная четырёхугольная призма',
        isBox: true,
        width: 2.6 * scaleW,
        depth: 2.6 * scaleW,
        height: 3.4 * scaleH,
        tiltX,
        tiltZ
      });

    case 'prism6':
      return buildNPrism(6, {
        id: 'prism6',
        title: 'Правильная шестиугольная призма',
        radius: 2.0 * scaleW,
        depth: 2.0 * scaleD,
        height: 2.8 * scaleH,
        tiltX,
        tiltZ
      });

    case 'pyramid3':
      return buildNPyramid(3, {
        id: 'pyramid3',
        title: 'Тетраэдр (пирамида SABC)',
        radius: 2.25 * scaleW,
        depth: 2.25 * scaleD,
        height: 2.8 * scaleH,
        tiltX,
        tiltZ
      });

    case 'pyramid4':
      return buildNPyramid(4, {
        id: 'pyramid4',
        title: 'Четырёхугольная пирамида SABCD',
        isSquareBase: true,
        width: 3.2 * scaleW,
        depth: 3.2 * scaleD,
        height: 3.0 * scaleH,
        tiltX,
        tiltZ
      });

    case 'pyramid6':
      return buildNPyramid(6, {
        id: 'pyramid6',
        title: 'Шестиугольная пирамида SABCDEF',
        radius: 2.1 * scaleW,
        depth: 2.1 * scaleD,
        height: 3.0 * scaleH,
        tiltX,
        tiltZ
      });

    case 'frustum4':
      return buildFrustum4({
        width: 3.5 * scaleW,
        height: 2.5 * scaleH,
        topRatio: 0.55,
        tiltX,
        tiltZ
      });

    case 'octahedron':
      return buildOctahedron({
        radius: 1.9 * scaleW,
        height: 2.9 * scaleH
      });

    case 'custom_prism':
      return buildNPrism(customN, {
        id: 'custom_prism',
        title: `${customN}-угольная призма`,
        radius: 2.05 * scaleW,
        depth: 2.05 * scaleD,
        height: 2.8 * scaleH,
        tiltX,
        tiltZ
      });

    case 'custom_pyramid':
      return buildNPyramid(customN, {
        id: 'custom_pyramid',
        title: `${customN}-угольная пирамида`,
        radius: 2.1 * scaleW,
        depth: 2.1 * scaleD,
        height: 2.9 * scaleH,
        tiltX,
        tiltZ
      });

    case 'cylinder':
      return buildRevolutionSolid('cylinder', {
        radius: 1.65 * scaleW,
        height: 2.8 * scaleH
      });

    case 'cone':
      return buildRevolutionSolid('cone', {
        radius: 1.8 * scaleW,
        height: 2.9 * scaleH
      });

    case 'sphere':
      return buildRevolutionSolid('sphere', {
        radius: 1.95 * scaleW
      });

    default:
      return createSolid('cube', customOpts);
  }
}

window.formatLabel = formatLabel;
window.SOLIDS_CATALOG = SOLIDS_CATALOG;
window.createSolid = createSolid;
