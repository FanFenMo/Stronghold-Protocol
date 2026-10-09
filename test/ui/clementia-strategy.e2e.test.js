import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, hasChrome, startRealServer, problemsOf } from '../e2e/client.mjs';

const enabled = process.env.SP_E2E === '1' && hasChrome();

test('Clementia strategy: the real draft displays devour recruits and six-member block restoration',
  { skip: !enabled && 'SP_E2E=1 + Chrome required', timeout: 120000 }, async () => {
    const srv = await startRealServer();
    const P = (await import('puppeteer-core')).default;
    const offline = { async launch(opts) {
      const browser = await P.launch(opts);
      const [page] = await browser.pages();
      await page.setRequestInterception(true);
      page.on('request', r => r.url().startsWith('https://fonts.googleapis.com/')
        ? r.respond({ status: 200, contentType: 'text/css', body: '' }) : r.continue());
      return browser;
    } };
    const c = new Client(offline, srv.base, 'clementia', { prefix: 'clementia-strategy' });
    try {
      await c.open();
      await c.enter('克莱门莎策略验收');
      await c.click('.mode-card', '独立模拟');
      await c.click('.diff-card', '险境模拟');
      await c.click('.create-box button', '开始独立模拟');
      await c.waitFor(s => !!s.room, 'solo room');
      if (!(await c.st()).phase) await c.click('.room-bar__right button', '开始模拟');
      await c.waitFor(s => s.phase === 'INFO_CHECK', 'briefing');
      await c.click('.brief__foot .btn--primary', '准备就绪');
      await c.waitFor(s => s.phase === 'BAND_DRAFT', 'strategy draft');
      await c.page.waitForSelector('.dband');
      await c.page.evaluate(() => [...document.querySelectorAll('.dband')]
        .find(el => el.querySelector('.dband__name').textContent === '克莱门莎').scrollIntoView({ block: 'center' }));
      await c.click('.dband', '克莱门莎');
      await c.page.waitForFunction(() => document.querySelector('.draft-detail__name')?.textContent === '克莱门莎');
      assert.equal(await c.exists('.draft-detail__off'), false, 'Aegir is available in this mode');
      const desc = await c.page.$eval('.draft-detail__desc', el => el.textContent);
      for (const text of ['每吞噬4名', '下回合获得1名', '不高于调度中心等级', '余数保留', '在场6名不同', '吞噬仍增加阻挡数', '保留真伤灼烧']) {
        assert.ok(desc.includes(text), `${text}: ${desc}`);
      }
      assert.ok(!desc.includes('被击倒时'), desc);
      assert.ok(!desc.includes('崇高牺牲') && !desc.includes('体验可能不完整'), 'no repeated title or missing-operator footnote');
      assert.deepEqual(problemsOf([c]), []);
      await c.shot('draft');
      await c.click('.draft-detail__btns .btn--primary', '确认选择');
      await c.waitFor(s => s.phase === 'PREP', 'preparation with the selected strategy');
      const selected = await c.page.evaluate(() => {
        const p = globalThis.__SP__.store.get().match.private;
        return { bandId: p.bandId, effect: p.effects.find(e => e.id === 'aceffect_band_33') };
      });
      assert.equal(selected.bandId, 'band_clementia');
      assert.ok(selected.effect.desc.includes('每吞噬4名') && !selected.effect.desc.includes('被击倒时'));
      console.log(desc);
    } finally {
      await c.close();
      await srv.stop();
    }
  });
