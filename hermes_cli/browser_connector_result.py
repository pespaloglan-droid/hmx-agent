"""Bounded read-only controller results. No paths, arbitrary images or error text."""
from __future__ import annotations
import base64
import struct
from urllib.parse import urlsplit

MAX_FRAME = 8 * 1024 * 1024


def _origin(value):
    if not isinstance(value, str) or len(value) > 512:
        return None
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
            return None
        if parsed.path not in ('', '/') or parsed.query or parsed.fragment:
            return None
        if parsed.port is not None and not 0 < parsed.port < 65536:
            return None
        return f'{parsed.scheme}://{parsed.netloc}'
    except ValueError:
        return None


def _tab(row):
    if not isinstance(row, dict):
        return None
    origin = _origin(row.get('origin'))
    title = row.get('title')
    if origin is None or not isinstance(title, str):
        return None
    return {'title': ''.join(c for c in title if c.isprintable())[:160], 'origin': origin}


def tab_result(result):
    rows = result.get('tabs') if isinstance(result, dict) else None
    if not isinstance(rows, list) or len(rows) > 1024:
        return {'state': 'invalid_read_result'}
    tabs = [_tab(row) for row in rows]
    if any(row is None for row in tabs):
        return {'state': 'invalid_read_result'}
    return {'state': 'read_complete', 'tabs': tabs}


def screenshot_result(result):
    value = result.get('image_data_url') if isinstance(result, dict) else None
    prefix = 'data:image/png;base64,'
    if not isinstance(value, str) or not value.startswith(prefix) or len(value) > MAX_FRAME:
        return {'state': 'invalid_read_result'}
    try:
        data = base64.b64decode(value[len(prefix):], validate=True)
    except ValueError:
        return {'state': 'invalid_read_result'}
    if len(data) < 33 or data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
        return {'state': 'invalid_read_result'}
    width, height = struct.unpack('>II', data[16:24])
    if not 0 < width <= 8192 or not 0 < height <= 8192:
        return {'state': 'invalid_read_result'}
    return {'state': 'read_complete', 'image_data_url': value}


READ_RESULTS = {'browser_tabs': tab_result, 'browser_screenshot': screenshot_result}
