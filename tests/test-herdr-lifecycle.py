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
 child=None
 def stop(*a):
  if child is not None: child.terminate(); child.wait()
  sock.close(); (d/'s').unlink();sys.exit()
 signal.signal(signal.SIGTERM,stop)
 while True:
  if (d/'background').exists() and child is None:
   child=subprocess.Popen(['sleep','600']); (d/'background-ready').touch()
  if not (d/'background').exists() and child is not None:
   child.terminate(); child.wait(); child=None; (d/'background-ready').unlink(missing_ok=True)
  time.sleep(.01)
if args==['status','--json']:
 if not (d/'s').exists(): sys.exit(1)
 emit({'server':{'running':True,'compatible':True,'session':name,'socket':str(d/'s')}})
elif args[:2]==['workspace','create']:
 cwd=args[args.index('--cwd')+1]; (d/'cwd').write_text(cwd)
 emit({'result':{'workspace':{'workspace_id':'w2'},'tab':{'tab_id':'w2:t1'},'root_pane':{'pane_id':'w2:p1','cwd':cwd}}})
elif args[:2]==['agent','start']:
 if os.environ.get('MOCK_START_FAIL'): sys.exit(1)
 emit({'result':{'agent':{'agent':'codex','agent_status':'idle','pane_id':'w2:p1','cwd':(d/'cwd').read_text(),'agent_session':{'kind':'id','value':'test-native'}}}})
elif args==['api','snapshot']:
 panes=json.loads((d/'panes.json').read_text()) if (d/'panes.json').exists() else []
 emit({'result':{'snapshot':{'agents':[{'agent_status':'working'}] if (d/'busy').exists() else [],'panes':panes}}})
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

    def launch(self, **kw):
        r = self.run_script('--mission','fixture', **kw)
        self.assertTrue(r['lifecycle']['owned'])
        self.record = Path(r['lifecycle']['record'])
        self.assertEqual(r['lifecycle']['status'], json.loads(self.record.read_text())['status'])
        self.assertEqual(r['lifecycle']['status'], 'RUNNING' if kw.get('ok', True) else 'UNKNOWN')
        self.key = r['lifecycle']['instanceKey']
        self.server = self.servers / r['herdr']['session']
        self.launch_receipt = r
        return r

    def op(self, name, *args, **kw):
        return self.run_script('--lifecycle',name,'--instance',self.key,*args,**kw)

    def edit(self, **updates):
        s=json.loads(self.record.read_text());s.update(updates)
        self.record.write_text(json.dumps(s))

    def finish(self):
        report = self.tmp/'report.txt'; report.write_text('Results and artifact locations preserved.\n')
        self.op('finish','--evidence',str(report))

    def accept(self, **kw):
        evidence = self.tmp/'accept.json'
        now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        evidence.write_text(json.dumps({'missionId':'fixture','attemptId':self.launch_receipt['attemptId'],
                         'artifactsPreserved':True,'workersStopped':True,
                         'usage':[{'status':'ready','nativeId':'test-native',
                                   'currentRequest':{'state':'settled','completedAt':now},
                                   'cwd':self.launch_receipt['worktree']['path'],
                                   'tool':{'inputTokens':1,'cacheReadTokens':0,'cacheCreationTokens':0,
                                           'outputTokens':0,'reasoningOutputTokens':0,'totalTokens':1},
                                   'scope':{'kind':'native session cumulative','includedNativeIds':['test-native'],
                                            'includedChildren':[],'missionDelta':False,'otherSessionsIncluded':False},
                                   'observedAt':now}]}))
        return self.op('accept','--evidence',str(evidence),**kw)

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
            report = self.tmp/'parent-env-report'; report.write_text('Fixture evidence\n')
            self.op('finish','--evidence',str(report),env=env)
            self.accept(); self.age(); self.op('reap')
            for key in CALLER_BINDINGS:
                self.assertEqual(os.environ[key],'parent-instance')

    def test_usage_requires_final_boundary_scope_and_counters(self):
        self.launch(); self.finish(); self.accept()
        self.edit(createdAt=(datetime.now(timezone.utc)-timedelta(days=1)).strftime('%Y-%m-%dT%H:%M:%SZ'))
        evidence = self.tmp/'accept.json'; original = json.loads(evidence.read_text())
        # An observation made now can still contain a pre-final completion boundary.
        changes = [
            ('currentRequest', {'state':'settled'}),
            ('currentRequest', {'state':'settled','completedAt':'2000-01-01T00:00:00Z'}),
            ('currentRequest', {'state':'settled','completedAt':(datetime.now(timezone.utc)-timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%SZ')}),
            ('currentRequest', {'state':'settled','completedAt':'2999-01-01T00:00:00Z'}),
            ('currentRequest', {'state':'settled','completedAt':'2026-02-30T12:00:00Z'}),
            ('scope', None), ('tool', {'totalTokens':1}),
        ]
        scope = original['usage'][0]['scope']; counters = original['usage'][0]['tool']
        changes += [('scope',dict(scope,**{k:v})) for k,v in [
            ('includedNativeIds',['foreign']), ('includedChildren',['child']),
            ('missionDelta',True), ('otherSessionsIncluded',True)]]
        changes += [('tool',dict(counters,**{k:v})) for k,v in [
            ('inputTokens',-1), ('outputTokens',0.5), ('totalTokens',2),
            ('cacheCreationTokens',1), ('reasoningOutputTokens',1), ('totalTokens',9007199254740992)]]
        for field,value in changes:
            with self.subTest(field=field,value=value):
                data = json.loads(json.dumps(original)); data['usage'][0][field] = value
                evidence.write_text(json.dumps(data))
                before = self.record.read_bytes()
                self.assertEqual(self.op('accept','--evidence',str(evidence),ok=False)['error']['code'],'invalid_evidence')
                self.assertEqual(self.record.read_bytes(),before)
        # Native logs use fractional UTC timestamps; preserve that supported form.
        data = json.loads(json.dumps(original))
        data['usage'][0]['currentRequest']['completedAt'] = data['usage'][0]['observedAt'].replace('Z','.000Z')
        evidence.write_text(json.dumps(data)); self.op('accept','--evidence',str(evidence))
        self.age(); self.op('reap')

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
        self.assertEqual(self.op('accept','--evidence',str(bad),ok=False)['error']['code'],'invalid_evidence')
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

    def test_usage_scope_and_freshness(self):
        self.launch();self.finish();self.accept()
        evidence=self.tmp/'accept.json';original=json.loads(evidence.read_text())
        for field,value in [('cwd','/wrong/worktree'),('nativeId','different-session'),('observedAt','2000-01-01T00:00:00Z'),('tool',{'totalTokens':-1})]:
            data=json.loads(json.dumps(original));data['usage'][0][field]=value;evidence.write_text(json.dumps(data))
            self.assertEqual(self.op('accept','--evidence',str(evidence),ok=False)['error']['code'],'invalid_evidence')
        evidence.write_text(json.dumps(original)+'\n'+json.dumps(original))
        self.assertEqual(self.op('accept','--evidence',str(evidence),ok=False)['error']['code'],'invalid_evidence')
        self.age();self.assertEqual(self.op('reap')['status'],'CLOSED')

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

if __name__=='__main__': unittest.main()
