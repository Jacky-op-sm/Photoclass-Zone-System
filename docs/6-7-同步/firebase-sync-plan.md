# PhotoClass Progress Cloud Sync Plan

## Goal

Add cross-device progress sync for the deployed PhotoClass Zone System web app.

Current behavior stores all progress in browser `localStorage`, so each device and browser has its own independent copy. The first sync version should keep the app lightweight:

- No formal account system.
- No PIN or password.
- One sync code identifies the cloud progress profile.
- `localStorage` remains the fast offline/local cache.
- Firebase Firestore stores the shared cloud copy.

This document is the execution plan for a later implementation pass.

## Current State

Progress is stored under:

```text
photoclass-zone-system-progress-v1
```

The saved object includes:

- `version`
- `startedAt`
- `lastStudiedAt`
- `units`
  - `completedCheckpoints`
  - `reflection`
  - `sessions`

Existing local functions already provide the main persistence boundary:

- `getProgress()`
- `saveProgress(data)`
- `exportProgress()`
- `importProgress(jsonString)`
- `resetProgress()`

The sync implementation should wrap or extend this boundary instead of rewriting every UI feature.

## Recommended Backend

Use Firebase Firestore.

Reasoning:

- The app is currently a static site, and Firestore can be called directly from browser JavaScript.
- A single document can store the full progress JSON.
- No custom Vercel API route is required for the first version.
- The same approach works on Mac and iPad browsers.
- Firebase can be upgraded later to anonymous auth or real accounts if needed.

## Product Decision

Use a sync code without PIN.

The sync code is not a strong security credential. It is a lightweight profile identifier. Because this app is for personal learning progress and the data is low sensitivity, this is acceptable for version 1.

Recommended sync code style:

```text
photo_jacky_8k2l_m9qz_x7p4
```

Avoid hard-coding the sync code in the repository. The user should enter it once in the UI, and the app should save it locally in `localStorage`.

## Cloud Data Model

Firestore collection:

```text
progress_profiles
```

Document ID:

```text
{syncCode}
```

Example document:

```json
{
  "schemaVersion": 1,
  "app": "photoclass-zone-system",
  "progress": {
    "version": 1,
    "startedAt": "2026-06-07",
    "lastStudiedAt": "2026-06-07",
    "units": {}
  },
  "updatedAt": "<server timestamp>",
  "lastDevice": "Mac",
  "lastClientSavedAt": "2026-06-07T12:00:00.000Z"
}
```

Additional local-only keys:

```text
photoclass-zone-system-sync-code-v1
photoclass-zone-system-sync-enabled-v1
photoclass-zone-system-device-label-v1
photoclass-zone-system-last-sync-v1
```

## Firestore Rules

Because there is no login and no PIN, the rules cannot truly prove ownership. The rules should still reduce accidental exposure:

- Allow document `get`, `create`, and `update` by exact document path.
- Deny collection `list`.
- Deny `delete` in version 1.
- Restrict fields to expected keys.
- Restrict app name and schema version.

