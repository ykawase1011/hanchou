// Test-only headless runner; dependency comes from an explicit external test directory.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

(async () => {
  const root = path.resolve(__dirname, '..');
  const template = await fs.readFile(path.join(root, 'skills/hanchou-orchestrator/assets/status-view.html'), 'utf8');
  const fixture = JSON.parse(await fs.readFile(path.join(root, 'tests/fixtures/status-view.json'), 'utf8'));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hanchou-view-qa-'));
  const browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:1280,height:960}});
  const page = await context.newPage();
  const network = [], errors = [];
  context.on('request', request => {if (/^https?:/.test(request.url())) network.push(request.url());});
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({time:new Date('2026-01-20T10:00:00Z')});
  async function open(data, raw) {
    const encoded = Buffer.from(JSON.stringify(data)).toString('base64');
    const file = path.join(directory, 'index.html');
    await fs.writeFile(file, template.replace('>e30=</script>', '>' + (raw ?? encoded) + '</script>'), {mode:0o600});
    await page.goto(pathToFileURL(file).href);
  }
  async function text(selector) {return page.locator(selector).innerText();}
  try {
    await open(fixture);
    assert.match(await text('#count'), /表示 5/);
    assert.equal(await page.locator('#worktrees article').count(),3);
    assert.match(await text('#requests'), /完了報告あり（受入とは別）/);
    assert.match(await text('#requests'), /未受入/);
    assert.match(await text('#requests'), /closed without merge/);
    assert.match(await text('#requests'), /古い観測・要再確認/);
    assert.match(await text('#requests'), /観測に矛盾/);
    assert.equal(await page.locator('html').getAttribute('lang'),'ja');
    assert.doesNotMatch(await text('body'), /synthetic-(?:main|child|run|deleted)/);
    await page.getByLabel('状態で絞り込み').selectOption('active');
    await page.locator('#requests summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#requests details').getAttribute('open'),'');
    assert.match(await text('#requests'), /原文未取得/);
    await page.getByLabel('状態で絞り込み').selectOption('all');
    await page.getByLabel('依頼を検索').fill('マージは私の判断');
    assert.match(await text('#count'), /表示 5/);
    await page.getByLabel('依頼を検索').fill('存在しない合成検索');
    assert.match(await text('#count'), /表示 0/);
    assert.match(await text('#requests'), /未観測の仕事がないことは保証しません/);
    await page.getByLabel('依頼を検索').fill('');
    await page.screenshot({path:path.join(directory,'desktop.png'),fullPage:true});
    await page.setViewportSize({width:375,height:812});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(directory,'mobile.png'),fullPage:true});

    const hostile=structuredClone(fixture);
    const attack='</script><script>globalThis.pwned=1</script><img src=https://evil.invalid onerror=globalThis.pwned=1> 日本語';
    hostile.requests[0].title=attack;
    hostile.requests[0].original.text=attack;
    hostile.requests[0].corrections[0].text=attack;
    hostile.requests[0].worktreeRefs=[{...hostile.worktrees[1],host:'different-host'}];
    hostile.worktrees[1].parent={...hostile.worktrees[0],project:'github:other/project'};
    hostile.requests[0].pullRequests=['javascript:alert(1)','data:text/html,hi','https://github.com.evil.invalid/example/sample/pull/1','https://user:pass@github.com/example/sample/pull/1','https://github.com/other/repo/pull/1','https://github.com/example/sample/pull/1?q=x','file:///tmp/secret','orca://anything'].map(url=>({url,project:'github:example/sample'}));
    await open(hostile);
    assert.equal(await page.evaluate(()=>globalThis.pwned),undefined);
    assert.equal(await page.locator('img').count(),0);
    assert.equal(await page.locator('#requests article').first().locator('a').count(),1); // original's validated GitHub URL only
    assert.match(await text('#requests'), /リンク未検証/);
    await page.locator('#requests summary').first().click();
    assert.match(await text('#requests'), /対応未確認/);
    assert.match(await text('#worktrees'), /関係未観測/);
    assert.equal(await page.locator('#requests h3').first().textContent(),attack);
    assert.equal(network.length,0,'load/search/filter/details must not issue network requests');

    const duplicate=structuredClone(fixture);
    duplicate.worktrees.push({...duplicate.worktrees[1]});
    duplicate.requests[0].group='result';
    await open(duplicate);
    await page.getByLabel('状態で絞り込み').selectOption('unknown');
    assert.match(await text('#count'), /表示 2/); // unaccepted result cannot look accepted
    await page.locator('#requests summary').first().click();
    assert.match(await text('#requests'), /対応未確認/);
    await open({...fixture,requests:[],worktrees:[],generatedAt:null,staleAfterHours:null});
    assert.match(await text('#overview'), /観測不明/);
    assert.match(await text('#worktrees'), /未取得/);
    await open({...fixture,requests:[null,{original:4,corrections:[null],lifecycle:'bad'}],worktrees:[null]});
    assert.match(await text('#requests'), /未取得/);
    await open({},'not base64');
    assert.match(await text('#overview'), /未取得・破損・未対応/);
    await open({...fixture,generatedAt:"2026-01-21T10:00:00Z"});
    assert.match(await text("#overview"), /時刻に矛盾/);
    await open({...fixture,staleAfterHours:null});
    assert.match(await text("#overview"), /鮮度基準未設定/);
    await open({version:2});
    assert.match(await text('#overview'), /未対応/);
    assert.deepEqual(errors,[]);

    await open(fixture);
    // External navigation occurs only after click; intercept it so QA never contacts GitHub.
    await context.route('https://github.com/**',route=>route.fulfill({status:200,body:'synthetic intercepted destination'}));
    const link=page.locator('a[target="_blank"]').first();
    assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
    const popupPromise=context.waitForEvent('page');
    await link.click();const popup=await popupPromise;await popup.waitForLoadState();
    assert.equal(network.length,1);
    assert.equal(await popup.evaluate(()=>window.opener),null);
    await popup.close();
    // Restore fixture as the durable synthetic preview, with no external calls needed.
    await open(fixture);
    console.log(JSON.stringify({result:'passed',preview:path.join(directory,'index.html'),desktop:path.join(directory,'desktop.png'),mobile:path.join(directory,'mobile.png'),networkBeforeExplicitClick:0,externalClickIntercepted:true,browser:browser.version()}));
  } finally {await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
