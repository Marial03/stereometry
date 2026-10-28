// ============================================================================
// constructionEngine.js — Педагогический движок пошагового построения сечений
// Поддерживает:
// 1. Аксиому принадлежности прямой плоскости (соединение точек в одной грани)
// 2. Метод следов (продление прямых и рёбер до пересечения, прямая следа)
// 3. Параллельный перенос (параллельные грани и параллельность заданной прямой)
// 4. Метод внутреннего проектирования (пересечение диагоналей и осевых прямых)
// 5. Сечения тел вращения (цилиндр, конус, шар)
// ============================================================================

const SECTION_POINT_LABELS = ['P', 'Q', 'L', 'R', 'T', 'H', 'W', 'Z'];
const TRACE_POINT_LABELS = ['E₁', 'E₂', 'E₃', 'E₄', 'E₅', 'E₆'];

const RULES_REFERENCE = {
  GIVEN: {
    category: 'Дано',
    color: '#3b82f6',
    formula: 'Задание начальных элементов секущей плоскости (по аксиоме A₁ через 3 точки, точку и прямую или параллельность).'
  },
  AXIOM_FACE: {
    category: 'Аксиома плоскости',
    color: '#10b981',
    formula: 'Аксиома A₂: Если две точки прямой принадлежат плоскости (грани), то и вся прямая принадлежит этой плоскости.'
  },
  TRACE_EXTEND: {
    category: 'Метод следов',
    color: '#f59e0b',
    formula: 'Две непараллельные прямые, лежащие в одной плоскости (грани), пересекаются в точке (следе), принадлежащей обеим прямым.'
  },
  TRACE_CONNECT: {
    category: 'Метод следов',
    color: '#f59e0b',
    formula: 'Прямая, проведённая через точку-след и точку сечения в одной плоскости грани, высекает на рёбрах этой грани новые вершины сечения.'
  },
  PARALLEL_GIVEN: {
    category: 'Параллельный перенос',
    color: '#8b5cf6',
    formula: 'Теорема: Если плоскость проходит через прямую, параллельную другой плоскости, и пересекает её, то линия пересечения параллельна данной прямой.'
  },
  PARALLEL_FACES: {
    category: 'Параллельный перенос',
    color: '#8b5cf6',
    formula: 'Теорема: Если две параллельные плоскости (грани) пересечены третьей (секущей) плоскостью, то линии их пересечения параллельны.'
  },
  INTERNAL_PROJ: {
    category: 'Внутреннее проектирование',
    color: '#ec4899',
    formula: 'Метод вспомогательных плоскостей: находим общую точку секущей плоскости с прямой пересечения диагональных сечений (осью фигуры).'
  },
  AUX_PLANE_PROJ: {
    category: 'Вспомогательная плоскость',
    color: '#0ea5e9',
    formula: 'Через две параллельные проектирующие прямые (ортогональные проекции точек на основание) проходит единственная вспомогательная плоскость β.'
  },
  COMPLETE: {
    category: 'Итог построения',
    color: '#059669',
    formula: 'Сечение многогранника плоскостью — выпуклый многоугольник, стороны которого являются отрезками пересечения секущей плоскости с гранями.'
  }
};

// Вычисляет 3D-координаты входной точки по её описанию (на ребре t in [0,1] или вершине)
function resolveInputPoint(solid, ptSpec, defaultLabel) {
  const edge = solid.edges[ptSpec.edgeIndex] || solid.edges[0];
  const t = typeof ptSpec.t === 'number' ? ptSpec.t : 0.5;
  const v1 = solid.vertices[edge.v1];
  const v2 = solid.vertices[edge.v2];
  const pos = Vec3.lerp(v1, v2, t);

  // Определим, попала ли точка точно в вершину
  let vertexIndex = -1;
  if (t <= 0.005) vertexIndex = edge.v1;
  else if (t >= 0.995) vertexIndex = edge.v2;

  // Соберём все грани и рёбра, которым принадлежит точка
  const faces = new Set();
  const edges = new Set();

  if (vertexIndex >= 0) {
    solid.faces.forEach((f, fi) => {
      if (f.vertices.includes(vertexIndex)) faces.add(fi);
    });
    solid.edges.forEach((e, ei) => {
      if (e.v1 === vertexIndex || e.v2 === vertexIndex) edges.add(ei);
    });
  } else {
    edge.faces.forEach(fi => faces.add(fi));
    edges.add(edge.index);
  }

  const label = ptSpec.label || defaultLabel;
  const ratioText = Geo3D.formatRatio(t);
  const edgeName = edge.name;

  return {
    label,
    pos,
    role: 'given',
    edgeIndex: edge.index,
    edgeName,
    t,
    ratioText,
    vertexIndex,
    faces: Array.from(faces),      // Грани, на самой поверхности которых лежит точка
    planes: Array.from(faces),     // Плоскости граней, которым принадлежит точка
    edges: Array.from(edges)
  };
}

// Проверяет, каким граням и рёбрам многогранника принадлежит произвольная 3D-точка
function classifyPointOnSolid(solid, pos, tol = 1e-3) {
  let vertexIndex = -1;
  for (let i = 0; i < solid.vertices.length; i++) {
    if (Vec3.dist(pos, solid.vertices[i]) <= tol * 2) {
      vertexIndex = i;
      break;
    }
  }

  const faces = new Set();
  const planes = new Set();
  const edges = new Set();
  let primaryEdgeIndex = -1;

  if (vertexIndex >= 0) {
    solid.faces.forEach((f, fi) => {
      if (f.vertices.includes(vertexIndex)) {
        faces.add(fi);
        planes.add(fi);
      }
    });
    solid.edges.forEach((e, ei) => {
      if (e.v1 === vertexIndex || e.v2 === vertexIndex) {
        edges.add(ei);
        if (primaryEdgeIndex === -1) primaryEdgeIndex = ei;
      }
    });
  } else {
    for (let ei = 0; ei < solid.edges.length; ei++) {
      const e = solid.edges[ei];
      const A = solid.vertices[e.v1];
      const B = solid.vertices[e.v2];
      if (Geo3D.isPointOnSegment(pos, A, B, tol)) {
        edges.add(ei);
        primaryEdgeIndex = ei;
        e.faces.forEach(fi => {
          faces.add(fi);
          planes.add(fi);
        });
      }
    }
    // Проверим также плоскости граней (для внешних точек-следов)
    for (let fi = 0; fi < solid.faces.length; fi++) {
      const f = solid.faces[fi];
      if (Geo3D.isPointInPlane(f.plane, pos, tol * 2)) {
        planes.add(fi);
        const fv = f.vertices.map(vi => solid.vertices[vi]);
        if (Geo3D.isPointInConvexPolygon3D(pos, fv, f.normal, tol * 2)) {
          faces.add(fi);
        }
      }
    }
  }

  return {
    vertexIndex,
    faces: Array.from(faces),
    planes: Array.from(planes),
    edges: Array.from(edges),
    primaryEdgeIndex
  };
}

