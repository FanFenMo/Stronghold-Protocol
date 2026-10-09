import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getData } from '../../server/data.js';
import { supportCatalog } from '../../shared/supportOperators.js';
import { Client, hasChrome, startRealServer, problemsOf, sleep } from '../e2e/client.mjs';

const records = Object.values(getData().chess);
const candidates = supportCatalog(records).filter(c => !process.env.SP_SUPPORT_CHAR || c.charId === process.env.SP_SUPPORT_CHAR);
const enabled = process.env.SP_E2E === '1' && hasChrome();

for (const candidate of candidates) test(`external roster: add ${candidate.name} to tier 6 in the browser, deploy and fight`,
  { skip: !enabled && 'SP_E2E=1 + Chrome required', timeout: 180000 }, async () => {
    const id = candidate.supportVariants[6];
    const srv = await startRealServer({ fast: { timerScale: 0.5, combatSpeed: 2, startRound: 1, chess: [id], stage: 'act2autochess_m01' } });
    const P = (await import('puppeteer-core')).default;
    const offline = { async launch(opts) {
      const browser = await P.launch(opts);
      const [page] = await browser.pages();
      await page.setRequestInterception(true);
      page.on('request', r => r.url().startsWith('https://fonts.googleapis.com/')
        ? r.respond({ status: 200, contentType: 'text/css', body: '' }) : r.continue());
      return browser;
    } };
    const c = new Client(offline, srv.base, 'support', { prefix: `support-${candidate.charId}` });
    try {
      await c.open();
      await c.enter('外援实战验收');
      await c.page.click('[data-testid="loadout-open"]');
      await c.page.waitForSelector('[data-testid="support-open"]');
      await c.page.click('[data-testid="support-open"]');
      const add = `[data-testid="support-add-6-${candidate.charId}"]`;
      await c.page.waitForSelector(add);
      await c.page.click(add);
      await c.page.waitForSelector(`[data-support-picked="${id}"]`);
      assert.equal(await c.page.$eval(`[data-testid="support-add-5-${candidate.charId}"]`, e => e.disabled), true);
      await c.shot('selected');
      await c.page.click('.lo-back');
      await c.click('.mode-card', '独立模拟');
      await c.click('.diff-card', '标准模拟');
      await c.click('.create-box button', '开始独立模拟');
      await c.waitFor(s => !!s.room, 'solo room');
      if (!(await c.st()).phase) await c.click('.room-bar__right button', '开始模拟');
      await c.waitFor(s => s.phase === 'INFO_CHECK', 'briefing');
      assert.deepEqual(await c.page.evaluate(() => globalThis.__SP__.store.get().match.private.supportOperators), { 5: [], 6: [id] });
      await c.click('.brief__foot .btn--primary', '准备就绪');
      await c.waitFor(s => s.phase === 'BAND_DRAFT', 'band draft');
      await c.click('.dband', null, { nth: 1 });
      await c.click('.draft-detail__btns .btn--primary', '确认选择');
      await c.waitFor(s => s.phase === 'PREP' && s.hand > 0, 'prep');
      await sleep(1000);
      const p = (await c.handPieces('chess')).find(p => p.id === id);
      assert.ok(p, 'selected external operator is granted by the real preparation engine');
      const tile = await c.freeTileFor(p.uid);
      await c.drag(await c.piecePoint(p.uid), await c.tilePoint(tile.row, tile.col));
      await c.page.waitForSelector('.fwheel__dia', { visible: true });
      await c.swipe('RIGHT');
      await c.page.waitForFunction(uid => globalThis.__SP__.store.get().match.private.board.some(p => p.uid === uid), {}, p.uid);
      await c.click('.readybtn');
      await c.waitFor(s => s.phase === 'COMBAT', 'combat');
      await c.page.waitForFunction(id => {
        const entry = [...globalThis.__SP_RUNNER__._entries.values()].find(e => e.own && e.battle);
        return entry?.battle.allyUnits.some(u => u.defId === id && u.stats.dmg > 0
          && globalThis.__SP_VIEW__.raw.debug.views.get(u.id)?.spineReady);
      }, { timeout: 60000 }, id);
      await c.shot('combat');
      assert.deepEqual(problemsOf([c]), []);
    } finally {
      await c.close();
      await srv.stop();
    }
  });

