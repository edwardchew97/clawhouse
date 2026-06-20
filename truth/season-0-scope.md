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
- Preview merge session: `019ee3d1-3a11-75b3-aad9-75182947a9eb`
- Date: 2026-06-20
- Basis: JY asked whether the old `codex/scope-v0-preview-truth` proof should
  be deleted or merged. The still-valid split-network preview constraints from
  Codex thread `019ede1f-65e9-73f0-8632-923a11145d39` were extracted onto
  current `dev` without raw-merging the stale branch.
- PaperTrade amendment session: `019ee646-2993-7b50-b6e3-bb7f9445131f`
- Date: 2026-06-21
- Basis: JY decided that current Agent Trading should move from real trading to
  PaperTrade. The first surface is public paper, the second surface is board
  paper, Hyperliquid board paper is long-only spot only, the paper leaderboard
  must be public, dev and staging must both be deployed, staging is the final
  acceptance surface, and OutLayer is deferred.

## 一句话

ClawHouse Season 0 是一个短期、会传播的消费级金融游戏：用户围绕一批精选 trading agents 买卖 access keys，看公开 PaperTrade 排行、进 holder-facing surface、分享收益/身份卡，并通过清楚标记的 paper performance 理解 agent 表现。

## 当前目标

Season 0 不是先做一个长期的 B2B agent proof layer，也不是先做完整 trading infrastructure。

当前目标是先做一个能让普通用户看懂、愿意参与、愿意分享的 30 天左右 campaign/game：

- agent 有人设、排行和可传播身份。
- 用户可以买 agent key，早买的人承担风险，也可能因为 key 变贵而赚钱。
- key 代表 access、status 和参与权，不代表 profit sharing。
- holder-facing room/feed 是产品体验的一部分。Scope V0 preview 先做第一方
  holder-facing room，不用 Telegram 或 chat 代替产品体验。
- share cards / receipts / public paper leaderboard 是传播核心。

## Agent Creation

Season 0 是 curated / permissioned，不是 permissionless agent creation。

大白话：一开始不是所有用户都能随便创建 agent。ClawHouse 先挑一批 agent 上线，用户主要是玩家、key holder、follower、copier。

这里的 agent creation 指 agent onboarding、认证、部署和产品推广，不等于链上的 key market 创建权限。

Scope V0 的 key market contract 是 permissionless：任何账号都可以在链上创建一个 agent key market。ClawHouse 产品层仍然 curated：前端、排行、badge 和官方推广只展示或重点推广 verified agents。未认证 market 可以存在于链上，但不默认获得 ClawHouse 分发。

Scope V0 preview 的产品面仍然是 curated：目标是 3 个 ClawHouse-curated
agents。它必须按 multi-agent 产品模型设计，不能写成只能容纳一个 agent 的一次性
demo。Preview 里出现的 agent 名字、身份和 room 都必须来自真实配置或真实产品事件。
leaderboard 和 PnL 必须来自 PaperTrade 的真实服务记录、paper order、paper fill、
paper holding 和 paper price snapshot，不允许用 seed content 伪造。

Scope V0 preview 不提供 public-facing agent onboarding。V0 agent 由 ClawHouse
内部创建、部署、管理和更新；外部创作者 onboarding 仍按
`truth/season-0-creator-onboarding.md` 的 IronClaw-side 边界另行推进。

建议的 Season 0 agent 池：

- 10 个 Official NEAR Agents。
- 50 个 Creator Agents。
- 40 个 Community Agents。

创作者 onboarding 和部署授权按 `truth/season-0-creator-onboarding.md` 执行。

## Scope V0 Build Slice

Scope V0 的第一刀是 NEAR 上的 agent key market 加 PaperTrade 排行体验，但产品目标不是只停在本地脚本。
当前 preview 必须是内部用户可访问的产品切片：key market、holder room、agent
updates、public paper leaderboard/PnL 和 receipt/share card 要连成一条真实可读的体验。

必须包含：

- 创建 agent key market。
- Friend.tech-style bonding curve。
- 买 key。
- 卖 key。
- 查询 key price / supply / reserve / holder balance。
- 本地简单脚本：create、quote、buy、sell、state。
- 3 个 ClawHouse-curated agents 的可访问 preview。
- 至少 1 个真正跑起来的 agent，可以自己发真实短 update，并通过 PaperTrade
  服务产生 paper leaderboard/PnL 输入。
- 第一方 holder-facing room。
- receipt / share card。

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

## Scope V0 Preview, Data, Deploy, And Networks

Scope V0 preview 使用 split-surface 架构：

- key trading / key market / holder gate：NEAR testnet。
- agent trading / agent PnL：PaperTrade service。
- public paper：公开 paper competition 和 public paper leaderboard。
- board paper：每个 agent board 的 paper account、paper order、paper fills、
  paper holdings 和 paper PnL。

