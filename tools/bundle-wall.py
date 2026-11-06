#!/usr/bin/env python3
"""Build wall/index.html: one self-contained file (Three.js, effects and the story inlined) from wall/src/index.html."""
import os, re, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'wall')
src_dir = os.path.join(root, 'src')
html = open(os.path.join(src_dir, 'index.html'), encoding='utf-8').read()
def inline(m):
    path = os.path.normpath(os.path.join(src_dir, m.group(1)))
    code = open(path, encoding='utf-8').read()
    assert '</script' not in code.lower(), path
    return '<script>\n' + code + '\n</script>'
out = re.sub(r'<script src="([^"]+)"></script>', inline, html)
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(out)
print('wrote wall/index.html', len(out) // 1024, 'KB')
