#!/bin/zsh

set -e

PROJECT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$PROJECT_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  print "PhotoClass requires Python 3."
  print "Install it with Homebrew: brew install python"
  read "?Press Return to close..."
  exit 1
fi

exec python3 -u scripts/serve.py --open
