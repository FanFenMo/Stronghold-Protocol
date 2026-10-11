import { richTextPlain } from './richText.js';

const clean = text => text.replace(/^(?:【\d+】)+/, '');
const idsOf = g => g.sourceGarrisonIds || [g.garrisonId];
const combine = (a, b, text) => ({ ...a, desc: richTextPlain(text), descRaw: text,
  sourceGarrisonIds: [...idsOf(a), ...idsOf(b)] });

// Presentation records only: executable event handlers and their independent caps stay untouched.
export function mergeGarrisonDescriptions(records, bondName) {
  const out = [];
  const grantGroups = new Map();
  for (const grant of records.filter(g => g.effectKey === 'ADD_BOND' && g.desc.includes('使自身和身前一格干员获得特质'))) {
    const reader = records.find(g => g.garrisonId === grant.bbStr.give_garrison_id);
    if (!reader) continue;
    let benefit;
    if (reader.effectKey === 'act1autochess_gar_eff_respawnTimeByBond') benefit = `再部署时间${reader.bb.respawn_time * 100}%`;
    else if (reader.effectKey === 'act1autochess_gar_eff_attrByBond' && reader.bb.attack_speed != null) benefit = `攻击速度+${reader.bb.attack_speed}`;
    else continue;
    const key = `${reader.bbStr.bond_id}:${reader.bb.divide_num}`;
    if (!grantGroups.has(key)) grantGroups.set(key, []);
    grantGroups.get(key).push({ grant, reader, benefit });
  }
  const combinedGrants = new Map(), covered = new Set();
  for (const group of grantGroups.values()) if (group.length > 1) {
    const first = group[0], ids = group.flatMap(g => [g.grant.garrisonId, g.reader.garrisonId]);
    const text = `<战斗开始时>使自身和身前一格干员获得特质“【${bondName(first.reader.bbStr.bond_id)}】每叠加${first.reader.bb.divide_num}层，${group.map(g => g.benefit).join('，')}”`;
    combinedGrants.set(first.grant.garrisonId, { ...first.grant, desc: text, descRaw: text, sourceGarrisonIds: ids });
    for (const id of ids) if (id !== first.grant.garrisonId) covered.add(id);
  }
  for (const record of records) {
    if (covered.has(record.garrisonId)) continue;
    if (combinedGrants.has(record.garrisonId)) { out.push(combinedGrants.get(record.garrisonId)); continue; }
    let text = clean(record.descRaw || record.desc);
    // Some upstream entries repeat other events in their prose. Display the actual event once.
    if (record.eventType === 'SERVER_PREP_START') text = text.replace('<进入休整期时><休整期结束时>', '<进入休整期时>');
    if (record.effectKey === 'act1autochess_gar_event_selfdead') text = text.replace(/^<部署时>[^\n]*\n/, '');
    if (record.effectKey === 'act2autochess_gar_event_onstart') text = text.replace(/^<获得时>[^\n]*\n/, '');
    if (record.effectKey === 'act1autochess_gar_event_consume_ammo' && Number.isFinite(record.bb.max_add_count_per_battle)) {
      const { consume_count, bond_add_count, max_add_count_per_battle } = record.bb;
      text = `<战斗中>自身每消耗${consume_count}发子弹，使已激活的【${bondName(record.bbStr.bond_id)}】层数<@ba.vup>+${bond_add_count}</>（每场战斗至多${max_add_count_per_battle}层）`;
    }
    let current = { ...record, descRaw: text, desc: richTextPlain(text), sourceGarrisonIds: [record.garrisonId] };
    // Paired blackboard entries often each carry the complete combined description.
    let at = out.findIndex(g => g.eventType === current.eventType && g.desc === current.desc);
    if (at >= 0) { out[at] = combine(out[at], current, out[at].descRaw); continue; }
    // A multi-event description can already cover the next record's entire sentence.
    const abilityText = s => s.replace(/^<战斗中>/, '');
    at = out.findIndex(g => g.eventType === current.eventType && abilityText(g.desc).includes(abilityText(current.desc)));
    if (at >= 0) { out[at] = combine(out[at], current, out[at].descRaw); continue; }
    at = out.findIndex(g => g.eventType === current.eventType && abilityText(current.desc).includes(abilityText(g.desc)));
    if (at >= 0) { out[at] = combine(out[at], current, current.descRaw); continue; }

    const gain = current.desc.match(/^(.*?使已激活的)(【[^】]+】)层数\+([\d.]+)([^【]*)$/);
    if (gain) {
      at = out.findIndex(g => g.eventType === current.eventType && g.gainPrefix === gain[1]);
      const part = `${gain[2]}层数<@ba.vup>+${gain[3]}</>${gain[4]}`;
      if (at >= 0) {
        const previous = out[at];
        const parts = [...previous.gainParts, part];
        out[at] = { ...combine(previous, current, gain[1] + parts.join('、')), gainPrefix: gain[1], gainParts: parts };
        continue;
      }
      current.gainPrefix = gain[1]; current.gainParts = [part];
    }
    // Same skill trigger, different gain conditions: keep both conditions in one sentence.
    const trigger = text.match(/^(<战斗中>开启技能时，)(.*)$/);
    if (trigger) {
      at = out.findIndex(g => g.eventType === current.eventType && g.skillTrigger === trigger[1]);
      if (at >= 0) {
        const previous = out[at];
        out[at] = { ...combine(previous, current, `${previous.descRaw}；${trigger[2]}`), skillTrigger: trigger[1] };
        continue;
      }
      current.skillTrigger = trigger[1];
    }
    out.push(current);
  }
  return out;
}
