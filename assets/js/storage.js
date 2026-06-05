// storage.js — localStorage CRUD for PhotoClass progress data
// Single localStorage key: photoclass-zone-system-progress-v1

const STORAGE_KEY = 'photoclass-zone-system-progress-v1';
const STORAGE_VERSION = 1;

// ── Initial state ─────────────────────────────────────────────
function createEmptyProgress() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    version: STORAGE_VERSION,
    startedAt: today,
    lastStudiedAt: null,
    units: {},
  };
}

// ── Core read/write ───────────────────────────────────────────

function getProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createEmptyProgress();
    }
    const data = JSON.parse(raw);
    if (!data || data.version !== STORAGE_VERSION) {
      return createEmptyProgress();
    }
    return data;
  } catch (e) {
    return createEmptyProgress();
  }
}

function saveProgress(data) {
  try {
    data.version = STORAGE_VERSION;
    data.lastStudiedAt = new Date().toISOString().slice(0, 10);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('Failed to save progress:', e);
    return false;
  }
}

// ── Unit-level helpers ────────────────────────────────────────

function getUnitProgress(unitId) {
  const data = getProgress();
  return data.units[unitId] || null;
}

function ensureUnitData(unitId) {
  const data = getProgress();
  if (!data.units[unitId]) {
    data.units[unitId] = {
      completedCheckpoints: [],
      reflection: {
        coreIdeas: '',
        myUnderstanding: '',
        bwRelevance: '',
        questions: '',
        nextPractice: '',
      },
      sessions: [],
    };
  }
  return data;
}

// ── Checkpoint toggle ─────────────────────────────────────────

function toggleCheckpoint(unitId, checkpointId) {
  const data = ensureUnitData(unitId);
  const unitData = data.units[unitId];
  const idx = unitData.completedCheckpoints.indexOf(checkpointId);

  if (idx === -1) {
    unitData.completedCheckpoints.push(checkpointId);
  } else {
    unitData.completedCheckpoints.splice(idx, 1);
  }

  return saveProgress(data);
}

function isCheckpointCompleted(unitId, checkpointId) {
  const unitData = getUnitProgress(unitId);
  if (!unitData) return false;
  return unitData.completedCheckpoints.indexOf(checkpointId) !== -1;
}

// ── Reflection ────────────────────────────────────────────────

function saveReflection(unitId, field, value) {
  const data = ensureUnitData(unitId);
  if (!data.units[unitId].reflection) {
    data.units[unitId].reflection = {
      coreIdeas: '',
      myUnderstanding: '',
      bwRelevance: '',
      questions: '',
      nextPractice: '',
    };
  }
  data.units[unitId].reflection[field] = value;
  return saveProgress(data);
}

function getReflection(unitId) {
  const unitData = getUnitProgress(unitId);
  if (!unitData || !unitData.reflection) return null;
  return unitData.reflection;
}

// ── Session log ───────────────────────────────────────────────

function addSession(unitId, session) {
  const data = ensureUnitData(unitId);
  if (!data.units[unitId].sessions) {
    data.units[unitId].sessions = [];
  }
  // Generate a simple unique id
  const sessionId = 'session-' + Date.now();
  data.units[unitId].sessions.push({
    id: sessionId,
    date: session.date || new Date().toISOString().slice(0, 10),
    minutes: session.minutes || 45,
    note: session.note || '',
  });
  return saveProgress(data);
}

function deleteSession(unitId, sessionId) {
  const data = getProgress();
  if (!data.units[unitId] || !data.units[unitId].sessions) return false;
  data.units[unitId].sessions = data.units[unitId].sessions.filter(
    function (s) { return s.id !== sessionId; }
  );
  return saveProgress(data);
}

function getSessions(unitId) {
  const unitData = getUnitProgress(unitId);
  if (!unitData || !unitData.sessions) return [];
  return unitData.sessions;
}

// ── Export / Import / Reset ───────────────────────────────────

function exportProgress() {
  const data = getProgress();
  return JSON.stringify(data, null, 2);
}

function importProgress(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data.version !== 'number' || !data.units) {
      return { success: false, error: 'Invalid progress data: missing version or units.' };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { success: true };
  } catch (e) {
    return { success: false, error: 'Could not parse JSON: ' + e.message };
  }
}

function resetProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

// ── Utility: get last studied date for a unit ─────────────────

function getLastStudiedForUnit(unitId) {
  const sessions = getSessions(unitId);
  if (sessions.length === 0) return null;
  // Sessions are in insertion order; find the latest date
  let latest = sessions[0].date;
  for (let i = 1; i < sessions.length; i++) {
    if (sessions[i].date > latest) {
      latest = sessions[i].date;
    }
  }
  return latest;
}