test('external roster: two choices per tier, no duplicate, removal, reload persistence and match lock',
 {skip:!enabled&&'SP_E2E=1 + Chrome required',timeout:180000},async()=>{
 const srv=await startRealServer({fast:{timerScale:.5,combatSpeed:2,startRound:1,stage:'act2autochess_m01'}});
 const P=(await import('puppeteer-core')).default;
 const offline={async launch(opts){
  const browser=await P.launch(opts),[page]=await browser.pages();
  await page.setRequestInterception(true);
  page.on('request',r=>r.url().startsWith('https://fonts.googleapis.com/')
   ?r.respond({status:200,contentType:'text/css',body:''}):r.continue());
  return browser;
 }};
 const c=new Client(offline,srv.base,'support-config',{prefix:'support-config'});
 const catalog=supportCatalog(records),[a,b,d,e]=catalog;
 const button=(rec,t)=>`[data-testid="support-add-${t}-${rec.charId}"]`;
 const selected={5:[b.supportVariants[5],a.supportVariants[5]],6:[d.supportVariants[6],e.supportVariants[6]]};
 const panel=async()=>{
  await c.page.click('[data-testid="loadout-open"]');
  await c.page.waitForSelector('[data-testid="support-open"]');
  await c.page.click('[data-testid="support-open"]');
  await c.page.waitForSelector('[data-testid="support-roster"]');
 };
 try{
  await c.open();await c.enter('外援配置验收');await panel();
  for(const [rec,t] of [[a,5],[b,5],[d,6],[e,6]])await c.page.click(button(rec,t));
  assert.equal(await c.page.$$eval('[data-support-picked]',els=>els.length),4);
  assert.equal(await c.page.$$eval('.lo-support__actions button',els=>els.every(e=>e.disabled)),true);
  await c.page.click(`[data-support-picked="${a.supportVariants[5]}"] button`);
  assert.equal(await c.page.$eval(button(catalog[4],5),e=>e.disabled),false);
  assert.equal(await c.page.$eval(button(b,6),e=>e.disabled),true);
  await c.page.click(button(a,5));await c.shot('full');
  assert.deepEqual(await c.page.evaluate(()=>JSON.parse(localStorage.getItem('sp.pref.supportOperators'))),selected);
  await c.page.reload({waitUntil:'domcontentloaded'});
  await c.page.waitForFunction(()=>!!globalThis.__SP__&&!!document.querySelector('.screen'));
  await c.page.waitForSelector('.lobby-screen');await panel();
  assert.equal(await c.page.$$eval('[data-support-picked]',els=>els.length),4);
  await c.page.click('.lo-back');
  await c.click('.mode-card','独立模拟');await c.click('.diff-card','标准模拟');
  await c.click('.create-box button','开始独立模拟');await c.waitFor(s=>!!s.room,'solo room');
  if(!(await c.st()).phase)await c.click('.room-bar__right button','开始模拟');
  await c.waitFor(s=>s.phase==='INFO_CHECK','briefing');
  assert.deepEqual(await c.page.evaluate(()=>globalThis.__SP__.store.get().match.private.supportOperators),selected);
  await c.click('.brief__foot .btn--primary','准备就绪');
  await c.waitFor(s=>s.phase==='BAND_DRAFT','locked band draft');
  await c.page.evaluate(async()=>(await import('/js/screens/loadout.js')).openLoadout('lobby'));
  await c.page.waitForSelector('[data-testid="support-open"]');
  await c.page.click('[data-testid="support-open"]');
  assert.equal(await c.page.$$eval('.lo-support button',els=>els.every(e=>e.disabled)),true);
  assert.deepEqual(problemsOf([c]),[]);
 }finally{await c.close();await srv.stop();}
});
