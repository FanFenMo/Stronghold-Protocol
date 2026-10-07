# 新增干员与服务器部署

此分支在原有内容注册方式中接入五名干员，保留浏览器／服务器共用的战斗引擎、联机协议、商店与部署流程。每名干员均有普通和精锐版本，三个技能可在开局调配中选择，技能按原项目的策略自动释放。

| 干员 | 调度中心等级 | 盟约 | 默认技能 | PRTS 资料 |
|---|---|---|---|---|
| 阿斯卡纶 | 五本 | 协防干员 | 技能二 | [阿斯卡纶](https://prts.wiki/w/阿斯卡纶) |
| 丰川祥子 | 六本 | 协防干员 | 技能三 | [丰川祥子](https://prts.wiki/w/丰川祥子) |
| 赤刃明霄陈（火陈） | 五本 | 大炎 | 技能三 | [赤刃明霄陈](https://prts.wiki/w/赤刃明霄陈) |
| 予愿安洁莉娜 | 六本 | 叙拉古 | 技能三 | [予愿安洁莉娜](https://prts.wiki/w/予愿安洁莉娜) |
| 望 | 六本 | 大炎 | 技能三 | [望](https://prts.wiki/w/望) |

数值、技能描述、天赋及攻击范围采用游戏公开数据表，技能效果对照 PRTS 核实。沿用项目的普通版技能等级四、精锐版技能等级七；本次三名干员采用精二一级／精二六十级、零潜能、无模组，表中指定的盟约是其唯一盟约。五本普通卡池库存八名，六本五名，三合一晋升精锐。

火陈实现伤害类型择优、静息治疗与一次闪避、连续斩击、瞬移和追踪剑气；予愿安洁莉娜实现起飞、浮空／缚地、重量降低、对空阻挡与弹药攻击；望实现棋子相连激活、连线增伤及无视法抗、三种棋子伤害和弹药返还。望适配本项目自动作战：自动在范围内靠近敌人路线的位置放置棋子；整备区手动部署的棋子也加入同一网络。跟子的同距离优先级随干员朝向旋转。棋子效果使用本项目特效绘制；公开镜像未提供的棋子 Spine 采用原有渲染回退，干员本体有完整 Spine。

叙拉古保留原有隐匿及结束后十秒的触发窗口、伤害资格和同一玩家成员共享计数方式。第一次符合条件的攻击触发概率为 3%，未造成盟约真伤后依次变为 6%、9%……，上限 100%，最迟第 34 次符合条件的攻击触发；实际造成盟约真实伤害后重置为 3%。持续伤害、附加伤害及盟约伤害沿用原有排除规则，避免重复触发。

删除上游新增的顶部盟约栏“本局禁用”低亮圆盘及对应视图字段，并从模式禁用名单移除独行。独行按原逻辑在场上一名独行干员时生效，两名不同独行干员时停止加成。本局信息仍保留其他实际模式限制的说明。

## 部署

依赖版本、端口、素材镜像、可选客户端资源提取和服务部署方式均沿用原项目。`package.json` 与 `package-lock.json` 未改变；生产环境仍使用 Node.js 22／24。新增素材记录放在原有 `docs/research/07-assets.json` 中，由 `npm run setup` 补下载，已有素材会复用。无需上传本机 `.runtime`、`node_modules` 或缓存。

新服务器按原流程安装，只需取本 fork 的对应分支：

```bash
git clone --branch custom-operators https://github.com/FanFenMo/Stronghold-Protocol.git
cd Stronghold-Protocol
npm ci
npm run setup
npm start
```

在已有服务器目录升级时，先按既有服务管理方式停止游戏进程，保留 `public/assets/local/` 与 `data/local-assets.json`。原仓库部署可添加此 fork 为新的远端，然后切换分支：

```bash
git remote add custom https://github.com/FanFenMo/Stronghold-Protocol.git
git fetch custom custom-operators
git switch --track custom/custom-operators
npm ci
npm run setup
```

若已存在该分支，后续在该分支运行 `git pull --ff-only`、`npm ci`、`npm run setup`。素材清单 `data/assets.json` 由 setup 生成，更新前可按原部署文档还原这个生成文件以免拉取冲突。完成后用原来的 systemd、Docker 或启动脚本重启；对应配置、环境变量及反向代理示例仍见 [DEPLOY.md](DEPLOY.md)。重启会结束内存中的对局，浏览器刷新后开始新局。

F 盘本地启动仍可双击 `scripts/start-windows.bat`；脚本优先使用项目已有的 `.runtime/node/node.exe`，没有便携运行时则使用已安装的 Node。Linux 服务器使用系统 Node，运行方式与此前相同。

## 数据重建与验证

新增数据快照位于 `tools/data/custom-operators.json`，原有 `npm run build-data` 在官方数据构建后应用该快照，保留五名干员、棋子及盟约修正。`--no-research` 仍用于构建未经本地扩展的官方基线。直接部署仓库不需要先重建数据。

专项测试覆盖普通／精锐的全部技能、伤害与控制、空中行为、手动棋子接入、叙拉古概率递增与重置，以及独行实际属性加成。四组真实 Chrome 用例验证五名干员普通／精锐版拖拽部署、Spine 加载、伤害计算和回合结算。固定种子的战斗与对局黄金结果随本次内容变化更新。

```bash
node --test test/content/custom_operators.test.js test/content/custom_expansion.test.js
SP_E2E=1 node --test --test-concurrency=1 test/ui/custom-operators.e2e.test.js
```

浏览器验证只在开发机需要 Chrome，服务器启动不增加此依赖。
