import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, MicroLabel } from './components.js';
import { ULTIMATE_LEVELS, ULTIMATE_MAX_LEVEL, ultimateAvailable, ultimateEffects } from '../../../shared/ultimateDifficulty.js';

const LEVEL_NAMES = ['原始模拟', '攻势增幅', '生命强化', '毒性残留', '疾行敌潮', '战力压制', '持久作战', '领袖强化', '资金紧缩'];
const clampLevel = (n) => Math.max(0, Math.min(ULTIMATE_MAX_LEVEL, n));

// The red becomes darker and more saturated with depth; the selected text stays light.
export function ultimateAtmosphere(n) {
  return `--ud-red:${155 - n * 4},${55 - n * 3},${70 - n * 3};--ud-bg:${28 + n},${16 - n * 0.75},${21 - n * 0.75};--ud-glow:${0.1 + n * 0.022};--ud-depth:${n / ULTIMATE_MAX_LEVEL}`;
}

/** Alarm-style scroll wheel. Local colour/selection follows the wheel; the room changes once scrolling settles. */
export function UltimateDifficultyPicker({ value = 0, onChange, onPreviewChange, disabled = false, compact = false }) {
  const [shown, setShown] = useState(value);
  const wheel = useRef(null);
  const timer = useRef(null);
  const shownRef = useRef(value);
  const current = useRef(null);
  current.current = { value, onChange, onPreviewChange, disabled };
  shownRef.current = shown;

  const rowHeight = () => wheel.current?.firstElementChild?.offsetHeight || 1;
  const commit = (n) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const now = current.current;
      if (!now.disabled && n !== now.value) now.onChange?.(n);
    }, 180);
  };

  useEffect(() => {
    clearTimeout(timer.current);
    // A host's request is in flight: retain the wheel's preview until the server replies.
    if (disabled && onChange) return;
    setShown(value);
    current.current.onPreviewChange?.(value);
    shownRef.current = value;
    wheel.current.scrollTop = value * rowHeight();
  }, [value, disabled]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      wheel.current.scrollTop = shownRef.current * rowHeight();
    });
    observer.observe(wheel.current);
    return () => { observer.disconnect(); clearTimeout(timer.current); };
  }, []);

  const scroll = () => {
    if (disabled) return;
    const n = clampLevel(Math.round(wheel.current.scrollTop / rowHeight()));
    setShown(n);
    current.current.onPreviewChange?.(n);
    commit(n);
  };
  const choose = (n) => {
    if (disabled) return;
    n = clampLevel(n);
    setShown(n);
    current.current.onPreviewChange?.(n);
    wheel.current.scrollTo({ top: n * rowHeight(), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    commit(n);
  };
  const keyDown = (event) => {
    const targets = { ArrowUp: shown - 1, ArrowDown: shown + 1, PageUp: shown - 3, PageDown: shown + 3, Home: 0, End: ULTIMATE_MAX_LEVEL };
    if (!(event.key in targets) || disabled) return;
    event.preventDefault();
    choose(targets[event.key]);
  };
  const available = ultimateAvailable(shown);
  const effects = ultimateEffects(shown);
  return html`<section class=${`udepth brackets${compact ? ' udepth--compact' : ''}${shown >= 5 ? ' is-deep' : ''}${!available ? ' is-pending' : ''}`}
      style=${ultimateAtmosphere(shown)} aria-label="终极模拟难度选择">
    <header class="udepth__head">
      <div><${MicroLabel}>ULTIMATE // DEPTH<//><strong>终极模拟 · 难度选择</strong></div>
      <span class="udepth__status">${disabled && !onChange ? '由创建者选择' : available ? '高难度包含低难度效果' : '未完待续'}</span>
    </header>
    <div class="udepth__dial">
      <div class="udepth__frame">
        <div class="udepth__focus" aria-hidden="true"><span>▸</span><span>◂</span></div>
        <div class="udepth__wheel" ref=${wheel} role="listbox" aria-label="终极模拟难度 n0 至 n16"
            aria-activedescendant=${`${compact ? 'room' : 'lobby'}-ultimate-n${shown}`} aria-disabled=${disabled ? 'true' : 'false'}
            tabIndex=${disabled ? -1 : 0} onScroll=${scroll} onKeyDown=${keyDown}>
          ${ULTIMATE_LEVELS.map((n) => html`<button key=${n} id=${`${compact ? 'room' : 'lobby'}-ultimate-n${n}`} type="button" role="option"
              aria-selected=${shown === n ? 'true' : 'false'} tabIndex=${-1} disabled=${disabled}
              class=${`udepth__row${shown === n ? ' is-selected' : ''}${!ultimateAvailable(n) ? ' is-locked' : ''}`}
              style=${`--ud-distance:${Math.min(2, Math.abs(n - shown))};--ud-tilt:${Math.max(-2, Math.min(2, n - shown)) * -16}deg`}
              onClick=${() => choose(n)}>
            <b class="num">n${n}</b><span>${LEVEL_NAMES[n] || '未完待续'}</span>
          </button>`)}
        </div>
      </div>
      <span class="udepth__gesture">${disabled ? '威胁等级' : '滚轮 / 上下滑动选择'}</span>
    </div>
    <div class="udepth__brief" aria-live="polite">
      <div class="udepth__selected"><b class="num">n${shown}</b><span>${LEVEL_NAMES[shown] || '未完待续'}</span></div>
      ${!available ? html`<p class="udepth__pending">未完待续<br /><span>更深层的模拟协议尚未开放</span></p>`
        : shown === 0 ? html`<p class="udepth__original">保留最原始终极模拟数值。<br /><span>13 回合常规作战，第 14 回合为 BOSS，随后衔接隐秘核心。</span></p>`
        : html`<ol class="udepth__effects" aria-label="本难度累计效果">${effects.map((text, i) => html`<li key=${i} class=${i === shown - 1 ? 'is-new' : ''}>
            <span class="num">n${i + 1}</span><span>${text}</span>
          </li>`)}</ol>`}
      <div class="udepth__meter" aria-hidden="true">${ULTIMATE_LEVELS.map((n) => html`<i key=${n} class=${n <= shown ? 'is-on' : ''}></i>`)}</div>
    </div>
  </section>`;
}

/** Compact label reused on room, briefing, combat and settlement screens. */
export function UltimateLevelTag({ difficulty, level = 0 }) {
  return difficulty === 'ABYSS' ? html`<span class="ultimate-level-tag num" style=${ultimateAtmosphere(level)}>n${level}</span>` : null;
}

export function UltimateDifficultySummary({ pub }) {
  if (pub?.difficulty !== 'ABYSS') return null;
  const level = pub.ultimateLevel ?? 0;
  const effects = ultimateEffects(level);
  return html`<div class="ultimate-brief">
    <${UltimateLevelTag} difficulty="ABYSS" level=${level} />终极模拟 · ${level ? `累计叠加 ${effects.length} 项效果` : '原始数值'}
    ${effects.length ? html`<details><summary>查看本局难度效果</summary>${effects.map((text, i) => html`<p key=${i}><b class="num">n${i + 1}</b> ${text}</p>`)}</details>` : null}
  </div>`;
}
