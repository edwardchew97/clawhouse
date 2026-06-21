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
- Hyperliquid paper trading amendment session:
  `019ee644-a97f-7953-a80b-e6642cf53596`
- Amendment date: 2026-06-21
- Amendment basis: JY reopened the agent-trading direction and confirmed that
  ClawHouse should first build Hyperliquid-style paper trading in the existing
  ClawHouse backend, not OutLayer, with agent orders sent to ClawHouse for
  depth/risk validation, cross and isolated margin support, timely liquidation,
  Paper PnL in the leaderboard, and a runtime skill agents can use to trade.
- Prior PaperTrade amendment session: `019ee646-2993-7b50-b6e3-bb7f9445131f`
- Amendment date: 2026-06-21
- Amendment basis: That parallel edit accepted Season 0 PaperTrade as public
  paper plus board paper and kept Hyperliquid board paper long-only spot. It is
  retained as provenance, but the later Hyperliquid-style paper trading
  amendment in session `019ee644-a97f-7953-a80b-e6642cf53596` supersedes the
  spot-only limit for the current backend implementation.
- Runtime cleanup amendment session: `019ee858-16a0-7603-b385-1d7a379e3a94`
- Amendment date: 2026-06-21
- Amendment basis: Prior JY request removed the legacy NEAR Intents spot-value
  runtime skill from current onboarding surfaces so PaperTrade users were not
  shown spot instructions inside the perps path. This skill-removal part is
  restored and expanded by the later runtime cleanup correction below.
- Trading skill split amendment sessions:
  `019ee646-2993-7b50-b6e3-bb7f9445131f`,
  `019ee644-a97f-7953-a80b-e6642cf53596`
- Amendment date: 2026-06-21
- Amendment basis: JY clarified that spot trading and perps trading should be
  separate runtime skills. Hyperliquid paper remains the perps/margin/liquidation
  lane; NEAR Intents returns as the spot-only value movement lane. Future venues
  must be added as separate skills. This two-skill runtime split is superseded
  by the runtime cleanup correction below.
- Runtime cleanup correction session: `019ee84c-2bfb-7ec3-844d-ff6f60412bb2`
- Amendment date: 2026-06-21
- Amendment basis: JY corrected the prior two-skill interpretation and
  instructed removing the NEAR Intents spot runtime/onboarding path completely
  from current surfaces. Current Season 0 runtime/onboarding exposes only the
  Hyperliquid paper perps trading skill; future spot or venue trading requires a
  later verified manifest skill.

## 一句话

ClawHouse Season 0 是一个短期、会传播的消费级金融游戏：用户围绕一批精选 trading agents 买卖 access keys，看排行、进 holder-facing surface、分享收益/身份卡，并通过 NEAR 相关能力完成支付、资金流转和风险辅助。

## 当前目标

Season 0 不是先做一个长期的 B2B agent proof layer，也不是先做完整 trading infrastructure。

当前目标是先做一个能让普通用户看懂、愿意参与、愿意分享的 30 天左右 campaign/game：

- agent 有人设、排行和可传播身份。
- 用户可以买 agent key，早买的人承担风险，也可能因为 key 变贵而赚钱。
- key 代表 access、status 和参与权，不代表 profit sharing。
- holder-facing room/feed 是产品体验的一部分。Scope V0 preview 先做第一方
  holder-facing room，不用 Telegram 或 chat 代替产品体验。
- share cards / receipts / leaderboard 是传播核心。

## Agent Creation

Season 0 是 curated / permissioned，不是 permissionless agent creation。

大白话：一开始不是所有用户都能随便创建 agent。ClawHouse 先挑一批 agent 上线，用户主要是玩家、key holder、follower、copier。

这里的 agent creation 指 agent onboarding、认证、部署和产品推广，不等于链上的 key market 创建权限。

Scope V0 的 key market contract 是 permissionless：任何账号都可以在链上创建一个 agent key market。ClawHouse 产品层仍然 curated：前端、排行、badge 和官方推广只展示或重点推广 verified agents。未认证 market 可以存在于链上，但不默认获得 ClawHouse 分发。

Scope V0 preview 的产品面仍然是 curated：目标是 3 个 ClawHouse-curated
agents。它必须按 multi-agent 产品模型设计，不能写成只能容纳一个 agent 的一次性
demo。Preview 里出现的 agent 名字、身份、room、leaderboard 和 PnL 都必须来自真实
配置、真实运行数据、真实链上状态或真实产品事件，不允许用 seed content 伪造。

Scope V0 preview 不提供 public-facing agent onboarding。V0 agent 由 ClawHouse
内部创建、部署、管理和更新；外部创作者 onboarding 仍按
`truth/season-0-creator-onboarding.md` 的 IronClaw-side 边界另行推进。

建议的 Season 0 agent 池：

- 10 个 Official NEAR Agents。
- 50 个 Creator Agents。
- 40 个 Community Agents。

创作者 onboarding 和部署授权按 `truth/season-0-creator-onboarding.md` 执行。

## Scope V0 Build Slice

Scope V0 的第一刀是 NEAR 上的 agent key market，但产品目标不是只停在本地脚本。
当前 preview 必须是内部用户可访问的产品切片：key market、holder room、agent
updates、leaderboard/PnL 和 receipt/share card 要连成一条真实可读的体验。

必须包含：

- 创建 agent key market。
- Friend.tech-style bonding curve。
- 买 key。
- 卖 key。
- 查询 key price / supply / reserve / holder balance。
- 本地简单脚本：create、quote、buy、sell、state。
- 3 个 ClawHouse-curated agents 的可访问 preview。
- 至少 1 个真正跑起来的 agent，可以自己发真实短 update，并产生真实
  leaderboard/PnL 输入。
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

## Scope V0 Preview, Data, And Networks

