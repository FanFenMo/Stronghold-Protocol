# 哥伦比亚盟约：实现说明与待办

本文记录本 fork 新增的**哥伦比亚**（`columbiaShip`）核心盟约的实现路径、已落地内容与尚未完成的部分。
设计数值来自项目主人的方案；本文只描述**代码实际做了什么**。

核对日期 **2026-10-15**，分支 `feature/columbia-bond`。

## 设计

| 档位 | 效果 |
|---|---|
| **(3)** 在场 3 名不同【哥伦比亚】干员 | 获得哥伦比亚的科技装备，仅【哥伦比亚】干员可用；每叠加 **50 层**随机获得一件，**不重复**，至多 **6 件**。 |
| **(6)** 在场 6 名不同【哥伦比亚】干员 | 科技装备获得**过载**，其效果增加 100%；所有佩戴科技装备的干员获得 **50 攻速**。 |

层数上限沿用默认 **999**（`BOND_LAYER_CAP`）；装备在 300 层即发满 6 件。

### 六件科技装备

过载值**不是统一翻倍**：拓荒者蓄力装具是特例，其余五件的过载值恰好是普通值的两倍。

| 装备 | 普通 → 过载 |
|---|---|
| 拓荒者蓄力装具 | `115% / 每3次+1% / 上限200%` → **`130% / 每3次+2% / 上限400%`**（特例） |
| 梅兰德战地保单 | `15% / −2%攻击力 / 15s` → `30% / −4% / 30s`，最高 15 层 |
| 过载护盾 | `2000 生命 / 0.6% 双抗 / 锁血7s` → `4000 / 1.2% / 14s` |
| 灰质引擎 | `+45% 攻击力 / 每1000伤害+1% / 5% 精神损伤` → `+90% / +2% / 10%`，最高 100 层 |
| 多维尔综合诊疗仪 | `治疗+20% / 自身四格sp+1 / 目标四格回复15%` → `+40% / +2 / 30%` |
| 反重力投送场 | `浮空2s / sp回复+0.25 / 攻速+40` → `4s / +0.5 / +80` |

数值全部集中在 [`shared/columbia.js`](../shared/columbia.js)，数据生成、战斗与界面共用同一份，不重复写死。

## 已落地

| 环节 | 文件 |
|---|---|
| 共用数值与装备定义 | `shared/columbia.js`（新增） |
| 数据生成（盟约记录 / 效果 / 成员 / 6 件装备 / 双星特质 / 模式名单） | `tools/columbia-data.mjs`（新增） |
| 数据生成挂载 | `tools/custom-data.mjs` → `applyCustomData()` |
| 素材挂载 | `tools/fetch-assets.mjs` |
| 战斗侧：(6) 档 +50 攻速、过载状态查询 | `server/sim/content/bonds/columbia.js`（新增） |
| 战斗侧注册 | `server/sim/content/bonds.js` 的 `PARTS` |
| **每 50 层发装备** | `server/match/PlayerState.js` → `addLayers()` 末尾调用 `_grantColumbiaTech()` |
| 界面描述 | `public/js/ui/bondDescriptions.js` |
| 测试 | `test/content/columbia.test.js`（新增） |

### 成员归属走"手写名单"

哥伦比亚在游戏数据里是**真实势力**——`data/chess.json` 有 32 条棋子的 `nationId` 含 `columbia`。
但本方案**不**走 `powerIdList` 自动圈人的官方路线，而是像繁盛那样在 `tools/columbia-data.mjs` 里显式写
`COLUMBIA_MEMBERS`，只给名单里的干员加 `columbiaShip`。名单见该文件的常量。

### 每 50 层发装备挂在哪

`PlayerState.addLayers()` 是层数的唯一入口（`server/match/PlayerState.js`），因此发放在它的末尾：

* 只在 **(3) 档及以上**发放；
* 跨越 50 的倍数时随机取一件**尚未获得**的科技装备，调用现成的 `acquireItem()`（本项目的装备发放入口）；
* 装备设 `mergeable: false`，避免两件同名合成进阶装备，违背"不重复"；
* 整备区已满时 `acquireItem` 会销毁装备并返回 `null`——此时**不消耗名额**，留到跨过下一个 50 层倍数时再试；
* 随机数走本玩家专属的 `columbia:<playerId>` 流（`deriveSeed`），**不扰动** setup / shop / waves / draft / bots / meta，
  这样黄金结果的差异只可能来自哥伦比亚自身。

### 溯光星源的双星

它原有的特质是 `garrison_121_a`：`<休整期结束时>本回合每花费3资金，使已激活的【灵巧】【奥术】层数+2`（`bb: {layer:2,count:3}`）。
双星 = **加一条数值完全相同、目标换成哥伦比亚的平行特质** `garrison_custom_columbia_astgenne_{a,b}`（精锐翻倍）。
原特质原样保留。

## 待办（尚未实现）

> ⚠️ 下面每一项都**没有**完成，代码里以 `TODO` 或 `spec.assumed` 标注。

1. **六件科技装备的战斗效果**。目前只做了记录生成、(3) 档发放、(6) 档 +50 攻速与过载状态查询；
   六件装备各自的战斗效果（攻速叠加、治疗计数、护盾与锁血、精神损伤、浮空、sp 回复）**均未实现**——
   `tools/columbia-data.mjs` 里每条记录的 `implFormula` 都标了 `[ASSUMED]`。
   这是本盟约最大的一块工作，需要逐件在 `server/sim/content/` 下实现并配战斗测试。
2. **四名待接入干员**：石英（设计一本）、星源（三本）、星极（四本）、响石（三本）在 `data/chess.json` 里**不存在**。
   它们只在 `feature/prts-reserved-operators` 分支的归档资料库里，而该分支的文档明确写了
   "后续开放时需要另行确定游戏规则并完成棋子、盟约和技能机制的接入，**不能仅翻转这里的标记**"。
3. **霍尔海雅的本数**：设计为**四本**，但数据里只有 `chess_external_5_heyak` / `chess_external_6_heyak`。
   当前**暂挂六本外援版本占位**，待搬池后替换。
4. **哥伦比亚干员搬出外援池**：方案要求把 9 名只存在于外援池的哥伦比亚干员
   （谬因、多萝西、霍尔海雅、伊芙利特、涤火杰西卡、麦哲伦、娜斯提、黑、淬羽赫默）搬进常规卡池。
   这要改 `tools/expanded-roster-data.mjs` 那套外援生成机制，尚未开始。
   当前谬因与霍尔海雅仍以 `chess_external_*` 记录参与盟约。
5. **其余干员的叠层特质**：石英、锡人、星源、响石、星极、缪因、霍尔海雅各自的叠层/加成特性只有文字描述，
   尚未落成 garrison 数据。溯光星源那条已完成（见上）。

## 验证

```bash
npm run build-data        # 生成 data/*.json（含哥伦比亚）
node --test               # 单元 + 集成
node tools/golden.mjs     # 黄金结果：本次改动会改变基线，确认差异后用 npm run golden:update
```

素材：盟约图标与三态图标按 `applyColumbiaAssets()` 的约定指向
`/img/bonds/columbia-{glyph,inactive,active}.png`，**这些图片尚未提供**，缺失时界面走原有回退。
