import { prosperityHealBonus } from '../../../shared/prosperity.js';

const highlight = (n, percent = false) => `<@bond.value>${Number((n * (percent ? 100 : 1)).toFixed(2))}${percent ? '%' : ''}</>`;

// Each clause has its own activation requirement; numbers come from the same blackboard as combat.
export function bondDescriptionClauses(bond, { layers = 0, tier = 0, active = false, thresholds = bond.thresholds } = {}) {
  const bb = bond.bb;
  const L = Math.max(0, layers);
  const clauses = [];
  const value = (index, subtract = 0) => {
    const p = bond.effectDescParams.find(p => p.index === index);
    let n = (bb[p.base] || 0) + (bb[p.perStack] || 0) * L;
    if (/prob/i.test(`${p.base}|${p.perStack}`)) n = Math.min(1, Math.max(0, n));
    return highlight(n - subtract, p.format.endsWith('%'));
  };
  const add = (text, neededTier = 1, minLayers = 0) => {
    const prefix = minLayers ? `${minLayers}层：` : `${thresholds[neededTier - 1]}名${bond.bondId === 'suntShip' ? '精锐' : bond.maxCount != null ? '及以下' : ''}：`;
    clauses.push({ text: `${prefix}${text}`, active: active && tier >= neededTier && L >= minLayers });
  };
  switch (bond.bondId) {
    case 'yanShip':
      add(`【炎】干员攻击力+${value(0)}。`);
      add('开战召唤炎佑，攻击力、生命值为【炎】干员总和的30%；同时攻击3个目标，附带20%攻击力灼燃损伤，周围敌人受到20%元素脆弱，可使用祛恶之焰。', 2);
      add('炎佑改为2只，攻击力额外+50%，受到伤害−90%。', 3); break;
    case 'sargonShip':
      add(`【萨尔贡】干员开启技能时，全体【萨尔贡】干员攻速+12，持续${value(0)}秒，至多+300；每次增益独立计时。`);
      add('开启技能还使全体【萨尔贡】干员攻击力+12%，持续时间相同，至多+300%；娜仁图亚策略会改变此效果。', 2); break;
    case 'victoriaShip':
      add(`携带装备的【维多利亚】干员伤害+${value(0, 1)}；每累计25层获得1件维式重锤。`);
      add('【维多利亚】干员每件装备使攻击力+50%，进阶装备改为+80%。', 2); break;
    case 'kjeragShip':
      add(`【谢拉格】干员伤害+25%，对寒冷、冻结目标改为+${value(0, 1)}。`);
      add(`每25秒使场上敌人寒冷${value(1)}秒。`, 2); break;
    case 'lateranoShip':
      add(`【拉特兰】干员开启技能时获得的弹药量+${value(0)}。`);
      add('每消耗1发弹药，全体【拉特兰】干员攻击力+4%，至多+200%。', 2); break;
    case 'egirShip':
      add(`【阿戈尔】干员生命值+${value(0)}；依次吞噬身前干员，获得其阻挡数及基础攻击力的${highlight(bb.devour_base_atk_scale + bb.devour_atk_scale_per_layer * L, true)}。`);
      add(`前3名【阿戈尔】干员首次被击倒时立即复活；将存活的被吞噬者所在格或身前一格内的至多一名敌人视为自身攻击范围，每次传递削减${highlight(1 - bb.relay_damage_per_hop, true)}伤害。`, 2); break;
    case 'siracusaShip':
      add(`【叙拉古】干员部署后攻速+${value(0)}，持续${value(1)}秒。`);
      add(`部署后同时隐匿；隐匿期间及结束后10秒，攻击有3%概率造成${value(2)}点真实伤害并恐惧3秒。`, 2); break;
    case 'kazimierzShip':
      add(`每次有干员部署，全体【卡西米尔】干员攻击力+20%，至多+${value(0)}，持续至战斗结束。`);
      add('阻挡时每2秒对周围敌人造成120%攻击力真实伤害并晕眩0.1秒；未阻挡时攻击附带30%攻击力真实伤害。', 2); break;
    case 'preciShip':
      add(`【精准】干员攻击力+${value(0)}。`);
      add('增益扩展至所有远程干员，攻击无视30%防御力和法术抗性。', 2); break;
    case 'swiftShip':
      add(`【迅捷】干员技能结束时有${value(0)}概率回复12点技力。`);
      add(`所有干员技能结束时有${value(0)}概率额外回复15点技力。`, 1, bb.power_bond_stack_cnt); break;
    case 'skillfulShip':
      add(`【灵巧】干员及周围4格干员攻速+${value(0)}。`);
      add('增益范围扩大至周围8格。', 1, bb.power_bond_stack_cnt); break;
    case 'arcaneShip':
      add(`【奥术】干员造成法术伤害时，使目标受到的法术伤害+${value(0)}，持续3秒。`);
      add(`对生命值低于50%的目标，该增益改为+${value(1)}。`, 2); break;
    case 'steadShip':
      add(`所有干员生命值+${value(0)}。`);
      add(`非【坚守】干员所受伤害的40%由【坚守】干员均摊；【坚守】干员受伤时反击${value(1)}点法术伤害，并施加40%脆弱5秒，每0.2秒至多触发一次。`, 2); break;
    case 'deputShip':
      add(`所有干员防御力+${value(0)}，再部署时间−30%；休整期结束时，所有已激活盟约层数+${highlight(tier >= 2 && active ? bb.more_layer : bb.layer)}。`);
      add('休整期叠层提升至+4。', 2); break;
    case 'visiShip':
      add('每累计10层获得2资金，整备区成员也可激活。');
      add('【远见】干员购买价格永久−1资金。', 1, bb.layer1);
      add('价格优惠扩展至调度中心内所有干员。', 1, bb.layer2); break;
    case 'miraShip':
      add(`刷新调度中心时，有${value(0)}概率使下次刷新免费；每累计100层获得20资金，整备区成员也可激活。`); break;
    case 'investShip':
      add(`干员“获得时”特质每次触发${highlight(L >= 100 ? 3 : bb.count)}次，整备区成员也可激活。`);
      add('“获得时”特质提升至每次触发3次。', 1, 100); break;
    case 'raidShip':
      add(`【突袭】干员10秒未攻击或技能就绪时，若范围内无敌人，保留技力再部署至地面敌人周围；期间攻击力、生命值+${value(0)}。`);
      add('所有干员攻速+50。', 1, bb.power_bond_stack_cnt); break;
    case 'indomShip':
      add(`地面干员被击倒时，有${value(0)}概率立即再部署。`);
      add('地面干员被击倒时，场上所有干员技力+5。', 2); break;
    case 'maniShip': add('核心盟约激活人数+1；【调和】干员享受已激活核心盟约的效果。'); break;
    case 'emptyShip': add('所有干员受到的物理、法术伤害−20%；协防干员伤害+20%，精锐改为+40%。'); break;
    case 'soloShip': add('【独行】干员攻击力、生命值+60%，初始技力+15；在场2名及以上时失效。'); break;
    case 'suntShip':
      add('所有精锐干员攻击力+30%。');
      add('所有精锐干员技力消耗−30%。', 2); break;
    case 'prosperityShip':
      add(`【繁盛】干员治疗效果+${highlight(prosperityHealBonus(L), true)}，上限200层。`);
      add('累计对其他干员的实际治疗；范围内有敌人时，每秒投掷生命球并清空计数，造成一次周围五格真实伤害，并为范围内友方恢复生命。40层时爆炸范围扩大至九格。', 2); break;
  }
  return clauses;
}