// Основная функция построения пошагового решения для многогранника
function buildPolyhedronConstruction(solid, spec) {
  const mode = spec.mode || 'points3';
  const strategy = spec.strategy || 'auto'; // 'auto' | 'traces' | 'parallel' | 'projection'

  const ptM = resolveInputPoint(solid, spec.points[0], 'M');
  const ptN = resolveInputPoint(solid, spec.points[1], 'N');
  const ptK = resolveInputPoint(solid, spec.points[2], 'K');

  let plane = null;
  let givenDescription = '';
  let givenPoints = [];
  let givenDir = null;
  let givenDirName = '';
  let givenParallelFaceIdx = -1;
  const initialAuxLines = [];

  if (mode === 'points3' || mode === 'pointLine') {
    givenPoints = [ptM, ptN, ptK];
    plane = Geo3D.planeFromPoints(ptM.pos, ptN.pos, ptK.pos);
    if (mode === 'points3') {
      givenDescription =
        `Даны три точки на рёбрах многогранника: ` +
        `M ∈ ${ptM.edgeName} (${ptM.ratioText}), ` +
        `N ∈ ${ptN.edgeName} (${ptN.ratioText}), ` +
        `K ∈ ${ptK.edgeName} (${ptK.ratioText}). ` +
        `По аксиоме стереометрии через три точки, не лежащие на одной прямой, проходит единственная секущая плоскость α = (MNK).`;
    } else {
      givenDescription =
        `Дана точка M ∈ ${ptM.edgeName} (${ptM.ratioText}) и прямая NK, где ` +
        `N ∈ ${ptN.edgeName}, K ∈ ${ptK.edgeName}. ` +
        `Через прямую NK и не лежащую на ней точку M проходит единственная секущая плоскость α.`;
      initialAuxLines.push({
        p1: ptN.pos,
        p2: ptK.pos,
        style: 'givenLine',
        label: 'прямая NK'
      });
    }
  } else if (mode === 'parallelLine') {
    givenPoints = [ptM, ptN];
    const parEdgeIdx = typeof spec.parallelEdgeIndex === 'number' ? spec.parallelEdgeIndex : 0;
    const parEdge = solid.edges[parEdgeIdx] || solid.edges[0];
    const A = solid.vertices[parEdge.v1];
    const B = solid.vertices[parEdge.v2];
    givenDir = Vec3.normalize(Vec3.sub(B, A));
    givenDirName = parEdge.name;
    plane = Geo3D.planeFromTwoPointsAndDir(ptM.pos, ptN.pos, givenDir);
    givenDescription =
      `Даны две точки M ∈ ${ptM.edgeName} (${ptM.ratioText}) и N ∈ ${ptN.edgeName} (${ptN.ratioText}). ` +
      `Требуется построить сечение плоскостью α, проходящей через точки M и N параллельно ребру ${givenDirName}.`;
    initialAuxLines.push({
      p1: A,
      p2: B,
      style: 'parallelRef',
      label: `∥ ${givenDirName}`
    });
  } else if (mode === 'parallelFace') {
    givenPoints = [ptM];
    givenParallelFaceIdx = typeof spec.parallelFaceIndex === 'number' ? spec.parallelFaceIndex : 0;
    const refFace = solid.faces[givenParallelFaceIdx] || solid.faces[0];
    plane = Geo3D.planeFromPointAndNormal(ptM.pos, refFace.normal);
    givenDescription =
      `Дана точка M ∈ ${ptM.edgeName} (${ptM.ratioText}). ` +
      `Требуется построить сечение плоскостью α, проходящей через точку M параллельно грани ${refFace.name}.`;
  }

  if (!plane) {
    return {
      valid: false,
      error: 'Заданные точки лежат на одной прямой или совпадают — плоскость сечения не определена однозначно.',
      steps: []
    };
  }

  // Полное аналитическое сечение для контроля и финального шага
  const exactSection = Geo3D.computePolyhedronSection(solid, plane);
  if (!exactSection || exactSection.points.length < 3) {
    return {
      valid: false,
      error: 'Секущая плоскость касается многогранника только в точке/ребре и не образует многоугольника сечения.',
      steps: []
    };
  }

  // Начинаем накопление шагов построения
  const knownPoints = givenPoints.map(p => ({ ...p }));
  const constructedSegments = []; // { faceIndex, p1, p2, label1, label2, name }
  const auxLines = initialAuxLines.map(l => ({ ...l }));
  const auxPlanes = []; // Вспомогательные проектирующие плоскости { poly3d: [p1,p2,p3,p4], name }
  const completedFaces = new Set();
  const steps = [];

  let secPtCounter = 0;
  let tracePtCounter = 0;

  function nextSectionLabel() {
    const lbl = SECTION_POINT_LABELS[secPtCounter] || `T${secPtCounter + 1}`;
    secPtCounter++;
    return lbl;
  }

  function nextTraceLabel() {
    const lbl = TRACE_POINT_LABELS[tracePtCounter] || `E${tracePtCounter + 1}`;
    tracePtCounter++;
    return lbl;
  }

  // Добавляет или возвращает уже существующую точку в knownPoints
  function addOrGetPoint(pos, role = 'section', extra = {}) {
    for (const kp of knownPoints) {
      if (Vec3.equals(kp.pos, pos, 1e-3)) {
        // Дополним информацию о принадлежности плоскостям и граням
        const info = classifyPointOnSolid(solid, pos);
        info.faces.forEach(fi => { if (!kp.faces.includes(fi)) kp.faces.push(fi); });
        info.planes.forEach(fi => { if (!kp.planes.includes(fi)) kp.planes.push(fi); });
        if (extra.planes) {
          extra.planes.forEach(fi => { if (!kp.planes.includes(fi)) kp.planes.push(fi); });
        }
        return { point: kp, isNew: false };
      }
    }

    const info = classifyPointOnSolid(solid, pos);
    let label = extra.label;
    if (!label) {
      if (info.vertexIndex >= 0) {
        label = solid.vertexNames[info.vertexIndex];
      } else if (role === 'trace') {
        label = nextTraceLabel();
      } else {
        label = nextSectionLabel();
      }
    }

    const planesSet = new Set(info.planes);
    if (extra.planes) extra.planes.forEach(fi => planesSet.add(fi));

    let edgeName = extra.edgeName || '';
    if (!edgeName && info.primaryEdgeIndex >= 0) {
      edgeName = solid.edges[info.primaryEdgeIndex].name;
    }

    const newPt = {
      label,
      pos: Vec3.clone(pos),
      role, // 'given' | 'section' | 'trace' | 'internal'
      edgeIndex: info.primaryEdgeIndex,
      edgeName,
      vertexIndex: info.vertexIndex,
      faces: info.faces,
      planes: Array.from(planesSet),
      edges: info.edges
    };
    knownPoints.push(newPt);
    return { point: newPt, isNew: true };
  }

  function recordStep(stepData) {
    steps.push({
      stepIndex: steps.length,
      title: stepData.title,
      ruleCategory: stepData.rule.category,
      ruleColor: stepData.rule.color,
      ruleFormula: stepData.rule.formula,
      explanation: stepData.explanation,
      highlightFaces: stepData.highlightFaces || [],
      points: knownPoints.map(p => ({ ...p, faces: [...p.faces], planes: [...p.planes] })),
      segments: constructedSegments.map(s => ({ ...s })),
      auxLines: auxLines.map(a => ({ ...a })),
      auxPlanes: auxPlanes.map(ap => ({ ...ap, poly3d: ap.poly3d.map(pt => Vec3.clone(pt)) })),
      newPointLabels: stepData.newPointLabels || [],
      newSegmentIndex: typeof stepData.newSegmentIndex === 'number' ? stepData.newSegmentIndex : -1,
      newAuxIndices: stepData.newAuxIndices || [],
      completedPolygon: stepData.completedPolygon || null
    });
  }

  // Шаг 0: Дано
  recordStep({
    title: 'Исходные данные задачи',
    rule: RULES_REFERENCE.GIVEN,
    explanation: givenDescription,
    highlightFaces: givenParallelFaceIdx >= 0 ? [givenParallelFaceIdx] : [],
    newPointLabels: givenPoints.map(p => p.label)
  });

  // Все грани, которые реально пересекаются плоскостью по отрезку
  const targetFaceIndices = exactSection.faceSegments.map(fs => fs.faceIndex);

  // Вспомогательная функция: какие известные точки СЕЧЕНИЯ лежат НА самой грани fi
  function getPointsOnFace(fi) {
    return knownPoints.filter(
      p => p.role !== 'projection' && p.role !== 'internal' && p.faces.includes(fi)
    );
  }

  // Какие известные точки СЕЧЕНИЯ лежат в ПЛОСКОСТИ грани fi (включая внешние следы!)
  function getPointsInFacePlane(fi) {
    return knownPoints.filter(
      p => p.role !== 'projection' && p.role !== 'internal' && p.planes.includes(fi)
    );
  }

  // Попытка построить отрезок сечения на грани fi по двум точкам pA, pB, лежащим в плоскости грани fi
  function constructSegmentOnFaceFromLine(fi, pA, pB, modeType, extraNote = '') {
    const face = solid.faces[fi];
    const hits = Geo3D.intersectLineWithFacePolygon(pA.pos, pB.pos, face, solid.vertices);
    if (hits.length < 2) return false;

    const r1 = addOrGetPoint(hits[0].point, 'section', { planes: [fi] });
    const r2 = addOrGetPoint(hits[1].point, 'section', { planes: [fi] });
    const pt1 = r1.point;
    const pt2 = r2.point;

    if (Vec3.equals(pt1.pos, pt2.pos, 1e-3)) return false;

    completedFaces.add(fi);
    const segIdx = constructedSegments.length;
    constructedSegments.push({
      faceIndex: fi,
      faceName: face.name,
      p1: pt1.pos,
      p2: pt2.pos,
      label1: pt1.label,
      label2: pt2.label,
      name: `${pt1.label}${pt2.label}`
    });

    const newPtLabels = [];
    if (r1.isNew) newPtLabels.push(pt1.label);
    if (r2.isNew) newPtLabels.push(pt2.label);

    const newAuxIndices = [];

    if (modeType === 'direct') {
      let expl = `Точки ${pA.label} и ${pB.label} лежат в одной грани ${face.name}. ` +
        `Соединим их отрезком ${pt1.label}${pt2.label} — это сторона сечения в грани ${face.name}.`;
      if (newPtLabels.length > 0) {
        expl = `Точки ${pA.label} и ${pB.label} принадлежат грани ${face.name}. ` +
          `Проведём через них прямую до пересечения с рёбрами грани и получим отрезок сечения ${pt1.label}${pt2.label}.`;
      }
      recordStep({
        title: `Отрезок ${pt1.label}${pt2.label} в грани ${face.name}`,
        rule: RULES_REFERENCE.AXIOM_FACE,
        explanation: expl,
        highlightFaces: [fi],
        newPointLabels: newPtLabels,
        newSegmentIndex: segIdx
      });
    } else if (modeType === 'traceConnect') {
      // Нарисуем выносную прямую от следа к точкам на грани
      const tracePt = pA.role === 'trace' ? pA : pB;
      const otherPt = pA.role === 'trace' ? pB : pA;
      // Найдём самую дальнюю от tracePt точку из (pt1, pt2, otherPt)
      const d1 = Vec3.dist(tracePt.pos, pt1.pos);
      const d2 = Vec3.dist(tracePt.pos, pt2.pos);
      const farPt = d1 >= d2 ? pt1 : pt2;

      const auxIdx = auxLines.length;
      auxLines.push({
        p1: tracePt.pos,
        p2: farPt.pos,
        style: 'traceRay',
        label: `след ${tracePt.label}${otherPt.label}`
      });
      newAuxIndices.push(auxIdx);

      const newDesc = newPtLabels.map(lbl => {
        const pObj = knownPoints.find(k => k.label === lbl);
        return pObj && pObj.edgeName ? `${lbl} (на ребре ${pObj.edgeName})` : lbl;
      }).join(' и ');

      recordStep({
        title: `Прямая через след ${tracePt.label} и точку ${otherPt.label} в плоскости ${face.name}`,
        rule: RULES_REFERENCE.TRACE_CONNECT,
        explanation:
          `Точка-след ${tracePt.label} и точка ${otherPt.label} лежат в одной плоскости грани ${face.name}. ` +
          `Проведём через них прямую ${tracePt.label}${otherPt.label}.${newDesc ? ` Она пересекает контур грани в точке ${newDesc}.` : ''} ` +
          `Отрезок ${pt1.label}${pt2.label} — сторона сечения в грани ${face.name}.`,
        highlightFaces: [fi],
        newPointLabels: newPtLabels,
        newSegmentIndex: segIdx,
        newAuxIndices
      });
    } else if (modeType === 'parallelGiven' || modeType === 'parallelFace') {
      recordStep({
        title: `Параллельный перенос в грани ${face.name}: отрезок ${pt1.label}${pt2.label}`,
        rule: modeType === 'parallelGiven' ? RULES_REFERENCE.PARALLEL_GIVEN : RULES_REFERENCE.PARALLEL_FACES,
        explanation: extraNote + ` Получаем новую точку ${newPtLabels.join(', ')} и сторону сечения ${pt1.label}${pt2.label} в грани ${face.name}.`,
        highlightFaces: [fi],
        newPointLabels: newPtLabels,
        newSegmentIndex: segIdx
      });
    }

    return true;
  }

  // Главный цикл дедуктивного вывода шагов (до 24 итераций)
  for (let iter = 0; iter < 24; iter++) {
    // Проверим, все ли целевые грани уже построены
    const remainingTargets = targetFaceIndices.filter(fi => !completedFaces.has(fi));
    if (remainingTargets.length === 0) break;

    let actionTaken = false;

    // ------------------------------------------------------------------------
    // ПРАВИЛО 1: Две точки уже лежат непосредственно на одной грани -> соединяем!
    // ------------------------------------------------------------------------
    for (const fi of remainingTargets) {
      const ptsOnFace = getPointsOnFace(fi);
      if (ptsOnFace.length >= 2) {
        if (constructSegmentOnFaceFromLine(fi, ptsOnFace[0], ptsOnFace[1], 'direct')) {
          actionTaken = true;
          break;
        }
      }
    }
    if (actionTaken) continue;

    // ------------------------------------------------------------------------
    // ПРАВИЛО 2: В плоскости грани есть точка на грани + точка-след (или 2 следа)
    // ------------------------------------------------------------------------
    for (const fi of remainingTargets) {
      const ptsInPlane = getPointsInFacePlane(fi);
      if (ptsInPlane.length >= 2) {
        // Предпочтём пару, где хотя бы одна точка лежит на самой грани
        let pair = [ptsInPlane[0], ptsInPlane[1]];
        const onFace = ptsInPlane.filter(p => p.faces.includes(fi));
        const traces = ptsInPlane.filter(p => !p.faces.includes(fi));
        if (onFace.length >= 1 && traces.length >= 1) {
          pair = [traces[0], onFace[0]];
        }
        if (constructSegmentOnFaceFromLine(fi, pair[0], pair[1], 'traceConnect')) {
          actionTaken = true;
          break;
        }
      }
    }
    if (actionTaken) continue;

    // ------------------------------------------------------------------------
    // ПРАВИЛО 3A: Условие параллельности заданной прямой (mode === 'parallelLine')
    // или заданной грани (mode === 'parallelFace')
    // ------------------------------------------------------------------------
    if (mode === 'parallelLine' && givenDir) {
      for (const fi of remainingTargets) {
        const face = solid.faces[fi];
        // Проверим, параллельна ли грань заданному направлению givenDir (n · dir == 0)
        if (Math.abs(Vec3.dot(face.normal, givenDir)) < 1e-3) {
          const ptsOnFace = getPointsOnFace(fi);
          if (ptsOnFace.length >= 1) {
            const pStart = ptsOnFace[0];
            const fakeSecond = {
              label: '',
              pos: Vec3.add(pStart.pos, givenDir),
              role: 'aux'
            };
            const note =
              `Секущая плоскость α параллельна ребру ${givenDirName}, которое параллельно грани ${face.name}. ` +
              `В грани ${face.name} через точку ${pStart.label} проведём прямую, параллельную ${givenDirName}.`;
            if (constructSegmentOnFaceFromLine(fi, pStart, fakeSecond, 'parallelGiven', note)) {
              actionTaken = true;
              break;
            }
          }
        }
      }
      if (actionTaken) continue;
    }

    if (mode === 'parallelFace' && givenParallelFaceIdx >= 0) {
      const refFace = solid.faces[givenParallelFaceIdx];
      for (const fi of remainingTargets) {
        const face = solid.faces[fi];
        const ptsOnFace = getPointsOnFace(fi);
        if (ptsOnFace.length >= 1) {
          // Направление линии пересечения грани face с плоскостью, параллельной refFace:
          // оно параллельно линии пересечения face и refFace (или общему ребру)
          const dir = Vec3.normalize(Vec3.cross(face.normal, refFace.normal));
          if (Vec3.len(dir) > 1e-4) {
            // Найдём ребро грани face, параллельное dir, для понятного объяснения
            let parEdgeName = `плоскости ${refFace.name}`;
            for (const e of solid.edges) {
              if (e.faces.includes(fi) && e.faces.includes(givenParallelFaceIdx)) {
                parEdgeName = `ребру ${e.name}`;
                break;
              }
            }
            const pStart = ptsOnFace[0];
            const fakeSecond = { label: '', pos: Vec3.add(pStart.pos, dir), role: 'aux' };
            const note =
              `Так как секущая плоскость параллельна грани ${refFace.name}, в грани ${face.name} ` +
              `проведём через точку ${pStart.label} прямую, параллельную ${parEdgeName}.`;
            if (constructSegmentOnFaceFromLine(fi, pStart, fakeSecond, 'parallelFace', note)) {
              actionTaken = true;
              break;
            }
          }
        }
      }
      if (actionTaken) continue;
    }

    // ------------------------------------------------------------------------
    // ПРАВИЛО 3B: Параллельный перенос в параллельных гранях
    // (если выбран режим 'parallel' или 'auto' и есть построенный отрезок в параллельной грани)
    // ------------------------------------------------------------------------
    if (strategy === 'parallel' || strategy === 'auto') {
      // Если strategy === 'traces', пропустим параллельный перенос в 1-ю очередь,
      // чтобы показать ученику метод следов
      for (const fi of remainingTargets) {
        const face = solid.faces[fi];
        const ptsOnFace = getPointsOnFace(fi);
        if (ptsOnFace.length < 1) continue;

        // Ищем уже построенную грань fj, параллельную грани fi
        let parallelSeg = null;
        for (const seg of constructedSegments) {
          const otherFace = solid.faces[seg.faceIndex];
          if (Vec3.isParallel(face.normal, otherFace.normal, 1e-3)) {
            parallelSeg = seg;
            break;
          }
        }

        if (parallelSeg) {
          const dir = Vec3.normalize(Vec3.sub(parallelSeg.p2, parallelSeg.p1));
          const pStart = ptsOnFace[0];
          const fakeSecond = { label: '', pos: Vec3.add(pStart.pos, dir), role: 'aux' };
          const note =
            `Грани ${face.name} и ${parallelSeg.faceName} параллельны. ` +
            `По теореме о пересечении двух параллельных плоскостей третьей, линии сечения в них параллельны. ` +
            `Проведём в грани ${face.name} через точку ${pStart.label} прямую, параллельную отрезку ${parallelSeg.name}.`;
          if (constructSegmentOnFaceFromLine(fi, pStart, fakeSecond, 'parallelFace', note)) {
            actionTaken = true;
            break;
          }
        }
      }
      if (actionTaken) continue;
    }

    // ------------------------------------------------------------------------
    // ПРАВИЛО 4: МЕТОД ВНУТРЕННЕГО ПРОЕКТИРОВАНИЯ (через пересечение диагоналей)
    // Применяется, если выбран strategy === 'projection' или если в пирамиде/призме
    // известны точки на противоположных боковых рёбрах
    // ------------------------------------------------------------------------
    if ((strategy === 'projection' || strategy === 'auto') && solid.diagonals && solid.diagonals.length >= 2) {
      // Проверим, есть ли в диагональной плоскости 1 две известные точки, а в диагональной плоскости 2 — одна точка
      const d1 = solid.diagonals[0];
      const d2 = solid.diagonals[1];
      if (d1.apex !== undefined && d2.apex !== undefined) {
        // Пирамида с вершиной S
        const S = solid.vertices[d1.apex];
        const A = solid.vertices[d1.v1];
        const C = solid.vertices[d1.v2];
        const B = solid.vertices[d2.v1];
        const D = solid.vertices[d2.v2];
        const baseInter = Geo3D.intersectCoplanarLines(A, C, B, D, 1e-2);

        if (baseInter) {
          const O = baseInter.point;
          const diagPlane1 = Geo3D.planeFromPoints(S, A, C);
          const diagPlane2 = Geo3D.planeFromPoints(S, B, D);

          const ptsInDiag1 = knownPoints.filter(
            p => p.role !== 'trace' && Geo3D.isPointInPlane(diagPlane1, p.pos, 1e-2)
          );
          const ptsInDiag2 = knownPoints.filter(
            p => p.role !== 'trace' && Geo3D.isPointInPlane(diagPlane2, p.pos, 1e-2)
          );

          // Если в одной диагональной плоскости уже есть 2 точки, а во второй — только 1 точка
          let activeD1 = null, activeD2 = null, pPair = null, pSingle = null;
          if (ptsInDiag1.length >= 2 && ptsInDiag2.length === 1) {
            activeD1 = d1; activeD2 = d2; pPair = [ptsInDiag1[0], ptsInDiag1[1]]; pSingle = ptsInDiag2[0];
          } else if (ptsInDiag2.length >= 2 && ptsInDiag1.length === 1) {
            activeD1 = d2; activeD2 = d1; pPair = [ptsInDiag2[0], ptsInDiag2[1]]; pSingle = ptsInDiag1[0];
          }

          if (activeD1 && activeD2 && (strategy === 'projection' || iter >= 2)) {
            // Пересечение хорды pPair[0]-pPair[1] с высотой/осью SO
            const hitSO = Geo3D.intersectCoplanarLines(pPair[0].pos, pPair[1].pos, S, O, 2e-2);
            if (hitSO) {
              const Qpos = hitSO.point;
              // Найдём пересечение луча (pSingle -> Qpos) со вторым боковым ребром диагональной плоскости activeD2
              const edgeCand1 = [S, solid.vertices[activeD2.v1], activeD2.v1];
              const edgeCand2 = [S, solid.vertices[activeD2.v2], activeD2.v2];

              let hitEdge = null;
              let targetVertIdx = -1;
              for (const cand of [edgeCand1, edgeCand2]) {
                const res = Geo3D.intersectCoplanarLines(pSingle.pos, Qpos, cand[0], cand[1], 2e-2);
                if (res && res.tb >= -1e-3 && res.tb <= 1 + 1e-3) {
                  const ptCand = Vec3.lerp(cand[0], cand[1], Math.max(0, Math.min(1, res.tb)));
                  if (!Vec3.equals(ptCand, pSingle.pos, 1e-2)) {
                    hitEdge = ptCand;
                    targetVertIdx = cand[2];
                    break;
                  }
                }
              }

              if (hitEdge) {
                const newAux = [];
                newAux.push(auxLines.length);
                auxLines.push({ p1: A, p2: C, style: 'internalDiag', label: 'AC' });
                newAux.push(auxLines.length);
                auxLines.push({ p1: B, p2: D, style: 'internalDiag', label: 'BD' });
                newAux.push(auxLines.length);
                auxLines.push({ p1: S, p2: O, style: 'internalAxis', label: 'SO' });
                newAux.push(auxLines.length);
                auxLines.push({ p1: pPair[0].pos, p2: pPair[1].pos, style: 'internalProj', label: `${pPair[0].label}${pPair[1].label}` });
                newAux.push(auxLines.length);
                auxLines.push({ p1: pSingle.pos, p2: hitEdge, style: 'internalProj', label: '' });

                const qObj = addOrGetPoint(Qpos, 'internal', { label: 'O₁' });
                const newPtRes = addOrGetPoint(hitEdge, 'section');
                const targetEdgeName = `S${solid.vertexNames[targetVertIdx]}`;

                recordStep({
                  title: `Внутреннее проектирование: точка ${newPtRes.point.label} на ребре ${targetEdgeName}`,
                  rule: RULES_REFERENCE.INTERNAL_PROJ,
                  explanation:
                    `Применим метод внутреннего проектирования. Диагонали основания AC и BD пересекаются в точке O, ` +
                    `а диагональные плоскости (SAC) и (SBD) пересекаются по прямой SO. ` +
                    `В плоскости ${activeD1.planeName} прямая ${pPair[0].label}${pPair[1].label} пересекает ось SO в точке ${qObj.point.label}. ` +
                    `Проведём в плоскости ${activeD2.planeName} прямую через ${pSingle.label} и ${qObj.point.label} до пересечения с ребром ${targetEdgeName} в точке ${newPtRes.point.label}.`,
                  highlightFaces: [],
                  newPointLabels: [qObj.point.label, newPtRes.point.label],
                  newAuxIndices: newAux
                });
                actionTaken = true;
                continue;
              }
            }
          }
        }
      }
    }

    // ------------------------------------------------------------------------
    // ПРАВИЛО 5: МЕТОД СЛЕДОВ — продление известной прямой в грани до пересечения с ребром
    // Ищем грань fi, в которой уже есть 2 точки (т.е. известна прямая сечения),
    // и продлеваем её до пересечения с ребром e этой грани, смежным с другой гранью fj!
    // ------------------------------------------------------------------------
    let bestTraceCandidate = null;

    for (let fi = 0; fi < solid.faces.length; fi++) {
      const ptsInFi = getPointsInFacePlane(fi);
      if (ptsInFi.length < 2) continue;

      // Выберем две точки на самой грани (или в её плоскости), задающие прямую сечения в грани fi
      const onFace = ptsInFi.filter(p => p.faces.includes(fi));
      const p1 = onFace.length >= 2 ? onFace[0] : ptsInFi[0];
      const p2 = onFace.length >= 2 ? onFace[1] : ptsInFi[1];

      // Переберём все рёбра грани fi
      const faceEdges = solid.edges.filter(e => e.faces.includes(fi));
      for (const edge of faceEdges) {
        const adjFaceIdx = edge.faces.find(fIdx => fIdx !== fi);
        if (adjFaceIdx === undefined) continue;

        // Если в смежной грани уже построен отрезок сечения и там больше не нужны следы, меньший приоритет
        const adjNeedsSegment = remainingTargets.includes(adjFaceIdx);
        const adjHasPoints = getPointsInFacePlane(adjFaceIdx).length;

        const vA = solid.vertices[edge.v1];
        const vB = solid.vertices[edge.v2];

        const inter = Geo3D.intersectCoplanarLines(p1.pos, p2.pos, vA, vB, 1e-2);
        if (!inter) {
          // Прямая сечения p1-p2 параллельна ребру edge!
          // Значит в смежной грани adjFaceIdx линия сечения тоже параллельна ребру edge!
          if (adjNeedsSegment && adjHasPoints >= 1) {
            const ptsAdj = getPointsOnFace(adjFaceIdx);
            if (ptsAdj.length >= 1) {
              const pStart = ptsAdj[0];
              const edgeDir = Vec3.normalize(Vec3.sub(vB, vA));
              const fakeSecond = { label: '', pos: Vec3.add(pStart.pos, edgeDir), role: 'aux' };
              const note =
                `Прямая ${p1.label}${p2.label} в грани ${solid.faces[fi].name} параллельна общему ребру ${edge.name}. ` +
                `Следовательно, плоскость сечения пересекает смежную грань ${solid.faces[adjFaceIdx].name} по прямой, параллельной ${edge.name}.`;
              if (constructSegmentOnFaceFromLine(adjFaceIdx, pStart, fakeSecond, 'parallelGiven', note)) {
                actionTaken = true;
                break;
              }
            }
          }
          continue;
        }

        const tracePos = inter.point;
        // Проверим, что этой точки ещё нет среди известных точек
        const alreadyKnown = knownPoints.some(kp => Vec3.equals(kp.pos, tracePos, 1e-2));
        if (alreadyKnown) continue;

        // Расстояние от центра фигуры до следа (чтобы выбирать самый близкий и удобный след!)
        const distFromCenter = Vec3.dist(tracePos, solid.center);
        if (distFromCenter > 11.0) continue; // Слишком далёкая точка пересечения

        // Оценим полезность этого следа:
        // Высший приоритет — если в смежной грани adjFaceIdx уже есть хотя бы 1 точка (тогда след сразу даст отрезок на следующем шаге!)
        let score = 100 - distFromCenter * 4;
        if (adjHasPoints >= 1 && adjNeedsSegment) score += 200;
        if (solid.faces[adjFaceIdx].role === 'bottom') score += 35; // Классический след на плоскости основания

        if (!bestTraceCandidate || score > bestTraceCandidate.score) {
          bestTraceCandidate = {
            score,
            fi,
            adjFaceIdx,
            p1,
            p2,
            edge,
            vA,
            vB,
            tracePos
          };
        }
      }
      if (actionTaken) break;
    }

    if (actionTaken) continue;

    if (bestTraceCandidate) {
      const { fi, adjFaceIdx, p1, p2, edge, vA, vB, tracePos } = bestTraceCandidate;
      const face = solid.faces[fi];
      const adjFace = solid.faces[adjFaceIdx];

      const traceRes = addOrGetPoint(tracePos, 'trace', {
        planes: [fi, adjFaceIdx],
        edgeName: `продолжении ${edge.name}`
      });
      const E = traceRes.point;

      // Добавим 2 выносные пунктирные линии: продолжение прямой p1-p2 до E и продолжение ребра edge до E
      const dP1 = Vec3.dist(p1.pos, E.pos);
      const dP2 = Vec3.dist(p2.pos, E.pos);
      const farSecPt = dP1 >= dP2 ? p1 : p2;

      const dVA = Vec3.dist(vA, E.pos);
      const dVB = Vec3.dist(vB, E.pos);
      const nearEdgeVert = dVA <= dVB ? vA : vB;

      const newAuxIndices = [];
      newAuxIndices.push(auxLines.length);
      auxLines.push({
        p1: farSecPt.pos,
        p2: E.pos,
        style: 'traceExtend',
        label: `пр. ${p1.label}${p2.label}`
      });

      newAuxIndices.push(auxLines.length);
      auxLines.push({
        p1: nearEdgeVert,
        p2: E.pos,
        style: 'edgeExtend',
        label: `пр. ${edge.name}`
      });

      recordStep({
        title: `Метод следов: точка пересечения ${E.label} на продолжении ребра ${edge.name}`,
        rule: RULES_REFERENCE.TRACE_EXTEND,
        explanation:
          `Прямая ${p1.label}${p2.label} и ребро ${edge.name} лежат в одной плоскости грани ${face.name} и не параллельны. ` +
          `Продлим прямую ${p1.label}${p2.label} и ребро ${edge.name} до их пересечения в точке ${E.label} (след секущей плоскости). ` +
          `Так как ${E.label} ∈ ${edge.name}, точка ${E.label} принадлежит также плоскости смежной грани ${adjFace.name}.`,
        highlightFaces: [fi, adjFaceIdx],
        newPointLabels: [E.label],
        newAuxIndices
      });

      actionTaken = true;
      continue;
    }

    // ------------------------------------------------------------------------
    // ПРАВИЛО 6: МЕТОД ВСПОМОГАТЕЛЬНОЙ ПЛОСКОСТИ ЧЕРЕЗ ОРТОГОНАЛЬНЫЕ ПРОЕКЦИИ
    // (Когда исходные точки лежат в разных гранях: опускаем проекции на основание,
    //  через две параллельные проектирующие прямые проводим вспомогательную плоскость
    //  и находим след прямой сечения на плоскости основания!)
    // ------------------------------------------------------------------------
    const baseFaceIdx = Math.max(0, solid.faces.findIndex(f => f.role === 'bottom'));
    const baseFace = solid.faces[baseFaceIdx];

    if (baseFace) {
      // Найдём направление бокового проектирования (боковое ребро призмы/куба или нормаль к основанию)
      let vProj = baseFace.normal;
      for (const e of solid.edges) {
        const inBottom1 = baseFace.vertices.includes(e.v1);
        const inBottom2 = baseFace.vertices.includes(e.v2);
        if (inBottom1 !== inBottom2) {
          const botV = inBottom1 ? solid.vertices[e.v1] : solid.vertices[e.v2];
          const topV = inBottom1 ? solid.vertices[e.v2] : solid.vertices[e.v1];
          vProj = Vec3.normalize(Vec3.sub(botV, topV));
          break;
        }
      }

      const secPts = knownPoints.filter(p => p.role === 'given' || p.role === 'section');
      let bestProjPair = null;

      for (let i = 0; i < secPts.length; i++) {
        for (let j = i + 1; j < secPts.length; j++) {
          const pA = secPts[i];
          const pB = secPts[j];

          // Если обе точки уже лежат в одной грани, для них сработает Правило 1/5
          const shareFace = pA.planes.some(fIdx => pB.planes.includes(fIdx));
          if (shareFace) continue;

          const hitProjA = Geo3D.intersectLinePlane(pA.pos, Vec3.add(pA.pos, vProj), baseFace.plane);
          const hitProjB = Geo3D.intersectLinePlane(pB.pos, Vec3.add(pB.pos, vProj), baseFace.plane);
          if (!hitProjA || !hitProjB) continue;

          const projA = hitProjA.point;
          const projB = hitProjB.point;
          if (Vec3.dist(projA, projB) < 0.05) continue;

          // Пересечение прямой pA-pB с её проекцией projA-projB во вспомогательной плоскости
          const interTrace = Geo3D.intersectCoplanarLines(pA.pos, pB.pos, projA, projB, 2e-2);
          if (!interTrace) continue;

          const tracePos = interTrace.point;
          if (Vec3.dist(tracePos, solid.center) > 11.5) continue;
          if (knownPoints.some(kp => Vec3.equals(kp.pos, tracePos, 1e-2))) continue;

          // Предпочтём пару точек, которые обе НЕ лежат в плоскости основания (например M и N в кубе)
          const aInBase = pA.planes.includes(baseFaceIdx);
          const bInBase = pB.planes.includes(baseFaceIdx);
          const score = (!aInBase && !bInBase ? 100 : 50) - Vec3.dist(tracePos, solid.center);

          if (!bestProjPair || score > bestProjPair.score) {
            bestProjPair = { pA, pB, projA, projB, tracePos, score };
          }
        }
      }

      if (bestProjPair) {
        const { pA, pB, projA, projB, tracePos } = bestProjPair;
        const newAux1 = [];
        const newPtLbls1 = [];

        // Определим обозначения проекций projA и projB на плоскости основания
        function resolveProjectionPoint(origPt, projPos) {
          if (Vec3.equals(origPt.pos, projPos, 1e-2)) {
            return { label: origPt.label, pos: projPos, isVertex: false, sameAsOrig: true };
          }
          const info = classifyPointOnSolid(solid, projPos);
          if (info.vertexIndex >= 0) {
            return {
              label: solid.vertexNames[info.vertexIndex],
              pos: projPos,
              isVertex: true,
              sameAsOrig: false
            };
          }
          const projLbl = `${origPt.label}₁`;
          const res = addOrGetPoint(projPos, 'projection', {
            label: projLbl,
            planes: [baseFaceIdx]
          });
          if (res.isNew) newPtLbls1.push(res.point.label);
          return {
            label: res.point.label,
            pos: projPos,
            isVertex: false,
            sameAsOrig: false,
            edgeName: res.point.edgeName
          };
        }

        const prA = resolveProjectionPoint(pA, projA);
        const prB = resolveProjectionPoint(pB, projB);

        // Проведём вертикальные проектирующие прямые
        if (!prA.sameAsOrig) {
          newAux1.push(auxLines.length);
          auxLines.push({
            p1: pA.pos,
            p2: prA.pos,
            style: 'internalAxis',
            label: `${pA.label}${prA.label}`
          });
        }
        if (!prB.sameAsOrig) {
          newAux1.push(auxLines.length);
          auxLines.push({
            p1: pB.pos,
            p2: prB.pos,
            style: 'internalAxis',
            label: `${pB.label}${prB.label}`
          });
        }

        // Прямая проекции на основании
        newAux1.push(auxLines.length);
        auxLines.push({
          p1: prA.pos,
          p2: prB.pos,
          style: 'internalProj',
          label: `${prA.label}${prB.label}`
        });

        // Добавим саму четырёхугольную вспомогательную плоскость (pA, prA, prB, pB)
        const planeName = `(${pA.label}${prA.label}${prB.label}${pB.label})`;
        auxPlanes.push({
          poly3d: [pA.pos, prA.pos, prB.pos, pB.pos],
          name: `Вспом. пл. ${planeName}`
        });

        recordStep({
          title: `Вспомогательная плоскость ${planeName} через проекции точек ${pA.label} и ${pB.label}`,
          rule: RULES_REFERENCE.AUX_PLANE_PROJ,
          explanation:
            `Точки ${pA.label} и ${pB.label} не лежат в одной грани, поэтому построим вспомогательную плоскость. ` +
            `Найдём ортогональные проекции точек ${pA.label} и ${pB.label} на плоскость основания ${baseFace.name}: ` +
            `проекция точки ${pA.label} — это ${prA.label}, а проекция точки ${pB.label} — точка ${prB.label}${prB.edgeName ? ` (на ребре ${prB.edgeName})` : ''}. ` +
            `Через две параллельные проектирующие прямые ${pA.label}${prA.label} ∥ ${pB.label}${prB.label} проведём вспомогательную плоскость β = ${planeName}.`,
          highlightFaces: [baseFaceIdx],
          newPointLabels: newPtLbls1,
          newAuxIndices: newAux1
        });

        // Следующий шаг: пересечение прямой pA-pB и её проекции prA-prB во вспомогательной плоскости -> след E в основании!
        const traceRes = addOrGetPoint(tracePos, 'trace', {
          planes: [baseFaceIdx],
          edgeName: `прямой проекции ${prA.label}${prB.label}`
        });
        const E = traceRes.point;

        const farTop = Vec3.dist(pA.pos, E.pos) >= Vec3.dist(pB.pos, E.pos) ? pA : pB;
        const farBot = Vec3.dist(prA.pos, E.pos) >= Vec3.dist(prB.pos, E.pos) ? prA : prB;

        const newAux2 = [];
        newAux2.push(auxLines.length);
        auxLines.push({
          p1: farTop.pos,
          p2: E.pos,
          style: 'traceExtend',
          label: `пр. ${pA.label}${pB.label}`
        });
        newAux2.push(auxLines.length);
        auxLines.push({
          p1: farBot.pos,
          p2: E.pos,
          style: 'edgeExtend',
          label: `пр. ${prA.label}${prB.label}`
        });

        recordStep({
          title: `Нахождение точки-следа ${E.label} во вспомогательной плоскости ${planeName}`,
          rule: RULES_REFERENCE.TRACE_EXTEND,
          explanation:
            `Во вспомогательной плоскости β = ${planeName} прямая сечения ${pA.label}${pB.label} и её проекция ${prA.label}${prB.label} пересекаются в точке-следе ${E.label}. ` +
            `Так как ${E.label} ∈ ${prA.label}${prB.label}, точка ${E.label} лежит в плоскости основания ${baseFace.name}! ` +
            `Теперь в плоскости основания ${baseFace.name} мы сможем соединить след ${E.label} с известной точкой и получить новую вершину сечения на ребре основания.`,
          highlightFaces: [baseFaceIdx],
          newPointLabels: [E.label],
          newAuxIndices: newAux2
        });

        actionTaken = true;
        continue;
      }
    }

    // ------------------------------------------------------------------------
    // ЗАПАСНОЙ ШАГ: Если следы слишком далеко (почти параллельные прямые),
    // используем аналитическое пересечение плоскости с оставшейся гранью
    // ------------------------------------------------------------------------
    const fallbackFi = remainingTargets[0];
    const fbSeg = exactSection.faceSegments.find(fs => fs.faceIndex === fallbackFi);
    if (fbSeg) {
      const r1 = addOrGetPoint(fbSeg.p1, 'section', { planes: [fallbackFi] });
      const r2 = addOrGetPoint(fbSeg.p2, 'section', { planes: [fallbackFi] });
      completedFaces.add(fallbackFi);
      const segIdx = constructedSegments.length;
      const fName = solid.faces[fallbackFi].name;
      constructedSegments.push({
        faceIndex: fallbackFi,
        faceName: fName,
        p1: r1.point.pos,
        p2: r2.point.pos,
        label1: r1.point.label,
        label2: r2.point.label,
        name: `${r1.point.label}${r2.point.label}`
      });
      const newLbls = [];
      if (r1.isNew) newLbls.push(r1.point.label);
      if (r2.isNew) newLbls.push(r2.point.label);

      recordStep({
        title: `Построение стороны ${r1.point.label}${r2.point.label} в грани ${fName}`,
        rule: RULES_REFERENCE.AXIOM_FACE,
        explanation:
          `Находим пересечение секущей плоскости с гранью ${fName} — отрезок ${r1.point.label}${r2.point.label}.`,
        highlightFaces: [fallbackFi],
        newPointLabels: newLbls,
        newSegmentIndex: segIdx
      });
      actionTaken = true;
    } else {
      break;
    }
  }

  // Сопоставим метки вершин упорядоченному многоугольнику exactSection.points
  const orderedLabels = exactSection.points.map(pt => {
    for (const kp of knownPoints) {
      if (Vec3.equals(kp.pos, pt, 1e-2)) return kp.label;
    }
    const res = addOrGetPoint(pt, 'section');
    return res.point.label;
  });

  const metrics = Geo3D.analyzePolygon(exactSection.points, plane.n);
  const polygonName = orderedLabels.join('');

  const completedPolygon = {
    points: exactSection.points,
    labels: orderedLabels,
    polygonName,
    plane,
    metrics
  };

  // Финальный шаг: Замыкание сечения и анализ многоугольника
  recordStep({
    title: `Сечение построено: ${metrics.shapeName.toLowerCase()} ${polygonName}`,
    rule: RULES_REFERENCE.COMPLETE,
    explanation:
      `Все стороны сечения построены. Искомое сечение — ${metrics.shapeName.toLowerCase()} ${polygonName} ` +
      `(число сторон: ${exactSection.points.length}, периметр P ≈ ${metrics.perimeter.toFixed(2)}, площадь S ≈ ${metrics.area.toFixed(2)}, ` +
      `угол наклона к плоскости основания φ ≈ ${metrics.dihedralAngleDeg.toFixed(1)}°).`,
    highlightFaces: [],
    completedPolygon
  });

  return {
    valid: true,
    solid,
    plane,
    steps,
    completedPolygon
  };
}

