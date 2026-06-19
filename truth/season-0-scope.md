# ClawHouse Season 0 Scope

这是 ClawHouse 当前已接受的产品方向。后续讨论产品、写 PRD、写代码、拆 monorepo 时，默认按这里理解。

## 一句话

ClawHouse Season 0 是一个短期、会传播的消费级金融游戏：用户围绕一批精选 trading agents 买卖 access keys，看排行、进 holder-facing surface、分享收益/身份卡，并通过 NEAR 相关能力完成支付、资金流转和风险辅助。

## 当前目标

Season 0 不是先做一个长期的 B2B agent proof layer，也不是先做完整 trading infrastructure。

当前目标是先做一个能让普通用户看懂、愿意参与、愿意分享的 30 天左右 campaign/game：

- agent 有人设、排行和可传播身份。
- 用户可以买 agent key，早买的人承担风险，也可能因为 key 变贵而赚钱。
- key 代表 access、status 和参与权，不代表 profit sharing。
- holder-facing room/feed 是产品体验的一部分，Telegram 可以做通知和增长，但不应该替代第一方产品体验。
- share cards / receipts / leaderboard 是传播核心。

## Agent Creation

Season 0 是 curated / permissioned，不是 permissionless agent creation。

大白话：一开始不是所有用户都能随便创建 agent。ClawHouse 先挑一批 agent 上线，用户主要是玩家、key holder、follower、copier。

建议的 Season 0 agent 池：

- 10 个 Official NEAR Agents。
- 50 个 Creator Agents。
- 40 个 Community Agents。

创作者 onboarding 和部署授权按 `truth/season-0-creator-onboarding.md` 执行。

## Scope V0 Build Slice

Scope V0 的第一刀是 NEAR 上的 agent key market。

必须包含：

- 创建 agent key market。
- Friend.tech-style bonding curve。
- 买 key。
- 卖 key。
- 查询 key price / supply / reserve / holder balance。
- 本地简单脚本：create、quote、buy、sell、state。

关键决定：

- 不需要 LP 池。
- key market contract 自己就是 reserve。
- 用户买 key 时 attach NEAR。
- 用户卖 key 时 burn key，contract 从 reserve 里退 NEAR。

## NEAR Intents Boundary

NEAR Intents 在当前 scope 里主要用于：

- spot / cross-chain swap。
- buying keys / selling keys 的支付和资金路径。
- copy-with-constraints 的未来 intent 表达。
- funding / portfolio allocation / rebalancing。

不要假设 NEAR Intents 原生提供：

- perps。
- order book trading。
- funding rate。
- liquidation。
- leverage。

如果未来要接 Hyperliquid，NEAR Intents 最多先作为 funding / cross-chain payment rails；真实 perps trading 需要单独使用 Hyperliquid 侧能力。

## Private Inference Boundary

Private inference 是用户侧的风险和组合助手，不是 agent 决策核心。

用户可以问：

- 我该不该 copy 这个 agent？
- 我最多该配多少？
- 哪个 agent 更符合我的风险偏好？
- 我的 portfolio 和这个策略冲不冲突？

不要把 private inference 写成 agent 可以直接控制用户资金或绕过用户约束。

## Out Of Scope For Now

当前不要做：

- 完整 PVE arena。
- 三个 venue 的 proof league。
- 以 Hyperliquid perps 作为第一主线。
- 杠杆、爆仓、资金费率。
- key profit sharing。
- permissionless agent creation。
- 本地 Codex / Claude / skill 直接部署 IronClaw 或修改 OutLayer funds policy。
- 把旧 `docs/prd/v0-scope.md` 方向当作当前 scope。

## Original Vision 的地位

`references/original-vision.md` 是重要参考，但不是完整执行稿。

我们采用它的核心消费传播逻辑：

- Friend.tech-style agent keys。
- bonding curve。
- agent profiles。
- holder access。
- share cards。
- copy-with-constraints 的未来方向。

但 Scope V0 只先落地 key market，不一次性做完整 Original Vision。
