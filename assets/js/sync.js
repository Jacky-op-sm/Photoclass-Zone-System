// sync.js — Firestore-backed progress sync for PhotoClass

(function () {
  'use strict';

  const APP_NAME = 'photoclass-zone-system';
  const CLOUD_SCHEMA_VERSION = 1;
  const SYNC_CODE_KEY = 'photoclass-zone-system-sync-code-v1';
  const SYNC_ENABLED_KEY = 'photoclass-zone-system-sync-enabled-v1';
  const DEVICE_LABEL_KEY = 'photoclass-zone-system-device-label-v1';
  const LAST_SYNC_KEY = 'photoclass-zone-system-last-sync-v1';
  const COLLECTION = 'progress_profiles';
  const PUSH_DEBOUNCE_MS = 1200;

  let db = null;
  let initialized = false;
  let status = {
    state: 'local_only',
    message: 'Local only',
    lastSyncedAt: readLocal(LAST_SYNC_KEY),
  };
  let pushTimer = null;
  let pushInFlight = false;

  function readLocal(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function writeLocal(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function removeLocal(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      // Ignore local cleanup failures.
    }
  }

  function setStatus(nextState, message) {
    status = {
      state: nextState,
      message: message,
      lastSyncedAt: readLocal(LAST_SYNC_KEY),
    };
    window.dispatchEvent(new CustomEvent('photoclass-sync-status', {
      detail: getStatus(),
    }));
  }

  function getStatus() {
    return {
      state: status.state,
      message: status.message,
      lastSyncedAt: status.lastSyncedAt,
      enabled: isEnabled(),
      configured: isConfigured(),
      syncCode: getSyncCode(),
    };
  }

  function isConfigured() {
    const config = window.PHOTOCLASS_FIREBASE_CONFIG || {};
    return !!(
      config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.appId &&
      window.firebase &&
      window.firebase.firestore
    );
  }

  function ensureInitialized() {
    if (initialized) return true;
    if (!isConfigured()) {
      setStatus('unconfigured', 'Firebase not configured');
      return false;
    }
    try {
      if (!window.firebase.apps.length) {
        window.firebase.initializeApp(window.PHOTOCLASS_FIREBASE_CONFIG);
      }
      db = window.firebase.firestore();
      initialized = true;
      if (isEnabled()) {
        setStatus('synced', 'Sync enabled');
      }
      return true;
    } catch (e) {
      setStatus('error', 'Firebase init failed');
      console.error('Firebase init failed:', e);
      return false;
    }
  }

  function normalizeSyncCode(value) {
    return String(value || '').trim();
  }

  function generateSyncCode() {
    const chunks = [];
    const chars = 'abcdefghijkmnopqrstuvwxyz23456789';
    const bytes = new Uint8Array(12);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 255);
    }
    for (let i = 0; i < bytes.length; i += 4) {
      let chunk = '';
      for (let j = i; j < i + 4; j++) {
        chunk += chars[bytes[j] % chars.length];
      }
      chunks.push(chunk);
    }
    return 'photo_' + chunks.join('_');
  }

  function getSyncCode() {
    return readLocal(SYNC_CODE_KEY) || '';
  }

  function getAutoSyncCode() {
    return normalizeSyncCode(window.PHOTOCLASS_SYNC_CODE);
  }

  function enableLocalSyncCode(syncCode) {
    syncCode = normalizeSyncCode(syncCode);
    if (!syncCode) return false;
    writeLocal(SYNC_CODE_KEY, syncCode);
    writeLocal(SYNC_ENABLED_KEY, 'true');
    return true;
  }

  function isEnabled() {
    return readLocal(SYNC_ENABLED_KEY) === 'true' && !!getSyncCode();
  }

  function getDeviceLabel() {
    let label = readLocal(DEVICE_LABEL_KEY);
    if (label) return label;
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|Mobile/.test(ua)) {
      label = 'Mobile';
    } else if (/Macintosh|Mac OS X/.test(ua)) {
      label = 'Mac';
    } else {
      label = 'Browser';
    }
    writeLocal(DEVICE_LABEL_KEY, label);
    return label;
  }

  function getDocRef(syncCode) {
    return db.collection(COLLECTION).doc(syncCode);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function makeCloudDocument(progressData) {
    return {
      schemaVersion: CLOUD_SCHEMA_VERSION,
      app: APP_NAME,
      progress: progressData,
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      lastDevice: getDeviceLabel(),
      lastClientSavedAt: nowIso(),
    };
  }

  function isEmptyProgress(data) {
    return !data || !data.units || Object.keys(data.units).length === 0;
  }

  function uniqueArray(items) {
    const seen = {};
    const result = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!seen[item]) {
        seen[item] = true;
        result.push(item);
      }
    }
    return result;
  }

  function earlierDate(a, b) {
    if (!a) return b || null;
    if (!b) return a || null;
    return a < b ? a : b;
  }

  function laterDate(a, b) {
    if (!a) return b || null;
    if (!b) return a || null;
    return a > b ? a : b;
  }

  function mergeSessions(localSessions, cloudSessions) {
    const byId = {};
    const merged = [];
    function add(session) {
      if (!session || !session.id) return;
      if (!byId[session.id]) {
        byId[session.id] = true;
        merged.push(session);
      }
    }
    for (let i = 0; i < (localSessions || []).length; i++) add(localSessions[i]);
    for (let i = 0; i < (cloudSessions || []).length; i++) add(cloudSessions[i]);
    merged.sort(function (a, b) {
      return String(a.date || '').localeCompare(String(b.date || ''));
    });
    return merged;
  }

  function mergeReflection(localReflection, cloudReflection) {
    const merged = {};
    const keys = ['coreIdeas', 'myUnderstanding', 'bwRelevance', 'questions', 'nextPractice'];
    localReflection = localReflection || {};
    cloudReflection = cloudReflection || {};
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      merged[key] = cloudReflection[key] || localReflection[key] || '';
    }
    return merged;
  }

  function mergeProgress(localProgress, cloudProgress) {
    localProgress = localProgress || (window.createEmptyProgress ? window.createEmptyProgress() : { version: 1, units: {} });
    cloudProgress = cloudProgress || (window.createEmptyProgress ? window.createEmptyProgress() : { version: 1, units: {} });

    const merged = {
      version: localProgress.version || cloudProgress.version || 1,
      startedAt: earlierDate(localProgress.startedAt, cloudProgress.startedAt),
      lastStudiedAt: laterDate(localProgress.lastStudiedAt, cloudProgress.lastStudiedAt),
      units: {},
    };

    const unitIds = {};
    const localUnits = localProgress.units || {};
    const cloudUnits = cloudProgress.units || {};
    Object.keys(localUnits).forEach(function (id) { unitIds[id] = true; });
    Object.keys(cloudUnits).forEach(function (id) { unitIds[id] = true; });

    Object.keys(unitIds).forEach(function (unitId) {
      const localUnit = localUnits[unitId] || {};
      const cloudUnit = cloudUnits[unitId] || {};
      merged.units[unitId] = {
        completedCheckpoints: uniqueArray(
          (localUnit.completedCheckpoints || []).concat(cloudUnit.completedCheckpoints || [])
        ),
        reflection: mergeReflection(localUnit.reflection, cloudUnit.reflection),
        sessions: mergeSessions(localUnit.sessions, cloudUnit.sessions),
      };
    });

    return merged;
  }

  async function readCloudProgress(syncCode) {
    if (!ensureInitialized()) return null;
    const snap = await getDocRef(syncCode).get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (!data || data.app !== APP_NAME || data.schemaVersion !== CLOUD_SCHEMA_VERSION || !data.progress) {
      throw new Error('Cloud progress document has an unsupported format.');
    }
    return data.progress;
  }

  async function writeCloudProgress(syncCode, progressData) {
    if (!ensureInitialized()) return false;
    await getDocRef(syncCode).set(makeCloudDocument(progressData), { merge: false });
    const syncedAt = nowIso();
    writeLocal(LAST_SYNC_KEY, syncedAt);
    setStatus('synced', 'Synced');
    return true;
  }

  function applyProgress(progressData) {
    if (window.setProgressData) {
      window.setProgressData(progressData, { sync: false });
    } else {
      localStorage.setItem('photoclass-zone-system-progress-v1', JSON.stringify(progressData));
    }
    window.dispatchEvent(new CustomEvent('photoclass-sync-progress-updated', {
      detail: { progress: progressData },
    }));
  }

  async function pushProgress(progressData) {
    if (!isEnabled()) return false;
    const syncCode = getSyncCode();
    if (!syncCode || !ensureInitialized()) return false;
    if (pushInFlight) return false;
    pushInFlight = true;
    setStatus('syncing', 'Syncing');
    try {
      await writeCloudProgress(syncCode, progressData || window.getProgress());
      return true;
    } catch (e) {
      setStatus('error', 'Sync failed');
      console.error('Progress sync upload failed:', e);
      return false;
    } finally {
      pushInFlight = false;
    }
  }

  function schedulePush(progressData) {
    if (!isEnabled()) return;
    if (!ensureInitialized()) return;
    clearTimeout(pushTimer);
    setStatus('syncing', 'Sync scheduled');
    pushTimer = setTimeout(function () {
      pushProgress(progressData || window.getProgress());
    }, PUSH_DEBOUNCE_MS);
  }

  async function pullProgress(options) {
    options = options || {};
    if (!isEnabled()) return { applied: false, reason: 'disabled' };
    const syncCode = getSyncCode();
    if (!syncCode || !ensureInitialized()) return { applied: false, reason: 'unconfigured' };
    setStatus('syncing', 'Checking cloud');
    try {
      const cloud = await readCloudProgress(syncCode);
      if (!cloud) {
        await writeCloudProgress(syncCode, window.getProgress());
        return { applied: false, reason: 'created_cloud' };
      }

      const local = window.getProgress();
      let next = cloud;
      if (options.strategy === 'merge' || (options.strategy !== 'cloud' && !isEmptyProgress(local))) {
        next = mergeProgress(local, cloud);
      }

      applyProgress(next);
      await writeCloudProgress(syncCode, next);
      return { applied: true, reason: 'pulled' };
    } catch (e) {
      setStatus('error', 'Sync failed');
      console.error('Progress sync download failed:', e);
      return { applied: false, reason: 'error', error: e };
    }
  }

  async function syncNow() {
    if (!isEnabled()) return { ok: false, reason: 'disabled' };
    const pulled = await pullProgress({ strategy: 'merge' });
    const pushed = await pushProgress(window.getProgress());
    return { ok: !!(pulled || pushed), pulled: pulled, pushed: pushed };
  }

  async function enableSync(syncCode, options) {
    options = options || {};
    syncCode = normalizeSyncCode(syncCode);
    if (!syncCode) throw new Error('Sync code is required.');
    enableLocalSyncCode(syncCode);

    if (!ensureInitialized()) {
      return { ok: false, reason: 'unconfigured' };
    }

    const local = window.getProgress();
    setStatus('syncing', 'Enabling sync');
    try {
      const cloud = await readCloudProgress(syncCode);
      if (!cloud) {
        await writeCloudProgress(syncCode, local);
        return { ok: true, mode: 'created_cloud' };
      }

      let next;
      if (options.strategy === 'local') {
        next = local;
      } else if (options.strategy === 'cloud') {
        next = cloud;
      } else {
        next = mergeProgress(local, cloud);
      }

      applyProgress(next);
      await writeCloudProgress(syncCode, next);
      return { ok: true, mode: options.strategy || 'merge' };
    } catch (e) {
      setStatus('error', 'Sync failed');
      console.error('Enable sync failed:', e);
      return { ok: false, reason: 'error', error: e };
    }
  }

  function disableSync() {
    clearTimeout(pushTimer);
    removeLocal(SYNC_CODE_KEY);
    removeLocal(SYNC_ENABLED_KEY);
    setStatus('local_only', 'Local only');
  }

  async function initSync() {
    if (!isConfigured()) {
      setStatus('unconfigured', 'Firebase not configured');
      return;
    }
    if (!ensureInitialized()) return;

    const autoSyncCode = getAutoSyncCode();
    if (autoSyncCode) {
      enableLocalSyncCode(autoSyncCode);
    }

    if (isEnabled()) {
      await pullProgress({ strategy: 'merge' });
    }
  }

  window.PhotoClassSync = {
    isEnabled: isEnabled,
    isConfigured: isConfigured,
    getSyncCode: getSyncCode,
    getStatus: getStatus,
    generateSyncCode: generateSyncCode,
    enableSync: enableSync,
    disableSync: disableSync,
    pullProgress: pullProgress,
    pushProgress: pushProgress,
    schedulePush: schedulePush,
    syncNow: syncNow,
    mergeProgress: mergeProgress,
    init: initSync,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSync);
  } else {
    initSync();
  }
})();
