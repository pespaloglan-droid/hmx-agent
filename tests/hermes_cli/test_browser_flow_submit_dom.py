"""Native local Chromium: observed Agent button, without assumed wrapper tag."""
import json
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from hermes_platform.resolver import locate_command
from hermes_cli.browser_flow_agent import agent_expression
from hermes_cli.browser_flow_stage import build_stage_message
from hermes_cli.browser_flow_submit import submit_expression

URL = 'https://flow.google.com/project/11111111-2222-3333-4444-555555555555'


def fixture_script(origin):
    message = build_stage_message([{'name': 'hmx_test_a', 'prompt': 'Local fixture'}])
    guard = submit_expression(URL, message).replace('https://flow.google.com', origin)
    click = submit_expression(URL, message, click=True).replace('https://flow.google.com', origin)
    # Execute the production expression on a local fixture. No Google account,
    # source-text assertions or browser/OS emulation is involved.
    return '''window.addEventListener('load', () => {
      const message = MESSAGE;
      const results = {};
      window.clicks = 0;
      const reset = () => {
        document.querySelector('#fixture').innerHTML = `<div id="editor" contenteditable="true" style="width:400px;min-height:100px"></div><div class="mode-wrapper"><button id="agent" class="agent-mode-chip agent-mode-chip-checked" aria-pressed="true">Агент</button></div><button id="send">arrow_forward</button>`;
        document.querySelector('#editor').innerText = message;
        document.querySelector('#send').onclick = () => { window.clicks++; };
      };
      const read = () => GUARD;
      const send = () => CLICK;
      reset(); results.selected = read().state;
      document.querySelector('#agent').setAttribute('aria-pressed', 'false');
      results.inactive = send().state;
      reset(); document.querySelector('#agent').removeAttribute('aria-pressed');
      results.unknown = send().state;
      reset(); document.querySelector('#agent').disabled = true;
      results.disabled = send().state;
      reset(); document.querySelector('#agent').setAttribute('aria-disabled', 'true');
      results.aria_disabled = send().state;
      reset(); document.querySelector('#agent').after(document.querySelector('#agent').cloneNode(true));
      results.ambiguous = send().state;
      document.querySelectorAll('#agent')[1].style.display = 'none';
      results.hidden_duplicate = read().state;
      reset(); document.querySelector('#agent').remove(); results.missing = send().state;
      reset(); document.querySelector('#editor').innerText += ' changed';
      results.changed_text = send().state;
      reset(); results.guard_clicks = window.clicks;
      results.clicked = send().state; results.total_clicks = window.clicks;
      document.querySelector('#results').textContent = JSON.stringify(results);
    });'''.replace('GUARD', guard).replace('CLICK', click).replace('MESSAGE', json.dumps(message))


def test_observed_selected_button_does_not_require_a_custom_wrapper(tmp_path):
    command = locate_command('chromium').command
    node = locate_command('node').command
    if not command or not node:
        pytest.skip('Native Chromium/Node is not installed; synthetic CDP tests still run')
    package = subprocess.run([*node, '-p', "require.resolve('playwright')"],
                             capture_output=True, text=True, timeout=10, check=False)
    if package.returncode:
        pytest.skip('Optional native DOM fixture needs the Playwright Node package')
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            origin = f'http://127.0.0.1:{self.server.server_port}'
            script = fixture_script(origin)
            body = '<div id="fixture"></div><pre id="results"></pre><script>' + script + '</script>'
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.end_headers()
            self.wfile.write(body.encode())
        def log_message(self, *_args):
            return
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True); worker.start()
    try:
        origin = f'http://127.0.0.1:{server.server_port}'
        script = """const {chromium} = require(process.argv[3]);
        (async () => {
          const browser = await chromium.launch({executablePath:process.argv[2], args:['--no-sandbox']});
          try {
            const page = await browser.newPage();
            await page.goto(process.argv[1]);
            const cdp = await page.context().newCDPSession(page);
            const before = await page.evaluate(() => ({clicks:window.clicks, text:document.querySelector('#editor').innerText}));
            const diagnostic = await cdp.send('Runtime.evaluate', {
              expression:process.argv[4], returnByValue:true, throwOnSideEffect:true, timeout:5000});
            require('node:assert/strict').equal(diagnostic.exceptionDetails, undefined);
            require('node:assert/strict').equal(diagnostic.result.value.markers.agent_pressed, 'true');
            require('node:assert/strict').equal(diagnostic.result.value.markers.agent_visible_count, 1);
            const after = await page.evaluate(() => ({clicks:window.clicks, text:document.querySelector('#editor').innerText}));
            require('node:assert/strict').deepEqual(after, before);
            console.log(await page.locator('#results').innerText());
          } finally { await browser.close(); }
        })().then(() => process.exit(0)).catch(() => process.exit(1));"""
        result = subprocess.run([*node, '-e', script,
            origin + '/project/11111111-2222-3333-4444-555555555555', command[0], package.stdout.strip(),
            agent_expression(URL).replace('https://flow.google.com', origin)],
            capture_output=True, text=True, encoding='utf-8', timeout=30, check=True)
        actual = json.loads(result.stdout)
        assert actual == {
            'selected': 'submit_ready', 'inactive': 'agent_not_selected',
            'unknown': 'agent_not_selected', 'disabled': 'agent_not_selected',
            'aria_disabled': 'agent_not_selected', 'ambiguous': 'agent_not_selected',
            'hidden_duplicate': 'submit_ready', 'missing': 'agent_not_selected',
            'changed_text': 'text_mismatch', 'guard_clicks': 0,
            'clicked': 'submit_clicked', 'total_clicks': 1,
        }
    finally:
        server.shutdown(); worker.join(timeout=5); server.server_close()
