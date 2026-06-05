// progress.js — Pure calculation functions for PhotoClass progress

// ── Unit-level calculations ───────────────────────────────────

/**
 * Calculate progress for a single unit.
 * Returns { completed, total, percentage }.
 */
function calculateUnitProgress(unit, progressData) {
  if (!unit || !unit.checkpoints || unit.checkpoints.length === 0) {
    return { completed: 0, total: 0, percentage: 0 };
  }

  const total = unit.checkpoints.length;
  const completed = countCompletedCheckpoints(unit.id, unit.checkpoints, progressData);
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, total, percentage };
}

function countCompletedCheckpoints(unitId, checkpoints, progressData) {
  const unitData = progressData.units[unitId];
  if (!unitData || !unitData.completedCheckpoints) return 0;

  let count = 0;
  for (let i = 0; i < checkpoints.length; i++) {
    if (unitData.completedCheckpoints.indexOf(checkpoints[i].id) !== -1) {
      count++;
    }
  }
  return count;
}

// ── Overall progress (core units only) ────────────────────────

/**
 * Calculate overall progress across all core units.
 * Reference units are excluded.
 */
function calculateOverallProgress(units, progressData) {
  let totalCompleted = 0;
  let totalCheckpoints = 0;

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (unit.type === 'reference') continue;

    const cp = calculateUnitProgress(unit, progressData);
    totalCompleted += cp.completed;
    totalCheckpoints += cp.total;
  }

  const percentage = totalCheckpoints > 0
    ? Math.round((totalCompleted / totalCheckpoints) * 100)
    : 0;

  return {
    completed: totalCompleted,
    total: totalCheckpoints,
    percentage: percentage,
  };
}

// ── Unit status ───────────────────────────────────────────────

/**
 * Determine a unit's status.
 * Possible values:
 *   'not_started'       — no checkpoints completed
 *   'in_progress'       — some checkpoints done, not all
 *   'reflection_needed' — all checkpoints done, reflection empty
 *   'complete'          — all checkpoints done, some reflection filled
 *   'reference'         — type === 'reference'
 */
function getUnitStatus(unit, progressData) {
  if (unit.type === 'reference') return 'reference';

  const cp = calculateUnitProgress(unit, progressData);

  if (cp.completed === 0) return 'not_started';
  if (cp.completed < cp.total) return 'in_progress';

  // All checkpoints completed — check reflection
  const unitData = progressData.units[unit.id];
  if (!unitData || !unitData.reflection) return 'reflection_needed';

  const reflection = unitData.reflection;
  const hasReflection =
    (reflection.coreIdeas && reflection.coreIdeas.trim() !== '') ||
    (reflection.myUnderstanding && reflection.myUnderstanding.trim() !== '') ||
    (reflection.bwRelevance && reflection.bwRelevance.trim() !== '') ||
    (reflection.questions && reflection.questions.trim() !== '') ||
    (reflection.nextPractice && reflection.nextPractice.trim() !== '');

  return hasReflection ? 'complete' : 'reflection_needed';
}

// ── Current unit ──────────────────────────────────────────────

/**
 * Find the first incomplete core unit.
 * Returns the unit object or null if all core units are complete.
 */
function getCurrentUnit(units, progressData) {
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (unit.type === 'reference') continue;
    const status = getUnitStatus(unit, progressData);
    if (status !== 'complete') {
      return unit;
    }
  }
  return null;
}

// ── Status display helpers ────────────────────────────────────

const STATUS_LABELS = {
  'not_started':       'Not Started',
  'in_progress':       'In Progress',
  'reflection_needed': 'Reflection Needed',
  'complete':          'Complete',
  'reference':         'Reference',
};

const STATUS_COLORS = {
  'not_started':       'var(--status-neutral)',
  'in_progress':       'var(--status-active)',
  'reflection_needed': 'var(--status-warning)',
  'complete':          'var(--status-done)',
  'reference':         'var(--status-reference)',
};

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function getStatusColor(status) {
  return STATUS_COLORS[status] || STATUS_COLORS['not_started'];
}
