#!/usr/bin/env python3
"""Local dev server for the Billy Crystal 860 site.

`python3 -m http.server` lets the browser cache css/ and js/, so edits often
don't appear without a hard reload. This sends no-store on everything, which
makes a plain refresh enough.

    python3 dev/serve.py          -> http://localhost:8000
    python3 dev/serve.py 8080
"""

import functools
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()


if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    handler = functools.partial(Handler, directory=ROOT)

    with socketserver.TCPServer(('127.0.0.1', PORT), handler) as httpd:
        print(f'Billy Crystal 860 dev server -> http://localhost:{PORT}')
        httpd.serve_forever()
