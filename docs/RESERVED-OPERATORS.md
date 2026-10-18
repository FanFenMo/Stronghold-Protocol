# 隐藏干员资料库

石英、星源、星极、响石、谬因目前仅归档 PRTS 原作资料。谬因保留检索别名“缪因”，并附带关联装置“中继器”的资料和模型。盟约、阶数、本游戏专属特性均未确定，使用 `null` 表示待定。

`tools/data/reserved-operators.json` 维护名单，`tools/import-reserved-operators.mjs` 从 PRTS 页面及其模型查看器使用的 Torappu 地址导入。生成文件是 `data/reserved-operators.json`，请通过脚本重新生成，勿手工修改。每个条目记录页面修订号及固定修订链接，技能保留 1–7 级和专精一至三的数据，模组保留原作效果和属性字段。属性、天赋、范围及模组字段沿用 PRTS 字段名；数值归属于原作，不代表本游戏平衡设定。原作角色档案、语音台词、模组故事和基建技能不在本次归档范围内。

模型包含 PRTS 提供的默认及时装版本，分别保存正面、背面、基建骨骼和贴图。`animations` 保存所有动作名称和时长，`events`、`hits`、`bounds` 保存解析结果；`roles` 复用项目已有解析器映射动作，仅作为后续接入参考。图像包括头像、默认与精英二立绘、半身像、技能图标、模组图像和模组类型图标。二进制资源位于 `public/assets/local/reserved-operators/`，沿用项目不提交游戏资源的约定，并避免被通用资源命令的 `--prune` 清除。

首次导入运行 `node tools/import-reserved-operators.mjs`。更新上游资料运行 `node tools/import-reserved-operators.mjs --refresh`，使用本地页面缓存重新生成运行 `node tools/import-reserved-operators.mjs --offline`。在新检出目录恢复已归档资源运行 `node tools/import-reserved-operators.mjs --assets-only`，该命令依据生成文件中的地址和 SHA-256 下载文件，不改写资料。页面缓存位于 `.cache/reserved-operators/`。

所有条目显式设置 `isHidden: true`、`visible: false`、`game.enabled: false`。本资料库没有加入 `chess.json`、`backups.json`、`tokens.json`、`assets.json`，也没有运行时导入点，因此商店、奖励、外援选择、图鉴和战斗都不会出现这些条目。后续开放时需要另行确定游戏规则并完成棋子、盟约和技能机制的接入，不能仅翻转这里的标记。

资料来源为 [石英](https://prts.wiki/w/石英)、[星源](https://prts.wiki/w/星源)、[星极](https://prts.wiki/w/星极)、[响石](https://prts.wiki/w/响石)、[谬因](https://prts.wiki/w/谬因) 和 [中继器](https://prts.wiki/w/中继器)。PRTS 文本保留原站许可；游戏模型、图像与基础资料属于鹰角及相关权利人，遵循项目现有的游戏资源声明。
