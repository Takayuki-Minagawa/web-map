#!/usr/bin/env python3
"""
シンプルなHTTPサーバー
WebMapアプリケーションをローカルで実行するための軽量サーバー
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def main():
    os.chdir(DIRECTORY)

    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"===================================")
        print(f" WebMap サーバーを起動しました")
        print(f"===================================")
        print(f" URL: http://localhost:{PORT}")
        print(f" 終了: Ctrl+C")
        print(f"===================================\n")

        # ブラウザを自動で開く
        webbrowser.open(f'http://localhost:{PORT}')

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nサーバーを終了します...")
            sys.exit(0)

if __name__ == "__main__":
    main()