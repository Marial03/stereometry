// ============================================================================
// renderer3d.js — 3D и 2D графический движок стереометрии на HTML5 Canvas
// Реализует:
// - Автоматический расчёт видимых (сплошных) и невидимых (пунктирных) линий
// - Визуальное расширение (продление) плоскостей граней с сеткой в плоскости грани
// - Захват точек, вершин, рёбер, построенных прямых и граней мышью
// - 2D-вид натуральной величины сечения И 2D-вынос отдельной грани со следами
// - Маркер/указку учителя поверх чертежа
// ============================================================================

class StereometryRenderer3D {
  constructor(canvas3d, canvas2d) {
    this.canvas = canvas3d;
    this.ctx = canvas3d.getContext('2d');
    this.canvas2d = canvas2d;
    this.ctx2d = canvas2d ? canvas2d.getContext('2d') : null;

    // Параметры 3D-камеры
    this.camera = {
      yaw: -0.62,
      pitch: 0.38,
      zoom: 1.0,
      panX: 0,
      panY: 0,
      isOrtho: true,
      locked: false
    };

    // Настройки визуального стиля
    this.style = {
      theme: 'light',
      figureMode: 'shaded',
      sectionFill: 'both',
      sectionColor: '#e11d48',
      showHiddenDashed: true,
      showAuxLines: true,
      showAuxPlanes: true,    // Показывать или скрывать вспомогательные проектирующие плоскости
      showRatioLabels: false, // По умолчанию скрываем доли/координаты (1:1), чтобы не загромождать чертёж
      showNotebookGrid: true
    };

    // Режим 2D-панели справа: 'section' (натуральная величина сечения) | 'face' (вынос грани со следами)
    this.view2DMode = 'section';
    this.selected2DFaceIndex = 0;

    // Расширенные (продлённые) плоскости граней: массив индексов граней
    this.extendedFaces = new Set();

    // Данные текущей сцены
    this.sceneData = null;
    this.hoveredItem = null;
    this.hoveredFaceIndex = -1;
    this.selectedToolPoint = null;
    this.selectedRefLine = null;
    this.previewMousePos = null;

    // Штрихи маркера учителя поверх холста
    this.markerStrokes = []; // [{ color, points: [{x,y}, ...] }]
    this.currentMarkerStroke = null;

    this._projCache = {
      vertices: [],
      points: [],
      edges: [],
      lines: [], // Все доступные прямые/отрезки для выбора (пересечение, параллельность, ластик)
      faces: []
    };

    this._setupResize();
  }

