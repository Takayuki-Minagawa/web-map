#!/usr/bin/env python3
"""
シンプルなHTTPサーバー
WebMapアプリケーションをローカルで実行するための軽量サーバー
"""

import errno
import http.server
import socketserver
import webbrowser
import os
import sys

DEFAULT_PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def parse_port_argument():
    if len(sys.argv) < 2:
        return DEFAULT_PORT

    value = sys.argv[1]
    try:
        port = int(value)
        if not (0 < port < 65536):
            raise ValueError
        return port
    except ValueError:
        print(f"警告: 指定されたポート '{value}' は無効です。デフォルトポート {DEFAULT_PORT} を使用します。", file=sys.stderr)
        return DEFAULT_PORT


def acquire_server(preferred_port, max_attempts=10):
    last_error = None
    for offset in range(max_attempts):
        port = preferred_port + offset
        try:
            server = ReusableTCPServer(("", port), MyHTTPRequestHandler)
            return server, port, offset
        except OSError as exc:
            if exc.errno == errno.EADDRINUSE:
                last_error = exc
                continue
            raise

    if last_error is not None:
        raise last_error

    raise OSError("ポートの確保に失敗しました")


def main():
    os.chdir(DIRECTORY)

    preferred_port = parse_port_argument()

    try:
        httpd, bound_port, offset = acquire_server(preferred_port)
    except OSError as exc:
        print(f"ポート {preferred_port} を使用できませんでした: {exc}", file=sys.stderr)
        sys.exit(1)

    with httpd:
        print("===================================")
        print(" WebMap サーバーを起動しました")
        print("===================================")
        if offset:
            print(f" リクエストされたポート {preferred_port} は使用中のため、{bound_port} で待ち受けます")
        print(f" URL: http://localhost:{bound_port}")
        print(" 終了: Ctrl+C")
        print("===================================\n")

        # ブラウザを自動で開く
        webbrowser.open(f'http://localhost:{bound_port}')

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nサーバーを終了します...")
            sys.exit(0)

if __name__ == "__main__":
    main()
