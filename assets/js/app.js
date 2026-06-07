// app.js — Dashboard logic for PhotoClass: Zone System Study

(function () {
  'use strict';

  let units = [];
  let progressData = null;

  // ── Init ────────────────────────────────────────────────────
  async function init() {
    try {
      const resp = await fetch('data/units.json');
      if (!resp.ok) throw new Error('Failed to load units.json');
      units = await resp.json();
    } catch (e) {
      document.body.innerHTML = '<div class="page-shell"><p style="color:red;">Error loading data/units.json. Make sure to run: python scripts/generate_units.py</p></div>';
      return;
    }

    progressData = getProgress();
    render();
  }

  // ── Render ──────────────────────────────────────────────────
  function render() {
    const existing = document.querySelector('.page-shell');
    if (existing) existing.remove();

    const shell = document.createElement('div');
    shell.className = 'page-shell';

    // --- Header ---
    shell.appendChild(renderHeader());

    // --- Overall Progress ---
    shell.appendChild(renderOverallProgress());

    // --- Current Unit ---
    shell.appendChild(renderCurrentUnit());

    // --- Unit Grid ---
    shell.appendChild(renderUnitGrid());

    // --- Data Section ---
    shell.appendChild(renderDataSection());

    // --- Footer ---
    const footer = document.createElement('div');
    footer.className = 'app-footer';
    footer.textContent = 'PhotoClass: Zone System Study — Private study log.';
    shell.appendChild(footer);

    document.body.appendChild(shell);
  }

  // ── Header ──────────────────────────────────────────────────
  function renderHeader() {
    const header = document.createElement('div');

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'PhotoClass: Zone System Study';

    const subtitle = document.createElement('p');
    subtitle.className = 'page-subtitle';
    subtitle.textContent = 'A private 45–60 min/day black-and-white photography study log.';

    header.appendChild(title);
    header.appendChild(subtitle);
    header.appendChild(renderZoneScale());
    return header;
  }

  function renderZoneScale() {
    const scale = document.createElement('div');
    scale.className = 'zone-scale';
    scale.setAttribute('aria-label', 'Zone System tonal scale from 0 to 10');

    for (let i = 0; i <= 10; i++) {
      const value = Math.round((255 / 10) * i);
      const zone = document.createElement('span');
      zone.className = 'zone-scale-step';
      zone.style.background = 'rgb(' + value + ', ' + value + ', ' + value + ')';
      zone.setAttribute('title', 'Zone ' + i);
      scale.appendChild(zone);
    }

    return scale;
  }

  // ── Overall Progress ────────────────────────────────────────
  function renderOverallProgress() {
    const overall = calculateOverallProgress(units, progressData);

    const wrap = document.createElement('div');
    wrap.className = 'progress-summary';
    if (overall.percentage === 0) wrap.classList.add('is-empty');

    // Percentage
    const ringArea = document.createElement('div');
    ringArea.className = 'progress-ring-area';

    const percent = document.createElement('div');
    percent.className = 'progress-percent';
    percent.textContent = overall.percentage + '%';
    ringArea.appendChild(percent);

    const detail = document.createElement('div');
    detail.className = 'progress-detail';
    detail.innerHTML =
      '<span>' + overall.completed + '</span> / <span>' + overall.total + '</span> checkpoints completed';
    ringArea.appendChild(detail);
    wrap.appendChild(ringArea);

    // Bar
    const barWrap = document.createElement('div');
    barWrap.className = 'progress-bar-wrap';

    const barLabel = document.createElement('div');
    barLabel.className = 'progress-bar-label';
    barLabel.innerHTML = '<span>OVERALL PROGRESS</span><span>' + overall.percentage + '%</span>';
    barWrap.appendChild(barLabel);

    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    const fill = document.createElement('div');
    fill.className = 'progress-bar-fill';
    fill.style.width = overall.percentage + '%';
    bar.appendChild(fill);
    barWrap.appendChild(bar);

    wrap.appendChild(barWrap);
    return wrap;
  }

  // ── Current Unit ────────────────────────────────────────────
  function renderCurrentUnit() {
    const currentUnit = getCurrentUnit(units, progressData);
    if (!currentUnit) {
      const wrap = document.createElement('div');
      wrap.className = 'current-unit-card';
      wrap.innerHTML = '<div class="current-unit-info"><div class="current-unit-title">All units complete!</div><div class="current-unit-meta">Congratulations on finishing the Zone System study.</div></div>';
      return wrap;
    }

    const cp = calculateUnitProgress(currentUnit, progressData);
    const status = getUnitStatus(currentUnit, progressData);

    const wrap = document.createElement('div');
    wrap.className = 'current-unit-card';

    const info = document.createElement('div');
    info.className = 'current-unit-info';

    const eyebrow = document.createElement('div');
    eyebrow.className = 'current-unit-eyebrow';
    eyebrow.textContent = 'CURRENT UNIT';
    info.appendChild(eyebrow);

    const title = document.createElement('div');
    title.className = 'current-unit-title';
    title.textContent = 'Unit ' + currentUnit.number + ': ' + currentUnit.title;
    info.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'current-unit-meta';
    meta.textContent = cp.percentage + '% complete — ' + cp.completed + '/' + cp.total + ' checkpoints';
    info.appendChild(meta);

    wrap.appendChild(info);

    const btn = document.createElement('a');
    btn.className = 'btn-continue';
    btn.href = 'reader.html?src=' + encodeURIComponent(currentUnit.href) +
               '&title=' + encodeURIComponent('Unit ' + currentUnit.number + ': ' + currentUnit.title);
    btn.textContent = 'Continue';
    wrap.appendChild(btn);

    return wrap;
  }

  // ── Unit Grid ───────────────────────────────────────────────
  function renderUnitGrid() {
    const section = document.createElement('div');

    const heading = document.createElement('div');
    heading.className = 'section-title';
    heading.textContent = 'All Units';
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'unit-grid';

    const currentUnit = getCurrentUnit(units, progressData);

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const card = renderUnitCard(unit, currentUnit);
      grid.appendChild(card);
    }

    section.appendChild(grid);
    return section;
  }

  function renderUnitCard(unit, currentUnit) {
    const status = getUnitStatus(unit, progressData);
    const cp = calculateUnitProgress(unit, progressData);
    const isCurrent = currentUnit && unit.id === currentUnit.id;
    const lastStudied = getLastStudiedForUnit(unit.id);

    const card = document.createElement('a');
    card.className = 'unit-card';
    card.href = 'reader.html?src=' + encodeURIComponent(unit.href) +
                '&title=' + encodeURIComponent('Unit ' + unit.number + ': ' + unit.title);

    if (isCurrent) card.classList.add('is-current');
    if (status === 'complete') card.classList.add('is-complete');
    if (status === 'reference') card.classList.add('is-reference');

    // Header
    const header = document.createElement('div');
    header.className = 'unit-card-header';

    const titleWrap = document.createElement('div');
    titleWrap.style.flex = '1';
    titleWrap.style.minWidth = '0';

    const number = document.createElement('div');
    number.className = 'unit-card-number';
    if (unit.type === 'core') {
      number.textContent = 'UNIT ' + unit.number;
    } else {
      number.textContent = 'REFERENCE';
    }
    titleWrap.appendChild(number);

    const title = document.createElement('div');
    title.className = 'unit-card-title';
    title.textContent = unit.title;
    titleWrap.appendChild(title);

    header.appendChild(titleWrap);

    // Check mark
    if (status === 'complete') {
      const check = document.createElement('span');
      check.className = 'unit-card-check';
      check.innerHTML = '&#10003;';
      header.appendChild(check);
    }

    card.appendChild(header);

    // Status
    const statusEl = document.createElement('div');
    statusEl.className = 'unit-card-status';
    statusEl.style.color = getStatusColor(status);
    statusEl.textContent = getStatusLabel(status);
    card.appendChild(statusEl);

    // Progress bar (only for core units)
    if (unit.type === 'core') {
      const progressDiv = document.createElement('div');
      progressDiv.className = 'unit-card-progress';
      if (cp.percentage === 0) progressDiv.classList.add('is-empty');

      const bar = document.createElement('div');
      bar.className = 'progress-bar';
      const fill = document.createElement('div');
      fill.className = 'progress-bar-fill';
      fill.style.width = cp.percentage + '%';
      bar.appendChild(fill);
      progressDiv.appendChild(bar);

      card.appendChild(progressDiv);
    }

    // Last studied
    if (lastStudied) {
      const last = document.createElement('div');
      last.className = 'unit-card-last';
      last.textContent = 'Last studied: ' + lastStudied;
      card.appendChild(last);
    }

    return card;
  }

  // ── Data Section (Export / Import / Reset) ──────────────────
  function renderDataSection() {
    const section = document.createElement('div');
    section.className = 'data-section';

    const heading = document.createElement('div');
    heading.className = 'section-title';
    heading.textContent = 'Data';
    section.appendChild(heading);

    const controls = document.createElement('div');
    controls.className = 'data-controls';

    // Export
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn-data';
    exportBtn.textContent = 'Export Progress';
    exportBtn.addEventListener('click', handleExport);
    controls.appendChild(exportBtn);

    // Import
    const importBtn = document.createElement('button');
    importBtn.className = 'btn-data';
    importBtn.textContent = 'Import Progress';
    importBtn.addEventListener('click', function () {
      document.getElementById('import-file').click();
    });
    controls.appendChild(importBtn);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'import-file';
    fileInput.accept = '.json';
    fileInput.addEventListener('change', handleImport);
    controls.appendChild(fileInput);

    // Reset
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn-data is-danger';
    resetBtn.textContent = 'Reset Progress';
    resetBtn.addEventListener('click', handleReset);
    controls.appendChild(resetBtn);

    section.appendChild(controls);

    section.appendChild(renderSyncPanel());
    return section;
  }

  // ── Sync panel ──────────────────────────────────────────────
  function renderSyncPanel() {
    const panel = document.createElement('div');
    panel.className = 'sync-panel';

    const sync = window.PhotoClassSync;
    const status = sync && sync.getStatus ? sync.getStatus() : {
      state: 'unavailable',
      message: 'Sync unavailable',
      enabled: false,
      configured: false,
      syncCode: '',
      lastSyncedAt: null,
    };

    const header = document.createElement('div');
    header.className = 'sync-panel-header';

    const title = document.createElement('div');
    title.className = 'sync-panel-title';
    title.textContent = 'Cloud Sync';
    header.appendChild(title);

    const badge = document.createElement('span');
    badge.className = 'sync-status-badge';
    badge.setAttribute('data-state', status.state);
    badge.textContent = getSyncStatusLabel(status);
    header.appendChild(badge);

    panel.appendChild(header);

    const body = document.createElement('div');
    body.className = 'sync-panel-body';

    const detail = document.createElement('p');
    detail.className = 'sync-detail';
    detail.textContent = getSyncDetailText(status);
    body.appendChild(detail);

    if (status.enabled && status.syncCode) {
      const code = document.createElement('code');
      code.className = 'sync-code';
      code.textContent = status.syncCode;
      body.appendChild(code);
    }

    const controls = document.createElement('div');
    controls.className = 'sync-controls';

    if (!status.enabled) {
      const input = document.createElement('input');
      input.className = 'sync-input';
      input.type = 'text';
      input.placeholder = 'sync code';
      input.value = sync && sync.generateSyncCode ? sync.generateSyncCode() : '';
      input.setAttribute('aria-label', 'Sync code');
      controls.appendChild(input);

      const enableBtn = document.createElement('button');
      enableBtn.className = 'btn-data';
      enableBtn.textContent = 'Enable Sync';
      enableBtn.disabled = !sync || !status.configured;
      enableBtn.addEventListener('click', function () {
        handleEnableSync(input.value);
      });
      controls.appendChild(enableBtn);
    } else {
      const syncNowBtn = document.createElement('button');
      syncNowBtn.className = 'btn-data';
      syncNowBtn.textContent = 'Sync Now';
      syncNowBtn.addEventListener('click', handleSyncNow);
      controls.appendChild(syncNowBtn);

      const disconnectBtn = document.createElement('button');
      disconnectBtn.className = 'btn-data';
      disconnectBtn.textContent = 'Disconnect';
      disconnectBtn.addEventListener('click', handleDisconnectSync);
      controls.appendChild(disconnectBtn);
    }

    body.appendChild(controls);

    if (!status.configured) {
      const note = document.createElement('p');
      note.className = 'sync-note';
      note.textContent = 'Fill assets/js/firebase-config.js with your Firebase Web App config to enable sync.';
      body.appendChild(note);
    }

    panel.appendChild(body);
    return panel;
  }

  function getSyncStatusLabel(status) {
    if (!status.configured) return 'Not configured';
    if (!status.enabled) return 'Local only';
    if (status.state === 'syncing') return 'Syncing';
    if (status.state === 'error') return 'Sync failed';
    return 'Synced';
  }

  function getSyncDetailText(status) {
    if (!status.configured) return 'Progress is saved locally until Firebase is configured.';
    if (!status.enabled) return 'Use one sync code on Mac and iPad to share the same progress.';
    if (status.lastSyncedAt) {
      return status.message + ' · Last sync: ' + new Date(status.lastSyncedAt).toLocaleString();
    }
    return status.message || 'Sync enabled';
  }

  async function handleEnableSync(syncCode) {
    if (!window.PhotoClassSync) return;
    syncCode = String(syncCode || '').trim();
    if (!syncCode) {
      showToast('Enter a sync code first.');
      return;
    }

    showToast('Enabling sync...');
    const result = await window.PhotoClassSync.enableSync(syncCode, { strategy: 'merge' });
    progressData = getProgress();
    render();

    if (result && result.ok) {
      showToast('Sync enabled.');
    } else if (result && result.reason === 'unconfigured') {
      showToast('Firebase is not configured yet.');
    } else {
      showToast('Could not enable sync.');
    }
  }

  async function handleSyncNow() {
    if (!window.PhotoClassSync) return;
    showToast('Syncing...');
    const result = await window.PhotoClassSync.syncNow();
    progressData = getProgress();
    render();
    showToast(result && result.ok ? 'Synced.' : 'Sync failed.');
  }

  function handleDisconnectSync() {
    if (!window.PhotoClassSync) return;
    window.PhotoClassSync.disableSync();
    render();
    showToast('Cloud sync disconnected. Local progress kept.');
  }

  // ── Export handler ──────────────────────────────────────────
  function handleExport() {
    const jsonStr = exportProgress();
    const today = new Date().toISOString().slice(0, 10);
    const filename = 'photoclass-progress-' + today + '.json';

    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Progress exported: ' + filename);
  }

  // ── Import handler ──────────────────────────────────────────
  function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (ev) {
      const result = importProgress(ev.target.result);
      if (result.success) {
        showToast('Progress imported successfully. Reloading...');
        setTimeout(function () { location.reload(); }, 800);
      } else {
        showToast('Import failed: ' + result.error);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset file input
  }

  // ── Reset handler ───────────────────────────────────────────
  function handleReset() {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';

    const msg = document.createElement('p');
    msg.textContent = 'This will permanently delete all your progress, reflections, and session logs. This action cannot be undone.';
    dialog.appendChild(msg);

    const buttons = document.createElement('div');
    buttons.className = 'confirm-buttons';

    const dangerBtn = document.createElement('button');
    dangerBtn.className = 'btn-confirm-danger';
    dangerBtn.textContent = 'Yes, Reset Everything';
    dangerBtn.addEventListener('click', function () {
      resetProgress();
      document.body.removeChild(overlay);
      showToast('All progress has been reset.');
      setTimeout(function () { location.reload(); }, 600);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-confirm-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function () {
      document.body.removeChild(overlay);
    });

    buttons.appendChild(dangerBtn);
    buttons.appendChild(cancelBtn);
    dialog.appendChild(buttons);
    overlay.appendChild(dialog);
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay) document.body.removeChild(overlay);
    });

    document.body.appendChild(overlay);
  }

  // ── Toast ───────────────────────────────────────────────────
  function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 2500);
  }

  // ── Start ───────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('photoclass-sync-progress-updated', function () {
    if (!progressData) return;
    progressData = getProgress();
    render();
  });

  window.addEventListener('photoclass-sync-status', function () {
    if (!progressData) return;
    progressData = getProgress();
    render();
  });
})();
