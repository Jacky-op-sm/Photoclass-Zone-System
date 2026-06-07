// unit.js — Unit detail page logic for PhotoClass: Zone System Study

(function () {
  'use strict';

  let unit = null;
  let progressData = null;
  let units = [];
  let debounceTimer = null;

  // ── Init ────────────────────────────────────────────────────
  async function init() {
    // Read unit id from query string
    const params = new URLSearchParams(window.location.search);
    const unitId = params.get('id');

    if (!unitId) {
      document.body.innerHTML = '<div class="unit-page"><p>No unit specified. <a href="./">Go to Dashboard</a></p></div>';
      return;
    }

    // Load units data
    try {
      const resp = await fetch('data/units.json');
      if (!resp.ok) throw new Error('Failed to load');
      units = await resp.json();
    } catch (e) {
      document.body.innerHTML = '<div class="unit-page"><p style="color:red;">Error loading units data.</p></div>';
      return;
    }

    // Find the unit
    unit = null;
    for (let i = 0; i < units.length; i++) {
      if (units[i].id === unitId) {
        unit = units[i];
        break;
      }
    }

    if (!unit) {
      document.body.innerHTML = '<div class="unit-page"><p>Unit not found: ' + unitId + '. <a href="./">Go to Dashboard</a></p></div>';
      return;
    }

    progressData = getProgress();
    document.title = 'Unit ' + unit.number + ': ' + unit.title + ' — PhotoClass';
    render();
  }

  // ── Render ──────────────────────────────────────────────────
  function render() {
    const page = document.createElement('div');
    page.className = 'unit-page';

    // Back link
    const back = document.createElement('a');
    back.className = 'back-link';
    back.href = './';
    back.innerHTML = '<span class="back-link-arrow">&larr;</span> Back to Dashboard';
    page.appendChild(back);

    // Header
    page.appendChild(renderHeader());

    // Open original chapter
    page.appendChild(renderOpenButton());

    // Checkpoints
    page.appendChild(renderCheckpoints());

    // Reflection
    page.appendChild(renderReflection());

    document.body.appendChild(page);
  }

  // ── Header ──────────────────────────────────────────────────
  function renderHeader() {
    const cp = calculateUnitProgress(unit, progressData);
    const status = getUnitStatus(unit, progressData);

    const header = document.createElement('div');
    header.className = 'unit-header';

    const number = document.createElement('div');
    number.className = 'unit-header-number';
    if (unit.type === 'core') {
      number.textContent = 'UNIT ' + unit.number;
    } else {
      number.textContent = 'REFERENCE';
    }
    header.appendChild(number);

    const title = document.createElement('h1');
    title.className = 'unit-header-title';
    title.textContent = unit.title;
    header.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'unit-header-meta';

    const badge = document.createElement('span');
    badge.className = 'unit-status-badge';
    badge.style.color = getStatusColor(status);
    badge.textContent = getStatusLabel(status);
    meta.appendChild(badge);

    if (unit.type === 'core') {
      const progressText = document.createElement('span');
      progressText.className = 'unit-progress-mini';
      progressText.innerHTML = '<span>' + cp.percentage + '%</span> — ' + cp.completed + '/' + cp.total + ' checkpoints';
      meta.appendChild(progressText);
    }

    header.appendChild(meta);

    // Progress bar for core units
    if (unit.type === 'core') {
      const barWrap = document.createElement('div');
      barWrap.style.marginTop = '0.8rem';

      const bar = document.createElement('div');
      bar.className = 'progress-bar';
      const fill = document.createElement('div');
      fill.className = 'progress-bar-fill';
      fill.style.width = cp.percentage + '%';
      bar.appendChild(fill);
      barWrap.appendChild(bar);
      header.appendChild(barWrap);
    }

    return header;
  }

  // ── Open chapter button ─────────────────────────────────────
  function renderOpenButton() {
    const btn = document.createElement('a');
    btn.className = 'btn-open-chapter';
    btn.href = 'reader.html?src=' + encodeURIComponent(unit.href) +
               '&title=' + encodeURIComponent('Unit ' + unit.number + ': ' + unit.title);
    btn.textContent = 'Open Chapter';
    return btn;
  }

  // ── Checkpoints ─────────────────────────────────────────────
  function renderCheckpoints() {
    const panel = document.createElement('div');
    panel.className = 'section-panel';

    const title = document.createElement('div');
    title.className = 'section-panel-title';
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
        updateUnitPageState();
      });

      const label = document.createElement('label');
      label.className = 'checkpoint-label';
      if (isDone) label.classList.add('is-done');
      label.textContent = cp.title;
      label.addEventListener('click', function () {
        checkbox.checked = !checkbox.checked;
        toggleCheckpoint(unit.id, cp.id);
        updateUnitPageState();
      });

      item.appendChild(checkbox);
      item.appendChild(label);
      list.appendChild(item);
    }

    panel.appendChild(list);
    return panel;
  }

  // ── Update page state after checkpoint toggle ───────────────
  function updateUnitPageState() {
    // Reload progress data
    progressData = getProgress();

    // Update unit status badge
    const status = getUnitStatus(unit, progressData);
    const badge = document.querySelector('.unit-status-badge');
    if (badge) {
      badge.style.color = getStatusColor(status);
      badge.textContent = getStatusLabel(status);
    }

    // Update progress text
    const cp = calculateUnitProgress(unit, progressData);
    const progressMini = document.querySelector('.unit-progress-mini');
    if (progressMini) {
      progressMini.innerHTML = '<span>' + cp.percentage + '%</span> — ' + cp.completed + '/' + cp.total + ' checkpoints';
    }

    // Update progress bar
    const fill = document.querySelector('.progress-bar-fill');
    if (fill) {
      fill.style.width = cp.percentage + '%';
    }

    // Update checkpoint checkmarks
    const unitData = progressData.units[unit.id];
    const completedIds = (unitData && unitData.completedCheckpoints) ? unitData.completedCheckpoints : [];
    const labels = document.querySelectorAll('.checkpoint-label');
    for (let i = 0; i < labels.length; i++) {
      const isDone = completedIds.indexOf(unit.checkpoints[i].id) !== -1;
      if (isDone) {
        labels[i].classList.add('is-done');
      } else {
        labels[i].classList.remove('is-done');
      }
    }
  }

  // ── Reflection ──────────────────────────────────────────────
  function renderReflection() {
    const panel = document.createElement('div');
    panel.className = 'section-panel';

    const title = document.createElement('div');
    title.className = 'section-panel-title';
    title.textContent = 'Reflection';
    panel.appendChild(title);

    const fields = [
      { key: 'coreIdeas', label: 'Core Ideas', hint: unit.reflectionPrompts.coreIdeas },
      { key: 'myUnderstanding', label: 'My Understanding', hint: unit.reflectionPrompts.myUnderstanding },
      { key: 'bwRelevance', label: 'Black & White Relevance', hint: unit.reflectionPrompts.bwRelevance },
      { key: 'questions', label: 'Questions', hint: unit.reflectionPrompts.questions },
      { key: 'nextPractice', label: 'Next Practice', hint: unit.reflectionPrompts.nextPractice },
    ];

    const reflectionData = getReflection(unit.id) || {};

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];

      const wrapper = document.createElement('div');
      wrapper.className = 'reflection-field';

      const label = document.createElement('label');
      label.className = 'reflection-label';
      label.textContent = field.label;
      label.htmlFor = 'reflection-' + field.key;
      wrapper.appendChild(label);

      const hint = document.createElement('span');
      hint.className = 'reflection-hint';
      hint.textContent = field.hint;
      wrapper.appendChild(hint);

      const textarea = document.createElement('textarea');
      textarea.className = 'reflection-textarea';
      textarea.id = 'reflection-' + field.key;
      textarea.rows = 3;
      textarea.value = reflectionData[field.key] || '';
      textarea.setAttribute('data-field', field.key);

      // Autosave with debounce
      textarea.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        const indicator = wrapper.querySelector('.reflection-save-indicator');
        if (indicator) indicator.textContent = 'Saving...';
        debounceTimer = setTimeout(function () {
          saveReflection(unit.id, field.key, textarea.value);
          if (indicator) {
            indicator.textContent = 'Saved ' + new Date().toLocaleTimeString();
            setTimeout(function () {
              if (indicator) indicator.style.opacity = '0';
            }, 2000);
          }
        }, 600);
      });

      // Restore saved indicator on blur
      textarea.addEventListener('blur', function () {
        clearTimeout(debounceTimer);
        saveReflection(unit.id, field.key, textarea.value);
      });

      wrapper.appendChild(textarea);

      const indicator = document.createElement('div');
      indicator.className = 'reflection-save-indicator';
      indicator.textContent = 'Changes are saved automatically';
      wrapper.appendChild(indicator);

      panel.appendChild(wrapper);
    }

    return panel;
  }

  // ── Start ───────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('photoclass-sync-progress-updated', function () {
    progressData = getProgress();
    document.body.querySelector('.unit-page')?.remove();
    if (unit) render();
  });
})();
