import { composeUnitRecord, unitForm, statusKey } from '../shared/standIn.js';
import { atPotential } from '../shared/potential.js';

// Word 方案中的新增常规棋子；多萝西保留外援入口，不在本次名单内。
export const COLUMBIA_NORMAL_OPERATORS = Object.freeze([
  { charId: 'char_4063_quartz', tier: 1, skill: 1, bonds: ['columbiaShip'] },
  { charId: 'char_135_halo', tier: 3, skill: 1, bonds: ['columbiaShip', 'miraShip'] },
  { charId: 'char_4214_cairn', tier: 3, skill: 1, bonds: ['columbiaShip', 'steadShip'] },
  { charId: 'char_274_astesi', tier: 4, skill: 1, bonds: ['columbiaShip', 'skillfulShip'] },
  { charId: 'char_4027_heyak', tier: 4, skill: 2, bonds: ['columbiaShip', 'soloShip'] },
  { charId: 'char_4229_aphris', tier: 6, skill: 2, bonds: ['columbiaShip', 'preciShip', 'arcaneShip'] },
]);

export const columbiaChessId = (charId) => `chess_columbia_${charId.split('_').slice(2).join('_')}_a`;

// 把归档资源登记为正常角色资源，客户端继续使用原有 chars / skills / modules 入口。
export function applyColumbiaOperatorAssets(assets, reserved, chess) {
  for (const op of COLUMBIA_NORMAL_OPERATORS.slice(0, 4)) {
    const source = reserved.operators[op.charId], images = source.assets.images;
    const image = name => images[name]?.path;
    const model = source.assets.spine['默认'];
    const spine = {};
    for (const [facing, label] of [['front', '正面'], ['back', '背面']]) {
      const m = model[label];
      if (!m) continue;
      spine[facing] = { skel: m.skeleton.path, atlas: m.atlas.path, textures: m.textures.map(t => t.path),
        pma: false, anims: m.roles, animations: m.animations, events: m.events, hits: m.hits, bounds: m.bounds };
    }
    assets.chars[op.charId] = { avatar: image(`头像_${source.name}.png`), avatarE2: image(`头像_${source.name}.png`),
      portrait: image(`半身像_${source.name}_1.png`) ?? image(`头像_${source.name}.png`),
      portraitE2: image(`半身像_${source.name}_2.png`) ?? image(`头像_${source.name}.png`), spine };
    const record = chess[columbiaChessId(op.charId)];
    for (const sk of record.skills) {
      const path = image(`技能_${sk.name}.png`);
      assets.skills[sk.iconId] = path;
      assets.skillsById[sk.skillId] = sk.iconId;
    }
    const elite = chess[columbiaChessId(op.charId).replace(/_a$/, '_b')];
    for (const m of elite.modules ?? []) {
      const path = image(`${m.uniEquipId}.typeIcon`);
      if (path) assets.modules[m.typeName] = path;
    }
  }
  assets.stats.chars = Object.keys(assets.chars).length;
  assets.stats.skills = Object.keys(assets.skills).length;
  assets.stats.modules = Object.keys(assets.modules).length;
}

export function applyColumbiaRoster(files, annotate) {
  const moved = new Set(COLUMBIA_NORMAL_OPERATORS.map(o => o.charId));
  const removed = new Set();
  for (const [id, c] of Object.entries(files.chess)) if (c.supportOperator && moved.has(c.charId)) {
    removed.add(id); delete files.chess[id];
  }
  for (const b of Object.values(files.bonds)) for (const key of ['members', 'visibleMembers']) {
    b[key] = b[key].filter(id => !removed.has(id));
  }
  for (const t of Object.values(files.tokens)) {
    t.owners = t.owners?.filter(id => !removed.has(id));
    if (t.variants) for (const id of removed) delete t.variants[id];
  }
  for (const [i, op] of COLUMBIA_NORMAL_OPERATORS.entries()) {
    const baseId = columbiaChessId(op.charId);
    for (const golden of [false, true]) {
      const template = Object.values(files.chess).find(c => c.tier === op.tier && c.isGolden === golden && !c.supportOperator && !c.isDiy);
      const id = baseId.replace(/_a$/, golden ? '_b' : '_a');
      const form = unitForm(files.backups, op.charId, template.status);
      const moduleId = golden ? form.modules?.find(m => !m.typeName?.startsWith('ISW'))?.uniEquipId ?? null : null;
      const identity = { ...template, chessId: id, baseId, goldenId: baseId.replace(/_a$/, '_b'),
        upgradeChessId: golden ? null : baseId.replace(/_a$/, '_b'), identifier: 30000 + i * 2 + Number(golden),
        shopSortId: 100 + i, isHidden: false, visible: true, isDiy: false, chessType: 'PRESET',
        backup: { charId: op.charId, skillIndex: op.skill, uniEquipId: moduleId, tmplId: null, potRank: 0 }, garrisonIds: [] };
      const ranked = Array.from({ length: 6 }, (_, rank) => composeUnitRecord(identity,
        files.backups.units[op.charId], atPotential(form, rank + 1), { skillIndex: op.skill, moduleId, bonds: op.bonds }));
      const record = annotate(ranked, `columbia ${id}`);
      record.supportKitId = op.charId;
      files.chess[id] = record;
      for (const tokenId of form.tokens) {
        const source = files.backups.tokens[tokenId];
        if (!source) continue;
        const token = files.tokens[tokenId] ??= { ...structuredClone(source), owners: [], variants: {} };
        if (!token.owners.includes(id)) token.owners.push(id);
        const key = `${op.charId}@${statusKey(template.status)}`;
        const variant = source.variants[key];
        if (variant) {
          const select = v => {
            const all = Object.fromEntries(form.skills.map(sk => [sk.index, v.bySkill?.[sk.index] ?? { skill: v.skill, count: v.count, sources: v.sources }]));
            let result = { ...v, ...all[op.skill], bySkill: Object.fromEntries(Object.entries(all).filter(([index]) => Number(index) !== op.skill)) };
            if (v.byModule && moduleId && v.byModule[moduleId]) {
              const none = Object.fromEntries(Object.keys(v.byModule[moduleId]).map(key => [key, result[key]]));
              result = { ...result, ...v.byModule[moduleId], byModule: { ...Object.fromEntries(Object.entries(v.byModule).filter(([key]) => key !== moduleId)), none } };
            }
            return result;
          };
          token.variants[id] = annotate(Array.from({ length: 6 }, (_, rank) => select(atPotential(variant, rank + 1))), `columbia token ${id}`);
        }
      }
    }
    for (const bondId of op.bonds) for (const key of ['members', 'visibleMembers']) {
      if (!files.bonds[bondId][key].includes(baseId)) files.bonds[bondId][key].push(baseId);
    }
  }
  files.backups.diy.ownedPool = files.backups.diy.ownedPool.filter(id => !moved.has(id));
  for (const id of moved) delete files.backups.diy.operators[id];
}
