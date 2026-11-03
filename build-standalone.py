"""รวม www/ ทั้งหมดเป็นไฟล์ HTML ไฟล์เดียว (ใช้งานออฟไลน์ได้ทันที)
วิธีรัน: python3 build-standalone.py  -> ได้ inspect.html"""
import pathlib
root = pathlib.Path(__file__).parent / 'www'
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'style.css').read_text(encoding='utf-8')
js = (root / 'app.js').read_text(encoding='utf-8')
assert '</script' not in js.lower()
html = html.replace('<link rel="stylesheet" href="style.css">', f'<style>\n{css}\n</style>')
html = html.replace('<script src="app.js"></script>', f'<script>\n{js}\n</script>')
assert 'style.css' not in html and 'app.js' not in html
out = pathlib.Path(__file__).parent / 'inspect.html'
out.write_text(html, encoding='utf-8')
print(out, round(out.stat().st_size / 1024), 'KB')
