# PhotoClass: Zone System Study

A private study dashboard for *The Practical Zone System for Film and Digital Photography* by Chris Johnson.

## What This App Is

- A **study progress tracker** that helps you read 45–60 minutes per day
- A **reflection journal** for writing notes on each chapter
- A **session log** for recording your daily study sessions
- A **progress dashboard** that shows how far you've come

## What This App Is NOT

- ❌ NOT a book reader — open the original XHTML chapters separately
- ❌ NOT a gallery or photo management tool
- ❌ NOT an online course platform
- ❌ NOT a public multi-user course — it's for your private study only
- ❌ NOT a rewritten version of the book content
- ❌ No required login

## Setup

### macOS Quick Start

The extracted book and generated unit data are already included in this project.
In Finder, double-click:

```text
start-macos.command
```

The script starts a private server on `127.0.0.1` and opens the site in your
default browser. Keep the Terminal window open while using PhotoClass. Press
`Control-C` in that window to stop the server.

If macOS blocks the first launch, right-click `start-macos.command`, choose
**Open**, then confirm **Open**.

You can also start it from Terminal:

```bash
./start-macos.command
```

The script works when the project path contains spaces or Chinese characters.
If port 8000 is already occupied, it automatically selects the next available
local port.

### Rebuild From the EPUB

### 1. Place the EPUB

Copy your EPUB file to:

```
source/book.epub
```

### 2. Extract the EPUB

```bash
python3 scripts/extract_epub.py
```

This unpacks the EPUB ZIP archive into `book/`, preserving all original XHTML,
images, and CSS files without modification.

### 3. Generate Unit Data

```bash
python3 scripts/generate_units.py
```

This reads the EPUB table of contents (`toc.ncx`) and creates `data/units.json`
with all chapters, checkpoints, and reflection prompts.

**Note:** You can manually edit `data/units.json` to adjust chapter titles,
checkpoint grouping, `estimatedDays`, or `priority` levels before using the app.

### 4. Run the Local Server

```bash
python3 scripts/serve.py --open
```

### 5. Open in Browser

Use the URL printed in Terminal, normally `http://localhost:8000/`.

> Always use the URL printed by the local server. Do not open `index.html`
> directly as a file; browser security restrictions prevent the app from
> loading its JSON and chapter files correctly.

## How Progress Is Stored

All progress data is stored in your browser's `localStorage` under the key:

```
photoclass-zone-system-progress-v1
```

Data includes:
- Completed checkpoints per unit
- Reflection text for each unit
- Session logs (date, minutes, note)

Progress is saved locally first, then automatically synced to Firebase
Firestore when the deployed app has Firebase configured.

## Cloud Sync

Cloud sync uses:

- Firebase Firestore
- One fixed sync code shared across devices
- `localStorage` as the local cache
- No login and no PIN

To configure Firebase:

1. Create a Firebase project.
2. Enable Firestore.
3. Add a Firebase Web App.
4. Put the Web App config and the fixed `PHOTOCLASS_SYNC_CODE` in
   `assets/js/firebase-config.js`.

Recommended Firestore collection:

```text
progress_profiles
```

See the full execution plan and draft Firestore rules in:

```text
docs/firebase-sync-plan.md
```

Copyable Firestore rules are also available in:

```text
docs/firestore.rules
```

After deployment, the app syncs invisibly. Progress changes are saved to
`localStorage` first, then pushed to Firestore. Other devices use the same fixed
sync code, pull the Firestore progress, merge it with any local progress, and
keep listening for live Firestore updates while the page stays open.

## Export & Import

To back up your progress or move it to another browser:

1. On the Dashboard, click **Export Progress** to download a JSON file
2. On another browser/computer, click **Import Progress** and select the JSON file

Export files are named `photoclass-progress-YYYY-MM-DD.json`.

## Unit Progress Rules

- **Unit progress** = completed checkpoints ÷ total checkpoints
- **Overall progress** = all completed checkpoints across core units ÷ total core checkpoints
- Reference units (Appendices) do not count toward overall progress

### Unit Statuses

| Status | Meaning |
|---|---|
| Not Started | No checkpoints completed |
| In Progress | Some checkpoints done |
| Reflection Needed | All checkpoints done, reflection is empty |
| Complete | All checkpoints done + reflection written |
| Reference | Reference unit (not counted in progress) |

## Daily Study Flow

1. Double-click `start-macos.command`, or run `python3 scripts/serve.py --open`
2. Click **Continue** on the current unit
3. Read for 45–60 minutes
4. Check off the sections you've read
5. Write a short reflection (2–5 sentences per field)
6. Record your session (date, minutes, note)
7. Close the browser

## Important: Copyright Notice

This app is for **private personal study only**. The EPUB book content remains
in the original XHTML files inside `book/`. This app does NOT rewrite, republish,
or redistribute the copyrighted book content. Do not deploy this app publicly
or share the `book/` directory with others.

## Tech Stack

- Plain HTML, CSS, JavaScript (no frameworks)
- Optional Firebase Firestore cloud sync
- Python 3 (for EPUB tools and local serving)
- `localStorage` for data persistence
- Python 3 standard library for private local serving

## License

This project is for personal use only. The book content is copyrighted material
and must not be redistributed.
