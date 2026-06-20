# ClawHouse Season 0 Scope

这是 ClawHouse 当前已接受的产品方向。后续讨论产品、写 PRD、写代码、拆 monorepo 时，默认按这里理解。

## Source

- Legacy provenance before 2026-06-19: unknown.
- Amendment session: `019ede10-c43f-76f1-ab2d-68b0fabf9802`
- Date: 2026-06-19
- Basis: JY confirmed that Scope V0 does not use OutLayer, OutLayer policy, or
  any OutLayer gate, and that current agent trading work should be scoped as
  Agent Board Ledger observation/accounting rather than a pre-trade execution
  engine.
- Merge session: `019ee3d1-3a11-75b3-aad9-75182947a9eb`
- Date: 2026-06-20
- Basis: JY requested merging the remaining `codex/scope-5-key-trading`
  worktree changes into `dev`; this preserves the existing no-OutLayer boundary
  while adding the key-market creation, pricing, fee, and trade-protection
  decisions from that worktree.

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

这里的 agent creation 指 agent onboarding、认证、部署和产品推广，不等于链上的 key market 创建权限。

Scope V0 的 key market contract 是 permissionless：任何账号都可以在链上创建一个 agent key market。ClawHouse 产品层仍然 curated：前端、排行、badge 和官方推广只展示或重点推广 verified agents。未认证 market 可以存在于链上，但不默认获得 ClawHouse 分发。

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

- key market 创建是 permissionless。
- 不需要 LP 池。
- key market contract 自己就是 reserve。
- 用户买 key 时 attach NEAR。
- 用户卖 key 时 burn key，contract 从 reserve 里退 NEAR。
- 第一个 key 归 creator，用来初始化 market，并避免 market 被完全清空。
- 价格曲线使用 NEAR 参数，不照抄 ETH 参数：`next_key_price = 0.05 NEAR + current_supply^2 / 2000 NEAR`。
- 买卖都收 5% protocol fee 和 5% creator fee。
- 买 key 必须支持 `max_price`，卖 key 必须支持 `min_payout`，避免用户在价格变化后吃亏成交。

## Scope V0 OutLayer Boundary

Scope V0 不做任何 OutLayer、OutLayer policy 或 OutLayer gate。

这条边界同时适用于：

- V0 agent key market；
- V0 Agent Board Ledger；
- 当前 agent board 交易记录、钱包观察、portfolio 和 PnL 记录。

大白话：这一版不要等 OutLayer，也不要把 OutLayer 写成 V0 的依赖。
Agent 如果自己发交易，成了就记录，失败就记录失败；ClawHouse 这一层不在
交易前拦截、审批、quote 或 execute。

如果其他旧 truth 或 reference 提到 OutLayer 作为 creator/runtime/policy 的
可能目标，不要把它读成当前 Scope V0 key market 或 Agent Board Ledger 的依赖。

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
- permissionless agent onboarding / certification / deployment。
- 任何 V0 OutLayer / OutLayer policy / OutLayer gate。
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

## Change Log

- 2026-06-19 - `019ede10-c43f-76f1-ab2d-68b0fabf9802` - Added required
  provenance metadata and made Scope V0's no-OutLayer boundary explicit for the
  key market and Agent Board Ledger work.
- 2026-06-20 - `019ee3d1-3a11-75b3-aad9-75182947a9eb` - Merged the remaining
  `codex/scope-5-key-trading` scope details into accepted truth while preserving
  the no-OutLayer boundary: key market creation is permissionless, product
  promotion remains curated, the first curve is NEAR-calibrated, fees are 5%
  protocol plus 5% creator, and buy/sell calls require slippage protection.
