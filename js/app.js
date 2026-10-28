// ============================================================================
// app.js — Главный контроллер приложения «Стереометрия 3D: Конструктор сечений»
// ============================================================================

class StereometryApp {
  constructor() {
    this.currentSolidId = 'cube';
    this.solidCustomOpts = {
      scaleW: 1.0,
      scaleH: 1.0,
      scaleD: 1.0,
      tiltX: 0.0,
      tiltZ: 0.0,
      customN: 5
    };
    this.solid = null;

    this.spec = {
      mode: 'points3',
      strategy: 'auto',
      parallelEdgeIndex: 0,
      parallelFaceIndex: 0,
      points: [
        { edgeIndex: 0, t: 0.5, label: 'M' },
        { edgeIndex: 2, t: 0.5, label: 'N' },
        { edgeIndex: 5, t: 0.5, label: 'K' }
      ],
      revMode: 'parallelAxis',
      offsetD: 0.45,
      heightRatio: 0.5,
      tiltDeg: 25
    };

    // Режим работы: 'explain' | 'trainer' | 'notebook'
    this.appMode = 'explain';

    this.construction = null;
    this.currentStepIndex = 0;
    this.playTimer = null;

    // Режим рисования маркером поверх чертежа
    this.markerActive = false;
    this.markerEraserActive = false;
    this.markerColor = '#f59e0b';

    this.trainer = {
      tool: 'segment',
      checkErrorsLive: true,
      userPoints: [],
      userLines: [],
      userAuxPlanes: [],
      completedPolygon: null,
      selectedFirstPoint: null,
      selectedFirstLine: null,
      parallelRefLine: null,
      parallelThroughPoint: null,
      feedbackMessage: '',
      feedbackType: 'info'
    };

    this.activeGivenPointSlot = 0;
    this.draggingPointSlot = -1;

    this.renderer = null;
    this.init();
  }

  init() {
    const canvas3d = document.getElementById('canvas3d');
    const canvas2d = document.getElementById('canvas2d');
    this.renderer = new StereometryRenderer3D(canvas3d, canvas2d);

    this._populateCatalogSelects();
    this._bindUIEvents();
    this._bindKeyboardShortcuts();
    this._bindCanvasInteraction();

    this.loadPreset('cube_hexagon');
  }

