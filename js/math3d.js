// ============================================================================
// math3d.js — Математическое ядро 3D-стереометрии и аналитической геометрии
// ============================================================================

const EPS = 1e-6;

const Vec3 = {
  create(x = 0, y = 0, z = 0) {
    return { x, y, z };
  },
  clone(v) {
    return { x: v.x, y: v.y, z: v.z };
  },
  add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  },
  sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  },
  scale(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
  },
  addScaled(a, b, s) {
    return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
  },
  lerp(a, b, t) {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t
    };
  },
  dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  },
  cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  },
  lenSq(v) {
    return v.x * v.x + v.y * v.y + v.z * v.z;
  },
  len(v) {
    return Math.hypot(v.x, v.y, v.z);
  },
  dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  },
  normalize(v) {
    const l = Math.hypot(v.x, v.y, v.z);
    if (l < 1e-12) return { x: 0, y: 0, z: 0 };
    return { x: v.x / l, y: v.y / l, z: v.z / l };
  },
  equals(a, b, tol = 1e-4) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < tol;
  },
  isParallel(u, v, tol = 1e-4) {
    const nu = Vec3.normalize(u);
    const nv = Vec3.normalize(v);
    if (Vec3.len(nu) < EPS || Vec3.len(nv) < EPS) return false;
    return Vec3.len(Vec3.cross(nu, nv)) < tol;
  },
  centroid(pts) {
    if (!pts || pts.length === 0) return { x: 0, y: 0, z: 0 };
    let sx = 0, sy = 0, sz = 0;
    for (const p of pts) {
      sx += p.x;
      sy += p.y;
      sz += p.z;
    }
    return { x: sx / pts.length, y: sy / pts.length, z: sz / pts.length };
  }
};

// ============================================================================
// Операции с плоскостями и прямыми в 3D
// Плоскость задаётся нормалью n (единичной) и числом d: n·x + d = 0
// ============================================================================

