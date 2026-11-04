#!/usr/bin/env python3
"""Real Git, process identities and Unix sockets; no agent inference or user server."""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from datetime import datetime, timedelta, timezone
from lifecycle_support import CALLER_BINDINGS, fixture_environment, require_lifecycle_permissions

ROOT = Path(__file__).resolve().parents[1]
LAUNCH = ROOT / 'skills/hanchou-orchestrator/scripts/launch-sokkin.sh'

NATIVE_ID = '11111111-1111-4111-8111-111111111111'

def codex_status(directory_lines, native_id=NATIVE_ID, column=23):
    # Synthetic 0.164.0 FieldFormatter rows, including the observed 94-column
    # Directory continuation layout; no account or usage text from live evidence.
    return ('  >_ OpenAI Codex (v0.164.0)\n\n' +
            '  Directory:'.ljust(column) + directory_lines[0] + '\n' +
            ''.join(' ' * column + line + '\n' for line in directory_lines[1:]) +
            '  Permissions:'.ljust(column) + 'Workspace (Ask for approval)\n' +
            '  Agents.md:'.ljust(column) + 'AGENTS.md\n' +
            '  Session:'.ljust(column) + native_id + '\n\n')


class NativeStatusLayout(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Exercise the shipped jq filter, not a second implementation of it.
        source = LAUNCH.read_text().split('status_id=$(jq -Rser ', 1)[1]
        cls.query = source.split("'\n", 1)[1].split("\n    ' \"$tmp/bind-status.txt\"", 1)[0]

    def parse(self, text, cwd, provider='codex'):
        return subprocess.run(['jq','-Rser','--arg','provider',provider,
                               '--arg','cwd',cwd,'--arg','home','/home/fixture',self.query],
                              input=text,text=True,capture_output=True,check=False)

    def test_complete_paths(self):
        for fragments, cwd in [
            (['/workspace/native-status/fixture'], '/workspace/native-status/fixture'),
            (['~'], '/home/fixture'),
            (['~/research/native-status/fixture'], '/home/fixture/research/native-status/fixture'),
            (['/workspace/native-status/', 'task-worktrees/fixture'], '/workspace/native-status/task-worktrees/fixture'),
            (['~/orca/research/hanchou-status-wrap-fixture-20261105/',
              'task-worktrees/native-status-repro-0000000000000000'],
             '/home/fixture/orca/research/hanchou-status-wrap-fixture-20261105/task-worktrees/native-status-repro-0000000000000000'),
            (['/workspace/資料 with  spaces/実装'], '/workspace/資料 with  spaces/実装'),
            (['~/資料 with  spaces/', '実装/e\u0301'], '/home/fixture/資料 with  spaces/実装/e\u0301'),
            (['/workspace/long-component-', 'continued/', 'fixture'], '/workspace/long-component-continued/fixture'),
        ]:
            with self.subTest(fragments=fragments):
                result = self.parse(codex_status(fragments), cwd)
                self.assertEqual((result.returncode,result.stdout), (0,NATIVE_ID+'\n'), result.stderr)
        result = self.parse(codex_status(['/workspace/child/', 'fixture'], column=19), '/workspace/child/fixture')
        self.assertEqual((result.returncode,result.stdout), (0,NATIVE_ID+'\n'), result.stderr)

    def test_reject_incomplete_or_ambiguous_layout(self):
        fragments = ['/workspace/native-status/', 'task-worktrees/fixture']
        cwd = ''.join(fragments); status = codex_status(fragments)
        continuation = ' ' * 23 + fragments[1] + '\n'
        cases = {
            'duplicate directory': status + '  Directory:           '+cwd+'\n',
            'duplicate permissions': status + '  Permissions:         Workspace\n',
            'duplicate session': status + '  Session:             '+NATIVE_ID+'\n',
            'missing continuation': status.replace(continuation, ''),
            'misaligned continuation': status.replace(continuation, ' '+continuation),
            'gap in directory': status.replace(continuation, '\n'+continuation),
            'foreign continuation': status.replace('task-worktrees/fixture', 'task-worktrees/foreign'),
            'extra continuation': status.replace(continuation, continuation+' '*23+'extra\n'),
            'unicode ellipsis': status.replace('task-worktrees', '…'),
            'ascii ellipsis': status.replace('task-worktrees', '...'),
            'missing terminator': status.split('  Permissions:', 1)[0],
            'misaligned terminator': status.replace('  Permissions:         ', '  Permissions:          '),
            'foreign session': status.replace(NATIVE_ID, '22222222-2222-4222-8222-222222222222'),
            'partial session': status.replace(NATIVE_ID, NATIVE_ID[:-1]),
            'wrapped session': status.replace(NATIVE_ID, NATIVE_ID[:20]+'\n'+' '*23+NATIVE_ID[20:]),
            'extra session continuation': status.replace(NATIVE_ID+'\n', NATIVE_ID+'\n'+' '*23+'extra\n'),
            'unqualified version': status.replace('0.164.0', '9.9.9'),
        }
        for name, text in cases.items():
            with self.subTest(case=name):
                result = self.parse(text, cwd)
                # A different valid UUID is rejected by bind_identity after parsing.
                if name == 'foreign session':
                    self.assertEqual(result.stdout, '22222222-2222-4222-8222-222222222222\n')
                else:
                    self.assertNotEqual(result.returncode, 0, result.stdout)
        for fragments, expected in [
            (['~/workspace/native-status'], '/workspace/native-status'),
            (['~-sibling/fixture'], '/home/fixture-sibling/fixture'),
            (['/workspace/space', 'name/fixture'], '/workspace/space name/fixture'),
            (['/workspace/with  spaces/fixture'], '/workspace/with spaces/fixture'),
            (['/workspace/…/fixture'], '/workspace/…/fixture'),
        ]:
            with self.subTest(fragments=fragments,expected=expected):
                self.assertNotEqual(self.parse(codex_status(fragments), expected).returncode, 0)

    def test_claude_status_unchanged(self):
        status = ('Version: 2.1.317\nSession kind: interactive\ncwd: /workspace/with spaces\n'
                  'Session ID: '+NATIVE_ID+'\n')
        result = self.parse(status, '/workspace/with spaces', provider='claude')
        self.assertEqual((result.returncode,result.stdout), (0,NATIVE_ID+'\n'))


MOCK = r'''#!/usr/bin/env python3
import sys, os, json, socket, signal, time, subprocess
from pathlib import Path
root=Path(os.environ['MOCK_SERVERS']); args=sys.argv[1:]
def emit(x): print(json.dumps(x))
if args[:2]==['session','list']:
 emit({'sessions':[{'name':p.name} for p in root.iterdir() if p.is_dir()]});sys.exit()
assert args[0]=='--session',args
name=args[1]; args=args[2:]; d=root/name
if args==['server']:
 d.mkdir(); sock=socket.socket(socket.AF_UNIX); sock.bind(str(d/'s')); (d/'pid').write_text(str(os.getpid()))
 child=None; pane=None
 def stop(*a):
  if child is not None: child.terminate(); child.wait()
  if pane is not None: pane.terminate(); pane.wait()
  sock.close(); (d/'s').unlink();sys.exit()
 signal.signal(signal.SIGTERM,stop)
 while True:
  if (d/'want-pane').exists() and pane is None:
   pane=subprocess.Popen(['/bin/bash'],stdin=subprocess.PIPE,cwd=(d/'cwd').read_text())
   (d/'pane-pid').write_text(str(pane.pid))
  if (d/'background').exists() and child is None:
   child=subprocess.Popen(['sleep','600']); (d/'background-ready').touch()
  if not (d/'background').exists() and child is not None:
   child.terminate(); child.wait(); child=None; (d/'background-ready').unlink(missing_ok=True)
  time.sleep(.01)
if args==['status','--json']:
 if not (d/'s').exists(): sys.exit(1)
 emit({'server':{'running':True,'compatible':True,'session':name+'-changed' if (d/'status-drift').exists() else name,'socket':str(d/'s')}})
elif args[:2]==['workspace','create']:
 cwd=args[args.index('--cwd')+1]; (d/'cwd').write_text(cwd)
 record=Path(next(a.split('=',1)[1] for a in args if a.startswith('HANCHOU_INSTANCE_RECORD=')))
 (d/'record').write_text(str(record))
 if os.environ.get('MOCK_INSPECT_PANES') or os.environ.get('MOCK_LATE_ID'):
  (d/'want-pane').touch()
  for _ in range(100):
   if (d/'pane-pid').exists(): break
   time.sleep(.01)
 collision=os.environ.get('MOCK_EVIDENCE_COLLISION')
 if collision:
  record=Path(next(a.split('=',1)[1] for a in args if a.startswith('HANCHOU_INSTANCE_RECORD=')))
  target=record.parent/'launch'
  if collision=='symlink':
   outside=root/'unrelated-evidence'; outside.mkdir(exist_ok=True)
   (outside/'receipt.json').write_text('unrelated evidence\n'); target.symlink_to(outside)
  else:
   target.mkdir(); (target/'receipt.json').write_text('prior evidence\n')
 emit({'result':{'workspace':{'workspace_id':'w2'},'tab':{'tab_id':'w2:t1'},'root_pane':{'pane_id':'w2:p1','cwd':cwd}}})
elif args[:2]==['agent','start']:
 if os.environ.get('MOCK_START_FAIL'): sys.exit(1)
 late=bool(os.environ.get('MOCK_LATE_ID'))
 if late:
  (d/'late-process').write_text(json.dumps(['codex']+args[args.index('--')+1:]))
 emit({'result':{'agent':{'agent':'codex','agent_status':'idle','pane_id':'w2:p1','cwd':(d/'cwd').read_text(),'agent_session':None if late else {'kind':'id','value':'test-native'}}}})
elif args==['pane','get','w2:p1']:
 native={'kind':'id','value':(d/'public-native').read_text()} if (d/'public-native').exists() else None
 offset=int((d/'scroll-offset').read_text()) if (d/'scroll-offset').exists() else 0
 emit({'result':{'pane':{'pane_id':'w2:p1','workspace_id':'w2','agent':'codex','agent_status':'idle','cwd':(d/'cwd').read_text(),'agent_session':native,'scroll':{'offset_from_bottom':offset}}}})
elif args==['pane','read','w2:p1','--source','visible','--format','text']:
 print((d/'native-status').read_text())
 if (d/'status-process-drift').exists():
  argv=json.loads((d/'late-process').read_text()); argv.append('--unexpected')
  (d/'late-process').write_text(json.dumps(argv))
elif args==['api','snapshot']:
 if os.environ.get('MOCK_INSPECT_MUTATE'):
  record=Path((d/'record').read_text()); mode=os.environ['MOCK_INSPECT_MUTATE']
  if mode=='record': record.write_text(record.read_text()+'\n')
  elif mode=='lock': (record.parent/'lock').mkdir(exist_ok=True)
  elif mode=='report': (record.parent/'report.txt').write_text('concurrent change\n')
  elif mode=='launch':
   f=record.parent/'launch/receipt.json'; f.write_text(f.read_text()+'\n')
  elif mode=='server': (d/'status-drift').touch()
 panes=json.loads((d/'panes.json').read_text()) if (d/'panes.json').exists() else ([{'pane_id':'w2:p1','workspace_id':'w2'}] if (d/'pane-pid').exists() else [])
 agents=json.loads((d/'agents.json').read_text()) if (d/'agents.json').exists() else ([{'agent_status':'working','pane_id':'w2:p1','workspace_id':'w2','agent_session':{'kind':'id','value':'test-native'}}] if (d/'busy').exists() else [])
 if (d/'late-process').exists():
  agents=[{'agent_status':'idle','pane_id':'w2:p1','workspace_id':'w2','agent_session':{'kind':'id','value':(d/'public-native').read_text()} if (d/'public-native').exists() else None}]
 emit({'result':{'snapshot':{'agents':agents,'panes':panes}}})
elif args[:2]==['pane','process-info']:
 assert args[2:]==['--pane','w2:p1']
 if (d/'process-info.json').exists(): emit(json.loads((d/'process-info.json').read_text()))
 elif (d/'late-process').exists():
  pid=int((d/'pane-pid').read_text()); argv=json.loads((d/'late-process').read_text())
  emit({'result':{'process_info':{'pane_id':'w2:p1','shell_pid':pid,'foreground_processes':[{'pid':pid,'name':'codex','argv':argv,'cwd':(d/'cwd').read_text()}]}}})
 else:
  pid=int((d/'pane-pid').read_text())
  emit({'result':{'process_info':{'pane_id':'w2:p1','shell_pid':pid,'foreground_processes':[{'pid':pid,'name':'bash','argv':['/bin/bash'],'cwd':(d/'cwd').read_text()}]}}})
elif args[:2]==['session','stop']:
 assert args[2]==name
 with (root/'stops').open('a') as f: f.write(name+'\n')
 if (d/'stop-fail').exists(): sys.exit(1)
 os.kill(int((d/'pid').read_text()),signal.SIGTERM)
 emit({'stopped':True})
else: raise RuntimeError(args)
'''

class Lifecycle(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        require_lifecycle_permissions()
        cls.tmp = Path(tempfile.mkdtemp(prefix='hl-', dir='/tmp'))
        cls.repo = cls.tmp / 'human checkout'
        cls.repo.mkdir()
        cls.servers = cls.tmp / 'servers'
        cls.servers.mkdir()
        cls.bin = cls.tmp / 'bin'
        cls.bin.mkdir()
        for name, content in [('herdr', MOCK), ('codex', '#!/bin/sh\nexit 99\n')]:
            p = cls.bin / name
            p.write_text(content)
            p.chmod(0o755)
        cls.env = fixture_environment(PATH=str(cls.bin)+os.pathsep+os.environ['PATH'],
                       HERDR_BIN=str(cls.bin/'herdr'), MOCK_SERVERS=str(cls.servers))
        for args in [('init','-q'), ('config','user.name','Fixture'), ('config','user.email','fixture@example.invalid')]:
            cls.git(*args)
        (cls.repo/'tracked').write_text('base\n')
        (cls.repo/'.gitignore').write_text('.hanchou/\n')
        cls.git('add','.')
        cls.git('commit','-qm','base')
        (cls.repo/'tracked').write_text('staged\n')
        cls.git('add','tracked')
        (cls.repo/'tracked').write_text('unstaged\n')
        (cls.repo/'untracked').write_text('human\n')
        (cls.repo/'.hanchou').mkdir()
        (cls.repo/'.hanchou/config.json').write_text('{"version":2,"sokkin":{"agent":"codex"}}')
        cls.baseline = cls.snapshot()

    @classmethod
    def git(cls, *args):
        return subprocess.check_output(['git','--no-optional-locks','-C',str(cls.repo),*args])

    @classmethod
    def snapshot(cls):
        return (cls.git('rev-parse','HEAD'), cls.git('diff','--binary'),
                cls.git('diff','--cached','--binary'), cls.git('status','--porcelain=v1'),
                (cls.repo/'.git/index').read_bytes(), (cls.repo/'untracked').read_bytes(),
                (cls.repo/'.hanchou/config.json').read_bytes())

    @classmethod
    def tearDownClass(cls):
        for pidfile in cls.servers.glob('*/pid'):
            if (pidfile.parent/'s').exists():
                try: os.kill(int(pidfile.read_text()), 15)
                except ProcessLookupError: pass
        import time
        for _ in range(100):
            if not list(cls.servers.glob('*/s')): break
            time.sleep(.02)
        shutil.rmtree(cls.tmp)

    def run_script(self, *args, ok=True, env=None, cleanup_group=False):
        command = ['bash',str(LAUNCH),'--project',str(self.repo),*args]
        if cleanup_group:
            # Simulate an agent tool runner that cleans up its process group after
            # the launch command exits. Never signal the test runner/user group.
            child = subprocess.Popen(command, env=env or self.env, text=True,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     start_new_session=True)
            stdout,stderr = child.communicate(timeout=25)
            self.launch_group = child.pid
            try: os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError: pass
            p = subprocess.CompletedProcess(command, child.returncode, stdout, stderr)
        else:
            p = subprocess.run(command, env=env or self.env, text=True, capture_output=True, timeout=25)
        self.assertEqual(p.returncode==0, ok, (p.stdout,p.stderr))
        return json.loads(p.stdout) if p.stdout.strip() else None

    def launch(self, *args, **kw):
        r = self.run_script('--mission','fixture', *args, **kw)
        self.assertTrue(r['lifecycle']['owned'])
        self.record = Path(r['lifecycle']['record'])
        self.assertEqual(r['lifecycle']['status'], json.loads(self.record.read_text())['status'])
        self.assertEqual(r['lifecycle']['status'], 'RUNNING' if kw.get('ok', True) else 'UNKNOWN')
        self.key = r['lifecycle']['instanceKey']
        self.server = self.servers / r['herdr']['session']
        self.launch_receipt = r
        return r

    def preserved_receipt(self, receipt):
        evidence = receipt['evidence']
        self.assertEqual(evidence['hashKind'], 'git-blob')
        path = Path(evidence['receipt'])
        self.assertEqual(path, self.record.parent/'launch/receipt.json')
        self.assertEqual(evidence['hash'], self.git('hash-object', str(path)).decode().strip())
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
        self.assertLessEqual(path.stat().st_size, 65537)
        self.assertEqual([p.name for p in path.parent.iterdir()], ['receipt.json'])
        return json.loads(path.read_text())

    def test_full_launch_evidence(self):
        r = self.launch()
        self.assertEqual(r['receiptFormat'], 'full')
        full = self.preserved_receipt(r)
        self.assertEqual(full, {k:v for k,v in r.items() if k not in ('evidence','receiptFormat')})
        before = Path(r['evidence']['receipt']).read_bytes()
        self.finish(); self.accept(); self.age(); self.op('reap')
        self.assertEqual(Path(r['evidence']['receipt']).read_bytes(), before)
        self.assertEqual(self.snapshot(), self.baseline)

    def test_compact_launch_evidence(self):
        r = self.launch('--compact-receipt')
        self.assertEqual(r['receiptFormat'], 'compact')
        full = self.preserved_receipt(r)
        for key in ('ok','stage','startedAt','missionId','attemptId','config','worktree','herdr',
                    'lifecycle','error','resources'):
            self.assertEqual(r[key], full[key])
        self.assertEqual(r['identityReadiness']['status'], 'pending')
        self.assertEqual(r['usageReadiness']['status'], 'not_required')
        self.assertIsNone(r['sokkin']['process'])
        self.assertIn('sourceSnapshot', full)
        self.assertNotIn('sourceSnapshot', r)
        self.finish(); self.accept(); self.age(); self.op('reap')
        self.assertEqual(self.snapshot(), self.baseline)

    def test_failed_compact_launch_preserves_error(self):
        r = self.launch('--compact-receipt', ok=False, env=dict(self.env, MOCK_START_FAIL='1'))
        full = self.preserved_receipt(r)
        self.assertEqual(r['receiptFormat'], 'compact')
        self.assertEqual(r['error'], full['error'])
        self.assertEqual(r['error']['code'], 'agent_start_unconfirmed')
        self.assertEqual(full['lifecycle']['status'], 'UNKNOWN')
        self.assertNotEqual(r['usageReadiness']['status'], 'ready')
        self.assertTrue(Path(r['worktree']['path']).is_dir())
        self.assertTrue((self.server/'s').exists())
        self.assertEqual(self.snapshot(), self.baseline)

    def test_launch_evidence_collision_fails_closed(self):
        for collision in ('directory', 'symlink'):
            with self.subTest(collision=collision):
                r = self.launch('--compact-receipt', ok=False,
                                env=dict(self.env, MOCK_EVIDENCE_COLLISION=collision))
                self.assertEqual(r['receiptFormat'], 'full')
                self.assertIsNone(r['evidence'])
                self.assertEqual(r['error']['code'], 'launch_evidence_failed')
                self.assertEqual(r['identityReadiness']['status'], 'unavailable')
                self.assertEqual((self.record.parent/'launch/receipt.json').read_text(),
                                 'unrelated evidence\n' if collision=='symlink' else 'prior evidence\n')
                self.assertTrue(Path(r['worktree']['path']).is_dir())
                self.assertTrue((self.server/'s').exists())
        self.assertEqual(self.snapshot(), self.baseline)

    def test_compact_option_boundaries(self):
        r = self.run_script('--mission','INVALID','--compact-receipt', ok=False)
        self.assertEqual(r['receiptFormat'], 'full')
        self.assertIsNone(r['evidence'])
        self.assertEqual(r['resources'], [])
        r = self.run_script('--lifecycle','reap','--compact-receipt', ok=False)
        self.assertEqual(r['error']['code'], 'invalid_operation')

    def op(self, name, *args, **kw):
        return self.run_script('--lifecycle',name,'--instance',self.key,*args,**kw)

    def edit(self, **updates):
        s=json.loads(self.record.read_text());s.update(updates)
        self.record.write_text(json.dumps(s))

    def result(self):
        r = json.loads(self.record.read_text())
        return {'missionId':r['missionId'],'attemptId':r['attemptId'],
                'requestId':r.get('requestId'),'nativeId':r['nativeId'],'status':'succeeded',
                'artifactRefs':['fixture-artifact'],'verificationRefs':['fixture-test'],
                'authority':{'approved':True,'source':'fixture policy','scope':'fixture task'}}

    def finish(self):
        report = self.tmp/'report.txt'; report.write_text(json.dumps(self.result()))
        self.op('finish','--evidence',str(report))

    def acceptance(self):
        r = json.loads(self.record.read_text()); result = self.result()
        return {k:result[k] for k in ('missionId','attemptId','requestId','nativeId','authority')} | {
            'artifactsPreserved':True,'workersStopped':True,'independentAcceptance':True,
            'result':{'status':'succeeded','reportHash':r.get('reportHash'),
                      'artifactRefs':result['artifactRefs'],'verificationRefs':result['verificationRefs']}}

    def accept(self, **kw):
        evidence = self.tmp/'accept.json'; evidence.write_text(json.dumps(self.acceptance()))
        return self.op('accept','--evidence',str(evidence),**kw)

    def late_launch(self, *args):
        r = self.launch(*args, env=dict(self.env, MOCK_LATE_ID='1'))
        self.assertIsNone(r['sokkin']['nativeThreadId'])
        self.assertIsNotNone(r['sokkin']['process'])
        self.assertEqual(r['sokkin']['process']['observedArguments'], ['--no-daemon'])
        return r

    def binding_input(self, source='herdr'):
        r = self.launch_receipt
        return {'version':1,'missionId':r['missionId'],'attemptId':r['attemptId'],
                'requestId':r['requestId'],'nativeId':'11111111-1111-4111-8111-111111111111',
                'source':source,'launchHash':r['evidence']['hash'],
                'observedAt':datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}

    def bind(self, data, **kw):
        evidence = self.tmp/'identity.json'; evidence.write_text(json.dumps(data))
        return self.op('bind','--evidence',str(evidence),**kw)

    def test_late_native_binding_finish_accept_and_inspect(self):
        r = self.late_launch(); original = Path(r['evidence']['receipt']).read_bytes()
        claim = self.result(); claim['nativeId'] = self.binding_input()['nativeId']
        report = self.tmp/'unbound-report'; report.write_text(json.dumps(claim))
        self.assertEqual(self.op('finish','--evidence',str(report),ok=False)['error']['code'],'invalid_evidence')
        data = self.binding_input()
        self.assertEqual(self.bind(data,ok=False)['error']['code'],'native_identity_pending')
        (self.server/'public-native').write_text(data['nativeId'])
        result = self.bind(data)
        self.assertEqual(result['nativeId'],data['nativeId'])
        self.assertEqual(result['identityBinding']['source'],'herdr')
        self.assertEqual(Path(r['evidence']['receipt']).read_bytes(),original)
        self.assertEqual(self.bind(data,ok=False)['error']['code'],'invalid_transition')
        self.finish()
        (self.server/'late-process').unlink()  # fixture CLI exits, its real shell remains
        self.accept(); observation = self.op('inspect')['observation']
        self.assertTrue(observation['quiet']); self.assertEqual(observation['nativeId'],data['nativeId'])
        self.age(); self.op('reap')
        self.assertEqual(self.snapshot(),self.baseline)

    def test_late_binding_wrong_stale_and_restarted_evidence(self):
        self.late_launch(); data = self.binding_input(); original = self.record.read_bytes()
        (self.server/'public-native').write_text(data['nativeId'])
        for update in ({'nativeId':'foreign'}, {'requestId':'old-request'},
                       {'observedAt':'2000-01-01T00:00:00Z'}, {'launchHash':'wrong'}):
            with self.subTest(update=update):
                self.bind(data|update,ok=False); self.assertEqual(self.record.read_bytes(),original)
        process = self.launch_receipt['sokkin']['process']
        (self.server/'process-info.json').write_text(json.dumps({'result':{'process_info':{
            'foreground_processes':[{'pid':process['pid']+1,'name':'codex','cwd':process['cwd'],
                                     'argv':['codex','--no-daemon']}]}}}))
        self.assertEqual(self.bind(data,ok=False)['error']['code'],'instance_mismatch')
        (self.server/'process-info.json').unlink()
        subprocess.run(['git','-C',self.launch_receipt['worktree']['path'],
                        '-c','user.name=Fixture','-c','user.email=fixture@example.invalid',
                        'commit','--allow-empty','-qm','unexpected pre-assignment commit'],check=True)
        self.assertEqual(self.bind(data,ok=False)['error']['code'],'instance_mismatch')
        subprocess.run(['git','-C',self.launch_receipt['worktree']['path'],'reset','--hard',
                        self.launch_receipt['worktree']['head']],check=True,stdout=subprocess.DEVNULL)
        self.bind(data)
        (self.server/'public-native').write_text('restarted-native')
        report = self.tmp/'bound-report'; report.write_text(json.dumps(self.result()))
        self.assertEqual(self.op('finish','--evidence',str(report),ok=False)['error']['code'],'instance_mismatch')
        self.assertEqual(self.snapshot(),self.baseline)

    def test_native_status_binding_without_herdr_metadata(self):
        r = self.late_launch('--worktree-root', str(self.tmp/'資料 with  spaces'))
        data = self.binding_input('native-status'); cwd = Path(r['worktree']['path'])
        status = codex_status([str(cwd.parent)+'/', cwd.name], data['nativeId'])
        original = self.record.read_bytes(); launch = Path(r['evidence']['receipt']).read_bytes()
        for text in (status.replace(data['nativeId'],'22222222-2222-4222-8222-222222222222'),
                     status.replace('0.164.0','9.9.9'), status+'  Session: '+data['nativeId']+'\n',
                     status.replace(cwd.name,'other-checkout')):
            with self.subTest(status=text):
                (self.server/'native-status').write_text(text)
                self.bind(data,ok=False)
                self.assertEqual(self.record.read_bytes(),original)
                self.assertFalse((self.record.parent/'identity').exists())
        (self.server/'native-status').write_text(status)
        (self.server/'scroll-offset').write_text('1')
        self.assertEqual(self.bind(data,ok=False)['error']['code'],'native_identity_pending')
        (self.server/'scroll-offset').unlink()
        argv = (self.server/'late-process').read_bytes()
        (self.server/'status-process-drift').touch()
        self.assertEqual(self.bind(data,ok=False)['error']['code'],'instance_mismatch')
        (self.server/'status-process-drift').unlink(); (self.server/'late-process').write_bytes(argv)
        self.assertEqual(self.record.read_bytes(),original)
        self.edit(status='UNKNOWN')
        unknown = self.record.read_bytes()
        self.assertEqual(self.bind(data,ok=False)['error']['code'],'invalid_transition')
        self.assertEqual(self.record.read_bytes(),unknown)
        self.record.write_bytes(original)  # restore this isolated test fixture only
        self.bind(data)
        self.assertEqual(Path(r['evidence']['receipt']).read_bytes(),launch)
        proof = self.record.parent/'identity/public-status.txt'; saved = proof.read_bytes()
        self.assertEqual(saved.decode(),status+'\n')  # mock CLI print adds one newline
        self.assertEqual(self.bind(data,ok=False)['error']['code'],'invalid_transition')
        self.finish(); (self.server/'late-process').unlink()
        proof.write_bytes(saved+b'changed\n')
        self.assertEqual(self.accept(ok=False)['error']['code'],'changed_evidence')
        proof.write_bytes(saved); self.accept()
        self.assertTrue(self.op('inspect')['observation']['quiet'])
        self.assertEqual(Path(r['evidence']['receipt']).read_bytes(),launch)
        self.assertEqual(self.snapshot(),self.baseline)

    def test_changed_identity_binding_is_not_accepted(self):
        self.late_launch(); data = self.binding_input()
        (self.server/'public-native').write_text(data['nativeId']); self.bind(data); self.finish()
        (self.server/'late-process').unlink()
        binding = self.record.parent/'identity/binding.json'; binding.write_text(binding.read_text()+'\n')
        self.assertEqual(self.accept(ok=False)['error']['code'],'changed_evidence')

    def test_changed_public_identity_proof_is_not_accepted(self):
        self.late_launch(); data = self.binding_input()
        (self.server/'public-native').write_text(data['nativeId']); self.bind(data); self.finish()
        (self.server/'late-process').unlink()
        proof = self.record.parent/'identity/public-pane.json'; proof.write_text('{}\n')
        self.assertEqual(self.accept(ok=False)['error']['code'],'changed_evidence')

    def test_finish_rejects_changed_server_and_wrong_caller(self):
        self.launch()
        report = self.tmp/'finish-report'; report.write_text('Preserved result\n')
        original = self.record.read_text()
        s = json.loads(original); s['server']['birth'] = 'changed'
        self.record.write_text(json.dumps(s))
        self.op('finish','--evidence',str(report),ok=False)
        self.assertEqual(json.loads(self.record.read_text())['status'],'RUNNING')
        self.record.write_text(original)
        for key in ('HANCHOU_INSTANCE_KEY','HANCHOU_INSTANCE_RECORD','HANCHOU_MISSION_ID','HANCHOU_ATTEMPT_ID'):
            self.op('finish','--evidence',str(report),ok=False,env=dict(self.env,**{key:'foreign'}))
            self.assertEqual(self.record.read_text(),original)
        self.finish(); self.accept(); self.age(); self.op('reap')

    def test_process_inspection_denied_before_resources(self):
        blocked = self.tmp/'blocked-ps'; blocked.mkdir()
        ps = blocked/'ps'; ps.write_text('#!/bin/sh\nexit 1\n'); ps.chmod(0o755)
        before = self.git('worktree','list','--porcelain'), sorted(self.servers.iterdir())
        result = self.run_script('--mission','denied',ok=False,
                                 env=dict(self.env,PATH=str(blocked)+os.pathsep+self.env['PATH']))
        self.assertEqual(result['error']['code'],'process_inspection_unavailable')
        self.assertEqual(result['stage'],'preflight')
        self.assertEqual(result['resources'],[])
        self.assertIsNone(result['lifecycle']['status'])
        self.assertEqual(before,(self.git('worktree','list','--porcelain'),sorted(self.servers.iterdir())))
        self.assertEqual(self.snapshot(),self.baseline)

    def test_parent_instance_environment_is_not_fixture_identity(self):
        with patch.dict(os.environ,{key:'parent-instance' for key in CALLER_BINDINGS}):
            env = fixture_environment(PATH=self.env['PATH'],HERDR_BIN=self.env['HERDR_BIN'],
                                      MOCK_SERVERS=self.env['MOCK_SERVERS'])
            self.launch(env=env)
            report = self.tmp/'parent-env-report'; report.write_text(json.dumps(self.result()))
            self.op('finish','--evidence',str(report),env=env)
            self.accept(); self.age(); self.op('reap')
            for key in CALLER_BINDINGS:
                self.assertEqual(os.environ[key],'parent-instance')

    def test_no_usage_and_legacy_optional_data(self):
        self.launch(); self.finish(); self.accept()
        self.assertNotIn('usage',json.loads((self.record.parent/'acceptance.json').read_text()))
        self.age(); self.op('reap')
        # Legacy records are not migrated or deleted. Old debug data is preserved
        # verbatim, even when unavailable; it cannot establish acceptance.
        self.launch()
        legacy=json.loads(self.record.read_text())
        for key in ('resultContract','requestId','receive','process'): legacy.pop(key,None)
        legacy['usage']={'status':'unavailable','total':None}
        self.record.write_text(json.dumps(legacy))
        report=self.tmp/'legacy-report';report.write_text('Legacy preserved text.\n')
        self.op('finish','--evidence',str(report))
        data=self.acceptance();data['usage']=[{'status':'unavailable','tool':None}]
        evidence=self.tmp/'legacy-accept';evidence.write_text(json.dumps(data))
        self.op('accept','--evidence',str(evidence));self.age();self.op('reap')
        self.assertEqual(json.loads(self.record.read_text())['usage'],{'status':'unavailable','total':None})
        self.assertEqual(json.loads((self.record.parent/'acceptance.json').read_text())['usage'],data['usage'])

    def test_previously_accepted_legacy_receipts_reap_unchanged(self):
        self.launch();self.finish();self.accept();self.age()
        record=json.loads(self.record.read_text())
        for key in ('resultContract','requestId','receive','process','completionPeer'):record.pop(key,None)
        legacy={'missionId':record['missionId'],'attemptId':record['attemptId'],
                'artifactsPreserved':True,'workersStopped':True,
                'usage':[{'status':'ready','nativeId':record['nativeId'],'historicalFixture':True}]}
        f=self.record.parent/'acceptance.json';f.write_text(json.dumps(legacy))
        record['acceptanceHash']=subprocess.check_output(['git','hash-object',str(f)],text=True).strip()
        self.record.write_text(json.dumps(record)); before=f.read_bytes()
        self.op('reap');self.assertEqual(f.read_bytes(),before)
        self.assertNotIn('resultContract',json.loads(self.record.read_text()))

    def test_bound_completion_and_independent_acceptance(self):
        self.launch(); report=self.tmp/'bad-result'; original=self.record.read_bytes()
        good=self.result()
        for field,value in [('missionId','wrong'),('attemptId','old'),('nativeId',None),
                            ('nativeId','wrong'),('requestId','old'),('status','held'),
                            ('status','refused'),('status','exited'),('status','idle'),
                            ('artifactRefs',[]),('verificationRefs',[]),('authority',None)]:
            with self.subTest(field=field,value=value):
                report.write_text(json.dumps(dict(good,**{field:value})))
                self.assertEqual(self.op('finish','--evidence',str(report),ok=False)['error']['code'],'invalid_evidence')
                self.assertEqual(self.record.read_bytes(),original)
        self.finish(); old=good['requestId']; self.op('resume')
        self.assertNotEqual(json.loads(self.record.read_text())['requestId'],old)
        report.write_text(json.dumps(good));self.op('finish','--evidence',str(report),ok=False)
        self.finish();good=self.acceptance(); original=self.record.read_bytes()
        for field,value in [('nativeId',None),('nativeId','wrong'),('requestId',old),
                            ('authority',None),('independentAcceptance',False),('artifactsPreserved',False),
                            ('result',None),('workersStopped',False)]:
            report.write_text(json.dumps(dict(good,**{field:value})))
            self.assertEqual(self.op('accept','--evidence',str(report),ok=False)['error']['code'],'invalid_evidence')
            self.assertEqual(self.record.read_bytes(),original)
        self.accept();self.assertEqual(self.accept(ok=False)['error']['code'],'invalid_transition')
        self.age();self.op('reap')

    def test_wrong_old_duplicate_held_refused_exit_notice_is_not_acceptance(self):
        self.launch(); self.finish()
        # Explicit notification fixture: no claim this mock establishes native wake.
        process={'pid':12345,'birth':'owned-incarnation'}
        self.edit(receive={'route':'claude-peer','parent':{'peer':'parent [abcdef]'},'childName':'child'},
                  process=process,completionPeer='child [123abc]')
        good=self.acceptance(); evidence=self.tmp/'notice.json'
        notice={'kind':'idle','requestId':good['requestId'],'nativeId':good['nativeId'],
                'process':process,'receiptId':'official-send-receipt',
                'parentPeer':'parent [abcdef]','childPeer':'child [123abc]'}
        changes=[('kind',v) for v in ['held','refused','exit','expired','duplicate']]+[
            ('requestId','old'),('nativeId','wrong'),('process',{'pid':12345,'birth':'restarted'}),
            ('childPeer','child [456def]'),('parentPeer','parent [654321]'),('receiptId',None)]
        for field,value in changes:
            with self.subTest(field=field,value=value):
                evidence.write_text(json.dumps(dict(good,notification=dict(notice,**{field:value}))))
                before=self.record.read_bytes()
                self.assertEqual(self.op('accept','--evidence',str(evidence),ok=False)['error']['code'],'invalid_evidence')
                self.assertEqual(self.record.read_bytes(),before)
        evidence.write_text(json.dumps(dict(good,notification=notice)))
        self.op('accept','--evidence',str(evidence))
        self.assertEqual(self.op('accept','--evidence',str(evidence),ok=False)['error']['code'],'invalid_transition')
        self.age();self.op('reap')

    def test_malformed_pane_inventory_is_retained(self):
        self.launch(); self.finish(); self.accept(); self.age()
        inventory = self.server/'panes.json'
        # Newline IDs must not disappear in the shell line-oriented enumeration.
        for panes in [[{'pane_id':''}], [{'pane_id':'\n'}], [None], [{'pane_id':'p'},{'pane_id':'p'}]]:
            inventory.write_text(json.dumps(panes))
            self.op('reap',ok=False)
            self.assertTrue((self.server/'s').exists())
        inventory.unlink(); self.op('reap')

    def age(self, days=2):
        self.edit(finishedAt=(datetime.now(timezone.utc)-timedelta(days=days)).strftime('%Y-%m-%dT%H:%M:%SZ'))

    def test_lifecycle_and_preservation(self):
        self.launch(); self.assertEqual(json.loads(self.record.read_text())['status'],'RUNNING')
        self.finish()
        self.assertEqual(self.op('reap')['action'],'retained')
        self.op('resume')
        s=json.loads(self.record.read_text()); self.assertEqual(s['status'],'RUNNING'); self.assertIsNone(s['finishedAt']); self.assertIsNone(s['acceptedAt'])
        self.finish(); self.age()
        self.assertEqual(self.op('reap')['action'],'retained')  # no acceptance after resume
        self.accept(); self.op('resume',ok=False); self.assertEqual(self.op('reap')['status'],'CLOSED')
        self.assertFalse((self.server/'s').exists())
        self.assertTrue(Path(self.launch_receipt['worktree']['path']).is_dir())
        self.assertTrue((self.record.parent/'report.txt').is_file())
        self.assertEqual(self.op('reap')['action'],'retained')
        self.assertEqual(self.snapshot(),self.baseline)

    def test_server_survives_launch_tool_group_cleanup(self):
        import time
        self.launch(cleanup_group=True)
        time.sleep(.2)
        self.assertTrue((self.server/'s').exists(), 'tool cleanup stopped the owned server')
        pid = json.loads(self.record.read_text())['server']['pid']
        self.assertEqual(os.getpgid(pid),pid)
        self.assertNotEqual(os.getpgid(pid),self.launch_group)
        # Later independent commands still reach the same incarnation and can reap.
        self.finish(); self.accept(); self.age()
        self.assertEqual(self.op('reap')['status'],'CLOSED')

    def test_busy_agent_and_background_process(self):
        import time
        self.launch(); self.finish(); (self.server/'busy').touch()
        self.assertEqual(self.accept(ok=False)['error']['code'],'instance_busy')
        (self.server/'busy').unlink(); self.accept(); self.age()
        (self.server/'background').touch()
        for _ in range(200):
            if (self.server/'background-ready').exists(): break
            time.sleep(.01)
        self.assertEqual(self.op('reap',ok=False)['error']['code'],'instance_busy')
        (self.server/'background').unlink()
        for _ in range(200):
            if not (self.server/'background-ready').exists(): break
            time.sleep(.01)
        self.assertEqual(self.op('reap')['status'],'CLOSED')

    def test_invalid_identity_clock_and_evidence(self):
        self.launch(); self.finish(); self.accept(); self.age()
        original=self.record.read_text()
        for change in [{'host':'another-host'}, {'ownership':'shared'}, {'instanceKey':'0'*32}, {'session':'default'}]:
            self.edit(**change); self.op('reap',ok=False); self.record.write_text(original)
        for field in ['birth','socketInode','pid']:
            s=json.loads(original); s['server'][field]='bad';self.record.write_text(json.dumps(s))
            self.op('reap',ok=False);self.record.write_text(original)
        for stamp in ['not-a-time','2999-01-01T00:00:00Z']:
            self.edit(finishedAt=stamp);self.assertEqual(self.op('reap')['action'],'retained');self.record.write_text(original)
        report=self.record.parent/'report.txt'; old=report.read_bytes();report.write_text('changed')
        self.assertEqual(self.op('reap',ok=False)['error']['code'],'changed_evidence');report.write_bytes(old)
        (self.record.parent/'lock').mkdir();self.op('reap',ok=False);(self.record.parent/'lock').rmdir()
        self.assertEqual(self.op('reap')['status'],'CLOSED')

    def test_exact_day_boundary(self):
        self.launch(); self.finish(); self.accept()
        self.edit(finishedAt='2026-10-20T12:00:00Z',acceptedAt='2026-10-20T12:00:01Z')
        clock=self.bin/'date';clock.write_text('#!/bin/sh\nprintf "%s\\n" "$FIXTURE_NOW"\n');clock.chmod(0o755)
        try:
            early=dict(self.env,FIXTURE_NOW='2026-10-21T11:59:59Z')
            due=dict(self.env,FIXTURE_NOW='2026-10-21T12:00:00Z')
            self.assertEqual(self.op('reap',env=early)['action'],'retained')
            self.assertEqual(self.op('reap',env=due)['status'],'CLOSED')
        finally: clock.unlink()

    def test_changed_inventory_and_unsettled_acceptance(self):
        self.launch();self.finish();self.accept();self.age()
        original=self.record.read_text()
        self.edit(acceptedInventory=[{'pane':'foreign','pid':1,'birth':'unknown'}])
        self.assertEqual(self.op('reap',ok=False)['error']['code'],'inventory_changed')
        self.record.write_text(original)
        bad=self.tmp/'bad-accept.json';bad.write_text(json.dumps({'missionId':'fixture','attemptId':self.launch_receipt['attemptId'],
             'artifactsPreserved':True,'workersStopped':True,'usage':[{'status':'ready','nativeId':'test-native','currentRequest':{'state':'active'}}]}))
        self.assertEqual(self.op('accept','--evidence',str(bad),ok=False)['error']['code'],'invalid_transition')
        self.assertEqual(self.op('reap')['status'],'CLOSED')

    def test_record_symlinks_and_scan(self):
        self.launch();self.finish();self.accept();self.age()
        saved=self.record.with_suffix('.saved');self.record.rename(saved);self.record.symlink_to(saved)
        self.assertEqual(self.op('reap',ok=False)['error']['code'],'invalid_record')
        self.record.unlink();saved.rename(self.record)
        # Other records may be CLOSED/UNKNOWN; scan must still find and reap this one.
        p=subprocess.run(['bash',str(LAUNCH),'--project',str(self.repo),'--lifecycle','reap'],env=self.env,text=True,capture_output=True,timeout=25)
        self.assertEqual(p.returncode,0,(p.stdout,p.stderr))
        self.assertEqual(json.loads(self.record.read_text())['status'],'CLOSED')

    def test_acceptance_multiple_documents_refused(self):
        self.launch();self.finish();data=self.acceptance()
        evidence=self.tmp/'many-accept';evidence.write_text(json.dumps(data)+'\n'+json.dumps(data))
        self.assertEqual(self.op('accept','--evidence',str(evidence),ok=False)['error']['code'],'invalid_evidence')
        self.accept();self.age();self.op('reap')

    def test_uncertain_launch_is_retained(self):
        self.launch(ok=False,env=dict(self.env,MOCK_START_FAIL='1'))
        self.assertEqual(json.loads(self.record.read_text())['status'],'UNKNOWN')
        self.assertIsNone(json.loads(self.record.read_text())['nativeId'])
        self.assert_partial_launch_cannot_complete()

    def test_interrupted_starting_record_cannot_complete(self):
        self.launch()
        # Fixture for interruption before the launcher persisted its final receipt.
        self.edit(status='STARTING',nativeId=None)
        self.assert_partial_launch_cannot_complete()

    def assert_partial_launch_cannot_complete(self):
        original = self.record.read_bytes()
        report = self.tmp/'partial-report.txt'
        report.write_text('Later bootstrap acknowledged; not mission completion.\n')
        for operation in ('finish','resume'):
            args = ('--evidence',str(report)) if operation == 'finish' else ()
            result = self.op(operation,*args,ok=False)
            self.assertEqual(result['error']['code'],'invalid_transition')
            self.assertEqual(self.record.read_bytes(),original)
        # Even a well-formed settled usage receipt cannot promote the failed start.
        self.assertEqual(self.accept(ok=False)['error']['code'],'invalid_transition')
        self.assertEqual(self.record.read_bytes(),original)
        self.assertEqual(self.op('reap')['action'],'retained')
        self.assertEqual(self.record.read_bytes(),original)
        self.assertTrue((self.server/'s').exists())

    def test_stop_failure_is_not_closed(self):
        self.launch();self.finish();self.accept();self.age();(self.server/'stop-fail').touch()
        self.assertEqual(self.op('reap',ok=False)['error']['code'],'stop_unconfirmed')
        self.assertEqual(json.loads(self.record.read_text())['status'],'FINISHED')
        (self.server/'stop-fail').unlink();self.assertEqual(self.op('reap')['status'],'CLOSED')

    def inspect_launch(self):
        self.launch(env=dict(self.env, MOCK_INSPECT_PANES='1'))

    def read_only_inspect(self, ok=True, env=None):
        before = {str(p):p.read_bytes() for p in self.record.parent.rglob('*') if p.is_file()}
        native = self.tmp/'native-observation-sentinel.jsonl'
        native.write_text('native log must remain untouched\n')
        with tempfile.TemporaryDirectory(prefix='inspect-', dir=self.tmp) as tmp:
            r = self.op('inspect', ok=ok, env=dict(env or self.env, TMPDIR=tmp))
            self.assertEqual(list(Path(tmp).iterdir()), [], 'temporary observation leaked')
        self.assertEqual(before, {str(p):p.read_bytes() for p in self.record.parent.rglob('*') if p.is_file()})
        self.assertEqual(native.read_text(), 'native log must remain untouched\n')
        self.assertEqual(self.snapshot(), self.baseline)
        self.assertFalse((self.record.parent/'lock').exists())
        self.assertEqual(r['operation'], 'inspect')
        return r

    def test_inspect_read_only_running_finished_accepted(self):
        self.inspect_launch()
        r = self.read_only_inspect()
        self.assertTrue(r['observation']['quiet'])
        self.assertEqual(r['observation']['nativeId'], 'test-native')
        self.assertEqual(r['recordHash'], self.git('hash-object', str(self.record)).decode().strip())
        self.assertIsNone(r['observation']['report'])
        self.assertEqual(r['observation']['panes'][0]['foreground'][0]['cwd'], self.launch_receipt['worktree']['path'])
        self.finish()
        r = self.read_only_inspect()
        self.assertEqual(r['observation']['report'], {'path':str(self.record.parent/'report.txt'),
                         'hash':json.loads(self.record.read_text())['reportHash'], 'matches':True})
        self.accept(); self.assertIsNotNone(self.read_only_inspect()['observation']['acceptedAt'])
        self.age(); self.op('reap')

    def test_inspect_busy_is_an_observation_not_acceptance(self):
        import time
        self.inspect_launch(); self.finish()
        (self.server/'busy').touch()
        r = self.read_only_inspect()
        self.assertFalse(r['observation']['quiet'])
        self.assertEqual(r['observation']['agents'], [{'paneId':'w2:p1','nativeId':'test-native','status':'working'}])
        self.assertEqual(self.accept(ok=False)['error']['code'], 'instance_busy')
        (self.server/'busy').unlink(); (self.server/'background').touch()
        for _ in range(200):
            if (self.server/'background-ready').exists(): break
            time.sleep(.01)
        r = self.read_only_inspect()
        self.assertFalse(r['observation']['quiet'])
        self.assertEqual(len(r['observation']['processes']), 2)
        self.assertNotIn('argv', json.dumps(r))
        self.assertNotIn('sleep', json.dumps(r))
        (self.server/'background').unlink()
        for _ in range(200):
            if not (self.server/'background-ready').exists(): break
            time.sleep(.01)
        self.assertTrue(self.read_only_inspect()['observation']['quiet'])
        # A past quiet observation cannot bypass the existing acceptance recheck.
        (self.server/'busy').touch()
        self.assertEqual(self.accept(ok=False)['error']['code'], 'instance_busy')
        (self.server/'busy').unlink(); self.accept(); self.age(); self.op('reap')

    def test_inspect_rejects_identity_clock_and_report_changes(self):
        self.inspect_launch(); self.finish()
        original = self.record.read_bytes()
        changes = [{'nativeId':'other'}, {'nativeId':None}, {'missionId':'other'}, {'host':'foreign'},
                   {'status':'UNKNOWN'}, {'status':'CLOSED'}, {'finishedAt':'2999-01-01T00:00:00Z'},
                   {'finishedAt':'2026-02-30T12:00:00Z'}, {'worktree':{'path':'/other','branch':'other'}}]
        for change in changes:
            with self.subTest(change=change):
                self.edit(**change); self.read_only_inspect(ok=False); self.record.write_bytes(original)
        for field in ('birth','socketInode','pid','processGroup'):
            s=json.loads(original); s['server'][field]='changed'; self.record.write_text(json.dumps(s))
            self.read_only_inspect(ok=False); self.record.write_bytes(original)
        report=self.record.parent/'report.txt'; saved=report.read_bytes(); report.write_text('changed')
        self.assertEqual(self.read_only_inspect(ok=False)['error']['code'], 'changed_evidence')
        report.write_bytes(saved)
        saved_path=report.with_suffix('.saved'); report.rename(saved_path); report.symlink_to(saved_path)
        self.assertEqual(self.read_only_inspect(ok=False)['error']['code'], 'missing_evidence')
        report.unlink(); saved_path.rename(report)
        self.accept(); self.age(); self.op('reap')

    def test_inspect_optional_native_metadata_requires_post_exit_observation(self):
        self.inspect_launch(); self.finish()
        # Shape of the observed Herdr 0.9.5 idle Codex agent, with fixture-owned
        # identifiers/cwd. The public schema permits missing/null agent_session.
        # This fixture does not model a real native CLI or qualify its exit.
        agent = {'agent':'codex', 'agent_status':'idle', 'completion_seq':11,
                 'cwd':self.launch_receipt['worktree']['path'], 'focused':True,
                 'foreground_cwd':self.launch_receipt['worktree']['path'],
                 'interactive_ready':True, 'name':'fixture-sokkin',
                 'pane_id':'w2:p1', 'revision':346, 'state_change_seq':11,
                 'tab_id':'w2:t1', 'terminal_id':'fixture-terminal', 'workspace_id':'w2'}
        agents = self.server/'agents.json'
        variants = [[agent], [dict(agent, agent_session=None)],
                    [dict(agent, agent_session={'kind':'id','value':'other'})],
                    [dict(agent, agent_status='unknown')], [agent, agent]]
        original = self.record.read_bytes()
        for value in variants:
            with self.subTest(agents=value):
                agents.write_text(json.dumps(value))
                observed = self.read_only_inspect(ok=False)
                self.assertEqual(observed['error']['code'], 'observation_unavailable')
                self.assertIsNone(observed['observation'])
                self.assertEqual(self.accept(ok=False)['error']['code'], 'instance_busy')
                self.assertEqual(self.record.read_bytes(), original)
        # Only the agent-free snapshot plus the independently checked real owned
        # idle shell/process tree permits quiet observation. No metadata injected.
        agents.write_text('[]')
        observed = self.read_only_inspect()['observation']
        self.assertTrue(observed['quiet'])
        self.assertEqual(observed['agents'], [])
        self.assertEqual(observed['nativeId'], 'test-native')
        self.assertIsNone(observed['acceptedAt'])
        self.assertTrue(observed['report']['matches'])
        # A later live agent still blocks acceptance; inspection grants no ticket.
        agents.write_text(json.dumps([agent]))
        self.assertEqual(self.accept(ok=False)['error']['code'], 'instance_busy')
        agents.write_text('[]')
        self.accept(); self.age(); self.op('reap')

    def test_inspect_existing_lock_and_concurrent_changes(self):
        self.inspect_launch(); self.finish()
        lock=self.record.parent/'lock'; lock.mkdir()
        self.assertEqual(self.op('inspect',ok=False)['error']['code'], 'instance_busy')
        self.assertTrue(lock.is_dir()); lock.rmdir()
        files=[self.record,self.record.parent/'report.txt',self.record.parent/'launch/receipt.json']
        saved={f:f.read_bytes() for f in files}
        for mode,code in [('record','instance_changed'),('launch','instance_changed'),('lock','instance_changed'),
                          ('report','changed_evidence'),('server','instance_mismatch')]:
            with self.subTest(mode=mode):
                with tempfile.TemporaryDirectory(prefix='inspect-race-',dir=self.tmp) as tmp:
                    r=self.op('inspect',ok=False,env=dict(self.env,MOCK_INSPECT_MUTATE=mode,TMPDIR=tmp))
                    self.assertEqual(r['error']['code'],code)
                    self.assertIsNone(r['observation'])
                    self.assertEqual(list(Path(tmp).iterdir()),[])
                if mode=='lock': self.assertTrue(lock.is_dir()); lock.rmdir()
                if mode=='server': (self.server/'status-drift').unlink()
                for f,data in saved.items(): f.write_bytes(data)
        self.assertEqual(self.snapshot(),self.baseline)
        self.accept(); self.age(); self.op('reap')

    def test_inspect_unknown_panes_agents_and_processes(self):
        self.inspect_launch()
        panes=self.server/'panes.json'; agents=self.server/'agents.json'
        for values in [[],[{'pane_id':'foreign','workspace_id':'w2'}],
                       [{'pane_id':'w2:p1','workspace_id':'w2'}]*2,
                       [{'pane_id':'w2:p'+str(i),'workspace_id':'w2'} for i in range(1,34)],
                       [{'pane_id':'\n','workspace_id':'w2'}]]:
            panes.write_text(json.dumps(values)); self.read_only_inspect(ok=False)
        panes.unlink()
        for values in [[{'pane_id':'w2:p1','workspace_id':'w2','agent_status':'unknown'}],
                       [{'pane_id':'foreign','workspace_id':'w2','agent_status':'working'}],
                       [{'pane_id':'w2:p1','workspace_id':'w2','agent_status':'idle'}],
                       [{'pane_id':'w2:p1','workspace_id':'w2','agent_status':'idle','agent_session':{'kind':'id','value':'other'}}],None]:
            agents.write_text(json.dumps(values)); self.read_only_inspect(ok=False)
        agents.unlink()
        pid=int((self.server/'pane-pid').read_text()); info=self.server/'process-info.json'
        base={'pane_id':'w2:p1','shell_pid':pid,'foreground_processes':[{'pid':pid,'name':'bash','argv':['/bin/bash'],'cwd':str(self.repo)}]}
        for change in [{'pane_id':'other'},{'shell_pid':None},{'foreground_processes':[]},
                       {'foreground_processes':[{'pid':pid,'name':'mystery','argv':['private-argument'],'cwd':str(self.repo)}]},
                       {'foreground_processes':[{'pid':os.getpid(),'name':'python','argv':['private-argument'],'cwd':str(self.repo)}]}]:
            info.write_text(json.dumps({'result':{'process_info':dict(base,**change)}}))
            r=self.read_only_inspect(ok=False); self.assertNotIn('private-argument',json.dumps(r))
        info.unlink()
        blocked=Path(tempfile.mkdtemp(prefix='inspect-ps-',dir=self.tmp)); real_ps=shutil.which('ps')
        (blocked/'ps').write_text('#!/bin/sh\n[ "$1" != "-axo" ] || exit 1\nexec "'+real_ps+'" "$@"\n')
        (blocked/'ps').chmod(0o755)
        self.assertEqual(self.read_only_inspect(ok=False,env=dict(self.env,PATH=str(blocked)+os.pathsep+self.env['PATH']))['error']['code'], 'observation_unavailable')
        (blocked/'ps').write_text('#!/bin/sh\nif [ "$1" = "-axo" ]; then "'+real_ps+'" "$@"; printf "unknown process row\\n"; else exec "'+real_ps+'" "$@"; fi\n')
        self.assertEqual(self.read_only_inspect(ok=False,env=dict(self.env,PATH=str(blocked)+os.pathsep+self.env['PATH']))['error']['code'], 'observation_unavailable')
        self.finish(); self.accept(); self.age(); self.op('reap')

    def test_inspect_requires_explicit_instance_and_separates_launch(self):
        self.inspect_launch()
        self.assertEqual(self.run_script('--lifecycle','inspect',ok=False)['error']['code'],'invalid_instance')
        for args in [('--evidence','/unused'),('--mission','other'),('--compact-receipt',)]:
            before=self.record.read_bytes()
            self.assertEqual(self.op('inspect',*args,ok=False)['error']['code'],'invalid_operation')
            self.assertEqual(self.record.read_bytes(),before)
            self.assertFalse((self.record.parent/'lock').exists())
        launch=self.record.parent/'launch/receipt.json'; saved=launch.read_bytes(); launch.unlink()
        self.assertEqual(self.read_only_inspect(ok=False)['error']['code'],'missing_evidence')
        launch.write_bytes(saved)
        self.finish(); self.accept(); self.age(); self.op('reap')

if __name__=='__main__': unittest.main()
