// Local roster additions and rule changes survive the original build-data command.
import { applyAegirTraitData } from './aegir-trait-data.mjs';

export function applyCustomData(files, custom) {
  applyAegirTraitData(files.garrisons);
  Object.assign(files.chess, custom.chess);
  Object.assign(files.tokens, custom.tokens);
  for (const c of Object.values(custom.chess)) {
    if (c.isGolden) continue;
    for (const id of c.bonds) for (const key of ['members', 'visibleMembers']) {
      if (!files.bonds[id][key].includes(c.chessId)) files.bonds[id][key].push(c.chessId);
    }
  }
  for (const mode of Object.values(files.config.modes)) {
    mode.inactiveBondIds = mode.inactiveBondIds.filter(id => id !== 'soloShip');
    if (!mode.activeBondIds.includes('soloShip')) mode.activeBondIds.push('soloShip');
  }
  const bond = files.bonds.siracusaShip;
  const note = '叙拉古真伤首次触发概率为3%，每次符合条件的伤害未触发真伤时提升3个百分点，至多100%；造成盟约真实伤害后重置为3%。';
  for (const key of ['desc', 'descRaw']) if (!bond[key].includes(note)) bond[key] += '\n' + note;
}
