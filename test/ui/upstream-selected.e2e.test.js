import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { startServer } from '../../server/index.js';

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
test('selected upstream UI: roster, cultivation persistence, settings, reroll and local stats load in Chrome',
  {skip:process.env.SP_E2E!=='1' || !existsSync(chrome)}, async t => {
    const srv = await startServer({port:0,host:'127.0.0.1',quiet:true});
    const {default:puppeteer} = await import('puppeteer-core');
    const browser = await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
    t.after(async()=>{await browser.close();await srv.close();});
    const page = await browser.newPage();
    await page.setViewport({width:1920,height:1080});
    const errors=[];
    page.on('console',msg=>{if(msg.type()==='error')console.log('CONSOLE',msg.text())});
    page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
    await page.evaluateOnNewDocument(()=>{
      localStorage.setItem('sp.name','移植验收');sessionStorage.setItem('sp.entered','1');
    });
    await page.goto(`http://127.0.0.1:${srv.port}/`);
    await page.waitForFunction(()=>globalThis.__SP__?.store.get().connection.status==='online');
    await page.evaluate(async()=>{
      const {data}=globalThis.__SP__;await data.loadAll('chess','backups','effects');
      const {setSupportOperators,setOpsMap,openLoadout}=await import('/js/ui/loadoutSync.js');
      setSupportOperators({5:['chess_external_5_kalts_a','chess_custom_5_chen3_a'],6:['chess_custom_6_oblvns_a','chess_custom_6_clemnt_a']});
      setOpsMap({char_003_kalts:{potential:2,cultivate:1}});openLoadout('lobby');
    });
    await page.waitForSelector('.lo-card');
    const roster=await page.evaluate(()=>Object.values(__SP__.data.get('chess')).filter(c=>c.supportOperator&&!c.isGolden&&c.tier===5).length);
    assert.equal(roster,73);
    assert.ok(await page.$('.lo-card select'), 'aligned rows have quick configuration');
    await page.evaluate(async()=>{
      const {closeLoadout}=await import('/js/ui/loadoutSync.js');closeLoadout();
      const {updateSettings}=await import('/js/ui/settings.js');updateSettings({textSize:'lg',keys:{refresh:'KeyT'}});
    });
    assert.equal(await page.$eval('html',el=>el.dataset.text),'lg');
    await page.reload();
    await page.waitForFunction(()=>globalThis.__SP__?.store.get().connection.status==='online');
    const saved=await page.evaluate(async()=>{
      const {loadoutStore}=await import('/js/ui/loadoutSync.js');return loadoutStore.get().ops;
    });
    assert.deepEqual(saved.char_003_kalts,{potential:2,cultivate:1});
    await page.evaluate(async()=>{
      await __SP__.net.request('room.create',{mode:'solo',difficulty:'FUNNY'});
      await __SP__.net.request('room.start',{});
    });
    await page.waitForFunction(()=>__SP__.store.get().match.public?.phase==='INFO_CHECK');
    await page.waitForSelector('.brief-reroll');
    await page.evaluate(()=>__SP__.net.request('room.rerollSetup',{setupRevision:0}));
    await page.waitForFunction(()=>__SP__.store.get().match.public?.setupRevision===1);
    await page.evaluate(()=>__SP__.net.request('g.infoReady',{setupRevision:1}));
    await page.waitForFunction(()=>__SP__.store.get().match.public?.phase==='BAND_DRAFT');
    await page.evaluate(()=>__SP__.net.request('g.band',{bandId:'band_bldsk'}));
    await page.waitForFunction(()=>__SP__.store.get().match.public?.phase==='PREP');
    const roomCode=await page.evaluate(()=>__SP__.store.get().room.code);
    const match=srv.lobby.getRoom(roomCode).match;
    const playerId=await page.evaluate(()=>__SP__.store.get().me.playerId);
    const ps=match.players.get(playerId);
    const {give}=await import('../match/harness.js');
    give(match,ps,'chess_external_5_kalts_a','board',[10,4]);
    give(match,ps,'chess_custom_5_chen3_a','board',[10,5]);
    ps.dirty();
    await page.waitForSelector('canvas',{timeout:15000});
    assert.equal(ps.battleInput().units.find(u=>u.chessId==='chess_external_5_kalts_a').potential,2);
    assert.equal(ps.battleInput().units.find(u=>u.chessId==='chess_external_5_kalts_a').cultivate,1);
    await page.evaluate(()=>__SP__.net.request('g.ready',{ready:true}));
    await page.waitForFunction(()=>['COMBAT','COMBAT_END','PREP'].includes(__SP__.store.get().match.public?.phase)&&__SP__.store.get().match.public?.phase!=='BAND_DRAFT');
    await page.waitForFunction(()=>__SP__.store.get().match.public?.round>=2&&__SP__.store.get().match.public?.phase==='PREP',{timeout:60000});
    assert.equal(match.phase,'PREP');
    const pid=playerId;
    await page.close();
    const restored=await browser.newPage();
    restored.on('pageerror',e=>errors.push(e.message));
    await restored.goto(`http://127.0.0.1:${srv.port}/`);
    await restored.waitForSelector('.title-login');
    await restored.evaluate(()=>[...document.querySelectorAll('.title-login button')].find(b=>b.textContent.trim()==='开始').click());
    await restored.waitForFunction(id=>__SP__.store.get().me.playerId===id&&__SP__.store.get().room?.inMatch,{},pid);
    await restored.evaluate(async()=>{
      const {quitMatch}=await import('/js/ui/matchChrome.js');await quitMatch();
    });
    await restored.waitForFunction(()=>!__SP__.store.get().room?.inMatch);
    await restored.close();
    const statsPage=await browser.newPage();
    statsPage.on('pageerror',e=>errors.push(e.message));
    await statsPage.evaluateOnNewDocument(()=>sessionStorage.setItem('sp.entered','1'));
    await statsPage.goto(`http://127.0.0.1:${srv.port}/`);
    await statsPage.waitForFunction(()=>globalThis.__SP__?.store);
    await statsPage.evaluate(async()=>{
      const {openStats}=await import('/js/screens/stats.js');openStats();
    });
    await statsPage.waitForSelector('.st',{timeout:5000});
    assert.ok(await statsPage.evaluate(async()=>{const {loadStats}=await import('/js/ui/stats.js');return loadStats().records.length>0;}),'quit match persists to local history');
    assert.deepEqual(errors,[],'page has no module or render errors');
  });
