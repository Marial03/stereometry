// ============================================================================
// presets.js — Коллекция классических задач и шаблонов (школьная геометрия и ЕГЭ №14)
// ============================================================================

function findEdgeByVertices(solid, vName1, vName2) {
  if (!solid || !solid.edges) return 0;
  const f1 = formatLabel(vName1);
  const f2 = formatLabel(vName2);
  for (let i = 0; i < solid.edges.length; i++) {
    const e = solid.edges[i];
    const n1 = solid.vertexNames[e.v1];
    const n2 = solid.vertexNames[e.v2];
    if ((n1 === f1 && n2 === f2) || (n1 === f2 && n2 === f1)) {
      return { index: i, reversed: n1 !== f1 };
    }
  }
  return { index: 0, reversed: false };
}

function makePtSpec(solid, vName1, vName2, tFromV1, label) {
  const found = findEdgeByVertices(solid, vName1, vName2);
  const t = found.reversed ? 1 - tFromV1 : tFromV1;
  return {
    edgeIndex: found.index,
    t,
    label
  };
}

const PRESETS_LIBRARY = [
  // --- ГРУППА 1: БАЗОВЫЕ (АКСИОМА ПЛОСКОСТИ) ---
  {
    id: 'cube_corner_triangle',
    group: '1. Базовые (соединение в одной грани)',
    title: 'Куб: треугольное сечение через 3 смежных ребра',
    subtitle: 'Точки M, N, K попарно лежат в общих гранях',
    solidId: 'cube',
    mode: 'points3',
    strategy: 'auto',
    setup(solid) {
      return {
        mode: 'points3',
        strategy: 'auto',
        points: [
          makePtSpec(solid, 'A1', 'B1', 0.5, 'M'),
          makePtSpec(solid, 'B1', 'C1', 0.5, 'N'),
          makePtSpec(solid, 'B', 'B1', 0.35, 'K')
        ]
      };
    }
  },
  {
    id: 'tetra_simple',
    group: '1. Базовые (соединение в одной грани)',
    title: 'Тетраэдр SABC: точки на трёх боковых рёбрах',
    subtitle: 'M ∈ SA, N ∈ SB, K ∈ SC — базовое сечение пирамиды',
    solidId: 'pyramid3',
    mode: 'points3',
    strategy: 'auto',
    setup(solid) {
      return {
        mode: 'points3',
        strategy: 'auto',
        points: [
          makePtSpec(solid, 'S', 'A', 0.5, 'M'),
          makePtSpec(solid, 'S', 'B', 1 / 3, 'N'),
          makePtSpec(solid, 'S', 'C', 2 / 3, 'K')
        ]
      };
    }
  },
  {
    id: 'cube_trapezoid',
    group: '1. Базовые (соединение в одной грани)',
    title: 'Куб: равнобедренная трапеция (ЕГЭ классика)',
    subtitle: 'Сечение через середины двух верхних рёбер и вершины основания',
    solidId: 'cube',
    mode: 'points3',
    strategy: 'auto',
    setup(solid) {
      return {
        mode: 'points3',
        strategy: 'auto',
        points: [
          makePtSpec(solid, 'A1', 'D1', 0.5, 'M'),
          makePtSpec(solid, 'C1', 'D1', 0.5, 'N'),
          makePtSpec(solid, 'A', 'B', 0.0, 'K')
        ]
      };
    }
  },

  // --- ГРУППА 2: МЕТОД СЛЕДОВ ---
  {
    id: 'tetra_traces',
    group: '2. Метод следов (продление прямых)',
    title: 'Тетраэдр SABC: классический метод следов',
    subtitle: 'Продление прямой MN до пересечения с ребром основания AB',
    solidId: 'pyramid3',
    mode: 'points3',
    strategy: 'traces',
    setup(solid) {
      return {
        mode: 'points3',
        strategy: 'traces',
        points: [
          makePtSpec(solid, 'S', 'A', 0.35, 'M'),
          makePtSpec(solid, 'S', 'B', 0.7, 'N'),
          makePtSpec(solid, 'B', 'C', 0.5, 'K')
        ]
      };
    }
  },
  {
    id: 'cube_hexagon',
    group: '2. Метод следов (продление прямых)',
    title: 'Куб: правильный шестиугольник в сечении!',
    subtitle: 'Знаменитая задача: через середины рёбер AA₁, B₁C₁ и CD',
    solidId: 'cube',
    mode: 'points3',
    strategy: 'traces',
    setup(solid) {
      return {
        mode: 'points3',
        strategy: 'traces',
        points: [
          makePtSpec(solid, 'A', 'A1', 0.5, 'M'),
          makePtSpec(solid, 'B1', 'C1', 0.5, 'N'),
          makePtSpec(solid, 'C', 'D', 0.5, 'K')
        ]
      };
    }
  },
  {
    id: 'cube_pentagon_traces',
    group: '2. Метод следов (продление прямых)',
    title: 'Куб: пятиугольное сечение методом следов',
    subtitle: 'Выносные точки-следы E₁, E₂ на продолжениях рёбер',
    solidId: 'cube',
    mode: 'points3',
    strategy: 'traces',
    setup(solid) {
      return {
        mode: 'points3',
        strategy: 'traces',
        points: [
          makePtSpec(solid, 'A1', 'D1', 0.4, 'M'),
          makePtSpec(solid, 'C1', 'D1', 0.55, 'N'),
          makePtSpec(solid, 'B', 'B1', 0.4, 'K')
        ]
      };
    }
  },
  {
    id: 'pyramid4_traces',
    group: '2. Метод следов (продление прямых)',
    title: 'Пирамида SABCD: метод следов на плоскость основания',
    subtitle: 'Точки на рёбрах SA, SB и стороне основания CD',
    solidId: 'pyramid4',
    mode: 'points3',
    strategy: 'traces',
    setup(solid) {
      return {
        mode: 'points3',
        strategy: 'traces',
        points: [
          makePtSpec(solid, 'S', 'A', 0.4, 'M'),
          makePtSpec(solid, 'S', 'B', 0.72, 'N'),
          makePtSpec(solid, 'C', 'D', 0.45, 'K')
        ]
      };
    }
  },

  // --- ГРУППА 3: ПАРАЛЛЕЛЬНЫЙ ПЕРЕНОС ---
  {
    id: 'cube_parallel_faces',
    group: '3. Параллельный перенос',
    title: 'Куб: параллельный перенос в противоположных гранях',
    subtitle: 'Использование свойства пересечения параллельных плоскостей',
    solidId: 'cube',
    mode: 'points3',
    strategy: 'parallel',
    setup(solid) {
      return {
        mode: 'points3',
        strategy: 'parallel',
        points: [
          makePtSpec(solid, 'A', 'A1', 0.35, 'M'),
          makePtSpec(solid, 'A', 'B', 0.5, 'N'),
          makePtSpec(solid, 'C1', 'D1', 0.5, 'K')
        ]
      };
    }
  },
  {
    id: 'prism3_parallel_edge',
    group: '3. Параллельный перенос',
    title: 'Треугольная призма: сечение параллельно ребру AA₁',
    subtitle: 'Через две точки M и N параллельно боковому ребру призмы',
    solidId: 'prism3',
    mode: 'parallelLine',
    strategy: 'auto',
    setup(solid) {
      const parEdge = findEdgeByVertices(solid, 'A', 'A1').index;
      return {
        mode: 'parallelLine',
        strategy: 'auto',
        parallelEdgeIndex: parEdge,
        points: [
          makePtSpec(solid, 'A', 'B', 0.5, 'M'),
          makePtSpec(solid, 'B', 'C', 0.5, 'N'),
          makePtSpec(solid, 'A', 'C', 0.5, 'K')
        ]
      };
    }
  },
  {
    id: 'pyramid4_parallel_base_edge',
    group: '3. Параллельный перенос',
    title: 'Пирамида SABCD: сечение параллельно ребру основания BC',
    subtitle: 'Через точки M ∈ SA и N ∈ CD параллельно прямой BC',
    solidId: 'pyramid4',
    mode: 'parallelLine',
    strategy: 'auto',
    setup(solid) {
      const parEdge = findEdgeByVertices(solid, 'B', 'C').index;
      return {
        mode: 'parallelLine',
        strategy: 'auto',
        parallelEdgeIndex: parEdge,
        points: [
          makePtSpec(solid, 'S', 'A', 0.5, 'M'),
          makePtSpec(solid, 'C', 'D', 0.5, 'N'),
          makePtSpec(solid, 'S', 'B', 0.5, 'K')
        ]
      };
    }
  },

  // --- ГРУППА 4: МЕТОД ВНУТРЕННЕГО ПРОЕКТИРОВАНИЯ ---
  {
    id: 'pyramid4_internal_proj',
    group: '4. Внутреннее проектирование (диагонали)',
    title: 'Пирамида SABCD: точки на трёх боковых рёбрах SA, SB, SC',
    subtitle: 'Построение 4-й вершины на ребре SD через пересечение с высотой SO',
    solidId: 'pyramid4',
    mode: 'points3',
    strategy: 'projection',
    setup(solid) {
      return {
        mode: 'points3',
        strategy: 'projection',
        points: [
          makePtSpec(solid, 'S', 'A', 0.45, 'M'),
          makePtSpec(solid, 'S', 'B', 0.65, 'N'),
          makePtSpec(solid, 'S', 'C', 0.75, 'K')
        ]
      };
    }
  },
  {
    id: 'prism6_section',
    group: '4. Внутреннее проектирование (диагонали)',
    title: 'Шестиугольная призма: сечение через 3 точки',
    subtitle: 'Многоугольное сечение правильной шестиугольной призмы',
    solidId: 'prism6',
    mode: 'points3',
    strategy: 'auto',
    setup(solid) {
      return {
        mode: 'points3',
        strategy: 'auto',
        points: [
          makePtSpec(solid, 'A', 'A1', 0.25, 'M'),
          makePtSpec(solid, 'B', 'C', 0.5, 'N'),
          makePtSpec(solid, 'D1', 'E1', 0.5, 'K')
        ]
      };
    }
  },
  {
    id: 'octahedron_section',
    group: '4. Внутреннее проектирование (диагонали)',
    title: 'Октаэдр ABCDEF: шестиугольное сечение',
    subtitle: 'Сечение правильного октаэдра через середины рёбер',
    solidId: 'octahedron',
    mode: 'points3',
    strategy: 'parallel',
    setup(solid) {
      return {
        mode: 'points3',
        strategy: 'parallel',
        points: [
          makePtSpec(solid, 'E', 'A', 0.5, 'M'),
          makePtSpec(solid, 'E', 'B', 0.5, 'N'),
          makePtSpec(solid, 'F', 'C', 0.5, 'K')
        ]
      };
    }
  },

  // --- ГРУППА 5: ТЕЛА ВРАЩЕНИЯ ---
  {
    id: 'cylinder_parallel_axis',
    group: '5. Тела вращения (Цилиндр, Конус, Шар)',
    title: 'Цилиндр: сечение параллельно оси OO₁',
    subtitle: 'Хорда основания AB на расстоянии d от центра O, прямоугольник ABB₁A₁',
    solidId: 'cylinder',
    revMode: 'parallelAxis',
    offsetD: 0.45
  },
  {
    id: 'cone_through_apex',
    group: '5. Тела вращения (Цилиндр, Конус, Шар)',
    title: 'Конус: сечение через вершину S и хорду основания AB',
    subtitle: 'Равнобедренный треугольник △SAB, высота сечения SH и расстояние OH = d',
    solidId: 'cone',
    revMode: 'parallelAxis',
    offsetD: 0.45
  },
  {
    id: 'sphere_plane_section',
    group: '5. Тела вращения (Цилиндр, Конус, Шар)',
    title: 'Шар: сечение плоскостью на расстоянии d от центра',
    subtitle: 'Прямоугольный треугольник △OO₁M и радиус сечения r = √(R² − d²)',
    solidId: 'sphere',
    revMode: 'parallelAxis',
    offsetD: 0.48
  }
];

window.findEdgeByVertices = findEdgeByVertices;
window.makePtSpec = makePtSpec;
window.PRESETS_LIBRARY = PRESETS_LIBRARY;