// ============================================================================
// Пошаговое построение сечений ТЕЛ ВРАЩЕНИЯ (Цилиндр, Конус, Шар)
// ============================================================================
function buildRevolutionConstruction(solid, revSpec = {}) {
  const revMode = revSpec.revMode || 'parallelAxis'; // 'parallelAxis' | 'axial' | 'parallelBase' | 'inclined'
  const paramD = typeof revSpec.offsetD === 'number' ? revSpec.offsetD : 0.45; // в долях радиуса R (0..0.85)
  const paramH = typeof revSpec.heightRatio === 'number' ? revSpec.heightRatio : 0.55;
  const tiltDeg = typeof revSpec.tiltDeg === 'number' ? revSpec.tiltDeg : 25;

  const R = solid.R;
  const H = solid.H;
  const steps = [];

  if (solid.revType === 'cylinder') {
    const yB = solid.yBottom;
    const yT = solid.yTop;
    const O = { x: 0, y: yB, z: 0 };
    const O1 = { x: 0, y: yT, z: 0 };

    if (revMode === 'parallelAxis' || revMode === 'axial') {
      const d = revMode === 'axial' ? 0 : paramD * R;
      const halfChord = Math.sqrt(Math.max(0.01, R * R - d * d));
      const A = { x: -halfChord, y: yB, z: d };
      const B = { x: halfChord, y: yB, z: d };
      const B1 = { x: halfChord, y: yT, z: d };
      const A1 = { x: -halfChord, y: yT, z: d };
      const Hpt = { x: 0, y: yB, z: d };

      const chordLen = 2 * halfChord;
      const area = chordLen * H;
      const perim = 2 * (chordLen + H);

      const basePoints = [
        { label: 'O', pos: O, role: 'internal' },
        { label: 'O₁', pos: O1, role: 'internal' },
        { label: 'A', pos: A, role: 'given' },
        { label: 'B', pos: B, role: 'given' }
      ];
      if (d > 0.02) basePoints.push({ label: 'H', pos: Hpt, role: 'internal' });

      // Шаг 1
      steps.push({
        stepIndex: 0,
        title: revMode === 'axial' ? 'Шаг 1: Диаметр AB в нижнем основании' : 'Шаг 1: Хорда AB и расстояние OH = d в нижнем основании',
        ruleCategory: 'Дано',
        ruleColor: '#3b82f6',
        ruleFormula: 'Сечение цилиндра плоскостью, параллельной его оси OO₁, пересекает основания по параллельным хордам.',
        explanation: revMode === 'axial'
          ? `Проведём через центр нижнего основания O диаметр AB = 2R = ${(2 * R).toFixed(2)}. Осевое сечение проходит через ось цилиндра OO₁.`
          : `В нижнем основании проведём хорду AB на расстоянии OH = d = ${d.toFixed(2)} от центра O. Из прямоугольного △OHB по теореме Пифагора: AB = 2√(R² − d²) ≈ ${chordLen.toFixed(2)}.`,
        points: basePoints,
        segments: [{ p1: A, p2: B, label1: 'A', label2: 'B', name: 'AB', faceIndex: 0 }],
        auxLines: d > 0.02
          ? [
              { p1: O, p2: O1, style: 'internalAxis', label: 'ось OO₁' },
              { p1: O, p2: Hpt, style: 'internalProj', label: 'd' },
              { p1: O, p2: B, style: 'internalDiag', label: 'R' }
            ]
          : [{ p1: O, p2: O1, style: 'internalAxis', label: 'ось OO₁' }],
        newPointLabels: ['A', 'B'],
        newSegmentIndex: 0,
        newAuxIndices: [0],
        completedPolygon: null
      });

      // Шаг 2
      const pts2 = [...basePoints, { label: 'A₁', pos: A1, role: 'section' }, { label: 'B₁', pos: B1, role: 'section' }];
      steps.push({
        stepIndex: 1,
        title: 'Шаг 2: Проведение образующих AA₁ и BB₁ параллельно оси OO₁',
        ruleCategory: 'Параллельный перенос',
        ruleColor: '#8b5cf6',
        ruleFormula: 'Образующие цилиндра перпендикулярны основаниям и параллельны оси цилиндра OO₁.',
        explanation:
          `Через точки A и B проведём образующие цилиндра AA₁ ∥ OO₁ и BB₁ ∥ OO₁ до пересечения с окружностью верхнего основания в точках A₁ и B₁.`,
        points: pts2,
        segments: [
          { p1: A, p2: B, label1: 'A', label2: 'B', name: 'AB', faceIndex: 0 },
          { p1: B, p2: B1, label1: 'B', label2: 'B₁', name: 'BB₁', faceIndex: 0 },
          { p1: A, p2: A1, label1: 'A', label2: 'A₁', name: 'AA₁', faceIndex: 0 }
        ],
        auxLines: steps[0].auxLines,
        newPointLabels: ['A₁', 'B₁'],
        newSegmentIndex: 1,
        newAuxIndices: [],
        completedPolygon: null
      });

      // Шаг 3
      const polyPts = [A, B, B1, A1];
      const plane = Geo3D.planeFromPoints(A, B, B1);
      const metrics = {
        n: 4,
        pts2d: [
          { x: -halfChord, y: -H / 2 },
          { x: halfChord, y: -H / 2 },
          { x: halfChord, y: H / 2 },
          { x: -halfChord, y: H / 2 }
        ],
        sides: [chordLen, H, chordLen, H],
        angles: [90, 90, 90, 90],
        perimeter: perim,
        area,
        dihedralAngleDeg: 90,
        shapeName: Math.abs(chordLen - H) < 0.05 ? 'Квадрат' : 'Прямоугольник'
      };
      const completedPolygon = {
        points: polyPts,
        labels: ['A', 'B', 'B₁', 'A₁'],
        polygonName: 'ABB₁A₁',
        plane,
        metrics
      };

      steps.push({
        stepIndex: 2,
        title: `Шаг 3: Замыкание хорды A₁B₁ — прямоугольник ABB₁A₁`,
        ruleCategory: 'Итог построения',
        ruleColor: '#059669',
        ruleFormula: 'Сечение цилиндра плоскостью, параллельной оси — прямоугольник со сторонами AB = 2√(R² − d²) и H.',
        explanation:
          `Соединим точки A₁ и B₁ в верхнем основании. Сечение ABB₁A₁ — прямоугольник со сторонами AB ≈ ${chordLen.toFixed(2)} и AA₁ = H = ${H.toFixed(2)}. Площадь сечения S = AB · H ≈ ${area.toFixed(2)}.`,
        points: pts2,
        segments: [
          { p1: A, p2: B, label1: 'A', label2: 'B', name: 'AB', faceIndex: 0 },
          { p1: B, p2: B1, label1: 'B', label2: 'B₁', name: 'BB₁', faceIndex: 0 },
          { p1: B1, p2: A1, label1: 'B₁', label2: 'A₁', name: 'B₁A₁', faceIndex: 0 },
          { p1: A1, p2: A, label1: 'A₁', label2: 'A', name: 'A₁A', faceIndex: 0 }
        ],
        auxLines: steps[0].auxLines,
        newPointLabels: [],
        newSegmentIndex: 2,
        newAuxIndices: [],
        completedPolygon
      });

      return { valid: true, solid, plane, steps, completedPolygon };
    } else {
      // Поперечное или наклонное сечение цилиндра (круг или эллипс)
      const angleRad = revMode === 'parallelBase' ? 0 : (tiltDeg * Math.PI) / 180;
      const yCenter = yB + H * paramH;
      const N = 36;
      const curvePts = [];
      for (let i = 0; i < N; i++) {
        const phi = (2 * Math.PI * i) / N;
        const x = R * Math.cos(phi);
        const z = R * Math.sin(phi);
        const y = Math.max(yB, Math.min(yT, yCenter + x * Math.tan(angleRad)));
        curvePts.push({ x, y, z });
      }
      const aSemi = R / Math.cos(angleRad);
      const bSemi = R;
      const area = Math.PI * aSemi * bSemi;
      const perim = Math.PI * (3 * (aSemi + bSemi) - Math.sqrt((3 * aSemi + bSemi) * (aSemi + 3 * bSemi)));

      const C = { x: 0, y: yCenter, z: 0 };
      const A = { x: -R, y: yCenter - R * Math.tan(angleRad), z: 0 };
      const B = { x: R, y: yCenter + R * Math.tan(angleRad), z: 0 };

      const completedPolygon = {
        points: curvePts,
        isCurve: true,
        labels: [],
        polygonName: revMode === 'parallelBase' ? 'Круг' : 'Эллипс',
        plane: { n: { x: -Math.sin(angleRad), y: Math.cos(angleRad), z: 0 }, d: 0 },
        metrics: {
          n: N,
          pts2d: curvePts.map((_, i) => {
            const phi = (2 * Math.PI * i) / N;
            return { x: aSemi * Math.cos(phi), y: bSemi * Math.sin(phi) };
          }),
          sides: [],
          angles: [],
          perimeter: perim,
          area,
          dihedralAngleDeg: revMode === 'parallelBase' ? 0 : tiltDeg,
          shapeName: revMode === 'parallelBase'
            ? `Круг радиуса R = ${R.toFixed(2)}`
            : `Эллипс (полуоси a ≈ ${aSemi.toFixed(2)}, b = ${bSemi.toFixed(2)})`
        }
      };

      steps.push({
        stepIndex: 0,
        title: revMode === 'parallelBase' ? 'Поперечное сечение цилиндра (параллельно основаниям)' : `Наклонное сечение цилиндра под углом ${tiltDeg}°`,
        ruleCategory: 'Итог построения',
        ruleColor: '#059669',
        ruleFormula: revMode === 'parallelBase'
          ? 'Сечение цилиндра плоскостью, параллельной основаниям — круг радиуса R, равный основанию.'
          : 'Сечение цилиндра плоскостью, наклонной к оси и пересекающей все образующие — эллипс с площадью S = πR² / cos φ.',
        explanation: revMode === 'parallelBase'
          ? `Плоскость перпендикулярна оси OO₁. В сечении получается круг радиуса R = ${R.toFixed(2)} с площадью S = πR² ≈ ${area.toFixed(2)}.`
          : `Плоскость наклонена к основанию под углом φ = ${tiltDeg}°. В сечении — эллипс с малой полуосью b = R = ${R.toFixed(2)} и большой полуосью a = R/cos φ ≈ ${aSemi.toFixed(2)}. Площадь S ≈ ${area.toFixed(2)}.`,
        points: [
          { label: 'O₂', pos: C, role: 'internal' },
          { label: 'A', pos: A, role: 'section' },
          { label: 'B', pos: B, role: 'section' }
        ],
        segments: [],
        auxLines: [
          { p1: O, p2: O1, style: 'internalAxis', label: 'ось OO₁' },
          { p1: A, p2: B, style: 'internalProj', label: '2a' }
        ],
        newPointLabels: ['O₂', 'A', 'B'],
        newSegmentIndex: -1,
        newAuxIndices: [0, 1],
        completedPolygon
      });

      return { valid: true, solid, plane: completedPolygon.plane, steps, completedPolygon };
    }
  }

  if (solid.revType === 'cone') {
    const yB = solid.yBottom;
    const yS = solid.yApex;
    const O = { x: 0, y: yB, z: 0 };
    const S = { x: 0, y: yS, z: 0 };

    if (revMode === 'parallelAxis' || revMode === 'axial') {
      // Сечение конуса через вершину S и хорду основания AB
      const d = revMode === 'axial' ? 0 : paramD * R;
      const halfChord = Math.sqrt(Math.max(0.01, R * R - d * d));
      const A = { x: -halfChord, y: yB, z: d };
      const B = { x: halfChord, y: yB, z: d };
      const Hpt = { x: 0, y: yB, z: d };

      const chordLen = 2 * halfChord;
      const genLen = Math.hypot(R, H);
      const shLen = Math.hypot(H, d);
      const area = 0.5 * chordLen * shLen;

      const plane = Geo3D.planeFromPoints(S, A, B);
      const metrics = Geo3D.analyzePolygon([S, A, B], plane.n);

      const pts1 = [
        { label: 'S', pos: S, role: 'given' },
        { label: 'O', pos: O, role: 'internal' },
        { label: 'A', pos: A, role: 'given' },
        { label: 'B', pos: B, role: 'given' },
        { label: 'H', pos: Hpt, role: 'internal' }
      ];

      steps.push({
        stepIndex: 0,
        title: revMode === 'axial' ? 'Шаг 1: Диаметр AB в основании конуса' : 'Шаг 1: Хорда основания AB и перпендикуляр OH = d',
        ruleCategory: 'Дано',
        ruleColor: '#3b82f6',
        ruleFormula: 'Сечение конуса плоскостью, проходящей через вершину S, пересекает основание по хорде AB.',
        explanation: revMode === 'axial'
          ? `В основании конуса проведём диаметр AB = 2R = ${(2 * R).toFixed(2)}, проходящий через центр O.`
          : `В основании конуса проведём хорду AB на расстоянии OH = d = ${d.toFixed(2)} от центра O. Точка H — середина хорды AB, причём AB = 2√(R² − d²) ≈ ${chordLen.toFixed(2)}.`,
        points: pts1,
        segments: [{ p1: A, p2: B, label1: 'A', label2: 'B', name: 'AB', faceIndex: 0 }],
        auxLines: [
          { p1: S, p2: O, style: 'internalAxis', label: 'SO (высота)' },
          { p1: O, p2: Hpt, style: 'internalProj', label: 'OH' },
          { p1: O, p2: B, style: 'internalDiag', label: 'R' }
        ],
        newPointLabels: ['A', 'B', 'H'],
        newSegmentIndex: 0,
        newAuxIndices: [0, 1],
        completedPolygon: null
      });

      const completedPolygon = {
        points: [S, A, B],
        labels: ['S', 'A', 'B'],
        polygonName: 'SAB',
        plane,
        metrics
      };

      steps.push({
        stepIndex: 1,
        title: 'Шаг 2: Проведение образующих SA и SB — равнобедренный треугольник △SAB',
        ruleCategory: 'Итог построения',
        ruleColor: '#059669',
        ruleFormula: 'Все образующие конуса равны (SA = SB = L), поэтому сечение через вершину S — равнобедренный треугольник △SAB с высотой SH = √(SO² + OH²).',
        explanation:
          `Соединим вершину S с точками A и B по образующим конуса (SA = SB ≈ ${genLen.toFixed(2)}). ` +
          `По теореме о трёх перпендикулярах медиана SH ⊥ AB является высотой сечения: SH = √(H² + d²) ≈ ${shLen.toFixed(2)}. ` +
          `Площадь сечения S(△SAB) = ½ · AB · SH ≈ ${area.toFixed(2)}.`,
        points: pts1,
        segments: [
          { p1: A, p2: B, label1: 'A', label2: 'B', name: 'AB', faceIndex: 0 },
          { p1: S, p2: A, label1: 'S', label2: 'A', name: 'SA', faceIndex: 0 },
          { p1: S, p2: B, label1: 'S', label2: 'B', name: 'SB', faceIndex: 0 }
        ],
        auxLines: [
          ...steps[0].auxLines,
          { p1: S, p2: Hpt, style: 'internalProj', label: 'SH (высота сечения)' }
        ],
        newPointLabels: [],
        newSegmentIndex: 1,
        newAuxIndices: [3],
        completedPolygon
      });

      return { valid: true, solid, plane, steps, completedPolygon };
    } else {
      // Поперечное сечение конуса параллельно основанию (круг радиуса r = R*(1 - paramH))
      const k = 1 - Math.min(0.85, Math.max(0.15, paramH));
      const rSec = R * k;
      const ySec = yS - (yS - yB) * k;
      const O1 = { x: 0, y: ySec, z: 0 };
      const M = { x: rSec, y: ySec, z: 0 };
      const B = { x: R, y: yB, z: 0 };
      const N = 36;
      const curvePts = [];
      for (let i = 0; i < N; i++) {
        const phi = (2 * Math.PI * i) / N;
        curvePts.push({ x: rSec * Math.cos(phi), y: ySec, z: rSec * Math.sin(phi) });
      }
      const area = Math.PI * rSec * rSec;

      const completedPolygon = {
        points: curvePts,
        isCurve: true,
        labels: [],
        polygonName: 'Круг',
        plane: { n: { x: 0, y: 1, z: 0 }, d: -ySec },
        metrics: {
          n: N,
          pts2d: curvePts.map(p => ({ x: p.x, y: p.z })),
          sides: [],
          angles: [],
          perimeter: 2 * Math.PI * rSec,
          area,
          dihedralAngleDeg: 0,
          shapeName: `Круг радиуса r ≈ ${rSec.toFixed(2)} (коэффициент подобия k = ${k.toFixed(2)})`
        }
      };

      steps.push({
        stepIndex: 0,
        title: `Сечение конуса параллельно основанию (k = SO₁ / SO = ${k.toFixed(2)})`,
        ruleCategory: 'Итог построения',
        ruleColor: '#059669',
        ruleFormula: 'Плоскость, параллельная основанию конуса, отсекает подобный конус. Радиус сечения r = R · (SO₁ / SO), а площадь S = S_осн · k².',
        explanation:
          `Из подобия прямоугольных треугольников △SO₁M ~ △SOB с коэффициентом k = SO₁/SO = ${k.toFixed(2)} находим радиус круга в сечении: r = k·R ≈ ${rSec.toFixed(2)}. Площадь сечения S = πr² ≈ ${area.toFixed(2)}.`,
        points: [
          { label: 'S', pos: S, role: 'given' },
          { label: 'O', pos: O, role: 'internal' },
          { label: 'O₁', pos: O1, role: 'internal' },
          { label: 'M', pos: M, role: 'section' },
          { label: 'B', pos: B, role: 'internal' }
        ],
        segments: [],
        auxLines: [
          { p1: S, p2: O, style: 'internalAxis', label: 'SO' },
          { p1: O1, p2: M, style: 'internalProj', label: 'r' },
          { p1: O, p2: B, style: 'internalDiag', label: 'R' }
        ],
        newPointLabels: ['O₁', 'M'],
        newSegmentIndex: -1,
        newAuxIndices: [0, 1],
        completedPolygon
      });

      return { valid: true, solid, plane: completedPolygon.plane, steps, completedPolygon };
    }
  }

  if (solid.revType === 'sphere') {
    const d = revMode === 'axial' ? 0 : paramD * R;
    const rSec = Math.sqrt(Math.max(0.01, R * R - d * d));
    const O = { x: 0, y: 0, z: 0 };
    const O1 = { x: 0, y: d, z: 0 };
    const M = { x: rSec, y: d, z: 0 };
    const N = 36;
    const curvePts = [];
    for (let i = 0; i < N; i++) {
      const phi = (2 * Math.PI * i) / N;
      curvePts.push({ x: rSec * Math.cos(phi), y: d, z: rSec * Math.sin(phi) });
    }
    const area = Math.PI * rSec * rSec;

    const completedPolygon = {
      points: curvePts,
      isCurve: true,
      labels: [],
      polygonName: d < 0.02 ? 'Большой круг' : 'Круг сечения',
      plane: { n: { x: 0, y: 1, z: 0 }, d: -d },
      metrics: {
        n: N,
        pts2d: curvePts.map(p => ({ x: p.x, y: p.z })),
        sides: [],
        angles: [],
        perimeter: 2 * Math.PI * rSec,
        area,
        dihedralAngleDeg: 0,
        shapeName: d < 0.02 ? `Большой круг шара (R = ${R.toFixed(2)})` : `Круг радиуса r ≈ ${rSec.toFixed(2)}`
      }
    };

    steps.push({
      stepIndex: 0,
      title: 'Шаг 1: Перпендикуляр OO₁ = d из центра шара на секущую плоскость',
      ruleCategory: 'Дано',
      ruleColor: '#3b82f6',
      ruleFormula: 'Всякое сечение шара плоскостью есть круг. Основание перпендикуляра OO₁, опущенного из центра шара на плоскость — центр этого круга.',
      explanation:
        `Из центра шара O проведём перпендикуляр OO₁ = d = ${d.toFixed(2)} к секущей плоскости. Отметим точку M на окружности сечения и проведём радиус шара OM = R = ${R.toFixed(2)}.`,
      points: [
        { label: 'O', pos: O, role: 'internal' },
        { label: 'O₁', pos: O1, role: 'internal' },
        { label: 'M', pos: M, role: 'given' }
      ],
      segments: [],
      auxLines: [
        { p1: O, p2: O1, style: 'internalAxis', label: `d = ${d.toFixed(2)}` },
        { p1: O, p2: M, style: 'internalDiag', label: `R = ${R.toFixed(2)}` }
      ],
      newPointLabels: ['O', 'O₁', 'M'],
      newSegmentIndex: -1,
      newAuxIndices: [0, 1],
      completedPolygon: null
    });

    steps.push({
      stepIndex: 1,
      title: `Шаг 2: Нахождение радиуса сечения r = √(R² − d²) ≈ ${rSec.toFixed(2)}`,
      ruleCategory: 'Итог построения',
      ruleColor: '#059669',
      ruleFormula: 'Из прямоугольного треугольника △OO₁M по теореме Пифагора: r = O₁M = √(R² − d²), площадь сечения S = π(R² − d²).',
      explanation:
        `В прямоугольном треугольнике △OO₁M (∠OO₁M = 90°) катет O₁M является радиусом круга в сечении: r = √(R² − d²) ≈ ${rSec.toFixed(2)}. Площадь сечения шара S = πr² ≈ ${area.toFixed(2)}.`,
      points: [
        { label: 'O', pos: O, role: 'internal' },
        { label: 'O₁', pos: O1, role: 'internal' },
        { label: 'M', pos: M, role: 'section' }
      ],
      segments: [],
      auxLines: [
        { p1: O, p2: O1, style: 'internalAxis', label: `d = ${d.toFixed(2)}` },
        { p1: O, p2: M, style: 'internalDiag', label: `R = ${R.toFixed(2)}` },
        { p1: O1, p2: M, style: 'internalProj', label: `r = ${rSec.toFixed(2)}` }
      ],
      newPointLabels: [],
      newSegmentIndex: -1,
      newAuxIndices: [2],
      completedPolygon
    });

    return { valid: true, solid, plane: completedPolygon.plane, steps, completedPolygon };
  }
}

function buildConstruction(solid, spec) {
  if (solid.type === 'revolution') {
    return buildRevolutionConstruction(solid, spec);
  }
  return buildPolyhedronConstruction(solid, spec);
}

window.RULES_REFERENCE = RULES_REFERENCE;
window.resolveInputPoint = resolveInputPoint;
window.classifyPointOnSolid = classifyPointOnSolid;
window.buildConstruction = buildConstruction;
