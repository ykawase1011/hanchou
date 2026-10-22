#!/usr/bin/env python3
"""Opt-in Herdr server/workspace smoke. Agent start and usage are explicit fixtures.
Usage: python3 tests/test-herdr-lifecycle-live.py /absolute/path/to/herdr
No real agent, bootstrap or mission inference is run.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
import shutil
import signal
from lifecycle_support import fixture_environment, require_lifecycle_permissions

launcher = Path(__file__).resolve().parents[1] / 'skills/hanchou-orchestrator/scripts/launch-sokkin.sh'
real = Path(sys.argv[1]).resolve(strict=True)
def main():
    require_lifecycle_permissions()
    temp = tempfile.mkdtemp(prefix='hl-live-', dir='/tmp')
    root=Path(temp); repo=root/'project';repo.mkdir(); bin=root/'bin';bin.mkdir()
    def git(*args): return subprocess.check_output(['git','-C',str(repo),*args],text=True)
    git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid')
    (repo/'.gitignore').write_text('.hanchou/\n');git('add','.');git('commit','-qm','fixture')
    (repo/'.hanchou').mkdir();(repo/'.hanchou/config.json').write_text('{"version":2,"sokkin":{"agent":"codex"}}')
    wrapper=bin/'herdr'; wrapper.write_text('''#!/usr/bin/env python3
import sys,os,json,subprocess
from pathlib import Path
a=sys.argv[1:]; real=os.environ['LIVE_HERDR']; f=Path(os.environ['LIVE_CREATE'])
if a[2:4]==['workspace','create']:
 # The fixture must not source the user's zsh startup (keychain prompts, agents).
 a += ['--env','ZDOTDIR='+str(f.parent)]
 p=subprocess.run([real,*a],capture_output=True);sys.stdout.buffer.write(p.stdout);sys.stderr.buffer.write(p.stderr)
 if p.returncode==0: f.write_bytes(p.stdout)
 sys.exit(p.returncode)
if a[2:4]==['agent','start']:
 d=json.loads(f.read_text())['result']['root_pane']
 print(json.dumps({'result':{'agent':{'agent':'codex','agent_status':'idle','pane_id':d['pane_id'],'cwd':d['cwd'],'agent_session':{'kind':'id','value':'server-only-fixture'}}}}));sys.exit()
os.execv(real,[real,*a])
''');wrapper.chmod(0o755)
    (bin/'codex').write_text('#!/bin/sh\nexit 99\n');(bin/'codex').chmod(0o755)
    env=fixture_environment(PATH=str(bin)+os.pathsep+os.environ['PATH'],HERDR_BIN=str(wrapper),LIVE_HERDR=str(real),LIVE_CREATE=str(root/'create.json'))
    def call(*args):
        command=['bash',str(launcher),'--project',str(repo),*args]
        if '--mission' in args:
            child=subprocess.Popen(command,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
            stdout,stderr=child.communicate(timeout=30)
            # Tool completion cleans only this test-owned group. The server must
            # survive and be usable by the later independent lifecycle calls.
            try: os.killpg(child.pid,signal.SIGTERM)
            except ProcessLookupError: pass
            p=subprocess.CompletedProcess(command,child.returncode,stdout,stderr)
        else:
            p=subprocess.run(command,env=env,text=True,capture_output=True,timeout=30)
        if p.returncode: raise RuntimeError((p.stdout,p.stderr))
        return json.loads(p.stdout)
    name=None; completed=False
    try:
        r=call('--mission','server-smoke');name=r['herdr']['session'];key=r['lifecycle']['instanceKey'];record=Path(r['lifecycle']['record'])
        report=root/'report';report.write_text('Server-only fixture. No actual agent/usage qualification.\n')
        call('--lifecycle','finish','--instance',key,'--evidence',str(report))
        now=datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        acceptance=root/'accept.json';acceptance.write_text(json.dumps({'missionId':r['missionId'],'attemptId':r['attemptId'],
              'artifactsPreserved':True,'workersStopped':True,'usage':[{'status':'ready','nativeId':'server-only-fixture',
                      'currentRequest':{'state':'settled','completedAt':now},
                      'cwd':r['worktree']['path'],'tool':{'inputTokens':0,'cacheReadTokens':0,'cacheCreationTokens':0,
                          'outputTokens':0,'reasoningOutputTokens':0,'totalTokens':0},
                      'scope':{'kind':'native session cumulative','includedNativeIds':['server-only-fixture'],
                          'includedChildren':[],'missionDelta':False,'otherSessionsIncluded':False},
                      'observedAt':now}]}))
        import time
        for retry in range(10):
            try:
                call('--lifecycle','accept','--instance',key,'--evidence',str(acceptance))
                break
            except RuntimeError:
                if retry==9:
                    for label,args in [('snapshot',['api','snapshot']),
                                       ('process-info',['pane','process-info','--pane',r['herdr']['paneId']])]:
                        observed=subprocess.run([str(real),'--session',name,*args],capture_output=True,text=True)
                        (root/(label+'.json')).write_text(observed.stdout+observed.stderr)
                    (root/'process-tree.txt').write_text(subprocess.check_output(['ps','-axo','pid=,ppid=,comm='],text=True))
                    raise
                time.sleep(.2)
        s=json.loads(record.read_text());s['finishedAt']=(datetime.now(timezone.utc)-timedelta(days=2)).strftime('%Y-%m-%dT%H:%M:%SZ');record.write_text(json.dumps(s))
        result=call('--lifecycle','reap','--instance',key);assert result['status']=='CLOSED'
        assert Path(r['worktree']['path']).exists()
        completed=True
        print(json.dumps({'ok':True,'session':name,'status':'CLOSED','scope':'real Herdr server/workspace/process cleanup; agent start and usage fixture only'}))
    finally:
        if name is None:
            records=list((repo/'.hanchou/instances').glob('*/instance.json'))
            if records: name=json.loads(records[0].read_text())['session']
        if name:
            # Exact owned test server only; retain persistent session history.
            stopped=subprocess.run([str(real),'session','stop',name,'--json'],capture_output=True)
        if completed: shutil.rmtree(temp)
        else: print('Retained live-test evidence: '+temp, file=sys.stderr)

if __name__=="__main__": main()