Draft rule shape:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /progress_profiles/{syncCode} {
      allow get: if true;
      allow list: if false;

      allow create, update: if
        request.resource.data.keys().hasOnly([
          'schemaVersion',
          'app',
          'progress',
          'updatedAt',
          'lastDevice',
          'lastClientSavedAt'
        ]) &&
        request.resource.data.schemaVersion == 1 &&
        request.resource.data.app == 'photoclass-zone-system';

      allow delete: if false;
    }
  }
}
```

Important limitation: with no auth, anyone who knows the Firebase project config and the sync code can read or overwrite that document. This is accepted for version 1. If this becomes a concern later, add Firebase Anonymous Auth or a PIN-derived secret.

## Sync UX

Add a small sync area to the existing dashboard controls.

States:

- `Local only`
- `Sync enabled`
- `Syncing`
- `Synced`
- `Offline / sync failed`
- `Cloud has newer data`

Controls:

- `Enable Sync`
- `Sync Now`
- `Disconnect Sync`
- Optional `Change Sync Code`

First-time flow on Mac:

1. User clicks `Enable Sync`.
2. User enters a sync code or generates one.
3. App saves the sync code locally.
4. App checks whether a cloud document exists.
5. If no document exists, upload current local progress.
6. If a document exists, ask whether to:
   - use cloud progress,
   - upload this device's progress,
   - merge both.

First-time flow on iPad:

1. User clicks `Enable Sync`.
2. User enters the same sync code.
3. App loads cloud progress.
4. If local progress is empty, apply cloud progress immediately.
5. If local progress is non-empty and different, show the same choice:
   - use cloud progress,
   - upload this device's progress,
   - merge both.

Routine save flow:

1. User changes progress locally.
2. App writes to `localStorage` immediately.
3. App schedules a debounced cloud upload.
4. UI shows `Syncing`.
5. On success, UI shows `Synced`.
6. On failure, UI keeps local data and shows `Offline / sync failed`.

Routine load flow:

1. Page loads from local progress immediately.
2. If sync is enabled, fetch cloud progress in the background.
3. Compare cloud `updatedAt` / `lastClientSavedAt` with local last sync metadata.
4. If cloud is newer, merge or apply it.
5. Re-render dashboard after applying remote changes.

## Merge Strategy

Version 1 should avoid complex realtime collaboration. The app is personal and changes are usually sequential.

Use these rules:

- `completedCheckpoints`: union local and cloud arrays.
- `sessions`: merge by `id`; keep all unique sessions.
- `reflection`: prefer the value from the side with the newer per-unit timestamp if timestamps are added; otherwise prefer the cloud value when importing cloud progress.
- `startedAt`: keep the earlier date.
- `lastStudiedAt`: keep the later date.

Recommended small schema improvement before cloud sync:

Add metadata per unit:

```json
{
  "updatedAt": "2026-06-07T12:00:00.000Z",
  "reflectionUpdatedAt": "2026-06-07T12:00:00.000Z",
  "checkpointsUpdatedAt": "2026-06-07T12:00:00.000Z",
  "sessionsUpdatedAt": "2026-06-07T12:00:00.000Z"
}
```

This makes merge behavior predictable. If this feels too much for version 1, use whole-document last-write-wins first, but keep export/import as a manual backup.

## Implementation Phases

### Phase 1: Firebase Project Setup

1. Create a Firebase project.
2. Enable Firestore.
3. Add a Web app in Firebase.
4. Copy the Firebase config.
5. Add Firestore rules.
6. Confirm the app can create and read one test document.

Do not commit private service account files. The client Firebase config is not a secret, but the sync code should not be hard-coded.

### Phase 2: Local Sync Module

Create:

```text
assets/js/sync.js
```

Responsibilities:

- Store and read the sync code.
- Initialize Firebase.
- Read cloud progress.
- Write cloud progress.
- Track sync status.
- Expose functions on `window` for existing non-module scripts.

Suggested public API:

```js
window.PhotoClassSync = {
  isEnabled,
  getSyncCode,
  enableSync,
  disableSync,
  pullProgress,
  pushProgress,
  syncNow,
  schedulePush,
  getStatus,
};
```

### Phase 3: Storage Integration

Update `saveProgress(data)` so it still saves locally first, then schedules cloud sync if enabled.

Expected behavior:

```text
saveProgress(data)
  -> localStorage.setItem(...)
  -> PhotoClassSync.schedulePush(data)
```

This preserves current UI behavior even if Firebase is unavailable.

### Phase 4: Dashboard UI

Add a sync panel near the existing export/import/reset controls.

It should show:

- Current sync status.
- Current sync code when enabled.
- Last successful sync time.
- Buttons for enabling, syncing now, and disconnecting.

Keep existing export/import controls. They remain useful as manual backup and recovery.

### Phase 5: Conflict Handling

Minimum first version:

- If enabling sync and both local and cloud data exist, ask the user to choose:
  - Use cloud
  - Upload this device
  - Merge

Later improvement:

- Detect per-unit conflicts and show a small resolution dialog.

### Phase 6: Verification

Verify these flows:

1. Fresh Mac browser creates cloud progress with a sync code.
2. iPad / second browser enters same sync code and receives the same progress.
3. Completing a checkpoint on Mac appears on iPad after refresh or `Sync Now`.
4. Reflection text syncs.
5. Session logs sync.
6. Network failure does not lose local progress.
7. `Disconnect Sync` stops cloud writes but preserves local progress.
8. Existing export/import still works.
9. Reset progress only resets local progress unless explicitly designed to reset cloud progress.

## Open Decisions Before Implementation

Resolve these before coding:

1. Should the app generate a long random sync code, or should the user type a memorable one?
2. Should `Reset Progress` also offer `Reset Cloud Progress`, or should cloud deletion be omitted?
3. Should the first version use whole-document last-write-wins or implement the merge strategy immediately?
4. Should Firebase config live in `assets/js/firebase-config.js`, or be injected by Vercel environment variables through a build step?

Recommended answers for version 1:

1. Generate a long random sync code, with manual copy support.
2. Do not reset cloud progress from version 1.
3. Implement merge for checkpoints and sessions; use latest/cloud preference for reflections.
4. Use `assets/js/firebase-config.js` for the first static-site version, and document that the Firebase config is public.

## Rollback Plan

If sync causes issues:

1. Disable sync in the UI.
2. Keep reading from `localStorage`.
3. Use existing export/import JSON as backup.
4. Remove Firebase script references from HTML if needed.

The app should remain fully usable without Firebase.