const Geo3D = {
  planeFromPoints(p1, p2, p3) {
    const u = Vec3.sub(p2, p1);
    const v = Vec3.sub(p3, p1);
    const c = Vec3.cross(u, v);
    const len = Vec3.len(c);
    if (len < 1e-8) return null;
    const n = Vec3.scale(c, 1 / len);
    const d = -Vec3.dot(n, p1);
    return { n, d, origin: Vec3.clone(p1) };
  },

  planeFromPointAndNormal(p, normal) {
    const len = Vec3.len(normal);
    if (len < 1e-8) return null;
    const n = Vec3.scale(normal, 1 / len);
    const d = -Vec3.dot(n, p);
    return { n, d, origin: Vec3.clone(p) };
  },

  planeFromTwoPointsAndDir(p1, p2, dir) {
    const u = Vec3.sub(p2, p1);
    const c = Vec3.cross(u, dir);
    const len = Vec3.len(c);
    if (len < 1e-8) return null;
    const n = Vec3.scale(c, 1 / len);
    const d = -Vec3.dot(n, p1);
    return { n, d, origin: Vec3.clone(p1) };
  },

  signedDistToPlane(plane, p) {
    return Vec3.dot(plane.n, p) + plane.d;
  },

  isPointInPlane(plane, p, tol = 1e-3) {
    return Math.abs(Geo3D.signedDistToPlane(plane, p)) <= tol;
  },

  // Пересечение прямой (p1 -> p2) с плоскостью
  // Возвращает { point, t } где point = p1 + t*(p2 - p1), или null если параллельна
  intersectLinePlane(p1, p2, plane) {
    const dir = Vec3.sub(p2, p1);
    const denom = Vec3.dot(plane.n, dir);
    if (Math.abs(denom) < 1e-7) return null;
    const t = -(Vec3.dot(plane.n, p1) + plane.d) / denom;
    return {
      point: Vec3.lerp(p1, p2, t),
      t
    };
  },

  // Пересечение отрезка [p1, p2] с плоскостью
  intersectSegmentPlane(p1, p2, plane, tol = 1e-5) {
    const d1 = Geo3D.signedDistToPlane(plane, p1);
    const d2 = Geo3D.signedDistToPlane(plane, p2);
    if (Math.abs(d1) <= tol && Math.abs(d2) <= tol) {
      return null; // Отрезок целиком лежит в плоскости
    }
    if (Math.abs(d1) <= tol) {
      return { point: Vec3.clone(p1), t: 0 };
    }
    if (Math.abs(d2) <= tol) {
      return { point: Vec3.clone(p2), t: 1 };
    }
    if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0)) {
      return null;
    }
    const t = d1 / (d1 - d2);
    return {
      point: Vec3.lerp(p1, p2, t),
      t
    };
  },

  // Пересечение двух прямых (a1, a2) и (b1, b2) в 3D (если они лежат в одной плоскости)
  // Возвращает { point, ta, tb, skewDist } или null если параллельны
  intersectCoplanarLines(a1, a2, b1, b2, coplanarTol = 1e-2) {
    const u = Vec3.sub(a2, a1);
    const v = Vec3.sub(b2, b1);
    const w = Vec3.sub(a1, b1);
    const a = Vec3.dot(u, u);
    const b = Vec3.dot(u, v);
    const c = Vec3.dot(v, v);
    const d = Vec3.dot(u, w);
    const e = Vec3.dot(v, w);
    const D = a * c - b * b;

    if (D < 1e-8 * a * c) {
      return null; // Параллельные прямые
    }

    const ta = (b * e - c * d) / D;
    const tb = (a * e - b * d) / D;

    const pa = Vec3.addScaled(a1, u, ta);
    const pb = Vec3.addScaled(b1, v, tb);
    const skewDist = Vec3.dist(pa, pb);

    if (skewDist > coplanarTol) {
      return null; // Скрещивающиеся прямые!
    }

    return {
      point: Vec3.lerp(pa, pb, 0.5),
      ta,
      tb,
      skewDist
    };
  },

  // Проверка: лежит ли точка P на отрезке [A, B]
  isPointOnSegment(p, a, b, tol = 1e-3) {
    const ab = Vec3.dist(a, b);
    if (ab < 1e-8) return Vec3.dist(p, a) < tol;
    const ap = Vec3.dist(a, p);
    const pb = Vec3.dist(p, b);
    return Math.abs(ap + pb - ab) <= tol;
  },

  // Проверка: лежит ли точка P на прямой (A, B)
  isPointOnLine(p, a, b, tol = 1e-3) {
    const ab = Vec3.sub(b, a);
    const len = Vec3.len(ab);
    if (len < 1e-8) return Vec3.dist(p, a) < tol;
    const ap = Vec3.sub(p, a);
    const dist = Vec3.len(Vec3.cross(ab, ap)) / len;
    return dist <= tol;
  },

  // Проверка: лежит ли точка P внутри выпуклого многоугольника грани faceVertices
  isPointInConvexPolygon3D(p, faceVertices, faceNormal, tol = 1e-3) {
    // Сначала проверим принадлежность плоскости грани
    const dPlane = Math.abs(Vec3.dot(Vec3.sub(p, faceVertices[0]), faceNormal));
    if (dPlane > tol * 2) return false;

    const n = faceVertices.length;
    for (let i = 0; i < n; i++) {
      const a = faceVertices[i];
      const b = faceVertices[(i + 1) % n];
      const edge = Vec3.sub(b, a);
      const toP = Vec3.sub(p, a);
      const cross = Vec3.cross(edge, toP);
      const sign = Vec3.dot(cross, faceNormal);
      if (sign < -tol) return false;
    }
    return true;
  },

  // Пересечение прямой (p1, p2), лежащей в плоскости грани, с контуром выпуклой грани
  // Возвращает массив точек пересечения (от 0 до 2 точек) на рёбрах грани
  intersectLineWithFacePolygon(l1, l2, face, vertices, tol = 1e-4) {
    const hits = [];
    const fv = face.vertices;
    const n = fv.length;
    for (let i = 0; i < n; i++) {
      const vAIdx = fv[i];
      const vBIdx = fv[(i + 1) % n];
      const A = vertices[vAIdx];
      const B = vertices[vBIdx];

      const res = Geo3D.intersectCoplanarLines(l1, l2, A, B, 1e-2);
      if (!res) continue;

      if (res.tb >= -tol && res.tb <= 1 + tol) {
        const clampedTb = Math.max(0, Math.min(1, res.tb));
        const pt = Vec3.lerp(A, B, clampedTb);
        // Проверим дубликаты (если попали в вершину)
        let dup = false;
        for (const h of hits) {
          if (Vec3.equals(h.point, pt, 1e-3)) {
            dup = true;
            break;
          }
        }
        if (!dup) {
          hits.push({
            point: pt,
            edgeVertices: [vAIdx, vBIdx],
            tEdge: clampedTb,
            tLine: res.ta
          });
        }
      }
    }
    hits.sort((a, b) => a.tLine - b.tLine);
    return hits;
  },

  // Полное аналитическое сечение выпуклого многогранника плоскостью plane
  // Возвращает упорядоченный многоугольник сечения (массив 3D-точек и рёбер)
  computePolyhedronSection(solid, plane) {
    if (!plane || !solid || !solid.faces) return null;

    const rawPoints = [];
    const faceSegments = [];

    for (let fi = 0; fi < solid.faces.length; fi++) {
      const face = solid.faces[fi];
      const fv = face.vertices;
      const facePts = [];

      for (let i = 0; i < fv.length; i++) {
        const i1 = fv[i];
        const i2 = fv[(i + 1) % fv.length];
        const p1 = solid.vertices[i1];
        const p2 = solid.vertices[i2];
        const hit = Geo3D.intersectSegmentPlane(p1, p2, plane, 1e-4);
        if (hit) {
          let exists = false;
          for (const fp of facePts) {
            if (Vec3.equals(fp.point, hit.point, 1e-3)) {
              exists = true;
              break;
            }
          }
          if (!exists) {
            facePts.push({
              point: hit.point,
              edge: [i1, i2],
              t: hit.t
            });
          }
        }
      }

      if (facePts.length >= 2) {
        faceSegments.push({
          faceIndex: fi,
          faceName: face.name,
          p1: facePts[0].point,
          p2: facePts[1].point,
          e1: facePts[0].edge,
          e2: facePts[1].edge
        });
        for (const fp of facePts) {
          let exists = false;
          for (const rp of rawPoints) {
            if (Vec3.equals(rp.point, fp.point, 1e-3)) {
              exists = true;
              break;
            }
          }
          if (!exists) {
            rawPoints.push(fp);
          }
        }
      }
    }

    if (rawPoints.length < 3) return null;

    // Упорядочим точки по углу вокруг центроида в плоскости сечения
    const center = Vec3.centroid(rawPoints.map(r => r.point));
    const basis = Geo3D.buildPlaneBasis(plane.n);

    const ordered = rawPoints.map(r => {
      const rel = Vec3.sub(r.point, center);
      const x = Vec3.dot(rel, basis.u);
      const y = Vec3.dot(rel, basis.v);
      return {
        ...r,
        x2d: x,
        y2d: y,
        angle: Math.atan2(y, x)
      };
    });

    ordered.sort((a, b) => a.angle - b.angle);

    return {
      points: ordered.map(o => o.point),
      orderedMeta: ordered,
      faceSegments,
      center,
      basis,
      plane
    };
  },

  // Ортонормированный базис (u, v) в плоскости с нормалью n
  buildPlaneBasis(normal) {
    const n = Vec3.normalize(normal);
    // Выберем вспомогательный вектор, не коллинеарный n
    let ref = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const u = Vec3.normalize(Vec3.cross(ref, n));
    const v = Vec3.normalize(Vec3.cross(n, u));
    return { u, v, n };
  },

  // Анализ плоского многоугольника сечения (длины сторон, углы, площадь, периметр, тип)
  analyzePolygon(points3d, planeNormal) {
    const n = points3d ? points3d.length : 0;
    if (n < 3) return null;

    const center = Vec3.centroid(points3d);
    const basis = Geo3D.buildPlaneBasis(planeNormal);
    const pts2d = points3d.map(p => {
      const rel = Vec3.sub(p, center);
      return {
        x: Vec3.dot(rel, basis.u),
        y: Vec3.dot(rel, basis.v)
      };
    });

    const sides = [];
    let perimeter = 0;
    for (let i = 0; i < n; i++) {
      const len = Vec3.dist(points3d[i], points3d[(i + 1) % n]);
      sides.push(len);
      perimeter += len;
    }

    // Углы в вершинах (в градусах)
    const angles = [];
    for (let i = 0; i < n; i++) {
      const prev = points3d[(i - 1 + n) % n];
      const curr = points3d[i];
      const next = points3d[(i + 1) % n];
      const u = Vec3.normalize(Vec3.sub(prev, curr));
      const v = Vec3.normalize(Vec3.sub(next, curr));
      const cosA = Math.max(-1, Math.min(1, Vec3.dot(u, v)));
      angles.push((Math.acos(cosA) * 180) / Math.PI);
    }

    // Площадь по формуле Гаусса в 2D-базисе
    let area2 = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area2 += pts2d[i].x * pts2d[j].y - pts2d[j].x * pts2d[i].y;
    }
    const area = Math.abs(area2) * 0.5;

    // Угол наклона к плоскости основания (нормаль основания = (0, 1, 0))
    const cosDihedral = Math.min(1, Math.abs(planeNormal.y));
    const dihedralAngleDeg = (Math.acos(cosDihedral) * 180) / Math.PI;

    const shapeName = Geo3D.classifyPolygonShape(points3d, sides, angles);

    return {
      n,
      pts2d,
      sides,
      angles,
      perimeter,
      area,
      dihedralAngleDeg,
      shapeName
    };
  },

  classifyPolygonShape(points3d, sides, angles) {
    const n = points3d.length;
    const eqTol = 0.02;
    const angTol = 1.2;

    const allSidesEqual = sides.every(s => Math.abs(s - sides[0]) < eqTol);
    const allAnglesEqual = angles.every(a => Math.abs(a - angles[0]) < angTol);

    if (n === 3) {
      const hasRightAngle = angles.some(a => Math.abs(a - 90) < angTol);
      if (allSidesEqual) return 'Равносторонний (правильный) треугольник';
      const isIso =
        Math.abs(sides[0] - sides[1]) < eqTol ||
        Math.abs(sides[1] - sides[2]) < eqTol ||
        Math.abs(sides[2] - sides[0]) < eqTol;
      if (hasRightAngle && isIso) return 'Прямоугольный равнобедренный треугольник';
      if (hasRightAngle) return 'Прямоугольный треугольник';
      if (isIso) return 'Равнобедренный треугольник';
      return 'Разносторонний треугольник';
    }

    if (n === 4) {
      const v0 = Vec3.sub(points3d[1], points3d[0]);
      const v1 = Vec3.sub(points3d[2], points3d[1]);
      const v2 = Vec3.sub(points3d[3], points3d[2]);
      const v3 = Vec3.sub(points3d[0], points3d[3]);

      const p02 = Vec3.isParallel(v0, v2, 0.03);
      const p13 = Vec3.isParallel(v1, v3, 0.03);

      if (p02 && p13) {
        if (allSidesEqual && allAnglesEqual) return 'Квадрат';
        if (allAnglesEqual) return 'Прямоугольник';
        if (allSidesEqual) return 'Ромб';
        return 'Параллелограмм';
      }
      if (p02 || p13) {
        // Трапеция! Проверим боковые стороны
        const legDiff = p02
          ? Math.abs(sides[1] - sides[3])
          : Math.abs(sides[0] - sides[2]);
        const hasRight = angles.some(a => Math.abs(a - 90) < angTol);
        if (legDiff < eqTol) return 'Равнобедренная трапеция';
        if (hasRight) return 'Прямоугольная трапеция';
        return 'Трапеция';
      }
      return 'Произвольный четырёхугольник';
    }

    if (n === 5) {
      if (allSidesEqual && allAnglesEqual) return 'Правильный пятиугольник';
      return 'Пятиугольник';
    }

    if (n === 6) {
      if (allSidesEqual && allAnglesEqual) return 'Правильный шестиугольник';
      return 'Шестиугольник';
    }

    return `${n}-угольник`;
  },

  // Красивое форматирование отношения t in (0, 1) в виде дроби p:q
  formatRatio(t) {
    if (t <= 0.01) return 'вершина (0:1)';
    if (t >= 0.99) return 'вершина (1:0)';
    const ratios = [
      { p: 1, q: 1, val: 0.5, text: '1 : 1 (середина)' },
      { p: 1, q: 2, val: 1 / 3, text: '1 : 2' },
      { p: 2, q: 1, val: 2 / 3, text: '2 : 1' },
      { p: 1, q: 3, val: 0.25, text: '1 : 3' },
      { p: 3, q: 1, val: 0.75, text: '3 : 1' },
      { p: 2, q: 3, val: 0.4, text: '2 : 3' },
      { p: 3, q: 2, val: 0.6, text: '3 : 2' },
      { p: 1, q: 4, val: 0.2, text: '1 : 4' },
      { p: 4, q: 1, val: 0.8, text: '4 : 1' }
    ];
    for (const r of ratios) {
      if (Math.abs(t - r.val) < 0.018) return r.text;
    }
    const pct = Math.round(t * 100);
    return `${pct} : ${100 - pct}`;
  }
};

window.Vec3 = Vec3;
window.Geo3D = Geo3D;
