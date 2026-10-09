import { html, Button } from './components.js';
import { UnitThumb } from './gameComponents.js';
import { supportCatalog, EMPTY_SUPPORT_OPERATORS, SUPPORT_LIMIT } from '../../../shared/supportOperators.js';

export function SupportRoster({ records, selection = EMPTY_SUPPORT_OPERATORS, onChange, locked = false }) {
  const catalog = supportCatalog(records);
  const chosen = new Set([...selection[5], ...selection[6]].map(id => records.find(c => c.chessId === id)?.charId));
  const remove = id => onChange({ 5: selection[5].filter(x => x !== id), 6: selection[6].filter(x => x !== id) });
  const add = (c, tier) => onChange({ ...selection, [tier]: [...selection[tier], c.supportVariants[tier]] });
  return html`<main class="lo-support" data-testid="support-roster">
    <p>选择本局外援，加入对应档位的商店与奖励卡池。五本、六本各最多两名，同一干员不可重复添加。未添加的外援不会显示在本局盟约人员中。</p>
    <div class="lo-support__slots">
      ${[5, 6].map(tier => html`<section key=${tier} aria-label=${`${tier === 5 ? '五' : '六'}本外援`}>
        <h2>${tier === 5 ? '五本' : '六本'}外援 <small>${selection[tier].length}/${SUPPORT_LIMIT}</small></h2>
        ${selection[tier].length ? selection[tier].map(id => {
          const c = records.find(c => c.chessId === id);
          return html`<div class="lo-support__picked" key=${id} data-support-picked=${id}>
            <span>${c?.name}</span><${Button} variant="ghost" size="sm" disabled=${locked} onClick=${() => remove(id)}>移除<//>
          </div>`;
        }) : html`<p class="t-dim">尚未添加</p>`}
      </section>`)}
    </div>
    <div class="lo-support__catalog">
      ${catalog.map(c => html`<article key=${c.charId} class="lo-support__card" data-support-char=${c.charId}>
        <${UnitThumb} id=${c.chessId} /><strong>${c.name}</strong>
        <div class="lo-support__actions">
          ${[5, 6].map(tier => html`<${Button} key=${tier} variant="secondary" size="sm"
            data-testid=${`support-add-${tier}-${c.charId}`}
            disabled=${locked || chosen.has(c.charId) || selection[tier].length >= SUPPORT_LIMIT}
            onClick=${() => add(c, tier)}>加入${tier === 5 ? '五本' : '六本'}<//>`)}
        </div>
      </article>`)}
    </div>
  </main>`;
}
