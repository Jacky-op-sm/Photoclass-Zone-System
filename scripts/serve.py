#!/usr/bin/env python3
"""Serve PhotoClass locally from the project root."""

from __future__ import annotations

import argparse
import functools
import http.server
import socket
import sys
import threading
import webbrowser
from pathlib import Path


HOST = "127.0.0.1"
DEFAULT_PORT = 8000
PORT_SEARCH_LIMIT = 20


class LocalOnlyHandler(http.server.SimpleHTTPRequestHandler):
    """Development handler with predictable UTF-8 and cache behavior."""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def valid_port(value: str) -> int:
    try:
        port = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("port must be an integer") from error
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be between 1 and 65535")
    return port


def find_available_port(start_port: int) -> int:
    end_port = min(start_port + PORT_SEARCH_LIMIT, 65536)
    for port in range(start_port, end_port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            try:
                probe.bind((HOST, port))
            except OSError:
                continue
            return port
    raise RuntimeError(
        f"No available port found between {start_port} "
        f"and {start_port + PORT_SEARCH_LIMIT - 1}."
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the PhotoClass local server.")
    parser.add_argument(
        "--port",
        type=valid_port,
        default=DEFAULT_PORT,
        help=f"preferred local port (default: {DEFAULT_PORT})",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        dest="open_browser",
        help="open the site in the default browser",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = project_root()

    required_files = (root / "index.html", root / "data" / "units.json")
    missing = [str(path) for path in required_files if not path.is_file()]
    if missing:
        print("ERROR: Required project files are missing:", file=sys.stderr)
        for path in missing:
            print(f"  {path}", file=sys.stderr)
        return 1

    try:
        port = find_available_port(args.port)
    except RuntimeError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    handler = functools.partial(LocalOnlyHandler, directory=str(root))
    server = http.server.ThreadingHTTPServer((HOST, port), handler)
    server.daemon_threads = True
    url = f"http://localhost:{port}/"

    print("PhotoClass local server")
    print(f"Project: {root}")
    if port != args.port:
        print(f"Port {args.port} is in use; using port {port} instead.")
    print(f"Open:    {url}")
    print("Press Control-C to stop the server.")

    if args.open_browser:
        threading.Timer(0.4, webbrowser.open, args=(url,)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping PhotoClass server.")
    finally:
        server.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
