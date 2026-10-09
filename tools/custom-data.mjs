// Local roster additions and rule changes survive the original build-data command.
export function applyCustomData(files, custom) {
  Object.assign(files.chess, custom.chess);
  Object.assign(files.tokens, custom.tokens);
  const added = { ...custom.chess };
  for (const c of Object.values(custom.chess).filter(c => c.supportOperator)) {
    const kitId = c.baseId;
    const variants = Object.fromEntries([5, 6].map(t => [t, kitId.replace(/^chess_custom_[56]_/, `chess_custom_${t}_`)]));
    for (const tier of [5, 6]) {
      const baseId = variants[tier], chessId = baseId.replace(/_a$/, c.isGolden ? '_b' : '_a');
      const rec = { ...structuredClone(c), tier, chessId, baseId, goldenId: baseId.replace(/_a$/, '_b'),
        upgradeChessId: c.isGolden ? null : baseId.replace(/_a$/, '_b'),
        supportKitId: kitId, supportVariants: variants,
        identifier: c.identifier + (tier === c.tier ? 0 : 1000) };
      files.chess[chessId] = added[chessId] = rec;
      for (const token of Object.values(files.tokens)) {
        const owner = token.owners?.find(o => o.chessId === c.chessId);
        if (owner && !token.owners.some(o => o.chessId === chessId)) token.owners.push({ ...structuredClone(owner), chessId });
      }
    }
  }
  for (const c of Object.values(added)) {
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