  // ==========================================================================
  // Горячие клавиши: Esc — отмена выбора точки/прямой, Ctrl+Z — шаг назад
  // ==========================================================================
  _bindKeyboardShortcuts() {
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelActiveSelection(true);
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'я')) {
        e.preventDefault();
        this.undoLastAction();
      }
    });
  }

  // Сброс любого незавершённого выбора точки/прямой/грани (по нажатию Esc или кнопки)
  cancelActiveSelection(notifyUser = false) {
    const hadSelection =
      this.trainer.selectedFirstPoint ||
      this.trainer.selectedFirstLine ||
      this.trainer.parallelRefLine ||
      this.trainer.parallelThroughPoint ||
      this.renderer.selectedToolPoint ||
      this.renderer.selectedRefLine;

    this.trainer.selectedFirstPoint = null;
    this.trainer.selectedFirstLine = null;
    this.trainer.parallelRefLine = null;
    this.trainer.parallelThroughPoint = null;

    this.renderer.selectedToolPoint = null;
    this.renderer.selectedRefLine = null;
    this.renderer.previewMousePos = null;
    this.renderer.hoveredFaceIndex = -1;

    this._updateCancelBtnVisibility();
    this._renderParallelFacePickerBar(false);

    if (notifyUser && (this.appMode === 'trainer' || this.appMode === 'notebook')) {
      this.setTrainerFeedback(
        hadSelection
          ? '✖ Выбор отменён (Esc). Выберите начальный элемент для продолжения.'
          : 'Готово к выбору элементов (нажмите Esc в любой момент для сброса выбора).',
        'info'
      );
    }

    this.renderer.render();
  }

  _updateCancelBtnVisibility() {
    const btn = document.getElementById('cancelSelectionBtn');
    if (!btn) return;
    const active = Boolean(
      this.trainer.selectedFirstPoint ||
      this.trainer.selectedFirstLine ||
      this.trainer.parallelRefLine ||
      this.trainer.parallelThroughPoint
    );
    btn.style.display = active ? 'inline-flex' : 'none';
  }

  undoLastAction() {
    if (this.markerActive && this.renderer.markerStrokes.length > 0) {
      this.renderer.markerStrokes.pop();
      this.renderer.render();
      return;
    }
    if (this.appMode === 'trainer' || this.appMode === 'notebook') {
      this.cancelActiveSelection(false);
      if (this.trainer.userLines.length > 0) {
        const removed = this.trainer.userLines.pop();
        this.trainer.completedPolygon = null;
        this.setTrainerFeedback(`↩ Удалена линия ${removed.name || ''}.`, 'info');
        this._updateSceneAndUI();
      }
    } else {
      this.prevStep();
    }
  }

  _populateCatalogSelects() {
    const solidSelect = document.getElementById('solidSelect');
    if (solidSelect) {
      solidSelect.innerHTML = '';
      const groups = {};
      SOLIDS_CATALOG.forEach(item => {
        if (!groups[item.group]) groups[item.group] = [];
        groups[item.group].push(item);
      });
      Object.keys(groups).forEach(gName => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = gName;
        groups[gName].forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.id;
          opt.textContent = item.title;
          optgroup.appendChild(opt);
        });
        solidSelect.appendChild(optgroup);
      });
    }

    const presetSelect = document.getElementById('presetSelect');
    if (presetSelect) {
      presetSelect.innerHTML = '<option value="">— Выберите готовую задачу / шаблон —</option>';
      const pGroups = {};
      PRESETS_LIBRARY.forEach(p => {
        if (!pGroups[p.group]) pGroups[p.group] = [];
        pGroups[p.group].push(p);
      });
      Object.keys(pGroups).forEach(gName => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = gName;
        pGroups[gName].forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.title;
          optgroup.appendChild(opt);
        });
        presetSelect.appendChild(optgroup);
      });
    }
  }

  rebuildSolidAndSection(jumpToLastStep = false) {
    this.solid = createSolid(this.currentSolidId, this.solidCustomOpts);
    this.renderer.extendedFaces.clear();
    this.renderer.selected2DFaceIndex = 0;

    const isRev = this.solid.type === 'revolution';
    document.getElementById('polyhedronControls').style.display = isRev ? 'none' : 'block';
    document.getElementById('revolutionControls').style.display = isRev ? 'block' : 'none';
    document.getElementById('customNRow').style.display =
      (this.currentSolidId === 'custom_prism' || this.currentSolidId === 'custom_pyramid') ? 'flex' : 'none';

    if (!isRev) {
      const maxEdge = this.solid.edges.length - 1;
      this.spec.points.forEach((pt, idx) => {
        if (pt.edgeIndex > maxEdge) {
          pt.edgeIndex = Math.min(maxEdge, idx * 2);
        }
      });
      if (this.spec.parallelEdgeIndex > maxEdge) this.spec.parallelEdgeIndex = 0;
      if (this.spec.parallelFaceIndex >= this.solid.faces.length) this.spec.parallelFaceIndex = 0;

      this._populatePointEdgeSelects();
      this._populateFaceExtensionChips();
      this._populate2DFaceSelect();
    }

    this.recomputeConstruction(jumpToLastStep);
  }

  // Генерирует кнопки-чипсы для быстрого продления (расширения) любой грани многогранника
  _populateFaceExtensionChips() {
    const container = document.getElementById('extendFacesChipsContainer');
    if (!container || !this.solid || !this.solid.faces) return;
    container.innerHTML = '';

    this.solid.faces.forEach((f, fi) => {
      const btn = document.createElement('button');
      btn.className = `face-chip-btn ${this.renderer.extendedFaces.has(fi) ? 'active' : ''}`;
      btn.textContent = f.role === 'bottom' ? `Осн. ${f.name}` : f.name;
      btn.title = `Нажмите, чтобы визуально продлить плоскость грани ${f.name} и её рёбра`;
      btn.addEventListener('click', () => {
        this.toggleExtendedFace(fi);
      });
      container.appendChild(btn);
    });

    if (this.renderer.extendedFaces.size > 0) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'face-chip-btn clear';
      clearBtn.textContent = '✖ Скрыть плоскости';
      clearBtn.addEventListener('click', () => {
        this.renderer.extendedFaces.clear();
        this._populateFaceExtensionChips();
        this.renderer.render();
      });
      container.appendChild(clearBtn);
    }
  }

  toggleExtendedFace(fi) {
    if (!this.solid || !this.solid.faces || !this.solid.faces[fi]) return;
    const face = this.solid.faces[fi];
    if (this.renderer.extendedFaces.has(fi)) {
      this.renderer.extendedFaces.delete(fi);
      if (this.appMode !== 'explain') {
        this.setTrainerFeedback(`Плоскость грани ${face.name} возвращена к обычному размеру.`, 'info');
      }
    } else {
      this.renderer.extendedFaces.add(fi);
      // Также переключим 2D-вынос грани на эту грань, если открыта вкладка грани
      this.renderer.selected2DFaceIndex = fi;
      const face2dSel = document.getElementById('select2DFace');
      if (face2dSel) face2dSel.value = fi;
      if (this.appMode !== 'explain') {
        this.setTrainerFeedback(
          `▱ Плоскость грани ${face.name} и её рёбра визуально продлены за пределы фигуры!`,
          'success'
        );
      }
    }
    this._populateFaceExtensionChips();
    this.renderer.render();
  }

  _populate2DFaceSelect() {
    const sel = document.getElementById('select2DFace');
    if (!sel || !this.solid || !this.solid.faces) return;
    sel.innerHTML = '';
    this.solid.faces.forEach((f, fi) => {
      const opt = document.createElement('option');
      opt.value = fi;
      opt.textContent = `Грань ${f.name}`;
      sel.appendChild(opt);
    });
    sel.value = this.renderer.selected2DFaceIndex;
  }

  _populatePointEdgeSelects() {
    if (!this.solid || !this.solid.edges) return;

    ['M', 'N', 'K'].forEach((lbl, idx) => {
      const sel = document.getElementById(`edgeSelect_${lbl}`);
      if (!sel) return;
      sel.innerHTML = '';
      this.solid.edges.forEach((e, ei) => {
        const opt = document.createElement('option');
        opt.value = ei;
        opt.textContent = `Ребро ${e.name}`;
        sel.appendChild(opt);
      });
      sel.value = this.spec.points[idx].edgeIndex;

      const slider = document.getElementById(`ratioSlider_${lbl}`);
      const badge = document.getElementById(`ratioBadge_${lbl}`);
      if (slider) slider.value = this.spec.points[idx].t;
      if (badge) badge.textContent = Geo3D.formatRatio(this.spec.points[idx].t);
    });

    const parEdgeSel = document.getElementById('parallelEdgeSelect');
    if (parEdgeSel) {
      parEdgeSel.innerHTML = '';
      this.solid.edges.forEach((e, ei) => {
        const opt = document.createElement('option');
        opt.value = ei;
        opt.textContent = `Ребро ${e.name}`;
        parEdgeSel.appendChild(opt);
      });
      parEdgeSel.value = this.spec.parallelEdgeIndex;
    }

    const parFaceSel = document.getElementById('parallelFaceSelect');
    if (parFaceSel) {
      parFaceSel.innerHTML = '';
      this.solid.faces.forEach((f, fi) => {
        const opt = document.createElement('option');
        opt.value = fi;
        opt.textContent = `Грань ${f.name}`;
        parFaceSel.appendChild(opt);
      });
      parFaceSel.value = this.spec.parallelFaceIndex;
    }
  }

  recomputeConstruction(jumpToLast = false) {
    this.stopAutoPlay();
    this.construction = buildConstruction(this.solid, this.spec);

    if (!this.construction || !this.construction.valid) {
      this.currentStepIndex = 0;
      this._updateSceneAndUI();
      return;
    }

    if (jumpToLast) {
      this.currentStepIndex = this.construction.steps.length - 1;
    } else if (this.currentStepIndex >= this.construction.steps.length) {
      this.currentStepIndex = this.construction.steps.length - 1;
    }

    if (this.appMode === 'trainer' || this.appMode === 'notebook') {
      this.resetTrainerState();
    }

    this._updateSceneAndUI();
  }

  loadPreset(presetId) {
    const preset = PRESETS_LIBRARY.find(p => p.id === presetId);
    if (!preset) return;

    this.currentSolidId = preset.solidId;
    const solidSelect = document.getElementById('solidSelect');
    if (solidSelect) solidSelect.value = preset.solidId;

    this.solidCustomOpts = {
      scaleW: 1.0,
      scaleH: 1.0,
      scaleD: 1.0,
      tiltX: 0.0,
      tiltZ: 0.0,
      customN: 5
    };
    this._syncDimensionSliders();

    this.solid = createSolid(this.currentSolidId, this.solidCustomOpts);

    if (this.solid.type === 'revolution') {
      this.spec.revMode = preset.revMode || 'parallelAxis';
      this.spec.offsetD = typeof preset.offsetD === 'number' ? preset.offsetD : 0.45;
      const revModeSel = document.getElementById('revModeSelect');
      if (revModeSel) revModeSel.value = this.spec.revMode;
    } else if (preset.setup) {
      const setupSpec = preset.setup(this.solid);
      this.spec.mode = setupSpec.mode || 'points3';
      this.spec.strategy = setupSpec.strategy || 'auto';
      if (typeof setupSpec.parallelEdgeIndex === 'number') {
        this.spec.parallelEdgeIndex = setupSpec.parallelEdgeIndex;
      }
      if (typeof setupSpec.parallelFaceIndex === 'number') {
        this.spec.parallelFaceIndex = setupSpec.parallelFaceIndex;
      }
      this.spec.points = setupSpec.points;
    }

    this._syncSpecModeUI();
    this.rebuildSolidAndSection(true);
  }

  _syncDimensionSliders() {
    const ids = [
      ['scaleWSlider', 1.0],
      ['scaleHSlider', 1.0],
      ['tiltXSlider', 0.0]
    ];
    ids.forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    });
  }

  _syncSpecModeUI() {
    const modeSel = document.getElementById('specModeSelect');
    if (modeSel) modeSel.value = this.spec.mode;

    const stratSel = document.getElementById('strategySelect');
    if (stratSel) stratSel.value = this.spec.strategy;

    const m = this.spec.mode;
    const cardN = document.getElementById('pointCard_N');
    const cardK = document.getElementById('pointCard_K');
    const parEdgeRow = document.getElementById('parallelEdgeRow');
    const parFaceRow = document.getElementById('parallelFaceRow');

    if (cardN) cardN.style.display = m === 'parallelFace' ? 'none' : 'block';
    if (cardK) cardK.style.display = (m === 'points3' || m === 'pointLine') ? 'block' : 'none';
    if (parEdgeRow) parEdgeRow.style.display = m === 'parallelLine' ? 'block' : 'none';
    if (parFaceRow) parFaceRow.style.display = m === 'parallelFace' ? 'block' : 'none';
  }

  // ==========================================================================
  // Переключение режимов работы
  // ==========================================================================
  setAppMode(mode) {
    this.appMode = mode;
    this.stopAutoPlay();
    this.cancelActiveSelection(false);

    document.querySelectorAll('.mode-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    const explainBar = document.getElementById('explainStepPanel');
    const trainerBar = document.getElementById('trainerToolPanel');

    if (mode === 'explain') {
      explainBar.style.display = 'flex';
      trainerBar.style.display = 'none';
      this.renderer.camera.locked = false;
      this._syncLockButtonUI();
    } else if (mode === 'trainer') {
      explainBar.style.display = 'none';
      trainerBar.style.display = 'flex';
      this.trainer.checkErrorsLive = true;
      this.renderer.camera.locked = false;
      this._syncLockButtonUI();
      this._syncTrainerCheckToggleUI();
      this.resetTrainerState();
    } else if (mode === 'notebook') {
      explainBar.style.display = 'none';
      trainerBar.style.display = 'flex';
      this.trainer.checkErrorsLive = false;
      this.renderer.camera.locked = true;
      this._syncLockButtonUI();
      this._syncTrainerCheckToggleUI();
      this.resetTrainerState(
        'Режим «Как в тетради»: вращение закреплено 🔒, авто-проверка отключена. Чертите свободно (Esc — отмена выбранной точки), затем нажмите «✅ Проверить чертёж»!'
      );
    }

    this._updateSceneAndUI();
  }

  _syncLockButtonUI() {
    const btn = document.getElementById('lockCameraBtn');
    if (!btn) return;
    const locked = this.renderer.camera.locked;
    btn.classList.toggle('active-warn', locked);
    btn.innerHTML = locked ? '🔒 Фигура закреплена' : '🔓 Закрепить фигуру';
  }

  _syncTrainerCheckToggleUI() {
    const chk = document.getElementById('liveErrorCheckToggle');
    if (chk) chk.checked = this.trainer.checkErrorsLive;
  }

  // ==========================================================================
  // Логика режима тренажёра («Построй сам» и «Как в тетради»)
  // ==========================================================================
  resetTrainerState(customWelcome) {
    if (!this.construction || !this.construction.valid || this.construction.steps.length === 0) return;
    const step0 = this.construction.steps[0];
    this.trainer.userPoints = step0.points.map(p => ({
      ...p,
      faces: [...p.faces],
      planes: [...p.planes]
    }));
    this.trainer.userLines = [];
    this.trainer.userAuxPlanes = [];
    this.trainer.completedPolygon = null;
    this.cancelActiveSelection(false);

    // Если задано условие параллельности ребру, добавим само это ребро как подсказку
    if (this.spec.mode === 'parallelLine' && this.solid && this.solid.edges) {
      const pe = this.solid.edges[this.spec.parallelEdgeIndex];
      if (pe) {
        this.trainer.userLines.push({
          p1: Vec3.clone(this.solid.vertices[pe.v1]),
          p2: Vec3.clone(this.solid.vertices[pe.v2]),
          label1: this.solid.vertexNames[pe.v1],
          label2: this.solid.vertexNames[pe.v2],
          name: `ребро ${pe.name}`,
          faceIndex: pe.faces[0],
          planes: [...pe.faces],
          kind: 'aux',
          status: 'unchecked',
          isActuallyValid: true
        });
      }
    }

    this.setTrainerTool(this.trainer.tool, customWelcome);
    this._updateSceneAndUI();
  }

  setTrainerTool(toolName, customMsg) {
    this.trainer.tool = toolName;
    this.cancelActiveSelection(false);

    document.querySelectorAll('.trainer-tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === toolName);
    });

    const toolHints = {
      segment: '📏 «Отрезок сечения»: кликните по двум точкам в одной грани (нажмите Esc для отмены выбранной точки).',
      extendLine: '↔ «Продлить ребро / прямую»: кликните прямо по РЕБРУ фигуры, чтобы продлить его за пределы грани, или кликните по двум точкам, чтобы провести через них прямую!',
      extendFace: '▱ «Продлить плоскость грани»: кликните по любой грани на 3D-фигуре (или кнопкам граней выше), чтобы визуально расширить плоскость этой грани и все её рёбра!',
      intersect: '✕ «Точка пересечения»: последовательно кликните по двум прямым (например, продлённой прямой сечения и продлённому ребру или двум диагоналям), чтобы найти точку их пересечения!',
      parallel: '∥ «Параллельный перенос» (Шаг 1 из 3): сначала кликните по ПРЯМОЙ-ОБРАЗЦУ (построенному отрезку сечения или ребру фигуры), параллельно которой будем строить прямую.',
      auxPlane: '◫ «Вспом. плоскость (проекции)»: кликните по двум точкам (например M и N), чтобы опустить их ортогональные проекции на основание и провести через две параллельные прямые вспомогательную плоскость!',
      auxLine: '┄ «Диагональ / Вспом. прямая»: кликните по двум вершинам или точкам (например, A и C, B и D, S и O), чтобы провести вспомогательную прямую для внутреннего проектирования.',
      eraser: '🧽 «Ластик»: кликните по любой проведённой линии, продлению ребра или штриху маркера, чтобы удалить его.',
      movePoint: '✋ «Двигать M, N, K»: перетащите исходную точку вдоль ребра многогранника.'
    };

    this.setTrainerFeedback(customMsg || toolHints[toolName] || '', 'info');
    this.renderer.render();
  }

  setTrainerFeedback(msg, type = 'info') {
    this.trainer.feedbackMessage = msg;
    this.trainer.feedbackType = type;
    const box = document.getElementById('trainerFeedbackBox');
    if (box) {
      box.textContent = msg;
      box.className = `trainer-feedback feedback-${type}`;
    }
  }

  // Отображение панели выбора целевой плоскости (грани) на Шаге 3 параллельного переноса
  _renderParallelFacePickerBar(show) {
    const bar = document.getElementById('parallelFacePickerBar');
    if (!bar) return;
    if (!show || !this.solid || !this.solid.faces) {
      bar.style.display = 'none';
      bar.innerHTML = '';
      return;
    }

    bar.style.display = 'flex';
    const refName = this.trainer.parallelRefLine ? this.trainer.parallelRefLine.name : '';
    const ptName = this.trainer.parallelThroughPoint ? this.trainer.parallelThroughPoint.label : '';

    bar.innerHTML = `<span class="picker-title">Шаг 3/3: На какую плоскость (грань) переносим прямую <b>${refName}</b> через точку <b>${ptName}</b>? (кликните по грани в 3D или кнопке):</span>`;

    const btnsWrap = document.createElement('div');
    btnsWrap.className = 'picker-btns-wrap';

    this.solid.faces.forEach((f, fi) => {
      const b = document.createElement('button');
      b.className = 'face-pick-target-btn';
      b.textContent = `Грань ${f.name}`;
      b.addEventListener('mouseenter', () => {
        this.renderer.hoveredFaceIndex = fi;
        this.renderer.render();
      });
      b.addEventListener('mouseleave', () => {
        this.renderer.hoveredFaceIndex = -1;
        this.renderer.render();
      });
      b.addEventListener('click', () => {
        this._completeTrainerParallelOnFace(fi);
      });
      btnsWrap.appendChild(b);
    });

    bar.appendChild(btnsWrap);
  }

  // ==========================================================================
  // Обработчики инструментов в режиме Тренажёра / Тетради
  // ==========================================================================

  // 1. Инструмент «Отрезок сечения» (segment) и «Вспомогательная прямая / диагональ» (auxLine)
  handleTwoPointToolClick(ptObj) {
    const tool = this.trainer.tool;

    if (!this.trainer.selectedFirstPoint) {
      this.trainer.selectedFirstPoint = ptObj;
      this.renderer.selectedToolPoint = ptObj;
      this._updateCancelBtnVisibility();
      this.setTrainerFeedback(
        `Выбрана первая точка ${ptObj.label}. Кликните по второй точке (или нажмите Esc для отмены).`,
        'info'
      );
      this.renderer.render();
      return;
    }

    const pA = this.trainer.selectedFirstPoint;
    const pB = ptObj;
    this.cancelActiveSelection(false);

    if (Vec3.equals(pA.pos, pB.pos, 1e-3)) return;

    if (tool === 'segment') {
      this._executeTrainerSegment(pA, pB);
    } else if (tool === 'auxLine') {
      this._executeTrainerAuxDiagonal(pA, pB);
    } else if (tool === 'auxPlane') {
      this._executeTrainerAuxProjectingPlane(pA, pB);
    } else if (tool === 'extendLine') {
      this._executeTrainerExtendThroughTwoPoints(pA, pB);
    }
  }

  // Построение вспомогательной проектирующей плоскости через ортогональные проекции двух точек на основание
  _executeTrainerAuxProjectingPlane(pA, pB) {
    const baseFaceIdx = Math.max(0, this.solid.faces.findIndex(f => f.role === 'bottom'));
    const baseFace = this.solid.faces[baseFaceIdx];
    if (!baseFace) return;

    let vProj = baseFace.normal;
    for (const e of this.solid.edges) {
      const inBottom1 = baseFace.vertices.includes(e.v1);
      const inBottom2 = baseFace.vertices.includes(e.v2);
      if (inBottom1 !== inBottom2) {
        const botV = inBottom1 ? this.solid.vertices[e.v1] : this.solid.vertices[e.v2];
        const topV = inBottom1 ? this.solid.vertices[e.v2] : this.solid.vertices[e.v1];
        vProj = Vec3.normalize(Vec3.sub(botV, topV));
        break;
      }
    }

    const hitProjA = Geo3D.intersectLinePlane(pA.pos, Vec3.add(pA.pos, vProj), baseFace.plane);
    const hitProjB = Geo3D.intersectLinePlane(pB.pos, Vec3.add(pB.pos, vProj), baseFace.plane);
    if (!hitProjA || !hitProjB) return;

    const projA = hitProjA.point;
    const projB = hitProjB.point;
    if (Vec3.dist(projA, projB) < 0.05) {
      this.setTrainerFeedback('Проекции выбранных точек на основание совпадают. Выберите две точки на разных вертикалях.', 'warning');
      return;
    }

    const prPtA = this._addOrGetTrainerPoint(projA, [baseFaceIdx], 'projection');
    const prPtB = this._addOrGetTrainerPoint(projB, [baseFaceIdx], 'projection');
    const auxPlaneIndex = 100 + this.trainer.userAuxPlanes.length;
    if (!pA.planes.includes(auxPlaneIndex)) pA.planes.push(auxPlaneIndex);
    if (!pB.planes.includes(auxPlaneIndex)) pB.planes.push(auxPlaneIndex);
    if (!prPtA.planes.includes(auxPlaneIndex)) prPtA.planes.push(auxPlaneIndex);
    if (!prPtB.planes.includes(auxPlaneIndex)) prPtB.planes.push(auxPlaneIndex);

    // Вертикальные проектирующие прямые
    if (!Vec3.equals(pA.pos, projA, 1e-2)) {
      this.trainer.userLines.push({
        p1: Vec3.clone(pA.pos),
        p2: Vec3.clone(projA),
        label1: pA.label,
        label2: prPtA.label,
        name: `проекция ${pA.label}${prPtA.label}`,
        faceIndex: -1,
        planes: [auxPlaneIndex],
        kind: 'aux',
        status: 'unchecked',
        isActuallyValid: true
      });
    }
    if (!Vec3.equals(pB.pos, projB, 1e-2)) {
      this.trainer.userLines.push({
        p1: Vec3.clone(pB.pos),
        p2: Vec3.clone(projB),
        label1: pB.label,
        label2: prPtB.label,
        name: `проекция ${pB.label}${prPtB.label}`,
        faceIndex: -1,
        planes: [auxPlaneIndex],
        kind: 'aux',
        status: 'unchecked',
        isActuallyValid: true
      });
    }

    // Прямая сечения pA-pB и её проекция prPtA-prPtB на основании
    this.trainer.userLines.push({
      p1: Vec3.clone(pA.pos),
      p2: Vec3.clone(pB.pos),
      label1: pA.label,
      label2: pB.label,
      name: `прямая ${pA.label}${pB.label}`,
      faceIndex: -1,
      planes: [auxPlaneIndex],
      kind: 'ray',
      status: 'unchecked',
      isActuallyValid: true
    });
    this.trainer.userLines.push({
      p1: Vec3.clone(projA),
      p2: Vec3.clone(projB),
      label1: prPtA.label,
      label2: prPtB.label,
      name: `проекция ${prPtA.label}${prPtB.label}`,
      faceIndex: baseFaceIdx,
      planes: [baseFaceIdx, auxPlaneIndex],
      kind: 'aux',
      status: 'unchecked',
      isActuallyValid: true
    });

    const planeName = `(${pA.label}${prPtA.label}${prPtB.label}${pB.label})`;
    this.trainer.userAuxPlanes.push({
      poly3d: [pA.pos, projA, projB, pB.pos],
      name: `Вспом. пл. ${planeName}`
    });

    this.renderer.style.showAuxPlanes = true;
    const auxBtn = document.getElementById('toggleAuxPlanesBtn');
    if (auxBtn) auxBtn.textContent = '👁 Вспом. плоскость: Видна';

    this.setTrainerFeedback(
      `✅ Построена ортогональная проекция (${prPtA.label}, ${prPtB.label}) и проведена вспомогательная плоскость β = ${planeName} через две параллельные прямые! ` +
      `Теперь найдите пересечение прямой ${pA.label}${pB.label} и её проекции ${prPtA.label}${prPtB.label} инструментом «✕ Пересечение прямых» (а плоскость потом можно скрыть кнопкой «👁 Вспом. плоскость» вверху).`,
      'success'
    );
    this._updateSceneAndUI();
  }

  // Проведение отрезка сечения между pA и pB
  _executeTrainerSegment(pA, pB) {
    const commonPlanes = pA.planes.filter(fi => pB.planes.includes(fi));

    if (commonPlanes.length === 0) {
      if (this.trainer.checkErrorsLive) {
        this.setTrainerFeedback(
          `❌ Ошибка! Точки ${pA.label} и ${pB.label} НЕ лежат в одной плоскости (грани)! ` +
          `Отрезок ${pA.label}${pB.label} пройдёт сквозь внутренность многогранника. ` +
          `Сначала найдите точку-след в общей плоскости или используйте вспомогательную диагональную плоскость.`,
          'error'
        );
        return;
      } else {
        this.trainer.userLines.push({
          p1: Vec3.clone(pA.pos),
          p2: Vec3.clone(pB.pos),
          label1: pA.label,
          label2: pB.label,
          name: `${pA.label}${pB.label}`,
          faceIndex: -1,
          planes: [],
          kind: 'segment',
          status: 'unchecked',
          isActuallyValid: false,
          errorReason: `Отрезок ${pA.label}${pB.label} соединяет точки из разных граней и проходит внутри многогранника!`
        });
        this.setTrainerFeedback(
          `Проведена линия ${pA.label}${pB.label} (режим тетради без проверки). Нажмите «✅ Проверить чертёж», когда будете готовы.`,
          'info'
        );
        this.renderer.render();
        return;
      }
    }

    const fi = commonPlanes[0];
    const face = this.solid.faces[fi];
    const hits = Geo3D.intersectLineWithFacePolygon(pA.pos, pB.pos, face, this.solid.vertices);

    if (hits.length >= 2) {
      const pt1 = this._addOrGetTrainerPoint(hits[0].point, [fi]);
      const pt2 = this._addOrGetTrainerPoint(hits[1].point, [fi]);

      if (pA.role === 'trace' || pB.role === 'trace') {
        const tracePt = pA.role === 'trace' ? pA : pB;
        const farPt = Vec3.dist(tracePt.pos, pt1.pos) >= Vec3.dist(tracePt.pos, pt2.pos) ? pt1 : pt2;
        this.trainer.userLines.push({
          p1: Vec3.clone(tracePt.pos),
          p2: Vec3.clone(farPt.pos),
          label1: tracePt.label,
          label2: farPt.label,
          name: `луч ${tracePt.label}${farPt.label}`,
          faceIndex: fi,
          planes: [fi],
          kind: 'ray',
          status: 'unchecked',
          isActuallyValid: true
        });
      }

      const inTruePlane =
        Geo3D.isPointInPlane(this.construction.plane, pt1.pos, 1e-2) &&
        Geo3D.isPointInPlane(this.construction.plane, pt2.pos, 1e-2);

      this.trainer.userLines.push({
        p1: Vec3.clone(pt1.pos),
        p2: Vec3.clone(pt2.pos),
        label1: pt1.label,
        label2: pt2.label,
        name: `отрезок ${pt1.label}${pt2.label}`,
        faceIndex: fi,
        planes: [fi],
        kind: 'segment',
        status: this.trainer.checkErrorsLive ? 'valid' : 'unchecked',
        isActuallyValid: inTruePlane,
        errorReason: inTruePlane ? '' : `Отрезок ${pt1.label}${pt2.label} лежит в грани ${face.name}, но не принадлежит секущей плоскости.`
      });

      this.setTrainerFeedback(
        this.trainer.checkErrorsLive
          ? `✅ Верно! Точки ${pA.label} и ${pB.label} лежат в плоскости грани ${face.name}. Построена сторона сечения ${pt1.label}${pt2.label}.`
          : `Построен отрезок ${pt1.label}${pt2.label} в грани ${face.name}.`,
        this.trainer.checkErrorsLive ? 'success' : 'info'
      );

      this._checkIfTrainerCompletedSection();
      this._updateSceneAndUI();
    }
  }

  // Проведение вспомогательной прямой / диагонали (например AC, BD, SO, MK)
  _executeTrainerAuxDiagonal(pA, pB) {
    const dir = Vec3.normalize(Vec3.sub(pB.pos, pA.pos));
    const commonPlanes = pA.planes.filter(fi => pB.planes.includes(fi));

    // Слегка вытянем вспомогательную прямую за края точек, чтобы было удобно искать пересечения
    const extA = Vec3.addScaled(pA.pos, dir, -0.4);
    const extB = Vec3.addScaled(pB.pos, dir, Vec3.dist(pA.pos, pB.pos) + 0.4);

    this.trainer.userLines.push({
      p1: extA,
      p2: extB,
      label1: pA.label,
      label2: pB.label,
      name: `вспом. прямая ${pA.label}${pB.label}`,
      faceIndex: commonPlanes.length > 0 ? commonPlanes[0] : -1,
      planes: commonPlanes,
      kind: 'aux',
      status: 'unchecked',
      isActuallyValid: true
    });

    this.setTrainerFeedback(
      `┄ Проведена вспомогательная прямая ${pA.label}${pB.label}. Вы можете найти её пересечение с другой прямой инструментом «✕ Пересечение».`,
      'info'
    );
    this._updateSceneAndUI();
  }

  // 2. Инструмент «Продлить ребро / прямую» (extendLine)
  // Клик по ребру продлевает само ребро; клик по двум точкам продлевает прямую через эти две точки!
  handleExtendEdgeDirect(edgeIndex) {
    const edge = this.solid.edges[edgeIndex];
    if (!edge) return;
    const vA = this.solid.vertices[edge.v1];
    const vB = this.solid.vertices[edge.v2];
    const dir = Vec3.normalize(Vec3.sub(vB, vA));
    const len = Vec3.dist(vA, vB);

    const extP1 = Vec3.addScaled(vA, dir, -len * 1.45);
    const extP2 = Vec3.addScaled(vB, dir, len * 1.45);

    this.trainer.userLines.push({
      p1: extP1,
      p2: extP2,
      label1: this.solid.vertexNames[edge.v1],
      label2: this.solid.vertexNames[edge.v2],
      name: `продолжение ребра ${edge.name}`,
      faceIndex: edge.faces[0],
      planes: [...edge.faces],
      kind: 'edgeExtend',
      status: 'unchecked',
      isActuallyValid: true
    });

    const fNames = edge.faces.map(fi => this.solid.faces[fi].name).join(' и ');
    this.setTrainerFeedback(
      `↔ Ребро ${edge.name} продлено в обе стороны (принадлежит плоскостям граней ${fNames}). Теперь продлите прямую сечения или используйте «✕ Пересечение»!`,
      'success'
    );
    this._updateSceneAndUI();
  }

  _executeTrainerExtendThroughTwoPoints(pA, pB) {
    const commonPlanes = pA.planes.filter(fi => pB.planes.includes(fi));
    if (commonPlanes.length === 0 && this.trainer.checkErrorsLive) {
      this.setTrainerFeedback(
        `❌ Точки ${pA.label} и ${pB.label} не лежат в одной грани! Сначала выберите две точки из одной грани.`,
        'error'
      );
      return;
    }

    const dir = Vec3.normalize(Vec3.sub(pB.pos, pA.pos));
    const extP1 = Vec3.addScaled(pA.pos, dir, -4.5);
    const extP2 = Vec3.addScaled(pB.pos, dir, 4.5);

    this.trainer.userLines.push({
      p1: extP1,
      p2: extP2,
      label1: pA.label,
      label2: pB.label,
      name: `прямая ${pA.label}${pB.label}`,
      faceIndex: commonPlanes.length > 0 ? commonPlanes[0] : -1,
      planes: commonPlanes,
      kind: 'ray',
      status: 'unchecked',
      isActuallyValid: true
    });

    // Также построим сам отрезок внутри грани, если он ещё не построен
    if (commonPlanes.length > 0) {
      const fi = commonPlanes[0];
      const face = this.solid.faces[fi];
      const hits = Geo3D.intersectLineWithFacePolygon(pA.pos, pB.pos, face, this.solid.vertices);
      if (hits.length >= 2) {
        const pt1 = this._addOrGetTrainerPoint(hits[0].point, [fi]);
        const pt2 = this._addOrGetTrainerPoint(hits[1].point, [fi]);
        this.trainer.userLines.push({
          p1: Vec3.clone(pt1.pos),
          p2: Vec3.clone(pt2.pos),
          label1: pt1.label,
          label2: pt2.label,
          name: `отрезок ${pt1.label}${pt2.label}`,
          faceIndex: fi,
          planes: [fi],
          kind: 'segment',
          status: this.trainer.checkErrorsLive ? 'valid' : 'unchecked',
          isActuallyValid: true
        });
      }
    }

    this.setTrainerFeedback(
      `↔ Прямая ${pA.label}${pB.label} продлена за пределы грани! Теперь продлите нужное ребро (кликнув по нему) и найдите их пересечение инструментом «✕ Пересечение».`,
      'success'
    );
    this._checkIfTrainerCompletedSection();
    this._updateSceneAndUI();
  }

  // 3. Инструмент «✕ Точка пересечения двух прямых» (intersect) с проверкой СКРЕЩИВАЮЩИХСЯ прямых!
  handleIntersectLineClick(lineItem) {
    if (!this.trainer.selectedFirstLine) {
      this.trainer.selectedFirstLine = lineItem;
      this.renderer.selectedRefLine = lineItem;
      this._updateCancelBtnVisibility();
      this.setTrainerFeedback(
        `Выбрана первая прямая: ${lineItem.name}. Теперь кликните по второй прямой или ребру, с которым ищем пересечение (Esc — отмена).`,
        'info'
      );
      this.renderer.render();
      return;
    }

    const L1 = this.trainer.selectedFirstLine;
    const L2 = lineItem;
    this.cancelActiveSelection(false);

    if (L1.id === L2.id) return;

    // Проверим, пересекаются ли прямые L1 и L2 в 3D (лежат ли в одной плоскости!)
    const inter = Geo3D.intersectCoplanarLines(L1.p1_3d, L1.p2_3d, L2.p1_3d, L2.p2_3d, 2.5e-2);

    if (!inter) {
      // Либо параллельны, либо СКРЕЩИВАЮТСЯ!
      const dir1 = Vec3.sub(L1.p2_3d, L1.p1_3d);
      const dir2 = Vec3.sub(L2.p2_3d, L2.p1_3d);
      if (Vec3.isParallel(dir1, dir2, 1e-2)) {
        this.setTrainerFeedback(
          `⚠️ Прямые «${L1.name}» и «${L2.name}» параллельны — они не пересекаются!`,
          'warning'
        );
      } else {
        // СКРЕЩИВАЮЩИЕСЯ ПРЯМЫЕ!
        const planes1 = (L1.planes || []).map(fi => this.solid.faces[fi]?.name).filter(Boolean).join(', ');
        const planes2 = (L2.planes || []).map(fi => this.solid.faces[fi]?.name).filter(Boolean).join(', ');
        this.setTrainerFeedback(
          `❌ Ошибка (Скрещивающиеся прямые)! «${L1.name}» ${planes1 ? `(в ${planes1})` : ''} и «${L2.name}» ${planes2 ? `(в ${planes2})` : ''} ` +
          `НЕ лежат в одной плоскости! Они скрещиваются в пространстве и проходят мимо друг друга (на плоском чертеже их пересечение только кажущееся).`,
          'error'
        );
      }
      return;
    }

    const hitPos = inter.point;
    const distFromCenter = Vec3.dist(hitPos, this.solid.center);
    if (distFromCenter > 13.0) {
      this.setTrainerFeedback(
        `⚠️ Точка пересечения прямых «${L1.name}» и «${L2.name}» находится слишком далеко за пределами чертежа (почти параллельны). Попробуйте другой след или параллельный перенос.`,
        'warning'
      );
      return;
    }

    // Объединим плоскости обеих прямых для новой точки пересечения
    const combinedPlanes = Array.from(new Set([...(L1.planes || []), ...(L2.planes || [])]));
    const isInsideSolid = distFromCenter <= 2.3;
    const role = isInsideSolid ? 'internal' : 'trace';

    const newPt = this._addOrGetTrainerPoint(hitPos, combinedPlanes, role);

    // Аккуратно дотянем пунктирные линии от L1 и L2 до найденной точки пересечения newPt, чтобы чертёж был наглядным
    this.trainer.userLines.push({
      p1: Vec3.clone(L1.p1_3d),
      p2: Vec3.clone(newPt.pos),
      name: `луч до ${newPt.label}`,
      faceIndex: L1.planes && L1.planes[0] !== undefined ? L1.planes[0] : -1,
      planes: L1.planes || [],
      kind: 'ray',
      status: 'unchecked',
      isActuallyValid: true
    });
    this.trainer.userLines.push({
      p1: Vec3.clone(L2.p1_3d),
      p2: Vec3.clone(newPt.pos),
      name: `пр. до ${newPt.label}`,
      faceIndex: L2.planes && L2.planes[0] !== undefined ? L2.planes[0] : -1,
      planes: L2.planes || [],
      kind: 'edgeExtend',
      status: 'unchecked',
      isActuallyValid: true
    });

    const planeNames = combinedPlanes.map(fi => this.solid.faces[fi]?.name).filter(Boolean).join(' и ');
    this.setTrainerFeedback(
      `✅ Найдена точка пересечения ${newPt.label} = (${L1.name}) ∩ (${L2.name})! ` +
      (planeNames ? `Точка ${newPt.label} принадлежит плоскостям ${planeNames}.` : ''),
      'success'
    );
    this._updateSceneAndUI();
  }

  // 4. Инструмент «∥ Параллельный перенос» в 3 явных шага:
  // Шаг 1: Выбор прямой-образца (отрезка сечения или ребра)
  // Шаг 2: Выбор точки, через которую проводим прямую
  // Шаг 3: Прямой выбор ПЛОСКОСТИ (ГРАНИ), в которой проводим параллельную прямую!
  handleParallelToolLineClick(lineItem) {
    this.trainer.parallelRefLine = lineItem;
    this.trainer.parallelThroughPoint = null;
    this.renderer.selectedRefLine = lineItem;
    this.renderer.selectedToolPoint = null;
    this._updateCancelBtnVisibility();
    this._renderParallelFacePickerBar(false);

    this.setTrainerFeedback(
      `∥ Шаг 1/3 выполнен: выбрана прямая-образец «${lineItem.name}». Теперь (Шаг 2/3) кликните по ТОЧКЕ, через которую проводим параллельную прямую (Esc — отмена).`,
      'info'
    );
    this.renderer.render();
  }

  handleParallelToolPointClick(ptObj) {
    if (!this.trainer.parallelRefLine) {
      this.setTrainerFeedback(
        `⚠️ Сначала (Шаг 1/3) кликните по ПРЯМОЙ-ОБРАЗЦУ (построенному отрезку сечения или ребру многогранника), параллельно которой нужно провести линию!`,
        'warning'
      );
      return;
    }

    this.trainer.parallelThroughPoint = ptObj;
    this.renderer.selectedToolPoint = ptObj;
    this._updateCancelBtnVisibility();
    this._renderParallelFacePickerBar(true);

    this.setTrainerFeedback(
      `∥ Шаг 2/3 выполнен: выбрана точка ${ptObj.label}. Теперь (Шаг 3/3) ВЫБЕРИТЕ ПЛОСКОСТЬ (ГРАНЬ), на которую идёт параллельный перенос (кликните по грани на фигуре или кнопке выше)!`,
      'info'
    );
    this.renderer.render();
  }

  _completeTrainerParallelOnFace(targetFaceIdx) {
    const refLine = this.trainer.parallelRefLine;
    const ptStart = this.trainer.parallelThroughPoint;
    if (!refLine || !ptStart || !this.solid || !this.solid.faces[targetFaceIdx]) return;

    const targetFace = this.solid.faces[targetFaceIdx];
    const refDir = Vec3.normalize(Vec3.sub(refLine.p2_3d, refLine.p1_3d));

    // Проверка 1: Лежит ли точка ptStart в выбранной грани targetFace?
    const pointInTargetFace = ptStart.planes && ptStart.planes.includes(targetFaceIdx);
    if (!pointInTargetFace && this.trainer.checkErrorsLive) {
      const ptFaceNames = (ptStart.faces || []).map(fi => this.solid.faces[fi]?.name).join(', ');
      this.setTrainerFeedback(
        `❌ Ошибка выбора плоскости! Точка ${ptStart.label} НЕ принадлежит грани ${targetFace.name} (она лежит в: ${ptFaceNames}). ` +
        `Выберите ту грань, в которой лежит точка ${ptStart.label}!`,
        'error'
      );
      return;
    }

    // Проверка 2: Параллельна ли прямая-образец выбранной грани targetFace? (n_face · refDir == 0)
    const dotNormalDir = Math.abs(Vec3.dot(targetFace.normal, refDir));
    if (dotNormalDir > 1e-2 && this.trainer.checkErrorsLive) {
      const refFaces = (refLine.planes || []).map(fi => this.solid.faces[fi]?.name).join(', ');
      this.setTrainerFeedback(
        `❌ Ошибка! Вы выбрали грань ${targetFace.name}, но прямая-образец «${refLine.name}» ${refFaces ? `(из грани ${refFaces})` : ''} ` +
        `НЕ параллельна плоскости грани ${targetFace.name} (грани не параллельны)! Выберите грань, параллельную «${refLine.name}».`,
        'error'
      );
      return;
    }

    // Вычислим пересечение прямой, проходящей через ptStart параллельно refDir, с контуром грани targetFace
    const secondPos = Vec3.add(ptStart.pos, refDir);
    const hits = Geo3D.intersectLineWithFacePolygon(ptStart.pos, secondPos, targetFace, this.solid.vertices);

    if (hits.length < 2) {
      this.setTrainerFeedback(
        `⚠️ Прямая через точку ${ptStart.label} в направлении «${refLine.name}» не пересекает внутренность грани ${targetFace.name}. Проверьте выбранную грань.`,
        'warning'
      );
      return;
    }

    const pt1 = this._addOrGetTrainerPoint(hits[0].point, [targetFaceIdx]);
    const pt2 = this._addOrGetTrainerPoint(hits[1].point, [targetFaceIdx]);

    const inTruePlane =
      Geo3D.isPointInPlane(this.construction.plane, pt1.pos, 1e-2) &&
      Geo3D.isPointInPlane(this.construction.plane, pt2.pos, 1e-2) &&
      dotNormalDir <= 1e-2;

    this.trainer.userLines.push({
      p1: Vec3.clone(pt1.pos),
      p2: Vec3.clone(pt2.pos),
      label1: pt1.label,
      label2: pt2.label,
      name: `отрезок ${pt1.label}${pt2.label}`,
      faceIndex: targetFaceIdx,
      planes: [targetFaceIdx],
      kind: 'segment',
      status: this.trainer.checkErrorsLive ? 'valid' : 'unchecked',
      isActuallyValid: inTruePlane,
      errorReason: inTruePlane ? '' : `Отрезок ${pt1.label}${pt2.label} построен с нарушением условия параллельности.`
    });

    this.cancelActiveSelection(false);
    this.setTrainerFeedback(
      `✅ Отлично! В плоскости грани ${targetFace.name} через точку ${ptStart.label} проведён отрезок сечения ${pt1.label}${pt2.label} ∥ ${refLine.name}!`,
      'success'
    );
    this._checkIfTrainerCompletedSection();
    this._updateSceneAndUI();
  }

  // 5. Инструмент «🧽 Ластик» (удаление конкретной линии кликом по ней)
  handleEraserLineClick(lineItem) {
    if (lineItem.sourceType !== 'userLine') {
      this.setTrainerFeedback('Рёбра самой фигуры стирать нельзя — кликните по проведённой линии построения.', 'warning');
      return;
    }
    const idx = lineItem.userLineIndex;
    if (idx >= 0 && idx < this.trainer.userLines.length) {
      const removed = this.trainer.userLines.splice(idx, 1)[0];
      this.trainer.completedPolygon = null;
      this.setTrainerFeedback(`🧽 Удалена линия: ${removed.name || ''}.`, 'info');
      this._updateSceneAndUI();
    }
  }

  _addOrGetTrainerPoint(pos, extraPlanes = [], role = 'section') {
    for (const up of this.trainer.userPoints) {
      if (Vec3.equals(up.pos, pos, 1e-2)) {
        extraPlanes.forEach(fi => {
          if (fi !== undefined && !up.planes.includes(fi)) up.planes.push(fi);
        });
        return up;
      }
    }

    let label = null;
    if (this.construction && this.construction.steps.length > 0) {
      const lastStep = this.construction.steps[this.construction.steps.length - 1];
      for (const refPt of lastStep.points) {
        if (Vec3.equals(refPt.pos, pos, 1e-2)) {
          label = refPt.label;
          break;
        }
      }
    }
    if (!label) {
      const infoVertex = classifyPointOnSolid(this.solid, pos);
      if (infoVertex.vertexIndex >= 0) {
        label = this.solid.vertexNames[infoVertex.vertexIndex];
      } else {
        const idx = this.trainer.userPoints.length + 1;
        label = role === 'trace' ? `E${idx}` : role === 'internal' ? `O${idx}` : `T${idx}`;
      }
    }

    const info = classifyPointOnSolid(this.solid, pos);
    const planes = Array.from(new Set([...info.planes, ...extraPlanes.filter(x => x !== undefined)]));

    const newPt = {
      label,
      pos: Vec3.clone(pos),
      role,
      faces: info.faces,
      planes,
      edges: info.edges
    };
    this.trainer.userPoints.push(newPt);
    return newPt;
  }

  _checkIfTrainerCompletedSection() {
    if (!this.construction || !this.construction.completedPolygon) return false;
    const targetSegCount = this.construction.completedPolygon.points.length;
    const validUserSegs = this.trainer.userLines.filter(
      l => l.kind === 'segment' && l.isActuallyValid
    );

    if (validUserSegs.length >= targetSegCount) {
      this.trainer.completedPolygon = this.construction.completedPolygon;
      this.setTrainerFeedback(
        `🎉 Поздравляем! Все ${targetSegCount} стороны сечения построены верно! Сечение — ${this.construction.completedPolygon.metrics.shapeName.toLowerCase()} ${this.construction.completedPolygon.polygonName}.`,
        'success'
      );
      return true;
    }
    return false;
  }

  verifyStudentDrawing() {
    const segs = this.trainer.userLines.filter(l => l.kind === 'segment');
    if (segs.length === 0) {
      this.setTrainerFeedback('На чертеже пока не проведено ни одного отрезка сечения для проверки.', 'warning');
      return;
    }

    let invalidCount = 0;
    let firstErrorReason = '';
    segs.forEach(s => {
      if (s.isActuallyValid) {
        s.status = 'valid';
      } else {
        s.status = 'invalid';
        invalidCount++;
        if (!firstErrorReason) firstErrorReason = s.errorReason;
      }
    });

    if (invalidCount > 0) {
      this.setTrainerFeedback(
        `⚠️ Найдено ошибок: ${invalidCount}. ${firstErrorReason} Нажмите «🔓 Фигура закреплена», чтобы повернуть 3D-фигуру и увидеть ошибку в пространстве!`,
        'error'
      );
    } else {
      const done = this._checkIfTrainerCompletedSection();
      if (!done) {
        const totalNeeded = this.construction.completedPolygon.points.length;
        this.setTrainerFeedback(
          `✅ Все проведённые стороны сечения (${segs.length} из ${totalNeeded}) верны! Продолжайте построение.`,
          'success'
        );
      }
    }
    this._updateSceneAndUI();
  }

  showTrainerHint() {
    if (!this.construction || !this.construction.steps) return;
    for (let i = 1; i < this.construction.steps.length; i++) {
      const st = this.construction.steps[i];
      if (st.newSegmentIndex >= 0) {
        const refSeg = st.segments[st.newSegmentIndex];
        const alreadyBuilt = this.trainer.userLines.some(
          l =>
            l.kind === 'segment' &&
            ((Vec3.equals(l.p1, refSeg.p1, 1e-2) && Vec3.equals(l.p2, refSeg.p2, 1e-2)) ||
              (Vec3.equals(l.p1, refSeg.p2, 1e-2) && Vec3.equals(l.p2, refSeg.p1, 1e-2)))
        );
        if (!alreadyBuilt) {
          this.setTrainerFeedback(`💡 Подсказка (${st.ruleCategory}): ${st.explanation}`, 'info');
          return;
        }
      }
    }
    this.setTrainerFeedback('💡 Все стороны сечения уже построены!', 'success');
  }

  // ==========================================================================
  // Управление шагами в режиме «Пошаговое объяснение»
  // ==========================================================================
  goToStep(idx) {
    if (!this.construction || !this.construction.steps) return;
    const maxIdx = this.construction.steps.length - 1;
    this.currentStepIndex = Math.max(0, Math.min(maxIdx, idx));
    this._updateSceneAndUI();
  }

  nextStep() {
    if (!this.construction || !this.construction.steps) return;
    if (this.currentStepIndex < this.construction.steps.length - 1) {
      this.currentStepIndex++;
      this._updateSceneAndUI();
    } else {
      this.stopAutoPlay();
    }
  }

  prevStep() {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
      this._updateSceneAndUI();
    }
  }

  toggleAutoPlay() {
    if (this.playTimer) {
      this.stopAutoPlay();
      return;
    }
    if (this.currentStepIndex >= this.construction.steps.length - 1) {
      this.currentStepIndex = 0;
      this._updateSceneAndUI();
    }
    const playBtn = document.getElementById('stepAutoPlayBtn');
    if (playBtn) playBtn.textContent = '⏸ Пауза';

    this.playTimer = setInterval(() => {
      if (this.currentStepIndex < this.construction.steps.length - 1) {
        this.nextStep();
      } else {
        this.stopAutoPlay();
      }
    }, 2200);
  }

  stopAutoPlay() {
    if (this.playTimer) {
      clearInterval(this.playTimer);
      this.playTimer = null;
    }
    const playBtn = document.getElementById('stepAutoPlayBtn');
    if (playBtn) playBtn.textContent = '▶ Авто-показ';
  }

  _updateSceneAndUI() {
    if (!this.construction || !this.construction.valid) {
      this.renderer.setScene({ solid: this.solid, step: null, completedPolygon: null });
      const titleEl = document.getElementById('stepTitleText');
      const explEl = document.getElementById('stepExplanationText');
      if (titleEl) titleEl.textContent = 'Плоскость не определена';
      if (explEl) explEl.textContent = (this.construction && this.construction.error) || '';
      return;
    }

    const steps = this.construction.steps;
    const currentStep =
      this.appMode === 'explain' ? steps[this.currentStepIndex] : steps[0];

    const completedPolygon =
      this.appMode === 'explain'
        ? currentStep.completedPolygon || this.construction.completedPolygon
        : this.trainer.completedPolygon;

    this.renderer.setScene({
      solid: this.solid,
      step: currentStep,
      trainerData: this.appMode !== 'explain' ? this.trainer : null,
      completedPolygon
    });

    if (this.appMode === 'explain' && currentStep) {
      document.getElementById('stepCounterBadge').textContent =
        `Шаг ${this.currentStepIndex + 1} из ${steps.length}`;
      const catBadge = document.getElementById('stepCategoryBadge');
      catBadge.textContent = currentStep.ruleCategory;
      catBadge.style.backgroundColor = currentStep.ruleColor;

      document.getElementById('stepTitleText').textContent = currentStep.title;
      document.getElementById('stepExplanationText').textContent = currentStep.explanation;
      document.getElementById('stepRuleFormulaText').textContent = `📐 Правило: ${currentStep.ruleFormula}`;

      const stepListEl = document.getElementById('stepsTimelineList');
      if (stepListEl) {
        stepListEl.innerHTML = '';
        steps.forEach((st, idx) => {
          const item = document.createElement('div');
          item.className = `timeline-step-item ${idx === this.currentStepIndex ? 'active' : ''} ${idx < this.currentStepIndex ? 'done' : ''}`;
          item.innerHTML = `
            <span class="step-num">${idx + 1}</span>
            <div class="step-info">
              <div class="step-item-title">${st.title}</div>
              <span class="step-item-tag" style="color:${st.ruleColor}">${st.ruleCategory}</span>
            </div>
          `;
          item.addEventListener('click', () => this.goToStep(idx));
          stepListEl.appendChild(item);
        });
      }
    }

    this._updateMetricsPanel(completedPolygon || this.construction.completedPolygon);
  }

  _updateMetricsPanel(poly) {
    const shapeEl = document.getElementById('metricShapeName');
    const verticesEl = document.getElementById('metricVerticesCount');
    const areaEl = document.getElementById('metricArea');
    const perimEl = document.getElementById('metricPerimeter');
    const angleEl = document.getElementById('metricDihedralAngle');

    if (!poly || !poly.metrics) {
      if (shapeEl) shapeEl.textContent = '—';
      if (verticesEl) verticesEl.textContent = '—';
      if (areaEl) areaEl.textContent = '—';
      if (perimEl) perimEl.textContent = '—';
      if (angleEl) angleEl.textContent = '—';
      return;
    }

    const m = poly.metrics;
    if (shapeEl) shapeEl.textContent = `${m.shapeName} ${poly.polygonName || ''}`;
    if (verticesEl) verticesEl.textContent = poly.isCurve ? 'Гладкая кривая' : `${m.n} (${(poly.labels || []).join(', ')})`;
    if (areaEl) areaEl.textContent = m.area.toFixed(2);
    if (perimEl) perimEl.textContent = m.perimeter.toFixed(2);
    if (angleEl) angleEl.textContent = `${m.dihedralAngleDeg.toFixed(1)}°`;
  }

  exportPNG() {
    const dataUrl = this.renderer.canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `Сечение_${this.currentSolidId}_${Date.now()}.png`;
    a.click();
  }

  async copyCanvasToClipboard() {
    const btn = document.getElementById('copyClipboardBtn');
    try {
      const blob = await new Promise(resolve => this.renderer.canvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      if (btn) {
        const old = btn.textContent;
        btn.textContent = '✅ Скопировано!';
        setTimeout(() => { btn.textContent = old; }, 2000);
      }
    } catch (e) {
      this.exportPNG();
    }
  }

  // ==========================================================================
  // Привязка всех элементов управления UI
  // ==========================================================================
  _bindUIEvents() {
    document.querySelectorAll('.mode-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setAppMode(btn.dataset.mode));
    });

    const solidSelect = document.getElementById('solidSelect');
    if (solidSelect) {
      solidSelect.addEventListener('change', e => {
        this.currentSolidId = e.target.value;
        this.rebuildSolidAndSection(true);
      });
    }

    const presetSelect = document.getElementById('presetSelect');
    if (presetSelect) {
      presetSelect.addEventListener('change', e => {
        if (e.target.value) this.loadPreset(e.target.value);
      });
    }

    const bindDim = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', e => {
        this.solidCustomOpts[key] = parseFloat(e.target.value);
        this.rebuildSolidAndSection(false);
      });
    };
    bindDim('scaleWSlider', 'scaleW');
    bindDim('scaleHSlider', 'scaleH');
    bindDim('tiltXSlider', 'tiltX');
    bindDim('customNSlider', 'customN');

    const specModeSel = document.getElementById('specModeSelect');
    if (specModeSel) {
      specModeSel.addEventListener('change', e => {
        this.spec.mode = e.target.value;
        this._syncSpecModeUI();
        this.recomputeConstruction(true);
      });
    }

    const stratSel = document.getElementById('strategySelect');
    if (stratSel) {
      stratSel.addEventListener('change', e => {
        this.spec.strategy = e.target.value;
        this.recomputeConstruction(false);
      });
    }

    const parEdgeSel = document.getElementById('parallelEdgeSelect');
    if (parEdgeSel) {
      parEdgeSel.addEventListener('change', e => {
        this.spec.parallelEdgeIndex = parseInt(e.target.value, 10);
        this.recomputeConstruction(false);
      });
    }

    const parFaceSel = document.getElementById('parallelFaceSelect');
    if (parFaceSel) {
      parFaceSel.addEventListener('change', e => {
        this.spec.parallelFaceIndex = parseInt(e.target.value, 10);
        this.recomputeConstruction(false);
      });
    }

    ['M', 'N', 'K'].forEach((lbl, idx) => {
      const edgeSel = document.getElementById(`edgeSelect_${lbl}`);
      if (edgeSel) {
        edgeSel.addEventListener('change', e => {
          this.spec.points[idx].edgeIndex = parseInt(e.target.value, 10);
          this.recomputeConstruction(false);
        });
      }

      const slider = document.getElementById(`ratioSlider_${lbl}`);
      if (slider) {
        slider.addEventListener('input', e => {
          const val = parseFloat(e.target.value);
          this.spec.points[idx].t = val;
          const badge = document.getElementById(`ratioBadge_${lbl}`);
          if (badge) badge.textContent = Geo3D.formatRatio(val);
          this.recomputeConstruction(false);
        });
      }

      document.querySelectorAll(`.quick-ratio-btn[data-pt="${lbl}"]`).forEach(btn => {
        btn.addEventListener('click', () => {
          const val = parseFloat(btn.dataset.t);
          this.spec.points[idx].t = val;
          if (slider) slider.value = val;
          const badge = document.getElementById(`ratioBadge_${lbl}`);
          if (badge) badge.textContent = Geo3D.formatRatio(val);
          this.recomputeConstruction(false);
        });
      });

      const pickBtn = document.getElementById(`pickSlotBtn_${lbl}`);
      if (pickBtn) {
        pickBtn.addEventListener('click', () => {
          this.activeGivenPointSlot = idx;
          document.querySelectorAll('.pick-slot-btn').forEach((b, bi) => {
            b.classList.toggle('active', bi === idx);
          });
        });
      }
    });

    const revModeSel = document.getElementById('revModeSelect');
    if (revModeSel) {
      revModeSel.addEventListener('change', e => {
        this.spec.revMode = e.target.value;
        this.recomputeConstruction(true);
      });
    }
    const revDSlider = document.getElementById('revOffsetDSlider');
    if (revDSlider) {
      revDSlider.addEventListener('input', e => {
        this.spec.offsetD = parseFloat(e.target.value);
        this.recomputeConstruction(true);
      });
    }
    const revTiltSlider = document.getElementById('revTiltSlider');
    if (revTiltSlider) {
      revTiltSlider.addEventListener('input', e => {
        this.spec.tiltDeg = parseFloat(e.target.value);
        this.recomputeConstruction(true);
      });
    }

    const lockBtn = document.getElementById('lockCameraBtn');
    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        this.renderer.camera.locked = !this.renderer.camera.locked;
        this._syncLockButtonUI();
        this.renderer.render();
      });
    }

    // Маркер учителя поверх чертежа + скрываемая палитра цветов + ластик маркера
    const markerBtn = document.getElementById('toggleMarkerBtn');
    const markerPaletteBtn = document.getElementById('toggleMarkerPaletteBtn');
    const closeMarkerPaletteBtn = document.getElementById('closeMarkerPaletteBtn');
    const markerPaletteBar = document.getElementById('markerPaletteBar');
    const markerEraserBtn = document.getElementById('markerEraserBtn');
    const clearMarkerBtn = document.getElementById('clearMarkerBtn');

    const syncMarkerButtonsUI = () => {
      const hasStrokes = this.renderer.markerStrokes && this.renderer.markerStrokes.length > 0;
      const showTools = this.markerActive || this.markerEraserActive || hasStrokes;
      if (markerBtn) {
        markerBtn.classList.toggle('active-warn', this.markerActive);
        markerBtn.textContent = this.markerActive ? '🖍 Маркер: ВКЛ' : '🖍 Маркер';
      }
      if (markerEraserBtn) {
        markerEraserBtn.style.display = showTools ? 'inline-flex' : 'none';
        markerEraserBtn.classList.toggle('active-warn', this.markerEraserActive);
      }
      if (clearMarkerBtn) {
        clearMarkerBtn.style.display = showTools ? 'inline-flex' : 'none';
      }
    };
    this._syncMarkerButtonsUI = syncMarkerButtonsUI;

    if (markerBtn) {
      markerBtn.addEventListener('click', () => {
        this.markerActive = !this.markerActive;
        if (this.markerActive) this.markerEraserActive = false;
        syncMarkerButtonsUI();
      });
    }

    if (markerPaletteBtn && markerPaletteBar) {
      markerPaletteBtn.addEventListener('click', () => {
        const hidden = markerPaletteBar.style.display === 'none';
        markerPaletteBar.style.display = hidden ? 'flex' : 'none';
      });
    }
    if (closeMarkerPaletteBtn && markerPaletteBar) {
      closeMarkerPaletteBtn.addEventListener('click', () => {
        markerPaletteBar.style.display = 'none';
      });
    }

    document.querySelectorAll('.marker-color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        this.markerColor = sw.dataset.color || '#ef4444';
        this.markerActive = true;
        this.markerEraserActive = false;
        document.querySelectorAll('.marker-color-swatch').forEach(b => b.classList.toggle('active', b === sw));
        const dot = document.getElementById('currentMarkerColorDot');
        if (dot) dot.style.background = this.markerColor;
        syncMarkerButtonsUI();
      });
    });

    const customColorInp = document.getElementById('markerCustomColorInput');
    if (customColorInp) {
      customColorInp.addEventListener('input', e => {
        this.markerColor = e.target.value;
        this.markerActive = true;
        this.markerEraserActive = false;
        document.querySelectorAll('.marker-color-swatch').forEach(b => b.classList.remove('active'));
        const dot = document.getElementById('currentMarkerColorDot');
        if (dot) dot.style.background = this.markerColor;
        syncMarkerButtonsUI();
      });
    }

    if (markerEraserBtn) {
      markerEraserBtn.addEventListener('click', () => {
        this.markerEraserActive = !this.markerEraserActive;
        if (this.markerEraserActive) this.markerActive = false;
        syncMarkerButtonsUI();
      });
    }

    if (clearMarkerBtn) {
      clearMarkerBtn.addEventListener('click', () => {
        this.renderer.markerStrokes = [];
        this.markerEraserActive = false;
        syncMarkerButtonsUI();
        this.renderer.render();
      });
    }

    // Показ / скрытие вспомогательных проецирующих плоскостей, чтобы они не мешали после построения следа
    const auxPlanesBtn = document.getElementById('toggleAuxPlanesBtn');
    if (auxPlanesBtn) {
      auxPlanesBtn.addEventListener('click', () => {
        this.renderer.style.showAuxPlanes = !this.renderer.style.showAuxPlanes;
        const on = this.renderer.style.showAuxPlanes;
        auxPlanesBtn.classList.toggle('active-warn', on);
        auxPlanesBtn.textContent = on ? '👁 Вспом. плоскость: Видна' : '👁 Вспом. плоскость: Скрыта';
        this.renderer.render();
      });
    }

    const projBtn = document.getElementById('toggleProjectionBtn');
    if (projBtn) {
      projBtn.addEventListener('click', () => {
        this.renderer.camera.isOrtho = !this.renderer.camera.isOrtho;
        projBtn.textContent = this.renderer.camera.isOrtho ? '📐 Проекция: Учебник (Орто)' : '🔭 Проекция: Перспектива';
        this.renderer.render();
      });
    }

    // Показ/скрытие долей/координат точек (1:1, 1:2) на 3D-чертеже
    const ratioLblBtn = document.getElementById('toggleRatioLabelsBtn');
    if (ratioLblBtn) {
      ratioLblBtn.addEventListener('click', () => {
        this.renderer.style.showRatioLabels = !this.renderer.style.showRatioLabels;
        const on = this.renderer.style.showRatioLabels;
        ratioLblBtn.classList.toggle('active-warn', on);
        ratioLblBtn.textContent = on ? '🏷 Доли точек: Видны' : '🏷 Доли точек: Скрыты';
        this.renderer.render();
      });
    }

    // Скрытие/показ боковых панелей ("Широкий чертёж")
    const wideBtn = document.getElementById('toggleSidebarsBtn');
    if (wideBtn) {
      wideBtn.addEventListener('click', () => {
        const isWide = document.body.classList.toggle('wide-viewport');
        wideBtn.classList.toggle('active-warn', isWide);
        wideBtn.textContent = isWide ? '⛶ Вернуть панели' : '⛶ Широкий чертёж';
        setTimeout(() => this.renderer.resize(), 30);
      });
    }

    // Скрытие/показ блока координат/положения точек M, N, K в левой панели
    const ptsBlockBtn = document.getElementById('togglePointsBlockBtn');
    const ptsBlockContent = document.getElementById('pointsBlockContent');
    if (ptsBlockBtn && ptsBlockContent) {
      ptsBlockBtn.addEventListener('click', () => {
        const hidden = ptsBlockContent.style.display === 'none';
        ptsBlockContent.style.display = hidden ? 'block' : 'none';
        ptsBlockBtn.textContent = hidden ? 'Скрыть точки ▲' : 'Показать точки ▼';
      });
    }

    // Скрытие/показ памятки управления мышью и клавишами (ЛКМ, Esc и т.д.)
    const hintBtn = document.getElementById('toggleMouseHintBtn');
    const closeHintBtn = document.getElementById('closeMouseHintBtn');
    const hintPill = document.getElementById('mouseHintPill');
    if (hintBtn && hintPill) {
      hintBtn.addEventListener('click', () => {
        const hidden = hintPill.style.display === 'none';
        hintPill.style.display = hidden ? 'flex' : 'none';
      });
    }
    if (closeHintBtn && hintPill) {
      closeHintBtn.addEventListener('click', () => {
        hintPill.style.display = 'none';
      });
    }

    // Сворачивание текста шага и строки подсказки внизу, чтобы освободить место под 3D-чертёж
    const toggleExplBtn = document.getElementById('toggleExplainTextBtn');
    const stepContentBox = document.getElementById('stepContentBox');
    if (toggleExplBtn && stepContentBox) {
      toggleExplBtn.addEventListener('click', () => {
        const hidden = stepContentBox.style.display === 'none';
        stepContentBox.style.display = hidden ? 'block' : 'none';
        toggleExplBtn.textContent = hidden ? '▼ Скрыть текст' : '▲ Показать текст';
        setTimeout(() => this.renderer.resize(), 30);
      });
    }

    const toggleTrTextBtn = document.getElementById('toggleTrainerTextBtn');
    const trFeedbackBox = document.getElementById('trainerFeedbackBox');
    if (toggleTrTextBtn && trFeedbackBox) {
      toggleTrTextBtn.addEventListener('click', () => {
        const hidden = trFeedbackBox.style.display === 'none';
        trFeedbackBox.style.display = hidden ? 'block' : 'none';
        toggleTrTextBtn.textContent = hidden ? '▼ Скрыть подсказку' : '▲ Показать подсказку';
        setTimeout(() => this.renderer.resize(), 30);
      });
    }

    const figModeSel = document.getElementById('figureStyleSelect');
    if (figModeSel) {
      figModeSel.addEventListener('change', e => {
        this.renderer.style.figureMode = e.target.value;
        this.renderer.render();
      });
    }

    const secFillSel = document.getElementById('sectionFillSelect');
    if (secFillSel) {
      secFillSel.addEventListener('change', e => {
        this.renderer.style.sectionFill = e.target.value;
        this.renderer.render();
      });
    }

    const themeBtn = document.getElementById('toggleThemeBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const isDark = this.renderer.style.theme === 'dark';
        this.renderer.style.theme = isDark ? 'light' : 'dark';
        document.body.classList.toggle('dark-theme', !isDark);
        themeBtn.textContent = !isDark ? '☀️ Светлая (Тетрадь)' : '🌙 Тёмная (Доска)';
        this.renderer.render();
      });
    }

    document.querySelectorAll('.cam-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => this.renderer.setCameraPreset(btn.dataset.cam));
    });

    const expBtn = document.getElementById('exportPngBtn');
    if (expBtn) expBtn.addEventListener('click', () => this.exportPNG());

    const copyBtn = document.getElementById('copyClipboardBtn');
    if (copyBtn) copyBtn.addEventListener('click', () => this.copyCanvasToClipboard());

    document.getElementById('stepFirstBtn')?.addEventListener('click', () => this.goToStep(0));
    document.getElementById('stepPrevBtn')?.addEventListener('click', () => this.prevStep());
    document.getElementById('stepNextBtn')?.addEventListener('click', () => this.nextStep());
    document.getElementById('stepLastBtn')?.addEventListener('click', () => {
      if (this.construction && this.construction.steps) {
        this.goToStep(this.construction.steps.length - 1);
      }
    });
    document.getElementById('stepAutoPlayBtn')?.addEventListener('click', () => this.toggleAutoPlay());

    // Инструменты Тренажёра / Тетради
    document.querySelectorAll('.trainer-tool-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setTrainerTool(btn.dataset.tool));
    });

    document.getElementById('cancelSelectionBtn')?.addEventListener('click', () => {
      this.cancelActiveSelection(true);
    });

    const liveChk = document.getElementById('liveErrorCheckToggle');
    if (liveChk) {
      liveChk.addEventListener('change', e => {
        this.trainer.checkErrorsLive = e.target.checked;
        this.setTrainerFeedback(
          this.trainer.checkErrorsLive
            ? 'Проверка ошибок включена: программа сразу предупредит, если точки/прямые не лежат в одной плоскости.'
            : 'Проверка ошибок отключена (режим тетради): можно соединять любые точки, а затем нажать «✅ Проверить чертёж».',
          'info'
        );
      });
    }

    document.getElementById('trainerHintBtn')?.addEventListener('click', () => this.showTrainerHint());
    document.getElementById('trainerVerifyBtn')?.addEventListener('click', () => this.verifyStudentDrawing());
    document.getElementById('trainerUndoBtn')?.addEventListener('click', () => this.undoLastAction());
    document.getElementById('trainerResetBtn')?.addEventListener('click', () => this.resetTrainerState());

    // Переключение режима 2D-окна справа: «Само сечение 2D» vs «Вынос грани 2D»
    document.querySelectorAll('.tab-2d-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.view2d;
        this.renderer.view2DMode = mode;
        document.querySelectorAll('.tab-2d-btn').forEach(b => b.classList.toggle('active', b.dataset.view2d === mode));
        const faceRow = document.getElementById('select2DFaceRow');
        if (faceRow) faceRow.style.display = mode === 'face' ? 'flex' : 'none';
        this.renderer.render();
      });
    });

    const sel2DFace = document.getElementById('select2DFace');
    if (sel2DFace) {
      sel2DFace.addEventListener('change', e => {
        this.renderer.selected2DFaceIndex = parseInt(e.target.value, 10);
        this.renderer.render();
      });
    }
  }

  // ==========================================================================
  // Взаимодействие с 3D-холстом
  // ==========================================================================
  _bindCanvasInteraction() {
    const canvas = this.renderer.canvas;
    let isDraggingCamera = false;
    let isPanningCamera = false;
    let isDrawingMarker = false;
    let lastX = 0;
    let lastY = 0;
    let downX = 0;
    let downY = 0;

    canvas.addEventListener('mousedown', e => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      downX = mx;
      downY = my;
      lastX = mx;
      lastY = my;

      // Правая кнопка мыши без сдвига отменяет выбор точки (как и Esc), либо панорамирует при перетаскивании
      if (e.button === 2 || e.shiftKey) {
        isPanningCamera = true;
        return;
      }

      // Если включён Ластик маркера — стираем штрихи маркера под курсором
      if (this.markerEraserActive) {
        isDrawingMarker = true;
        if (this.renderer.eraseMarkerStrokeAt(mx, my, 16)) {
          if (this._syncMarkerButtonsUI) this._syncMarkerButtonsUI();
          this.renderer.render();
        }
        return;
      }

      // Если включён Маркер учителя — рисуем поверх чертежа
      if (this.markerActive) {
        isDrawingMarker = true;
        this.renderer.currentMarkerStroke = {
          color: this.markerColor,
          points: [{ x: mx, y: my }]
        };
        if (this._syncMarkerButtonsUI) this._syncMarkerButtonsUI();
        this.renderer.render();
        return;
      }

      const tool = this.trainer.tool;
      const inTrainer = this.appMode === 'trainer' || this.appMode === 'notebook';

      // 1. В режиме тренажёра проверим специальные инструменты
      if (inTrainer && this.solid && this.solid.type === 'polyhedron') {
        // Инструмент «Ластик» (стирает и штрихи маркера, и линии построения)
        if (tool === 'eraser') {
          if (this.renderer.eraseMarkerStrokeAt(mx, my, 16)) {
            if (this._syncMarkerButtonsUI) this._syncMarkerButtonsUI();
            this.renderer.render();
            return;
          }
          const hitLine = this.renderer.hitTestLine(mx, my, true);
          if (hitLine) {
            this.handleEraserLineClick(hitLine);
            return;
          }
        }

        // Инструмент «Продлить плоскость грани» (клик прямо по грани)
        if (tool === 'extendFace') {
          const fi = this.renderer.hitTestFace(mx, my);
          if (fi >= 0) {
            this.toggleExtendedFace(fi);
            return;
          }
        }

        // Инструмент «Точка пересечения двух прямых»
        if (tool === 'intersect') {
          const hitLine = this.renderer.hitTestLine(mx, my, false);
          if (hitLine) {
            this.handleIntersectLineClick(hitLine);
            return;
          }
        }

        // Инструмент «Параллельный перенос» (3 шага)
        if (tool === 'parallel') {
          // Если мы на Шаге 3 (уже выбрана прямая-образец и точка) — клик по грани завершает перенос!
          if (this.trainer.parallelRefLine && this.trainer.parallelThroughPoint) {
            const fi = this.renderer.hitTestFace(mx, my);
            if (fi >= 0) {
              this._completeTrainerParallelOnFace(fi);
              return;
            }
          }
          // Проверим клик по точке (Шаг 2)
          const hitPt = this.renderer.hitTest(mx, my);
          if (hitPt && (hitPt.type === 'point' || hitPt.type === 'vertex')) {
            const ptObj = hitPt.type === 'point'
              ? hitPt.pointObj
              : this._addOrGetTrainerPoint(hitPt.pos, [], 'section');
            this.handleParallelToolPointClick(ptObj);
            return;
          }
          // Проверим клик по прямой-образцу или ребру (Шаг 1)
          const hitLine = this.renderer.hitTestLine(mx, my, false);
          if (hitLine) {
            this.handleParallelToolLineClick(hitLine);
            return;
          }
        }

        // Инструмент «Продлить ребро / прямую» (extendLine):
        // Если ещё не выбрана первая точка и кликнули прямо по РЕБРУ — продлеваем само это ребро!
        if (tool === 'extendLine') {
          const hit = this.renderer.hitTest(mx, my);
          if (!this.trainer.selectedFirstPoint && hit && hit.type === 'edge') {
            this.handleExtendEdgeDirect(hit.index);
            return;
          }
          if (hit && (hit.type === 'point' || hit.type === 'vertex')) {
            const ptObj = hit.type === 'point'
              ? hit.pointObj
              : this._addOrGetTrainerPoint(hit.pos, [], 'section');
            this.handleTwoPointToolClick(ptObj);
            return;
          }
        }

        // Инструменты по двум точкам: «Отрезок сечения» (segment), «Диагональ / Вспом. прямая» (auxLine) и «Вспом. плоскость (проекции)» (auxPlane)
        if (tool === 'segment' || tool === 'auxLine' || tool === 'auxPlane') {
          const hit = this.renderer.hitTest(mx, my);
          if (hit && hit.type === 'point') {
            this.handleTwoPointToolClick(hit.pointObj);
            return;
          }
          if (hit && hit.type === 'vertex') {
            const vPt = this._addOrGetTrainerPoint(hit.pos, [], 'section');
            this.handleTwoPointToolClick(vPt);
            return;
          }
          if (hit && hit.type === 'edge') {
            const ePt = this._addOrGetTrainerPoint(hit.pos, hit.edge.faces, 'section');
            this.handleTwoPointToolClick(ePt);
            return;
          }
        }
      }

      // 2. Перетаскивание заданной точки M, N или K по ребру
      const hit = this.renderer.hitTest(mx, my);
      if (hit && hit.type === 'point' && (this.appMode === 'explain' || tool === 'movePoint')) {
        const slotIdx = ['M', 'N', 'K'].indexOf(hit.label);
        if (slotIdx >= 0) {
          this.draggingPointSlot = slotIdx;
          this.activeGivenPointSlot = slotIdx;
          return;
        }
      }

      // 3. Вращение камеры (если не закреплена замочком)
      if (!this.renderer.camera.locked) {
        isDraggingCamera = true;
      }
    });

    window.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (isDrawingMarker && this.markerEraserActive) {
        if (this.renderer.eraseMarkerStrokeAt(mx, my, 16)) {
          if (this._syncMarkerButtonsUI) this._syncMarkerButtonsUI();
          this.renderer.render();
        }
        return;
      }

      if (isDrawingMarker && this.renderer.currentMarkerStroke) {
        this.renderer.currentMarkerStroke.points.push({ x: mx, y: my });
        this.renderer.render();
        return;
      }

      if (this.draggingPointSlot >= 0 && this.solid && this.solid.edges) {
        const hit = this.renderer.hitTest(mx, my);
        if (hit && hit.type === 'edge') {
          const ptSpec = this.spec.points[this.draggingPointSlot];
          ptSpec.edgeIndex = hit.index;
          ptSpec.t = hit.t;
          this._populatePointEdgeSelects();
          this.recomputeConstruction(false);
        } else {
          const ptSpec = this.spec.points[this.draggingPointSlot];
          const eItem = this.renderer._projCache.edges[ptSpec.edgeIndex];
          if (eItem) {
            const vx = eItem.p2.x - eItem.p1.x;
            const vy = eItem.p2.y - eItem.p1.y;
            const lenSq = vx * vx + vy * vy;
            if (lenSq > 4) {
              let t = ((mx - eItem.p1.x) * vx + (my - eItem.p1.y) * vy) / lenSq;
              t = Math.max(0.02, Math.min(0.98, t));
              const snaps = [0.5, 1 / 3, 2 / 3, 0.25, 0.75];
              for (const s of snaps) {
                if (Math.abs(t - s) < 0.03) { t = s; break; }
              }
              ptSpec.t = t;
              this._populatePointEdgeSelects();
              this.recomputeConstruction(false);
            }
          }
        }
        return;
      }

      if (isPanningCamera) {
        this.renderer.camera.panX += mx - lastX;
        this.renderer.camera.panY += my - lastY;
        lastX = mx;
        lastY = my;
        this.renderer.render();
        return;
      }

      if (isDraggingCamera && !this.renderer.camera.locked) {
        const dx = mx - lastX;
        const dy = my - lastY;
        this.renderer.camera.yaw -= dx * 0.0085;
        this.renderer.camera.pitch = Math.max(
          -1.45,
          Math.min(1.45, this.renderer.camera.pitch + dy * 0.0085)
        );
        lastX = mx;
        lastY = my;
        this.renderer.render();
        return;
      }

      // Подсветка элементов и граней под курсором мыши
      if (mx >= 0 && mx <= this.renderer.width && my >= 0 && my <= this.renderer.height) {
        const tool = this.trainer.tool;
        const inTrainer = this.appMode === 'trainer' || this.appMode === 'notebook';

        if (inTrainer && (tool === 'extendFace' || (tool === 'parallel' && this.trainer.parallelRefLine && this.trainer.parallelThroughPoint))) {
          this.renderer.hoveredFaceIndex = this.renderer.hitTestFace(mx, my);
          this.renderer.hoveredItem = null;
        } else if (inTrainer && (tool === 'intersect' || tool === 'eraser')) {
          this.renderer.hoveredFaceIndex = -1;
          this.renderer.hoveredItem = this.renderer.hitTestLine(mx, my, tool === 'eraser');
        } else {
          this.renderer.hoveredFaceIndex = -1;
          this.renderer.hoveredItem = this.renderer.hitTest(mx, my);
        }

        if (this.renderer.selectedToolPoint) {
          this.renderer.previewMousePos = { x: mx, y: my };
        }
        canvas.style.cursor =
          this.markerActive
            ? 'crosshair'
            : this.renderer.hoveredItem || this.renderer.hoveredFaceIndex >= 0
              ? 'pointer'
              : this.renderer.camera.locked
                ? 'crosshair'
                : 'grab';
        this.renderer.render();
      }
    });

    window.addEventListener('mouseup', e => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const movedDist = Math.hypot(mx - downX, my - downY);

      if (isDrawingMarker) {
        if (this.renderer.currentMarkerStroke) {
          this.renderer.markerStrokes.push(this.renderer.currentMarkerStroke);
          this.renderer.currentMarkerStroke = null;
        }
        isDrawingMarker = false;
        if (this._syncMarkerButtonsUI) this._syncMarkerButtonsUI();
        this.renderer.render();
        return;
      }

      // Короткий клик правой кнопкой мыши также отменяет выбранную точку (наравне с Esc!)
      if (e.button === 2 && movedDist < 5) {
        this.cancelActiveSelection(true);
      }

      // Короткий клик по ребру в режиме объяснения переставляет активную точку M, N или K
      if (
        e.button === 0 &&
        movedDist < 5 &&
        this.draggingPointSlot === -1 &&
        this.appMode === 'explain' &&
        this.solid &&
        this.solid.type === 'polyhedron'
      ) {
        const hit = this.renderer.hitTest(mx, my);
        if (hit && hit.type === 'edge') {
          const slot = this.activeGivenPointSlot;
          this.spec.points[slot].edgeIndex = hit.index;
          this.spec.points[slot].t = hit.t;
          this._populatePointEdgeSelects();
          this.recomputeConstruction(false);
        }
      }

      isDraggingCamera = false;
      isPanningCamera = false;
      this.draggingPointSlot = -1;
    });

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.09 : 0.92;
      this.renderer.camera.zoom = Math.max(0.25, Math.min(2.8, this.renderer.camera.zoom * factor));
      this.renderer.render();
    }, { passive: false });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new StereometryApp();
});
