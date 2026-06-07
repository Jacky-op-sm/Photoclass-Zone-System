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
  let needsPushAfterFlight = false;
  let latestQueuedProgress = null;
  let unsubscribeCloudProgress = null;
  let listeningSyncCode = '';
  let lastHandledCloudSavedAt = '';

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

  function hasPendingPush() {
    return !!pushTimer;
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

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function normalizeReflection(reflection) {
    const normalized = {};
    const keys = ['coreIdeas', 'myUnderstanding', 'bwRelevance', 'questions', 'nextPractice'];
    reflection = reflection || {};
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      normalized[key] = hasOwn(reflection, key) ? String(reflection[key] || '') : '';
    }
    return normalized;
  }

  function preferLocalByTimestamp(localUpdatedAt, cloudUpdatedAt) {
    if (localUpdatedAt && cloudUpdatedAt) return localUpdatedAt > cloudUpdatedAt;
    if (localUpdatedAt && !cloudUpdatedAt) return true;
    return false;
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

  function mergeReflection(localReflection, cloudReflection, localUpdatedAt, cloudUpdatedAt) {
    if (localUpdatedAt || cloudUpdatedAt) {
      return preferLocalByTimestamp(localUpdatedAt, cloudUpdatedAt) ?
        normalizeReflection(localReflection) :
        normalizeReflection(cloudReflection);
    }

    const merged = normalizeReflection(localReflection);
    const normalizedCloud = normalizeReflection(cloudReflection);
    const keys = Object.keys(normalizedCloud);
    for (let i = 0; i < keys.length; i++) {
      if (normalizedCloud[keys[i]]) merged[keys[i]] = normalizedCloud[keys[i]];
    }
    return merged;
  }

  function mergeCheckpoints(localCheckpoints, cloudCheckpoints, localUpdatedAt, cloudUpdatedAt) {
    localCheckpoints = localCheckpoints || [];
    cloudCheckpoints = cloudCheckpoints || [];
    if (localUpdatedAt || cloudUpdatedAt) {
      return preferLocalByTimestamp(localUpdatedAt, cloudUpdatedAt) ?
        localCheckpoints.slice() :
        cloudCheckpoints.slice();
    }
    return uniqueArray(localCheckpoints.concat(cloudCheckpoints));
  }

  function mergeSessionsByTimestamp(localSessions, cloudSessions, localUpdatedAt, cloudUpdatedAt) {
    localSessions = localSessions || [];
    cloudSessions = cloudSessions || [];
    if (localUpdatedAt || cloudUpdatedAt) {
      return preferLocalByTimestamp(localUpdatedAt, cloudUpdatedAt) ?
        localSessions.slice() :
        cloudSessions.slice();
    }
    return mergeSessions(localSessions, cloudSessions);
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
      const checkpointsUpdatedAt = laterDate(localUnit.checkpointsUpdatedAt, cloudUnit.checkpointsUpdatedAt);
      const reflectionUpdatedAt = laterDate(localUnit.reflectionUpdatedAt, cloudUnit.reflectionUpdatedAt);
      const sessionsUpdatedAt = laterDate(localUnit.sessionsUpdatedAt, cloudUnit.sessionsUpdatedAt);
      merged.units[unitId] = {
        completedCheckpoints: mergeCheckpoints(
          localUnit.completedCheckpoints,
          cloudUnit.completedCheckpoints,
          localUnit.checkpointsUpdatedAt,
          cloudUnit.checkpointsUpdatedAt
        ),
        reflection: mergeReflection(
          localUnit.reflection,
          cloudUnit.reflection,
          localUnit.reflectionUpdatedAt,
          cloudUnit.reflectionUpdatedAt
        ),
        sessions: mergeSessionsByTimestamp(
          localUnit.sessions,
          cloudUnit.sessions,
          localUnit.sessionsUpdatedAt,
          cloudUnit.sessionsUpdatedAt
        ),
        updatedAt: laterDate(localUnit.updatedAt, cloudUnit.updatedAt),
        checkpointsUpdatedAt: checkpointsUpdatedAt,
        reflectionUpdatedAt: reflectionUpdatedAt,
        sessionsUpdatedAt: sessionsUpdatedAt,
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
    const cloudDocument = makeCloudDocument(progressData);
    await getDocRef(syncCode).set(cloudDocument, { merge: false });
    lastHandledCloudSavedAt = cloudDocument.lastClientSavedAt;
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
    if (pushInFlight) {
      needsPushAfterFlight = true;
      latestQueuedProgress = progressData || window.getProgress();
      return false;
    }
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
      if (needsPushAfterFlight) {
        const nextProgress = latestQueuedProgress || window.getProgress();
        needsPushAfterFlight = false;
        latestQueuedProgress = null;
        schedulePush(nextProgress);
      }
    }
  }

  function schedulePush(progressData) {
    if (!isEnabled()) return;
    if (!ensureInitialized()) return;
    latestQueuedProgress = progressData || window.getProgress();
    if (pushInFlight) {
      needsPushAfterFlight = true;
      setStatus('syncing', 'Sync queued');
      return;
    }
    clearTimeout(pushTimer);
    setStatus('syncing', 'Sync scheduled');
    pushTimer = setTimeout(function () {
      pushTimer = null;
      const nextProgress = latestQueuedProgress || window.getProgress();
      latestQueuedProgress = null;
      pushProgress(nextProgress);
    }, PUSH_DEBOUNCE_MS);
  }

  function stopRealtimeSync() {
    if (unsubscribeCloudProgress) {
      unsubscribeCloudProgress();
      unsubscribeCloudProgress = null;
    }
    listeningSyncCode = '';
  }

  function isSupportedCloudDocument(data) {
    return !!(
      data &&
      data.app === APP_NAME &&
      data.schemaVersion === CLOUD_SCHEMA_VERSION &&
      data.progress
    );
  }

  function handleCloudSnapshot(syncCode, snap) {
    if (!snap.exists || syncCode !== getSyncCode()) return;

    const data = snap.data();
    if (!isSupportedCloudDocument(data)) {
      setStatus('error', 'Cloud progress format is unsupported');
      console.error('Cloud progress document has an unsupported format.');
      return;
    }

    const cloudSavedAt = String(data.lastClientSavedAt || '');
    if (cloudSavedAt && cloudSavedAt === lastHandledCloudSavedAt) return;
    lastHandledCloudSavedAt = cloudSavedAt;

    const pendingPush = hasPendingPush();
    const next = mergeProgress(window.getProgress(), data.progress);
    applyProgress(next);
    writeLocal(LAST_SYNC_KEY, nowIso());
    setStatus('synced', 'Synced');

    if (pendingPush) {
      schedulePush(next);
    }
  }

  function startRealtimeSync(syncCode) {
    syncCode = normalizeSyncCode(syncCode);
    if (!syncCode || !ensureInitialized()) return false;
    if (unsubscribeCloudProgress && listeningSyncCode === syncCode) return true;

    stopRealtimeSync();
    listeningSyncCode = syncCode;
    unsubscribeCloudProgress = getDocRef(syncCode).onSnapshot(function (snap) {
      handleCloudSnapshot(syncCode, snap);
    }, function (e) {
      setStatus('error', 'Realtime sync failed');
      console.error('Realtime progress sync failed:', e);
    });
    return true;
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
        startRealtimeSync(syncCode);
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
      startRealtimeSync(syncCode);
      return { ok: true, mode: options.strategy || 'merge' };
    } catch (e) {
      setStatus('error', 'Sync failed');
      console.error('Enable sync failed:', e);
      return { ok: false, reason: 'error', error: e };
    }
  }

  function disableSync() {
    clearTimeout(pushTimer);
    pushTimer = null;
    stopRealtimeSync();
    lastHandledCloudSavedAt = '';
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
      startRealtimeSync(getSyncCode());
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
    startRealtimeSync: startRealtimeSync,
    stopRealtimeSync: stopRealtimeSync,
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
