"""Static safety/serialization checks; browser behavior is tested separately."""
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / 'skills/hanchou-orchestrator/assets/status-view.html'


def compose(payload):
    encoded = base64.b64encode(json.dumps(payload, ensure_ascii=False).encode()).decode()
    return TEMPLATE.read_text().replace('>e30=</script>', '>' + encoded + '</script>')


class StatusViewTests(unittest.TestCase):
    def test_exact_csp_hashes_and_no_active_resources(self):
        text = TEMPLATE.read_text()
        for tag in ('style', 'script'):
            blocks = re.findall(r'<' + tag + r'>(.*?)</' + tag + '>', text, re.S)
            self.assertEqual(len(blocks), 1)
            digest = base64.b64encode(hashlib.sha256(blocks[0].encode()).digest()).decode()
            self.assertIn("'sha256-" + digest + "'", text)
        self.assertIn("default-src 'none'", text)
        self.assertIn("connect-src 'none'", text)
        self.assertNotRegex(text, r'\b(?:src|onload|onclick)=')
        script = re.findall(r'<script>(.*?)</script>', text, re.S)[0]
        self.assertNotRegex(script, r'\b(?:fetch|XMLHttpRequest|WebSocket|eval|setInterval|setTimeout|localStorage|serviceWorker|innerHTML|outerHTML|insertAdjacentHTML)\b')
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'syntax.js'
            path.write_text(script)
            subprocess.run(['node', '--check', str(path)], check=True, capture_output=True)

    def test_untrusted_payload_cannot_break_markup(self):
        evil = '</script><script>alert(1)</script><img src=x onerror=alert(1)>\u2028日本語 & "'
        html = compose({'version': 1, 'title': evil})
        self.assertNotIn(evil, html)
        self.assertEqual(html.count('<script'), 2)
        encoded = re.search(r'type="application/octet-stream">(.*?)</script>', html).group(1)
        self.assertEqual(json.loads(base64.b64decode(encoded))['title'], evil)

    def test_fixture_has_separate_facts_and_stable_identity(self):
        data = json.loads((ROOT / 'tests/fixtures/status-view.json').read_text())
        trees = data['worktrees']
        self.assertEqual(trees[1]['label'], trees[2]['label'])
        self.assertNotEqual(trees[1]['identity'], trees[2]['identity'])
        self.assertEqual(data['requests'][0]['lifecycle']['acceptance'], 'pending')
        self.assertEqual(data['requests'][2]['lifecycle']['pr'], 'closed')
        self.assertEqual(data['requests'][3]['quality'], 'stale')
        self.assertEqual(data['requests'][4]['quality'], 'conflict')
        self.assertEqual(data['requests'][1]['original'], {})
