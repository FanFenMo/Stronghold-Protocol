/** Trophy prices are intentionally unset until the owner supplies them. */
const product = (id, group, name, value = null, extra = {}) => ({ id, group, name, value, price: null, limit: 1, ...extra });
export const TROPHY_EQUIPMENT_PRICES = Object.freeze({ basic: null, phone: null, material: null, special: null, hr: null });
const equipment = [
  ['basic', '基础装备', [
    ['chess_item_1_01_e_a', '维式重锤'], ['chess_item_3_04_e_a', '炎国短刀'], ['chess_item_5_02_e_a', '谢拉格不融冰'],
    ['chess_item_3_01_e_a', '叙拉古正装'], ['chess_item_4_07_e_a', '卡西米尔竞技旗'], ['chess_item_3_07_e_a', '阿戈尔重刃'],
    ['chess_item_2_04_e_a', '萨尔贡浓茶'], ['chess_item_4_08_e_a', '拉特兰桥夹'], ['chess_item_3_05_e_a', '迅捷作战粮'],
    ['chess_item_3_02_e_a', '精准狙击镜'], ['chess_item_3_08_e_a', '奥术法阵'], ['chess_item_1_02_e_a', '坚守盾牌'],
    ['chess_item_2_01_e_a', '不屈弹射器'],
  ]],
  ['phone', '简易通讯机', [['chess_item_2_06_e_a', '简易通讯机']]],
  ['material', '拟态物质 / 商业包装方案', [['chess_item_5_05_e_a', '拟态物质'], ['chess_item_5_07_e_a', '商业包装方案']]],
  ['special', '信标 / 博士投影 / 变形同构体', [
    ['chess_item_5_04_e_a', '信标'], ['chess_item_5_06_e_a', '博士投影'], ['chess_item_6_09_e_a', '变形同构体'],
  ]],
  ['hr', '人事部文档', [['chess_item_6_08_e_a', '人事部文档']]],
];

export const TROPHY_SHOP_PRODUCTS = Object.freeze([
  ...[5, 7, 9, 11, null].map(rounds => product(`slow_${rounds ?? 'all'}`, 'slow', rounds ? `前 ${rounds} 回合` : '所有回合', rounds)),
  ...[10, 20, 30].map(percent => product(`attack_${percent}`, 'attack', `${percent}%`, percent / 100)),
  ...equipment.flatMap(([tier, tierName, entries], order) => entries.map(([id, name]) =>
    product(`equip_${id}`, 'equipment', name, id, { tier, tierName, order, price: TROPHY_EQUIPMENT_PRICES[tier] }))),
  product('funds', 'funds', '本局随机一休整期开始时，资金额外 +10'),
  product('last_stand', 'last_stand', '本局生命值降至 0 时保留 1 点生命继续模拟，每局触发一次'),
  product('strategy', 'strategy', '开局获得一个随机策略效果'),
  product('round12', 'round12', '存活通过第 12 回合后，获得奖杯 +2；否则不额外获得奖杯', null, { price: 1, limit: 10 }),
  product('mystery', 'mystery', '？？？'),
]);

export const TROPHY_SHOP_GROUPS = Object.freeze([
  { id: 'slow', name: '怪物移速降低 20%', expandable: true },
  { id: 'attack', name: '干员攻击力提高', expandable: true },
  { id: 'equipment', name: '第 5 回合获得一件装备', expandable: true },
  ...['funds', 'last_stand', 'strategy', 'round12', 'mystery'].map(id => ({ id, name: TROPHY_SHOP_PRODUCTS.find(p => p.id === id).name })),
]);

export const trophyProduct = id => TROPHY_SHOP_PRODUCTS.find(p => p.id === id) ?? null;
