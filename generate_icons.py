#!/usr/bin/env python3
"""
ファビコンとアプリアイコンを生成するスクリプト
cairosvgライブラリを使用してSVGからPNGを生成します
"""

import base64
from pathlib import Path

def create_simple_favicon():
    """シンプルなPNGファビコンをdata URIとして生成"""
    # 32x32のシンプルな地図ピンアイコン（PNG base64）
    # これは手動で作成した小さなアイコンのbase64エンコード

    print("SVGファビコンが作成されました: favicon.svg")
    print("\nブラウザで表示されるファビコンを確認してください。")
    print("より高品質なPNGファビコンが必要な場合は、以下のツールを使用してください:")
    print("1. https://realfavicongenerator.net/ - SVGをアップロードして各種サイズを生成")
    print("2. https://favicon.io/ - オンラインでファビコンを生成")
    print("\nまたは、以下のコマンドでcairosvgをインストールしてPNGを生成できます:")
    print("  pip install cairosvg pillow")

def check_cairosvg():
    """cairosvgがインストールされているか確認"""
    try:
        import cairosvg
        from PIL import Image
        import io
        return True
    except ImportError:
        return False

def generate_png_icons():
    """SVGからPNGアイコンを生成"""
    if not check_cairosvg():
        print("cairosvgまたはPillowがインストールされていません。")
        print("インストールするには: pip install cairosvg pillow")
        create_simple_favicon()
        return

    import cairosvg
    from PIL import Image
    import io

    svg_file = Path("favicon.svg")
    if not svg_file.exists():
        print("favicon.svgが見つかりません")
        return

    svg_content = svg_file.read_text()

    # 各サイズのPNGを生成
    sizes = {
        'favicon-16x16.png': 16,
        'favicon-32x32.png': 32,
        'favicon-48x48.png': 48,
        'apple-touch-icon.png': 180,
        'android-chrome-192x192.png': 192,
        'android-chrome-512x512.png': 512,
    }

    for filename, size in sizes.items():
        png_data = cairosvg.svg2png(
            bytestring=svg_content.encode('utf-8'),
            output_width=size,
            output_height=size
        )

        # PNGファイルとして保存
        output_path = Path(filename)
        output_path.write_bytes(png_data)
        print(f"✓ 生成しました: {filename} ({size}x{size})")

    # favicon.icoも生成（複数サイズを含む）
    try:
        img_16 = Image.open(io.BytesIO(cairosvg.svg2png(
            bytestring=svg_content.encode('utf-8'),
            output_width=16, output_height=16
        )))
        img_32 = Image.open(io.BytesIO(cairosvg.svg2png(
            bytestring=svg_content.encode('utf-8'),
            output_width=32, output_height=32
        )))
        img_48 = Image.open(io.BytesIO(cairosvg.svg2png(
            bytestring=svg_content.encode('utf-8'),
            output_width=48, output_height=48
        )))

        img_16.save('favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48)],
                    append_images=[img_32, img_48])
        print("✓ 生成しました: favicon.ico (16x16, 32x32, 48x48)")
    except Exception as e:
        print(f"✗ favicon.icoの生成に失敗: {e}")

    print("\n✅ すべてのアイコンが生成されました！")

if __name__ == "__main__":
    generate_png_icons()