这个拆分是强约束。key trading 可以先在 testnet 展示真实合约状态和 holder gate；
agent performance 先走 PaperTrade，不要求真实资金、真实钱包、NEAR Intents mainnet
资金路径或真实交易。

产品里出现的 agent、room update、leaderboard、PnL、key price、holder count、
supply、reserve、holder balance、receipt/share card 数据都必须来自真实配置、真实
agent 运行结果、真实链上状态、真实产品事件或 PaperTrade 服务记录。做不到这些来源时，不要用假数据补位。

所有 UI、receipt、share card 和 backend response 都必须清楚标出 key market 是
testnet，agent performance / PnL 是 paper，不能让用户误以为 testnet key price 或
paper PnL 是真实资金收益。

Dev 和 staging 都必须部署当前 PaperTrade 方向。staging 是当前最终验收环境；
测试验收应在 staging 上发生，而不是只用本地或 dev 结果代替。

## Scope V0 Holder Room

Scope V0 必须有第一方 holder-facing room。

Room 必须包含：

- holder access gate：没有持有对应 agent key 的用户不能进入完整 room。
- agent room header：agent identity、key price、holders、supply、reserve、
  leaderboard/PnL 摘要。
- agent short updates：由 agent 自己发出的真实短 update。
- key position：当前用户持有的该 agent key 数量、买入成本、当前 sell quote /
  可退出 testnet NEAR。
- recent key activity：该 agent key market 的真实 buy/sell 或 holder/supply 变化。
- receipt / share card：用户买入或持有 key 后可以生成可分享凭证。

Room 不包含：

- chat。
- Telegram mirror。
- seed feed。
- copy trading。
- creator posting backend。
- private room 里的人工假内容。

## Scope V0 OutLayer Boundary

Scope V0 不做任何 OutLayer、OutLayer policy 或 OutLayer gate。

这条边界同时适用于：

- V0 agent key market；
- V0 Agent Board Ledger；
- 当前 PaperTrade、agent board paper account、paper order、paper fill、portfolio
  和 PnL 记录。

大白话：这一版不要等 OutLayer，也不要把 OutLayer 写成 V0 的依赖。
Agent 先发 paper order，ClawHouse PaperTrade 服务做 paper 级别的规则检查、深度检查、
模拟成交和记录；这不是 OutLayer policy，也不是真实资金执行。

如果其他旧 truth 或 reference 提到 OutLayer 作为 creator/runtime/policy 的
可能目标，不要把它读成当前 Scope V0 key market、PaperTrade 或 Agent Board Ledger 的依赖。

## NEAR Intents Boundary

NEAR Intents 在当前 scope 里主要用于未来资金路径或后续真实交易，不是当前 PaperTrade
验收依赖：

- spot / cross-chain swap。
- 出入金 / funding layer，把用户资金换成或带到后续真实 NEAR mainnet agent trading
  可能需要的资金路径。
- copy-with-constraints 的未来 intent 表达。
- funding / portfolio allocation / rebalancing。

Scope V0 preview 明确不使用 NEAR Intents 直接买卖 key。用户 buy key / sell key
发生在 NEAR testnet 的 key market contract 上。

不要假设 NEAR Intents 原生提供：

- perps。
- order book trading。
- funding rate。
- liquidation。
- leverage。
- agent key market execution。

当前 PaperTrade 的 Hyperliquid board surface 只允许 long-only spot。不要把它写成
Hyperliquid perps、short、borrow、leverage、funding rate、liquidation 或真实下单。
NEAR Intents 最多作为后续 funding / cross-chain payment rails，不是当前 PaperTrade
leaderboard 的资金来源。

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
- 以 Hyperliquid perps 作为当前主线。
- 真实交易作为当前 Agent Trading 主线。
- 杠杆、爆仓、资金费率。
- key profit sharing。
- permissionless agent onboarding / certification / deployment。
- public-facing agent onboarding。
- seed content / seed feed / fake leaderboard / fake PnL。
- 未标记为 paper 的 leaderboard 或 PnL。
- Telegram as the Scope V0 holder room or primary product surface。
- holder chat。
- copy trading。
- mainnet key trading。
- 用 NEAR Intents 直接买卖 key。
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
- 2026-06-20 - `019ee3d1-3a11-75b3-aad9-75182947a9eb` - Extracted the still-valid
  `codex/scope-v0-preview-truth` decisions onto current `dev`: Scope V0 preview
  is accessible rather than local-script-only, uses 3 curated agents, bans seed
  content, uses first-party holder rooms, splits key trading on NEAR testnet from
  agent trading / NEAR Intents funding on NEAR mainnet, and keeps NEAR Intents
  out of direct key buy/sell execution.
- 2026-06-21 - `019ee646-2993-7b50-b6e3-bb7f9445131f` - Superseded the current
  real-trading Agent Trading direction with PaperTrade for Season 0: public
  paper plus board paper, public paper leaderboard, Hyperliquid board paper as
  long-only spot, dev and staging deploy targets, staging as final acceptance,
  and OutLayer deferred.
