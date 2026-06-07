// reflections.js — Two-panel: left unit selector, right detail view

(function () {
  'use strict';

  let units = [];
  let progressData = null;
  let selectedUnitId = null;
  let debounceTimer = null;

  async function init() {
    try {
      const resp = await fetch('data/units.json');
      if (!resp.ok) throw new Error('Failed to load');
      units = await resp.json();
    } catch (e) {
      document.body.innerHTML += '<div style="padding:4rem;color:red;">Error loading units data.</div>';
      return;
    }
    progressData = getProgress();

    // Default to first incomplete core unit, or first unit
    const current = getCurrentUnit(units, progressData);
    selectedUnitId = current ? current.id : (units[0] && units[0].id);

    render();
  }

  function render() {
    const existing = document.querySelector('.reflections-layout');
    if (existing) existing.remove();

    const layout = document.createElement('div');
    layout.className = 'reflections-layout';

    layout.appendChild(renderSidebar());
    layout.appendChild(renderDetail());

    document.body.appendChild(layout);
  }

  // ── Left Sidebar: Unit List ─────────────────────────────────
  function renderSidebar() {
    const sidebar = document.createElement('aside');
    sidebar.className = 'reflections-sidebar';

    const header = document.createElement('div');
    header.className = 'reflections-sidebar-header';
    header.textContent = 'UNITS';
    sidebar.appendChild(header);

    const list = document.createElement('div');
    list.className = 'reflections-unit-list';

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const cp = calculateUnitProgress(unit, progressData);
      const status = getUnitStatus(unit, progressData);

      const item = document.createElement('button');
      item.className = 'reflections-unit-item';
      if (unit.id === selectedUnitId) item.classList.add('is-active');

      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';

      const title = document.createElement('span');
      title.className = 'reflections-unit-title';
      title.textContent = unit.type === 'core' ? 'Unit ' + unit.number + ': ' + unit.title : unit.title;
      row.appendChild(title);

      const pct = document.createElement('span');
      pct.className = 'reflections-unit-pct';
      pct.textContent = cp.percentage + '%';
      row.appendChild(pct);

      item.appendChild(row);

      // Progress bar
      const barWrap = document.createElement('div');
      barWrap.className = 'reflections-unit-bar';
      const bar = document.createElement('div');
      bar.className = 'reflections-unit-bar-fill';
      bar.style.width = cp.percentage + '%';
      barWrap.appendChild(bar);
      item.appendChild(barWrap);

      item.addEventListener('click', function () {
        selectedUnitId = unit.id;
        render();
      });

      list.appendChild(item);
    }

    sidebar.appendChild(list);
    return sidebar;
  }

  // ── Right Panel: Detail View ────────────────────────────────
  function renderDetail() {
    const unit = units.find(function (u) { return u.id === selectedUnitId; }) || units[0];
    if (!unit) return document.createElement('main');

    const main = document.createElement('main');
    main.className = 'reflections-detail';
    main.appendChild(renderMobileUnitSelect(unit));

    // Title
    const header = document.createElement('div');
    header.className = 'reflections-detail-header';

    const title = document.createElement('h1');
    title.className = 'reflections-detail-title';
    title.textContent = unit.type === 'core' ? 'Unit ' + unit.number + ': ' + unit.title : unit.title;
    header.appendChild(title);

    const status = getUnitStatus(unit, progressData);
    const badge = document.createElement('span');
    badge.className = 'unit-status-badge';
    badge.style.color = getStatusColor(status);
    badge.textContent = getStatusLabel(status);
    header.appendChild(badge);

    main.appendChild(header);

    // Checkpoints Panel
    main.appendChild(renderCheckpointsPanel(unit));

    // Reflection Panel
    main.appendChild(renderReflectionPanel(unit));

    return main;
  }

  function renderMobileUnitSelect(unit) {
    const group = document.createElement('label');
    group.className = 'reflections-mobile-select mobile-select-group';

    const label = document.createElement('span');
    label.textContent = 'Unit';
    group.appendChild(label);

    const select = document.createElement('select');
    select.className = 'mobile-select';
    select.setAttribute('aria-label', 'Choose reflection unit');

    for (let i = 0; i < units.length; i++) {
      const option = document.createElement('option');
      option.value = units[i].id;
      option.textContent = units[i].type === 'core'
        ? units[i].number + '. ' + units[i].title
        : units[i].title;
      option.selected = units[i].id === unit.id;
      select.appendChild(option);
    }

    select.addEventListener('change', function () {
      selectedUnitId = select.value;
      render();
    });
    group.appendChild(select);
    return group;
  }

  function renderCheckpointsPanel(unit) {
    const panel = document.createElement('div');
    panel.className = 'reflections-panel';

    const title = document.createElement('div');
    title.className = 'reflections-panel-title';
    title.textContent = 'Reading Checkpoints';
    panel.appendChild(title);

    const list = document.createElement('ul');
    list.className = 'checkpoint-list';

    const unitData = progressData.units[unit.id];
    const completedIds = (unitData && unitData.completedCheckpoints) ? unitData.completedCheckpoints : [];

    for (let i = 0; i < unit.checkpoints.length; i++) {
      const cp = unit.checkpoints[i];
      const isDone = completedIds.indexOf(cp.id) !== -1;

      const item = document.createElement('li');
      item.className = 'checkpoint-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'checkpoint-checkbox';
      checkbox.checked = isDone;
      checkbox.addEventListener('change', function () {
        toggleCheckpoint(unit.id, cp.id);
        progressData = getProgress();
        render();
      });

      const label = document.createElement('label');
      label.className = 'checkpoint-label';
      if (isDone) label.classList.add('is-done');
      label.textContent = cp.title;
      label.addEventListener('click', function () {
        checkbox.checked = !checkbox.checked;
        toggleCheckpoint(unit.id, cp.id);
        progressData = getProgress();
        render();
      });

      item.appendChild(checkbox);
      item.appendChild(label);
      list.appendChild(item);
    }

    panel.appendChild(list);
    return panel;
  }

  function renderReflectionPanel(unit) {
    const panel = document.createElement('div');
    panel.className = 'reflections-panel';

    const title = document.createElement('div');
    title.className = 'reflections-panel-title';
    title.textContent = 'Reflection';
    panel.appendChild(title);

    const saveState = document.createElement('div');
    saveState.className = 'reflection-save-state';
    saveState.textContent = 'Saved locally';
    panel.appendChild(saveState);

    const fields = [
      { key: 'coreIdeas', label: 'Core Ideas', hint: unit.reflectionPrompts.coreIdeas },
      { key: 'myUnderstanding', label: 'My Understanding', hint: unit.reflectionPrompts.myUnderstanding },
      { key: 'bwRelevance', label: 'Black & White Relevance', hint: unit.reflectionPrompts.bwRelevance },
      { key: 'questions', label: 'Questions', hint: unit.reflectionPrompts.questions },
      { key: 'nextPractice', label: 'Next Practice', hint: unit.reflectionPrompts.nextPractice },
    ];

    const unitData = progressData.units[unit.id];
    const reflectionData = (unitData && unitData.reflection) ? unitData.reflection : {};

    // Create grid container for 2-column layout
    const grid = document.createElement('div');
    grid.className = 'reflections-grid';

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];

      const wrapper = document.createElement('div');
      wrapper.className = 'reflection-field';
      if (f.key === 'nextPractice') wrapper.classList.add('is-wide');

      const label = document.createElement('label');
      label.className = 'reflection-label';
      label.textContent = f.label;
      wrapper.appendChild(label);

      const hint = document.createElement('span');
      hint.className = 'reflection-hint';
      hint.textContent = f.hint;
      wrapper.appendChild(hint);

      const textarea = document.createElement('textarea');
      textarea.className = 'reflection-textarea';
      textarea.rows = 3;
      textarea.value = reflectionData[f.key] || '';

      textarea.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        saveState.textContent = 'Saving...';
        saveState.classList.add('is-active');
        debounceTimer = setTimeout(function () {
          saveReflection(unit.id, f.key, textarea.value);
          saveState.textContent = 'Saved locally';
          setTimeout(function () { saveState.classList.remove('is-active'); }, 1600);
        }, 600);
      });

      textarea.addEventListener('blur', function () {
        clearTimeout(debounceTimer);
        saveReflection(unit.id, f.key, textarea.value);
        progressData = getProgress();
      });

      wrapper.appendChild(textarea);

      grid.appendChild(wrapper);
    }

    panel.appendChild(grid);
    return panel;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('photoclass-sync-progress-updated', function () {
    progressData = getProgress();
    render();
  });
})();