  _setupResize() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas && this.canvas.parentElement) {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      const w = Math.max(300, rect.width);
      const h = Math.max(260, rect.height);
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
      this.width = w;
      this.height = h;
      this.dpr = dpr;
    }

    if (this.canvas2d && this.canvas2d.parentElement) {
      const rect2 = this.canvas2d.parentElement.getBoundingClientRect();
      const w2 = Math.max(200, rect2.width);
      const h2 = Math.max(195, rect2.height);
      this.canvas2d.width = Math.round(w2 * dpr);
      this.canvas2d.height = Math.round(h2 * dpr);
      this.canvas2d.style.width = `${w2}px`;
      this.canvas2d.style.height = `${h2}px`;
      this.width2d = w2;
      this.height2d = h2;
    }

    this.render();
  }

  setCameraPreset(presetName) {
    this.camera.panX = 0;
    this.camera.panY = 0;
    switch (presetName) {
      case 'isometric':
        this.camera.yaw = -0.62;
        this.camera.pitch = 0.38;
        this.camera.zoom = 1.0;
        break;
      case 'front':
        this.camera.yaw = 0.0;
        this.camera.pitch = 0.08;
        this.camera.zoom = 1.0;
        break;
      case 'top':
        this.camera.yaw = 0.0;
        this.camera.pitch = 1.48;
        this.camera.zoom = 1.0;
        break;
      case 'side':
        this.camera.yaw = -Math.PI / 2;
        this.camera.pitch = 0.08;
        this.camera.zoom = 1.0;
        break;
      case 'fitAll':
        this.fitAllPoints();
        break;
    }
    this.render();
  }

  fitAllPoints() {
    if (!this.sceneData || !this.sceneData.solid) return;
    const pts = [];
    if (this.sceneData.solid.vertices) pts.push(...this.sceneData.solid.vertices);
    if (this.sceneData.step && this.sceneData.step.points) {
      for (const p of this.sceneData.step.points) pts.push(p.pos);
    }
    if (this.sceneData.trainerData && this.sceneData.trainerData.userPoints) {
      for (const p of this.sceneData.trainerData.userPoints) pts.push(p.pos);
    }
    if (pts.length === 0) return;

    let maxRadius = 2.2;
    for (const p of pts) {
      const r = Vec3.len(p);
      if (r > maxRadius) maxRadius = r;
    }
    this.camera.zoom = Math.max(0.3, Math.min(1.3, 2.55 / maxRadius));
    this.camera.panX = 0;
    this.camera.panY = 0;
    this.render();
  }

  getCameraBasis() {
    const cy = Math.cos(this.camera.yaw);
    const sy = Math.sin(this.camera.yaw);
    const cp = Math.cos(this.camera.pitch);
    const sp = Math.sin(this.camera.pitch);

    const viewDir = {
      x: sy * cp,
      y: sp,
      z: cy * cp
    };
    const right = {
      x: cy,
      y: 0,
      z: -sy
    };
    const up = Vec3.cross(viewDir, right);

    return { right, up, viewDir };
  }

  project(pt3d) {
    const { right, up, viewDir } = this.getCameraBasis();
    const xCam = Vec3.dot(pt3d, right);
    const yCam = Vec3.dot(pt3d, up);
    const zCam = Vec3.dot(pt3d, viewDir);

    const baseScale = Math.min(this.width, this.height) * 0.165 * this.camera.zoom;
    let factor = baseScale;

    if (!this.camera.isOrtho) {
      const camDist = 9.5;
      const denom = Math.max(1.5, camDist - zCam);
      factor = (baseScale * camDist) / denom;
    }

    const cx = this.width * 0.5 + this.camera.panX;
    const cy = this.height * 0.52 + this.camera.panY;

    return {
      x: cx + xCam * factor,
      y: cy - yCam * factor,
      z: zCam,
      scale: factor
    };
  }

  computeFaceVisibility(solid) {
    if (!solid || !solid.faces) return [];
    const { viewDir } = this.getCameraBasis();
    const camPos = Vec3.scale(viewDir, 9.5);

    return solid.faces.map(face => {
      if (this.camera.isOrtho) {
        return Vec3.dot(face.normal, viewDir) > 1e-4;
      } else {
        const toCam = Vec3.normalize(Vec3.sub(camPos, face.center));
        return Vec3.dot(face.normal, toCam) > 1e-4;
      }
    });
  }

  getPalette() {
    if (this.style.theme === 'dark') {
      return {
        bg: '#0f172a',
        grid: 'rgba(148, 163, 184, 0.08)',
        edgeVisible: '#e2e8f0',
        edgeHidden: '#64748b',
        faceFrontFill: 'rgba(56, 189, 248, 0.09)',
        faceBackFill: 'rgba(30, 41, 59, 0.35)',
        faceSolidFill: '#1e293b',
        faceHighlight: 'rgba(250, 204, 21, 0.25)',
        faceHoverFill: 'rgba(139, 92, 246, 0.28)',
        extendedPlaneFill: 'rgba(56, 189, 248, 0.08)',
        extendedPlaneBorder: 'rgba(56, 189, 248, 0.45)',
        vertexDot: '#94a3b8',
        vertexLabel: '#f8fafc',
        traceLine: '#fbbf24',
        edgeExtend: '#94a3b8',
        internalLine: '#c084fc',
        givenPoint: '#38bdf8',
        sectionPoint: '#fb7185',
        tracePoint: '#fbbf24',
        textBg: 'rgba(15, 23, 42, 0.85)',
        textPrimary: '#f8fafc',
        textMuted: '#94a3b8'
      };
    }
    return {
      bg: '#ffffff',
      grid: 'rgba(59, 130, 246, 0.095)',
      edgeVisible: '#1e293b',
      edgeHidden: '#64748b',
      faceFrontFill: 'rgba(59, 130, 246, 0.075)',
      faceBackFill: 'rgba(226, 232, 240, 0.32)',
      faceSolidFill: '#f1f5f9',
      faceHighlight: 'rgba(245, 158, 11, 0.22)',
      faceHoverFill: 'rgba(139, 92, 246, 0.22)',
      extendedPlaneFill: 'rgba(37, 99, 235, 0.065)',
      extendedPlaneBorder: 'rgba(37, 99, 235, 0.4)',
      vertexDot: '#475569',
      vertexLabel: '#0f172a',
      traceLine: '#d97706',
      edgeExtend: '#64748b',
      internalLine: '#7c3aed',
      givenPoint: '#2563eb',
      sectionPoint: '#e11d48',
      tracePoint: '#d97706',
      textBg: 'rgba(255, 255, 255, 0.9)',
      textPrimary: '#0f172a',
      textMuted: '#475569'
    };
  }

  setScene(sceneData) {
    this.sceneData = sceneData;
    this.render();
  }

  render() {
    if (!this.ctx || !this.width) return;
    const ctx = this.ctx;
    const dpr = this.dpr || 1;
    const pal = this.getPalette();

    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, this.width, this.height);

    if (this.style.showNotebookGrid) {
      this._drawNotebookGrid(ctx, pal);
    }

    if (this.sceneData && this.sceneData.solid) {
      const { solid, step, trainerData } = this.sceneData;
      if (solid.type === 'revolution') {
        this._renderRevolutionSolid(ctx, solid, step, pal);
      } else {
        this._renderPolyhedronScene(ctx, solid, step, trainerData, pal);
      }
    }

    // Отрисовка пометок маркера учителя поверх 3D-сцены
    this._renderMarkerStrokes(ctx);

    if (this.camera.locked) {
      this._drawLockedBadge(ctx, pal);
    }

    ctx.restore();

    if (this.view2DMode === 'face') {
      this.render2DFace(this.selected2DFaceIndex);
    } else {
      this.render2DSection();
    }
  }

  _drawNotebookGrid(ctx, pal) {
    const step = 24;
    ctx.save();
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = step; x < this.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
    }
    for (let y = step; y < this.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawLockedBadge(ctx) {
    ctx.save();
    const text = '🔒 Фигура закреплена (режим тетради)';
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    const tw = ctx.measureText(text).width;
    const x = 14, y = 48;
    ctx.fillStyle = this.style.theme === 'dark' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(254, 243, 199, 0.95)';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.2;
    this._roundRect(ctx, x, y, tw + 20, 26, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = this.style.theme === 'dark' ? '#fbbf24' : '#b45309';
    ctx.fillText(text, x + 10, y + 17);
    ctx.restore();
  }

  // Отрисовка визуально расширенной (продлённой) плоскости грани
  _drawExtendedFacePlane(ctx, solid, fi, allPoints, pal) {
    const face = solid.faces[fi];
    if (!face) return;

    const fCenter = face.center;
    const fvPts = face.vertices.map(vi => solid.vertices[vi]);

    // Вычислим необходимый коэффициент расширения плоскости грани, чтобы захватить все следы в этой плоскости
    let scaleFactor = 2.35;
    let maxVertDist = 0.5;
    for (const vp of fvPts) {
      const d = Vec3.dist(vp, fCenter);
      if (d > maxVertDist) maxVertDist = d;
    }
    for (const pt of allPoints) {
      if (pt.planes && pt.planes.includes(fi)) {
        const d = Vec3.dist(pt.pos, fCenter);
        const needed = (d / maxVertDist) * 1.28;
        if (needed > scaleFactor && needed < 5.5) {
          scaleFactor = needed;
        }
      }
    }

    // Расширенный многоугольник плоскости грани
    const extPts3d = fvPts.map(vp =>
      Vec3.add(fCenter, Vec3.scale(Vec3.sub(vp, fCenter), scaleFactor))
    );
    const extProj = extPts3d.map(p => this.project(p));

    ctx.save();
    ctx.fillStyle = pal.extendedPlaneFill;
    ctx.strokeStyle = pal.extendedPlaneBorder;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);

    ctx.beginPath();
    ctx.moveTo(extProj[0].x, extProj[0].y);
    for (let i = 1; i < extProj.length; i++) {
      ctx.lineTo(extProj[i].x, extProj[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Нарисуем также пунктирные продолжения всех рёбер этой грани вдоль расширенной плоскости
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.3;
    for (let i = 0; i < fvPts.length; i++) {
      const A = fvPts[i];
      const B = fvPts[(i + 1) % fvPts.length];
      const dir = Vec3.normalize(Vec3.sub(B, A));
      const extLen = maxVertDist * (scaleFactor - 0.8);
      const pStart = this.project(Vec3.addScaled(A, dir, -extLen));
      const pEnd = this.project(Vec3.addScaled(B, dir, extLen));
      ctx.beginPath();
      ctx.moveTo(pStart.x, pStart.y);
      ctx.lineTo(pEnd.x, pEnd.y);
      ctx.stroke();
    }

    // Подпись расширенной плоскости в углу
    const corner = extProj[0];
    ctx.setLineDash([]);
    ctx.font = '700 11.5px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = pal.givenPoint;
    ctx.fillText(`Плоскость грани ${face.name}`, corner.x + 8, corner.y - 6);
    ctx.restore();
  }

  _renderPolyhedronScene(ctx, solid, step, trainerData, pal) {
    const faceVisible = this.computeFaceVisibility(solid);
    const projVerts = solid.vertices.map(v => this.project(v));
    this._projCache.vertices = projVerts;
    this._projCache.lines = [];
    this._projCache.faces = [];

    // Сохраним экранные полигоны граней для захвата мышью (hitTestFace)
    solid.faces.forEach((face, fi) => {
      this._projCache.faces.push({
        faceIndex: fi,
        name: face.name,
        isVisible: faceVisible[fi],
        poly2d: face.vertices.map(vi => projVerts[vi])
      });
    });

    const allPts = [];
    if (step && step.points) allPts.push(...step.points);
    if (trainerData && trainerData.userPoints) {
      for (const up of trainerData.userPoints) {
        if (!allPts.some(p => Vec3.equals(p.pos, up.pos, 1e-3))) {
          allPts.push(up);
        }
      }
    }

    // 0. Отрисовка расширенных (продлённых) плоскостей граней
    for (const fi of this.extendedFaces) {
      if (fi >= 0 && fi < solid.faces.length) {
        this._drawExtendedFacePlane(ctx, solid, fi, allPts, pal);
      }
    }

    const highlightFaces = (step && step.highlightFaces) || [];

    // 1. Заливка задних (невидимых) граней
    if (this.style.figureMode === 'shaded') {
      solid.faces.forEach((face, fi) => {
        if (!faceVisible[fi]) {
          let fill = pal.faceBackFill;
          if (this.hoveredFaceIndex === fi) fill = pal.faceHoverFill;
          else if (highlightFaces.includes(fi)) fill = pal.faceHighlight;
          this._fillFacePolygon(ctx, face, projVerts, fill);
        }
      });
    } else if (this.style.figureMode === 'solid') {
      solid.faces.forEach((face, fi) => {
        if (faceVisible[fi]) {
          let fill = pal.faceSolidFill;
          if (this.hoveredFaceIndex === fi) fill = pal.faceHoverFill;
          else if (highlightFaces.includes(fi)) fill = pal.faceHighlight;
          this._fillFacePolygon(ctx, face, projVerts, fill);
        }
      });
    }

    // 2. Невидимые (задние) рёбра многогранника — ПУНКТИРОМ
    this._projCache.edges = [];
    solid.edges.forEach((edge, ei) => {
      const isVisible = edge.faces.some(fi => faceVisible[fi]);
      const p1 = projVerts[edge.v1];
      const p2 = projVerts[edge.v2];
      this._projCache.edges.push({ edgeIndex: ei, p1, p2, isVisible });

      // Также регистрируем ребро в списке прямых для выбора (пересечение / параллельность)
      this._projCache.lines.push({
        id: `edge_${ei}`,
        sourceType: 'edge',
        edgeIndex: ei,
        name: `ребро ${edge.name}`,
        p1_3d: solid.vertices[edge.v1],
        p2_3d: solid.vertices[edge.v2],
        planes: [...edge.faces],
        p1,
        p2
      });

      if (!isVisible && this.style.showHiddenDashed) {
        const isHovered =
          (this.hoveredItem && this.hoveredItem.type === 'edge' && this.hoveredItem.index === ei) ||
          (this.hoveredItem && this.hoveredItem.type === 'line' && this.hoveredItem.id === `edge_${ei}`);
        const isRef = this.selectedRefLine && this.selectedRefLine.id === `edge_${ei}`;

        ctx.save();
        ctx.strokeStyle = isRef ? '#8b5cf6' : isHovered ? '#3b82f6' : pal.edgeHidden;
        ctx.lineWidth = isRef || isHovered ? 3.0 : 1.75;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
      }
    });

    // 3. Заливка и штриховка готового многоугольника сечения
    const activePolygon =
      (step && step.completedPolygon) || (trainerData && trainerData.completedPolygon);
    if (
      activePolygon &&
      activePolygon.points &&
      activePolygon.points.length >= 3 &&
      this.style.sectionFill !== 'none'
    ) {
      const secProj = activePolygon.points.map(pt => this.project(pt));
      this._drawSectionPolygonFill(ctx, secProj);
    }

    // 4. Заливка передних граней
    if (this.style.figureMode === 'shaded') {
      solid.faces.forEach((face, fi) => {
        if (faceVisible[fi]) {
          let fill = pal.faceFrontFill;
          if (this.hoveredFaceIndex === fi) fill = pal.faceHoverFill;
          else if (highlightFaces.includes(fi)) fill = pal.faceHighlight;
          this._fillFacePolygon(ctx, face, projVerts, fill);
        }
      });
    } else if (this.style.figureMode === 'wireframe' && this.hoveredFaceIndex >= 0) {
      // В режиме каркаса подсветим наведённую грань, когда выбираем плоскость
      this._fillFacePolygon(ctx, solid.faces[this.hoveredFaceIndex], projVerts, pal.faceHoverFill);
    }

    // 4B. Отрисовка вспомогательных проектирующих плоскостей (если они не скрыты кнопкой)
    if (this.style.showAuxPlanes) {
      const planesToDraw = [];
      if (step && step.auxPlanes) planesToDraw.push(...step.auxPlanes);
      if (trainerData && trainerData.userAuxPlanes) planesToDraw.push(...trainerData.userAuxPlanes);
      for (const ap of planesToDraw) {
        this._drawAuxPlanePolygon(ctx, ap);
      }
    }

    // 5. Вспомогательные линии (продления рёбер, следы, диагонали)
    if (this.style.showAuxLines && step && step.auxLines) {
      step.auxLines.forEach((aux, idx) => {
        const isNew = step.newAuxIndices && step.newAuxIndices.includes(idx);
        this._drawAuxLine(ctx, aux, isNew, pal);
      });
    }

    // Линии, нарисованные учеником в тренажёре
    if (trainerData && trainerData.userLines) {
      trainerData.userLines.forEach((uLine, uIdx) => {
        const lineId = `userLine_${uIdx}`;
        const p1 = this.project(uLine.p1);
        const p2 = this.project(uLine.p2);
        this._projCache.lines.push({
          id: lineId,
          sourceType: 'userLine',
          userLineIndex: uIdx,
          uLine,
          name: uLine.name || `прямая ${uLine.label1 || ''}${uLine.label2 || ''}`,
          p1_3d: uLine.p1,
          p2_3d: uLine.p2,
          planes: uLine.planes || (uLine.faceIndex >= 0 ? [uLine.faceIndex] : []),
          p1,
          p2
        });

        const isHovered = this.hoveredItem && this.hoveredItem.type === 'line' && this.hoveredItem.id === lineId;
        const isRef = this.selectedRefLine && this.selectedRefLine.id === lineId;
        this._drawTrainerUserLine(ctx, uLine, faceVisible, pal, isHovered, isRef);
      });
    }

    // 6. Стороны сечения из пошагового режима
    if (step && step.segments) {
      step.segments.forEach((seg, sIdx) => {
        const isFront = seg.faceIndex >= 0 ? faceVisible[seg.faceIndex] : true;
        const isNew = step.newSegmentIndex === sIdx;
        const sp1 = this.project(seg.p1);
        const sp2 = this.project(seg.p2);

        ctx.save();
        ctx.strokeStyle = isNew ? '#f59e0b' : this.style.sectionColor;
        ctx.lineWidth = isNew ? 4.0 : 3.2;
        ctx.lineCap = 'round';
        if (!isFront && this.style.showHiddenDashed) {
          ctx.setLineDash([8, 5]);
        }
        ctx.beginPath();
        ctx.moveTo(sp1.x, sp1.y);
        ctx.lineTo(sp2.x, sp2.y);
        ctx.stroke();
        ctx.restore();
      });
    }

    // 7. Видимые (передние) рёбра многогранника — СПЛОШНОЙ ЛИНИЕЙ
    solid.edges.forEach((edge, ei) => {
      const isVisible = edge.faces.some(fi => faceVisible[fi]);
      if (isVisible) {
        const p1 = projVerts[edge.v1];
        const p2 = projVerts[edge.v2];
        const isHovered =
          (this.hoveredItem && this.hoveredItem.type === 'edge' && this.hoveredItem.index === ei) ||
          (this.hoveredItem && this.hoveredItem.type === 'line' && this.hoveredItem.id === `edge_${ei}`);
        const isRef = this.selectedRefLine && this.selectedRefLine.id === `edge_${ei}`;

        ctx.save();
        ctx.strokeStyle = isRef ? '#8b5cf6' : isHovered ? '#3b82f6' : pal.edgeVisible;
        ctx.lineWidth = isRef || isHovered ? 3.4 : 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
      }
    });

    // Пунктирная линия предпросмотра при выбранной первой точке (сбрасывается по Esc!)
    if (this.selectedToolPoint && this.previewMousePos) {
      const pStart = this.project(this.selectedToolPoint.pos);
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(pStart.x, pStart.y);
      ctx.lineTo(this.previewMousePos.x, this.previewMousePos.y);
      ctx.stroke();
      ctx.restore();
    }

    // Подпись наведённой грани (когда выбираем грань для параллельного переноса или расширения плоскости)
    if (this.hoveredFaceIndex >= 0 && solid.faces[this.hoveredFaceIndex]) {
      const f = solid.faces[this.hoveredFaceIndex];
      const fc = this.project(f.center);
      ctx.save();
      const text = `Грань ${f.name}`;
      ctx.font = '700 12.5px "Segoe UI", system-ui, sans-serif';
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(124, 58, 237, 0.92)';
      this._roundRect(ctx, fc.x - tw / 2 - 8, fc.y - 13, tw + 16, 24, 6);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, fc.x, fc.y - 1);
      ctx.restore();
    }

    // 8. Вершины многогранника и их подписи
    solid.vertices.forEach((v, vi) => {
      const pv = projVerts[vi];
      const vName = solid.vertexNames[vi];
      const isHovered = this.hoveredItem && this.hoveredItem.type === 'vertex' && this.hoveredItem.index === vi;

      ctx.save();
      ctx.fillStyle = isHovered ? '#3b82f6' : pal.vertexDot;
      ctx.beginPath();
      ctx.arc(pv.x, pv.y, isHovered ? 5.8 : 3.5, 0, Math.PI * 2);
      ctx.fill();

      const cProj = this.project(solid.center);
      const dx = pv.x - cProj.x;
      const dy = pv.y - cProj.y;
      const dLen = Math.hypot(dx, dy) || 1;
      const tx = pv.x + (dx / dLen) * 16;
      const ty = pv.y + (dy / dLen) * 16;

      ctx.font = '700 14px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = pal.vertexLabel;
      ctx.fillText(vName, tx, ty);
      ctx.restore();
    });

    // 9. Точки сечения, заданные точки и точки-следы
    this._projCache.points = [];
    allPts.forEach((pt, idx) => {
      const pp = this.project(pt.pos);
      this._projCache.points.push({ index: idx, pt, x: pp.x, y: pp.y });

      const isNew = step && step.newPointLabels && step.newPointLabels.includes(pt.label);
      const isHovered =
        this.hoveredItem &&
        this.hoveredItem.type === 'point' &&
        this.hoveredItem.label === pt.label;
      const isSelected =
        this.selectedToolPoint && this.selectedToolPoint.label === pt.label;

      let dotColor = pal.sectionPoint;
      if (pt.role === 'given') dotColor = pal.givenPoint;
      else if (pt.role === 'trace') dotColor = pal.tracePoint;
      else if (pt.role === 'internal') dotColor = pal.internalLine;
      else if (pt.role === 'projection') dotColor = '#0ea5e9';

      ctx.save();
      if (isNew || isHovered || isSelected) {
        ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.35)' : 'rgba(245, 158, 11, 0.32)';
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, 11.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = dotColor;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, pt.role === 'given' ? 6.2 : 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const labelText =
        this.style.showRatioLabels && pt.role === 'given' && pt.ratioText && !pt.ratioText.startsWith('вершина')
          ? `${pt.label} (${pt.ratioText.replace(' (середина)', '')})`
          : pt.label;

      ctx.font = '700 13.5px "Segoe UI", system-ui, sans-serif';
      const bx = pp.x + 9;
      const by = pp.y - 10;

      if (this.style.showRatioLabels) {
        const tw = ctx.measureText(labelText).width;
        ctx.fillStyle = pal.textBg;
        ctx.strokeStyle = dotColor;
        ctx.lineWidth = 1.2;
        this._roundRect(ctx, bx, by - 10, tw + 10, 20, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = pal.textPrimary;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, bx + 5, by);
      } else {
        // Чистая школьная подпись точки без громоздкой рамки, чтобы не закрывать рёбра
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = pal.bg;
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.strokeText(labelText, bx, by);
        ctx.fillStyle = dotColor;
        ctx.fillText(labelText, bx, by);
      }
      ctx.restore();
    });
  }

  _fillFacePolygon(ctx, face, projVerts, fillStyle) {
    const fv = face.vertices;
    if (fv.length < 3) return;
    ctx.save();
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(projVerts[fv[0]].x, projVerts[fv[0]].y);
    for (let i = 1; i < fv.length; i++) {
      ctx.lineTo(projVerts[fv[i]].x, projVerts[fv[i]].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawSectionPolygonFill(ctx, secProj) {
    if (secProj.length < 3) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(secProj[0].x, secProj[0].y);
    for (let i = 1; i < secProj.length; i++) {
      ctx.lineTo(secProj[i].x, secProj[i].y);
    }
    ctx.closePath();

    if (this.style.sectionFill === 'color' || this.style.sectionFill === 'both') {
      ctx.fillStyle = this._hexToRgba(this.style.sectionColor, 0.25);
      ctx.fill();
    }

    if (this.style.sectionFill === 'hatch' || this.style.sectionFill === 'both') {
      ctx.clip();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of secProj) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const span = (maxX - minX) + (maxY - minY);
      const step = 10;
      ctx.strokeStyle = this._hexToRgba(this.style.sectionColor, 0.55);
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      for (let d = -span; d <= span; d += step) {
        ctx.moveTo(minX + d, minY);
        ctx.lineTo(minX + d - (maxY - minY), maxY);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawAuxLine(ctx, aux, isNew, pal) {
    const p1 = this.project(aux.p1);
    const p2 = this.project(aux.p2);

    ctx.save();
    if (aux.style === 'edgeExtend') {
      ctx.strokeStyle = isNew ? '#f59e0b' : pal.edgeExtend;
      ctx.lineWidth = isNew ? 2.2 : 1.6;
      ctx.setLineDash([4, 4]);
    } else if (aux.style === 'traceExtend' || aux.style === 'traceRay') {
      ctx.strokeStyle = isNew ? '#f59e0b' : pal.traceLine;
      ctx.lineWidth = isNew ? 2.5 : 1.85;
      ctx.setLineDash([8, 4, 2, 4]);
    } else if (aux.style === 'parallelRef' || aux.style === 'givenLine') {
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 2.8;
      ctx.setLineDash([6, 4]);
    } else {
      ctx.strokeStyle = pal.internalLine;
      ctx.lineWidth = 1.75;
      ctx.setLineDash([5, 4]);
    }

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  _drawTrainerUserLine(ctx, uLine, faceVisible, pal, isHovered = false, isRef = false) {
    const p1 = this.project(uLine.p1);
    const p2 = this.project(uLine.p2);

    ctx.save();
    if (isRef) {
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 4.0;
    } else if (isHovered) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3.8;
    } else if (uLine.status === 'invalid') {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3.2;
      ctx.setLineDash([4, 4]);
    } else if (uLine.kind === 'edgeExtend') {
      ctx.strokeStyle = pal.edgeExtend;
      ctx.lineWidth = 1.9;
      ctx.setLineDash([5, 4]);
    } else if (uLine.kind === 'aux') {
      ctx.strokeStyle = pal.internalLine;
      ctx.lineWidth = 2.0;
      ctx.setLineDash([6, 4]);
    } else if (uLine.kind === 'ray') {
      ctx.strokeStyle = pal.traceLine;
      ctx.lineWidth = 2.1;
      ctx.setLineDash([8, 4, 2, 4]);
    } else {
      const isFront = uLine.faceIndex >= 0 ? faceVisible[uLine.faceIndex] : true;
      ctx.strokeStyle = uLine.status === 'valid' ? '#10b981' : this.style.sectionColor;
      ctx.lineWidth = 3.3;
      if (!isFront && this.style.showHiddenDashed) {
        ctx.setLineDash([8, 5]);
      }
    }
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  _renderMarkerStrokes(ctx) {
    const allStrokes = [...this.markerStrokes];
    if (this.currentMarkerStroke) allStrokes.push(this.currentMarkerStroke);
    for (const st of allStrokes) {
      if (!st.points || st.points.length < 2) continue;
      ctx.save();
      ctx.strokeStyle = st.color || '#f59e0b';
      ctx.lineWidth = st.width || 3.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(st.points[0].x, st.points[0].y);
      for (let i = 1; i < st.points.length; i++) {
        ctx.lineTo(st.points[i].x, st.points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // Удаление штриха маркера ластиком при клике или наведении
  eraseMarkerStrokeAt(mx, my, radius = 16) {
    const before = this.markerStrokes.length;
    this.markerStrokes = this.markerStrokes.filter(st => {
      if (!st.points) return false;
      for (const p of st.points) {
        if (Math.hypot(p.x - mx, p.y - my) <= radius) {
          return false;
        }
      }
      return true;
    });
    if (this.markerStrokes.length !== before) {
      this.render();
      return true;
    }
    return false;
  }

  // Отрисовка полупрозрачной вспомогательной проектирующей плоскости (через 2 параллельные прямые)
  _drawAuxPlanePolygon(ctx, ap) {
    if (!ap || !ap.poly3d || ap.poly3d.length < 3) return;
    const pts2d = ap.poly3d.map(p => this.project(p));
    ctx.save();
    ctx.fillStyle = 'rgba(14, 165, 233, 0.16)';
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.72)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(pts2d[0].x, pts2d[0].y);
    for (let i = 1; i < pts2d.length; i++) {
      ctx.lineTo(pts2d[i].x, pts2d[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (ap.name) {
      const cx = (pts2d[0].x + pts2d[2].x) * 0.5;
      const cy = (pts2d[0].y + pts2d[2].y) * 0.5;
      ctx.setLineDash([]);
      ctx.font = '700 11.5px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#0284c7';
      ctx.textAlign = 'center';
      ctx.fillText(ap.name, cx, cy);
    }
    ctx.restore();
  }

  // Отрисовка тел вращения
  _renderRevolutionSolid(ctx, solid, step, pal) {
    const N = 48;
    const { viewDir } = this.getCameraBasis();

    if (solid.revType === 'cylinder') {
      const R = solid.R;
      const yB = solid.yBottom;
      const yT = solid.yTop;

      const botPts = [];
      const topPts = [];
      for (let i = 0; i <= N; i++) {
        const phi = (2 * Math.PI * i) / N;
        const x = R * Math.cos(phi);
        const z = R * Math.sin(phi);
        const normal = { x: Math.cos(phi), y: 0, z: Math.sin(phi) };
        const front = Vec3.dot(normal, viewDir) >= -0.05;
        botPts.push({ p: this.project({ x, y: yB, z }), front });
        topPts.push({ p: this.project({ x, y: yT, z }), front });
      }

      let minIdx = 0, maxIdx = 0;
      for (let i = 0; i < N; i++) {
        if (botPts[i].p.x < botPts[minIdx].p.x) minIdx = i;
        if (botPts[i].p.x > botPts[maxIdx].p.x) maxIdx = i;
      }

      for (let i = 0; i < N; i++) {
        const a = botPts[i], b = botPts[i + 1];
        ctx.save();
        ctx.strokeStyle = a.front ? pal.edgeVisible : pal.edgeHidden;
        ctx.lineWidth = a.front ? 2.2 : 1.6;
        if (!a.front && this.style.showHiddenDashed) ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(a.p.x, a.p.y);
        ctx.lineTo(b.p.x, b.p.y);
        ctx.stroke();
        ctx.restore();
      }

      if (step && step.completedPolygon) {
        const secProj = step.completedPolygon.points.map(pt => this.project(pt));
        this._drawSectionPolygonFill(ctx, secProj);
        if (step.completedPolygon.isCurve) {
          ctx.save();
          ctx.strokeStyle = this.style.sectionColor;
          ctx.lineWidth = 3.0;
          ctx.beginPath();
          ctx.moveTo(secProj[0].x, secProj[0].y);
          for (let i = 1; i < secProj.length; i++) ctx.lineTo(secProj[i].x, secProj[i].y);
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        }
      }

      ctx.save();
      if (this.style.figureMode !== 'wireframe') {
        ctx.fillStyle = pal.faceFrontFill;
        ctx.beginPath();
        ctx.moveTo(topPts[0].p.x, topPts[0].p.y);
        for (let i = 1; i <= N; i++) ctx.lineTo(topPts[i].p.x, topPts[i].p.y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = pal.edgeVisible;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(topPts[0].p.x, topPts[0].p.y);
      for (let i = 1; i <= N; i++) ctx.lineTo(topPts[i].p.x, topPts[i].p.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(botPts[minIdx].p.x, botPts[minIdx].p.y);
      ctx.lineTo(topPts[minIdx].p.x, topPts[minIdx].p.y);
      ctx.moveTo(botPts[maxIdx].p.x, botPts[maxIdx].p.y);
      ctx.lineTo(topPts[maxIdx].p.x, topPts[maxIdx].p.y);
      ctx.stroke();
      ctx.restore();
    } else if (solid.revType === 'cone') {
      const R = solid.R;
      const yB = solid.yBottom;
      const S = this.project({ x: 0, y: solid.yApex, z: 0 });

      const botPts = [];
      for (let i = 0; i <= N; i++) {
        const phi = (2 * Math.PI * i) / N;
        const x = R * Math.cos(phi);
        const z = R * Math.sin(phi);
        const normal = { x: Math.cos(phi), y: 0, z: Math.sin(phi) };
        const front = Vec3.dot(normal, viewDir) >= -0.05;
        botPts.push({ p: this.project({ x, y: yB, z }), front });
      }

      let minIdx = 0, maxIdx = 0;
      for (let i = 0; i < N; i++) {
        if (botPts[i].p.x < botPts[minIdx].p.x) minIdx = i;
        if (botPts[i].p.x > botPts[maxIdx].p.x) maxIdx = i;
      }

      for (let i = 0; i < N; i++) {
        const a = botPts[i], b = botPts[i + 1];
        ctx.save();
        ctx.strokeStyle = a.front ? pal.edgeVisible : pal.edgeHidden;
        ctx.lineWidth = a.front ? 2.2 : 1.6;
        if (!a.front && this.style.showHiddenDashed) ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(a.p.x, a.p.y);
        ctx.lineTo(b.p.x, b.p.y);
        ctx.stroke();
        ctx.restore();
      }

      if (step && step.completedPolygon) {
        const secProj = step.completedPolygon.points.map(pt => this.project(pt));
        this._drawSectionPolygonFill(ctx, secProj);
        if (step.completedPolygon.isCurve) {
          ctx.save();
          ctx.strokeStyle = this.style.sectionColor;
          ctx.lineWidth = 3.0;
          ctx.beginPath();
          ctx.moveTo(secProj[0].x, secProj[0].y);
          for (let i = 1; i < secProj.length; i++) ctx.lineTo(secProj[i].x, secProj[i].y);
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        }
      }

      ctx.save();
      ctx.strokeStyle = pal.edgeVisible;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(S.x, S.y);
      ctx.lineTo(botPts[minIdx].p.x, botPts[minIdx].p.y);
      ctx.moveTo(S.x, S.y);
      ctx.lineTo(botPts[maxIdx].p.x, botPts[maxIdx].p.y);
      ctx.stroke();
      ctx.restore();
    } else if (solid.revType === 'sphere') {
      const R = solid.R;
      const centerP = this.project({ x: 0, y: 0, z: 0 });
      const radiusPx = R * centerP.scale;

      const eqPts = [];
      for (let i = 0; i <= N; i++) {
        const phi = (2 * Math.PI * i) / N;
        const x = R * Math.cos(phi);
        const z = R * Math.sin(phi);
        const front = Vec3.dot({ x, y: 0, z }, viewDir) >= 0;
        eqPts.push({ p: this.project({ x, y: 0, z }), front });
      }

      ctx.save();
      if (this.style.figureMode !== 'wireframe') {
        ctx.fillStyle = pal.faceFrontFill;
        ctx.beginPath();
        ctx.arc(centerP.x, centerP.y, radiusPx, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = pal.edgeVisible;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(centerP.x, centerP.y, radiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      for (let i = 0; i < N; i++) {
        const a = eqPts[i], b = eqPts[i + 1];
        ctx.save();
        ctx.strokeStyle = pal.edgeHidden;
        ctx.lineWidth = a.front ? 1.5 : 1.2;
        if (!a.front) ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(a.p.x, a.p.y);
        ctx.lineTo(b.p.x, b.p.y);
        ctx.stroke();
        ctx.restore();
      }

      if (step && step.completedPolygon) {
        const secProj = step.completedPolygon.points.map(pt => this.project(pt));
        this._drawSectionPolygonFill(ctx, secProj);
        ctx.save();
        ctx.strokeStyle = this.style.sectionColor;
        ctx.lineWidth = 3.0;
        ctx.beginPath();
        ctx.moveTo(secProj[0].x, secProj[0].y);
        for (let i = 1; i < secProj.length; i++) ctx.lineTo(secProj[i].x, secProj[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }

    if (step) {
      if (step.auxLines) {
        step.auxLines.forEach(aux => this._drawAuxLine(ctx, aux, false, pal));
      }
      if (step.segments) {
        step.segments.forEach(seg => {
          const sp1 = this.project(seg.p1);
          const sp2 = this.project(seg.p2);
          ctx.save();
          ctx.strokeStyle = this.style.sectionColor;
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.moveTo(sp1.x, sp1.y);
          ctx.lineTo(sp2.x, sp2.y);
          ctx.stroke();
          ctx.restore();
        });
      }
      if (step.points) {
        step.points.forEach(pt => {
          const pp = this.project(pt.pos);
          ctx.save();
          ctx.fillStyle = pt.role === 'given' ? pal.givenPoint : pal.sectionPoint;
          ctx.beginPath();
          ctx.arc(pp.x, pp.y, 5.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
          ctx.fillStyle = pal.textPrimary;
          ctx.fillText(pt.label, pp.x + 8, pp.y - 6);
          ctx.restore();
        });
      }
    }
  }

  // ==========================================================================
  // 2D-вид 1: "Натуральная величина сечения"
  // ==========================================================================
  render2DSection() {
    if (!this.ctx2d || !this.width2d) return;
    const ctx = this.ctx2d;
    const dpr = this.dpr || 1;
    const pal = this.getPalette();
    const w = this.width2d;
    const h = this.height2d;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, w, h);

    if (this.style.showNotebookGrid) {
      this._drawNotebookGrid(ctx, pal);
    }

    const poly =
      (this.sceneData && this.sceneData.completedPolygon) ||
      (this.sceneData && this.sceneData.step && this.sceneData.step.completedPolygon);

    if (!poly || !poly.metrics || !poly.metrics.pts2d || poly.metrics.pts2d.length < 3) {
      ctx.fillStyle = pal.textMuted;
      ctx.font = '500 12.5px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Завершите построение сечения,', w / 2, h / 2 - 8);
      ctx.fillText('чтобы увидеть его в 2D', w / 2, h / 2 + 11);
      ctx.restore();
      return;
    }

    const pts2d = poly.metrics.pts2d;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts2d) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const spanX = Math.max(0.5, maxX - minX);
    const spanY = Math.max(0.5, maxY - minY);
    const pad = 42;
    const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const screenPts = pts2d.map(p => ({
      x: w / 2 + (p.x - cx) * scale,
      y: h / 2 - (p.y - cy) * scale
    }));

    this._drawSectionPolygonFill(ctx, screenPts);

    ctx.strokeStyle = this.style.sectionColor;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(screenPts[0].x, screenPts[0].y);
    for (let i = 1; i < screenPts.length; i++) {
      ctx.lineTo(screenPts[i].x, screenPts[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    if (!poly.isCurve) {
      const n = screenPts.length;
      for (let i = 0; i < n; i++) {
        const pA = screenPts[i];
        const pB = screenPts[(i + 1) % n];
        const midX = (pA.x + pB.x) / 2;
        const midY = (pA.y + pB.y) / 2;
        const sideLen = poly.metrics.sides[i];

        ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = pal.textMuted;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sideLen.toFixed(2), midX, midY - 7);

        ctx.fillStyle = this.style.sectionColor;
        ctx.beginPath();
        ctx.arc(pA.x, pA.y, 4.5, 0, Math.PI * 2);
        ctx.fill();

        const dx = pA.x - w / 2;
        const dy = pA.y - h / 2;
        const dL = Math.hypot(dx, dy) || 1;
        const lx = pA.x + (dx / dL) * 18;
        const ly = pA.y + (dy / dL) * 18;

        const lbl = poly.labels[i] || '';
        const ang = poly.metrics.angles[i] ? `${Math.round(poly.metrics.angles[i])}°` : '';
        ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = pal.textPrimary;
        ctx.fillText(`${lbl} (${ang})`, lx, ly);
      }
    }

    ctx.restore();
  }

  // ==========================================================================
  // 2D-вид 2: "Выносной 2D-чертёж выбранной грани (со следами и продолжениями рёбер)"
  // ==========================================================================
  render2DFace(faceIndex) {
    if (!this.ctx2d || !this.width2d) return;
    const ctx = this.ctx2d;
    const dpr = this.dpr || 1;
    const pal = this.getPalette();
    const w = this.width2d;
    const h = this.height2d;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, w, h);

    if (this.style.showNotebookGrid) {
      this._drawNotebookGrid(ctx, pal);
    }

    const solid = this.sceneData && this.sceneData.solid;
    if (!solid || !solid.faces || !solid.faces[faceIndex]) {
      ctx.fillStyle = pal.textMuted;
      ctx.font = '500 12.5px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Выберите грань многогранника', w / 2, h / 2);
      ctx.restore();
      return;
    }

    const face = solid.faces[faceIndex];
    const basis = Geo3D.buildPlaneBasis(face.normal);
    const origin = face.center;

    const to2D = pt3d => {
      const rel = Vec3.sub(pt3d, origin);
      return {
        x: Vec3.dot(rel, basis.u),
        y: Vec3.dot(rel, basis.v)
      };
    };

    // Вершины самой грани
    const fv2d = face.vertices.map(vi => ({
      vi,
      label: solid.vertexNames[vi],
      ...to2D(solid.vertices[vi])
    }));

    // Точки сечения и точки-следы, лежащие в плоскости этой грани
    const step = this.sceneData.step;
    const trainerData = this.sceneData.trainerData;
    const allPts = [];
    if (step && step.points) allPts.push(...step.points);
    if (trainerData && trainerData.userPoints) {
      for (const up of trainerData.userPoints) {
        if (!allPts.some(p => Vec3.equals(p.pos, up.pos, 1e-3))) allPts.push(up);
      }
    }
    const facePlanePts = allPts
      .filter(p => p.planes && p.planes.includes(faceIndex))
      .map(p => ({ ...p, ...to2D(p.pos) }));

    // Определим габариты (вместе со следами!), чтобы всё аккуратно вписалось в 2D-окно
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of [...fv2d, ...facePlanePts]) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const spanX = Math.max(0.8, maxX - minX);
    const spanY = Math.max(0.8, maxY - minY);
    const pad = 34;
    const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const mapScreen = p2 => ({
      x: w / 2 + (p2.x - cx) * scale,
      y: h / 2 - (p2.y - cy) * scale
    });

    const screenFV = fv2d.map(mapScreen);

    // 1. Пунктирные продолжения рёбер грани
    ctx.strokeStyle = pal.edgeExtend;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i < screenFV.length; i++) {
      const a = screenFV[i];
      const b = screenFV[(i + 1) % screenFV.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      ctx.beginPath();
      ctx.moveTo(a.x - dx * 1.2, a.y - dy * 1.2);
      ctx.lineTo(b.x + dx * 1.2, b.y + dy * 1.2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 2. Контур и заливка самой грани
    ctx.fillStyle = pal.faceFrontFill;
    ctx.strokeStyle = pal.edgeVisible;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(screenFV[0].x, screenFV[0].y);
    for (let i = 1; i < screenFV.length; i++) ctx.lineTo(screenFV[i].x, screenFV[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. Прямая сечения и следы в этой грани
    if (facePlanePts.length >= 2) {
      const spA = mapScreen(facePlanePts[0]);
      const spB = mapScreen(facePlanePts[facePlanePts.length - 1]);
      const dx = spB.x - spA.x;
      const dy = spB.y - spA.y;
      ctx.save();
      ctx.strokeStyle = pal.traceLine;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(spA.x - dx * 0.5, spA.y - dy * 0.5);
      ctx.lineTo(spB.x + dx * 0.5, spB.y + dy * 0.5);
      ctx.stroke();
      ctx.restore();
    }

    // Отрезок сечения внутри грани
    const onFacePts = facePlanePts.filter(p => p.faces && p.faces.includes(faceIndex));
    if (onFacePts.length >= 2) {
      const s1 = mapScreen(onFacePts[0]);
      const s2 = mapScreen(onFacePts[1]);
      ctx.save();
      ctx.strokeStyle = this.style.sectionColor;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
      ctx.restore();
    }

    // 4. Подписи вершин грани
    for (let i = 0; i < screenFV.length; i++) {
      const sp = screenFV[i];
      ctx.fillStyle = pal.vertexDot;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 3.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = pal.vertexLabel;
      ctx.fillText(fv2d[i].label, sp.x + 7, sp.y - 6);
    }

    // 5. Точки сечения и точки-следы в плоскости этой грани
    for (const pt of facePlanePts) {
      const sp = mapScreen(pt);
      let color = pal.sectionPoint;
      if (pt.role === 'given') color = pal.givenPoint;
      else if (pt.role === 'trace') color = pal.tracePoint;

      ctx.fillStyle = color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 5.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = color;
      ctx.fillText(pt.label, sp.x + 7, sp.y + 13);
    }

    // Заголовок грани
    ctx.font = '700 11.5px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = pal.textMuted;
    ctx.textAlign = 'left';
    ctx.fillText(`Плоский вынос грани ${face.name}`, 10, 16);

    ctx.restore();
  }

  // ==========================================================================
  // Захват элементов под курсором мыши: точки, вершины, рёбра, прямые, грани
  // ==========================================================================
  hitTest(mouseX, mouseY, options = {}) {
    if (!this.sceneData || !this.sceneData.solid) return null;
    const solid = this.sceneData.solid;
    if (solid.type === 'revolution') return null;

    // Если ищем только построенную линию/ребро (например, для Ластика или Пересечения прямых)
    if (options.linesOnly) {
      return this.hitTestLine(mouseX, mouseY, options.excludeEdges);
    }

    // 1. Точки (M, N, K, E₁, T₁...)
    for (const pItem of this._projCache.points) {
      const dist = Math.hypot(mouseX - pItem.x, mouseY - pItem.y);
      if (dist <= 13) {
        return {
          type: 'point',
          label: pItem.pt.label,
          pointObj: pItem.pt,
          pos: pItem.pt.pos,
          x: pItem.x,
          y: pItem.y
        };
      }
    }

    // 2. Вершины многогранника
    for (let vi = 0; vi < this._projCache.vertices.length; vi++) {
      const pv = this._projCache.vertices[vi];
      const dist = Math.hypot(mouseX - pv.x, mouseY - pv.y);
      if (dist <= 11) {
        return {
          type: 'vertex',
          index: vi,
          label: solid.vertexNames[vi],
          pos: solid.vertices[vi],
          x: pv.x,
          y: pv.y
        };
      }
    }

    // 3. Рёбра многогранника
    let bestEdge = null;
    let bestDist = 11;

    for (const eItem of this._projCache.edges) {
      const { edgeIndex, p1, p2 } = eItem;
      const vx = p2.x - p1.x;
      const vy = p2.y - p1.y;
      const lenSq = vx * vx + vy * vy;
      if (lenSq < 4) continue;

      let t = ((mouseX - p1.x) * vx + (mouseY - p1.y) * vy) / lenSq;
      t = Math.max(0.05, Math.min(0.95, t));

      const snaps = [0.5, 1 / 3, 2 / 3, 0.25, 0.75, 0.4, 0.6];
      for (const s of snaps) {
        if (Math.abs(t - s) < 0.032) {
          t = s;
          break;
        }
      }

      const projX = p1.x + vx * t;
      const projY = p1.y + vy * t;
      const dist = Math.hypot(mouseX - projX, mouseY - projY);

      if (dist < bestDist) {
        bestDist = dist;
        const edge = solid.edges[edgeIndex];
        const pos3d = Vec3.lerp(solid.vertices[edge.v1], solid.vertices[edge.v2], t);
        bestEdge = {
          type: 'edge',
          index: edgeIndex,
          edge,
          t,
          ratioText: Geo3D.formatRatio(t),
          pos: pos3d,
          x: projX,
          y: projY
        };
      }
    }

    if (bestEdge) return bestEdge;

    // 4. Пользовательские линии (продления, вспомогательные прямые)
    return this.hitTestLine(mouseX, mouseY, true);
  }

  // Захват любой прямой (построенного отрезка, продлённого ребра, луча или ребра многогранника)
  hitTestLine(mouseX, mouseY, excludePolyhedronEdges = false) {
    let best = null;
    let bestDist = 10;

    // Сначала проверяем пользовательские линии (чтобы они имели приоритет над рёбрами)
    const candidates = [...this._projCache.lines].reverse();
    for (const item of candidates) {
      if (excludePolyhedronEdges && item.sourceType === 'edge') continue;
      const { p1, p2 } = item;
      const vx = p2.x - p1.x;
      const vy = p2.y - p1.y;
      const lenSq = vx * vx + vy * vy;
      if (lenSq < 4) continue;

      let t = ((mouseX - p1.x) * vx + (mouseY - p1.y) * vy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const projX = p1.x + vx * t;
      const projY = p1.y + vy * t;
      const d = Math.hypot(mouseX - projX, mouseY - projY);

      if (d < bestDist) {
        bestDist = d;
        best = {
          type: 'line',
          ...item,
          x: projX,
          y: projY
        };
      }
    }
    return best;
  }

  // Определение грани многогранника под курсором мыши (для выбора плоскости переноса или расширения грани)
  hitTestFace(mouseX, mouseY) {
    if (!this._projCache.faces || this._projCache.faces.length === 0) return -1;

    // Сначала проверяем видимые (передние) грани
    for (const fItem of this._projCache.faces) {
      if (fItem.isVisible && this._pointInPoly2D(mouseX, mouseY, fItem.poly2d)) {
        return fItem.faceIndex;
      }
    }
    // Если не попали в переднюю, проверим задние
    for (const fItem of this._projCache.faces) {
      if (!fItem.isVisible && this._pointInPoly2D(mouseX, mouseY, fItem.poly2d)) {
        return fItem.faceIndex;
      }
    }
    return -1;
  }

  _pointInPoly2D(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _hexToRgba(hex, alpha) {
    const clean = hex.replace('#', '');
    const bigint = parseInt(clean, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}

window.StereometryRenderer3D = StereometryRenderer3D;
