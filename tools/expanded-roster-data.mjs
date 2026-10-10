import { composeUnitRecord, unitForm, statusKey } from '../shared/standIn.js';
import { atPotential, stripPotential } from '../shared/potential.js';
import { isDiyModule } from '../shared/diy.js';
import { OPERATOR_KITS } from '../server/sim/content/kits/index.js';

// Use upstream operator forms with our existing per-player external roster and saved ids.
export function applyExpandedRoster(files, custom, annotate) {
  const original = new Map(Object.values(custom.chess).filter(c => !c.isGolden).map(c => [c.charId, c]));
  const available = new Set(Object.keys(OPERATOR_KITS));
  const records = [];
  for (const charId of files.backups.diy.ownedPool.filter(id => available.has(id))) {
    const old = original.get(charId);
    const suffix = charId.split('_').slice(2).join('_');
    const variants = Object.fromEntries([5, 6].map(tier => [tier, old
      ? old.baseId.replace(/^chess_custom_[56]_/, `chess_custom_${tier}_`)
      : `chess_external_${tier}_${suffix}_a`]));
    for (const tier of [5, 6]) for (const golden of [false, true]) {
      const slot = files.chess[`chess_char_${tier}_diy1_${golden ? 'b' : 'a'}`];
      const form = unitForm(files.backups, charId, slot.status);
      const baseId = variants[tier], chessId = baseId.replace(/_a$/, golden ? '_b' : '_a');
      const identity = { ...slot, chessId, baseId, goldenId: baseId.replace(/_a$/, '_b'),
        upgradeChessId: golden ? null : baseId.replace(/_a$/, '_b'),
        isDiy: false, visible: true, isHidden: false, garrisonIds: [],
        identifier: 20000 + records.length };
      const skillIndex = old?.skill?.index ?? form.skills[2]?.index ?? form.skills[0].index;
      const moduleId = golden ? old?.module?.id ?? null : null;
      const bonds = old?.bonds ?? files.backups.diy.operators[charId].bonds;
      const ranked = Array.from({ length: 6 }, (_, rank) => composeUnitRecord(identity,
        files.backups.units[charId], atPotential(form, rank + 1), { skillIndex, moduleId, bonds }));
      for (const record of ranked) if (record.modules) record.modules = record.modules.filter(isDiyModule);
      const record = annotate(ranked, `external ${chessId}`);
      record.tokens = [...form.tokens];
      Object.assign(record, { supportOperator: true, supportVariants: variants, supportKitId: charId });
      files.chess[chessId] = record;
      records.push(record);
      for (const tokenId of form.tokens) {
        const source = files.backups.tokens[tokenId];
        if (!source) continue;
        const token = files.tokens[tokenId] ??= { ...structuredClone(source), owners: [], variants: {} };
        token.owners ??= [];
        if (!token.owners.includes(chessId)) token.owners.push(chessId);
        token.variants ??= {};
        const variant = source.variants?.[`${charId}@${statusKey(slot.status)}`];
        if (variant) {
          const select = v => {
            const all = Object.fromEntries(form.skills.map(sk => [sk.index, v.bySkill?.[sk.index] ?? { skill: v.skill, count: v.count, sources: v.sources }]));
            const result = { ...v, ...all[skillIndex], bySkill: Object.fromEntries(Object.entries(all).filter(([index]) => Number(index) !== skillIndex)) };
            if (v.byModule) {
              const variants = v.byModule;
              if (moduleId && variants[moduleId]) {
                const none = Object.fromEntries(Object.keys(variants[moduleId]).map(key => [key, result[key]]));
                return { ...result, ...variants[moduleId], byModule: { ...Object.fromEntries(Object.entries(variants).filter(([id]) => id !== moduleId)), none } };
              }
              result.byModule = variants;
            }
            return result;
          };
          token.variants[chessId] = annotate(Array.from({ length: 6 }, (_, rank) => select(stripPotential(atPotential(variant, rank + 1)))), 'external token ' + chessId);
        }
      }
    }
  }
  for (const record of records.filter(c => !c.isGolden)) for (const bondId of record.bonds) {
    for (const key of ['members', 'visibleMembers']) {
      if (!files.bonds[bondId][key].includes(record.chessId)) files.bonds[bondId][key].push(record.chessId);
    }
  }
  // This fork selects external operators directly; upstream prototype slots are data templates only.
  for (const record of Object.values(files.chess)) if (record.isDiy) {
    record.visible = false;
    record.isHidden = true;
  }
}