Scope V0 preview 使用 split-network 架构：

- key trading / key market / holder gate：NEAR testnet。
- agent trading / Paper PnL / leaderboard：ClawHouse backend 上的
  Hyperliquid-style paper trading。

这个拆分是强约束。key trading 可以先在 testnet 展示真实合约状态和 holder gate；
agent trading 不再用 NEAR Intents spot 作为第一条交易主线。ClawHouse backend 接收
agent paper orders，用 Hyperliquid market data 做 depth、margin、risk 和 liquidation
计算，并把 Paper PnL 作为 leaderboard 的 agent-trading 输入。

产品里出现的 agent、room update、leaderboard、PnL、key price、holder count、
supply、reserve、holder balance、receipt/share card 数据都必须来自真实配置、真实
agent 运行结果、真实链上状态、真实 Hyperliquid market data、或 ClawHouse paper
engine 写入的可 replay 事件。做不到真实数据时，不要用假数据补位。

所有 UI、receipt、share card 和 backend response 都必须清楚标出 key market 是
testnet，agent trading / PnL 是 paper，不能让用户误以为 testnet key price 或
paper PnL 是 mainnet 金钱收益。

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

Scope V0 第一版 Hyperliquid paper trading 不依赖 OutLayer、OutLayer policy 或
OutLayer gate。

这条边界同时适用于：

- V0 agent key market；
- V0 Agent Board Ledger；
- 当前 Hyperliquid paper trading order intake、risk、liquidation 和 leaderboard
  Paper PnL。

大白话：这一版不要等 OutLayer，也不要把 OutLayer 写成 V0 的依赖。Agent 把
paper order 发给 ClawHouse backend；ClawHouse backend 做 depth/risk 校验、
paper fill、position accounting、timely liquidation 和可 replay 的 proof。

如果其他旧 truth 或 reference 提到 OutLayer 作为 creator/runtime/policy 的
可能目标，不要把它读成当前 Scope V0 key market 或 Agent Board Ledger 的依赖。

## NEAR Intents Boundary

NEAR Intents 不再是当前 agent-trading / leaderboard PnL 的第一条交易主线。

Scope V0 preview 明确不使用 NEAR Intents 直接买卖 key。用户 buy key / sell key
发生在 NEAR testnet 的 key market contract 上。

NEAR Intents 也不负责当前 Hyperliquid paper trading 的：

- perps。
- order book trading。
- funding rate。
- liquidation。
- leverage。
- agent key market execution。

Current onboarding/runtime surfaces must not expose a NEAR Intents spot runtime
skill. Future spot or venue trading requires a new verified manifest skill and a
new accepted truth update before onboarding can route agents to it.

## Hyperliquid Paper Perps Boundary

Current agent trading uses a ClawHouse-owned Hyperliquid-style paper engine.
It is not real-money execution and it must be labeled as paper in product and
API surfaces.

The first backend slice must support:

- agent-submitted paper orders over HTTPS;
- Hyperliquid market-data-backed depth checks;
- deterministic paper fills for IOC and market-like orders;
- resting paper limit orders with GTC and ALO time-in-force;
- cross margin and isolated margin position accounting;
- funding and fee accounting when the source data is available;
- timely liquidation from fresh mark/risk data;
- hash-linked audit/replay proof for orders, fills, risk checks, liquidations,
  and leaderboard snapshots;
- Paper PnL, drawdown, liquidation count, and staleness status in the
  leaderboard.

The first backend slice does not:

- submit real orders to Hyperliquid;
- collect Hyperliquid API keys;
- hold user or agent private keys;
- treat paper PnL as real realized trading PnL;
- depend on OutLayer before the later OutLayer migration.

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
- 真实 Hyperliquid perps execution。
- 真实资金的杠杆、爆仓、资金费率。
- key profit sharing。
- permissionless agent onboarding / certification / deployment。
- public-facing agent onboarding。
- seed content / seed feed / fake leaderboard / unlabeled paper PnL。
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
- 2026-06-21 - `019ee644-a97f-7953-a80b-e6642cf53596` - Reopened agent trading
  around ClawHouse-hosted Hyperliquid-style paper trading: OutLayer is deferred,
  NEAR Intents is no longer the first agent-trading/PnL lane, Paper PnL may feed
  the leaderboard when labeled as paper, and the backend must support agent
  order intake, Hyperliquid market-data-backed depth checks, cross and isolated
  margin, timely liquidation, replay proof, and an installable runtime skill.
- 2026-06-21 - `019ee646-2993-7b50-b6e3-bb7f9445131f` - Preserved the parallel
  PaperTrade provenance while resolving the merge conflict in favor of the
  later Hyperliquid-style paper trading scope from
  `019ee644-a97f-7953-a80b-e6642cf53596`.
- 2026-06-21 - `019ee858-16a0-7603-b385-1d7a379e3a94` - Temporarily removed
  NEAR Intents from PaperTrade onboarding/runtime surfaces to avoid showing
  deposit instructions in the perps path. Restored by the later runtime cleanup
  correction.
- 2026-06-21 - `019ee646-2993-7b50-b6e3-bb7f9445131f`,
  `019ee644-a97f-7953-a80b-e6642cf53596` - Recorded NEAR Intents as a separate
  spot-only runtime skill while keeping Hyperliquid paper as the perps/margin/
  liquidation lane; future venues must be added as separate skills. Superseded
  by the later runtime cleanup correction.
- 2026-06-21 - `019ee84c-2bfb-7ec3-844d-ff6f60412bb2` - Removed the NEAR
  Intents spot runtime/onboarding path from current Season 0 scope. Current
  runtime/onboarding exposes only the Hyperliquid paper perps trading skill;
  future spot or venue trading requires a new verified manifest skill and truth
  update.
