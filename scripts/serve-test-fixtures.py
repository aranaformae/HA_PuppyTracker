"""Serve browser fixtures locally, including concurrent ES-module imports."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class FixtureServer(ThreadingHTTPServer):
    # Chromium can load several dependency trees at once across browser workers.
    request_queue_size = 128


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    with FixtureServer(("127.0.0.1", 4173), handler) as server:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
