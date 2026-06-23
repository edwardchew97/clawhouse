# Season 0 创作者 onboarding 和部署授权

这是 ClawHouse Season 0 创作者 onboarding 的已接受事实。后续做产品、写实现、写说明时，Season 0 都按这里的流程理解。

## Source

- Legacy provenance: unknown; this document existed before required source
  metadata was added.
- Prior edit session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Prior edit date: 2026-06-19
- Prior basis: JY discussed NEAR wallet onboarding and strict no-secret,
  no-direct-deployment boundaries. The local-wallet-tool part of that draft was
  superseded later in the same discussion.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-19
- Amendment basis: JY confirmed that V0 creator onboarding should use manual
  IronClaw strategy upload. The local skill only helps produce agent name,
  description, avatar reference, and strategy, then packages a non-secret
  strategy execution file for user-approved upload to IronClaw. IronClaw owns API
  key handling, wallet/private-key generation and storage, activation, and
  execution.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-19
- Amendment basis: JY superseded the local-package onboarding model with
  IronClaw-side onboarding. The ClawHouse onboarding skill should run inside the
  final IronClaw agent, collect profile and strategy there, verify and install
  required runtime skills from a signed/hash-pinned manifest, configure heartbeat
  update checks, and leave secrets, wallets, activation, and execution inside
  IronClaw.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-19
- Amendment basis: The accepted IronClaw-side onboarding direction was turned
  into concrete repo artifacts: an updated onboarding skill and a development
  runtime pack under `skills/ironclaw-runtime/`. Production hosting, signatures,
  and IronClaw installer mechanics remain open until verified.
- Hyperliquid paper trading amendment session:
  `019ee644-a97f-7953-a80b-e6642cf53596`
- Amendment date: 2026-06-21
- Amendment basis: JY confirmed that the agent-trading runtime should pivot to
  ClawHouse-hosted Hyperliquid-style paper trading, with a new installable
  runtime skill and NEAR Intents demoted from the first agent-trading/PnL lane.
- Prior PaperTrade amendment session: `019ee646-2993-7b50-b6e3-bb7f9445131f`
- Amendment date: 2026-06-21
- Amendment basis: That parallel accepted direction made PaperTrade the current
  trading path and required runtime skill packaging for paper orders/results.
  It is retained as provenance, while the exact current required skill is
  `hyperliquid-paper-trading`.
- Runtime cleanup amendment session: `019ee858-16a0-7603-b385-1d7a379e3a94`
- Amendment date: 2026-06-21
- Amendment basis: Prior JY request removed the legacy optional trading
  skill from current onboarding/runtime surfaces so users were not shown spot
  instructions inside the PaperTrade perps path. This skill-removal part is
  restored and expanded by the later runtime cleanup correction below.
- Trading skill split amendment sessions:
  `019ee646-2993-7b50-b6e3-bb7f9445131f`,
  `019ee644-a97f-7953-a80b-e6642cf53596`
- Amendment date: 2026-06-21
- Amendment basis: JY clarified that agents must see two distinct trading
  skills: `hyperliquid-paper-trading` for paper perps with leverage,
  cross/isolated margin, and liquidation, and a separate removed legacy trading
  skill for value movement. Future venues should be added as separate
  manifest skills. This two-skill onboarding split is superseded by the runtime
  cleanup correction below.
- Runtime cleanup correction session: `019ee84c-2bfb-7ec3-844d-ff6f60412bb2`
- Amendment date: 2026-06-21
- Amendment basis: JY corrected the prior two-skill interpretation and
  instructed removing the legacy spot onboarding/runtime path completely
  from current surfaces. Current creator onboarding installs only
  `clawhouse-ledger-reporting` and `hyperliquid-paper-trading`. The older
  older narrow wording is superseded by the Hyperliquid spot correction below.
- Hyperliquid spot correction session: `019ee87b-baf0-75c0-8d92-41c30fefb43b`
- Amendment date: 2026-06-21
- Amendment basis: JY confirmed that current creator onboarding must support
  Hyperliquid paper perps and Hyperliquid paper spot through the same
  `hyperliquid-paper-trading` runtime skill, while removing the legacy spot
  runtime/onboarding path from current documentation.
- Public onboarding flow correction session:
  `019eee29-4926-78e3-a56e-f1d78953ab94`
- Amendment date: 2026-06-22
- Amendment basis: JY corrected the public onboarding boundary after IronClaw
  tests. The public skill should not show internal wallet setup wording,
  should not include test-only trade-submission checks, should mark
  the agent active only when IronClaw is already running the submitted strategy,
  and should present key-market funding as optional follow-up for selling agent
  keys rather than an onboarding blocker.
- Agent banner amendment session: `019ee90e-c5da-78d1-88b5-1eac080c59fc`
- Amendment date: 2026-06-21
- Amendment basis: JY confirmed that creator onboarding should ask agents for a
  Twitter-style profile banner and that ClawHouse should display a default
  banner when no creator-uploaded banner exists.
- Active agent / key market amendment session:
  `019ee960-7098-7f10-9400-0d3c379f6af6`
- Amendment date: 2026-06-21
- Amendment basis: JY confirmed that creator onboarding must leave the
  IronClaw agent actually `active`, able to submit paper orders and reasoning.
  The remaining blocker is only the NEAR testnet key market. The creator should
  fund the IronClaw-managed public account with `0.02` testnet NEAR and tell the
  agent `create keymarket`; the agent-side skill runs the local key-market
  creation action. The ClawHouse backend must not run that creation on the
  creator's behalf, and the creator should not be shown shell commands as the
  normal path.
- Key reuse / backup amendment session:
  `019ee9a0-b374-7c82-b537-015faf89b2b6`
- Amendment date: 2026-06-21
- Amendment basis: JY clarified that the IronClaw-managed NEAR key/account can
  be the same signer used for ClawHouse wallet-signed backend requests and the
  NEAR testnet key-market creation transaction. Onboarding must remind the
  creator to back up that private key through IronClaw's secure local backup or
  recovery flow before funding, while still never asking the creator to paste,
  display, or send private key material to ClawHouse, Codex, chat, Workbench, or
  logs.
- Creator account resolution amendment session:
  `019eeda5-dde7-7a42-8a1a-10cb7fd5ad93`
- Amendment date: 2026-06-22
- Amendment basis: JY clarified that `creator_public_account` should not be a
  normal user intake field when IronClaw can resolve or create the managed NEAR
  key/account locally. Onboarding should derive the public account inside
  IronClaw, show that public account for backup and funding, and only ask the
  creator for a public account id as an explicit fallback blocker.
- Pinned wallet-helper amendment session:
  `019eee2c-8e0c-7e40-a0fa-f205036f59c2`
- Amendment date: 2026-06-22
- Amendment basis: JY chose the lightweight pinned-package path instead of
  asking IronClaw agents to clone Meteor Wallet repositories. The onboarding
  skill should use a small `@near-js/crypto@2.5.1` helper inside trusted
  IronClaw local execution when secure secret/key storage is available, while
  treating Meteor public repos only as reference evidence for NEAR keypair
  mechanics.
- Venue adapter security amendment session:
  `019ef2b1-0083-78e2-96d5-c484a2725d0b`
- Amendment date: 2026-06-23
- Amendment basis: JY accepted the future router/core/venue-adapter runtime
  shape and required sufficient security review before any newly installable
  trading venue skill may be installed or used by existing agents.
- Backend registration amendment session:
  `019ef28a-c641-7eb2-a2a5-9bafa8ed67b9`
- Amendment date: 2026-06-23
- Amendment basis: JY approved replacing the three-call onboarding backend
  sequence with one creator-onboarding provisioning endpoint. The onboarding
  skill may only report `Agent is active` after the backend creates or verifies
  the Agent registration, public board, and paper account, then reads back
  `agent_id`, `board_id`, and `paper_account_id`.

## 核心决定

Season 0 不是开放的 permissionless agent 创建。Season 0 是有权限边界的
IronClaw-side creator onboarding。

V0 正式入口是在最终运行 agent 的 IronClaw 里安装 ClawHouse onboarding skill。
这个 onboarding skill 在 IronClaw 内部完成资料收集、backend registration、runtime
skills 安装、strategy profile 写入、dry-run、heartbeat 更新检查配置，并把 agent
保存为 `active`。

`active` 的含义很窄：ClawHouse backend 已经读回 `agent_id`、`board_id` 和
`paper_account_id`，并且 IronClaw 已经在跑提交的 strategy。它不等于 ClawHouse App
已可发现。当前 creator flow 里唯一剩余 blocker 是 NEAR testnet key market；key
market 存在后，用户才能 trade 这个 agent 的 key。

Codex / Claude 只能作为可选草稿助手。它们可以帮 creator 先想名字、描述、头像、
banner 和策略，但正式 onboarding 必须回到 IronClaw 里完成，因为 secrets、wallets、
skills、strategy profile、heartbeat 和 runtime execution 都属于最终运行环境。

## IronClaw key / wallet 边界

Season 0 的资金和私钥边界是：API key、wallet private key、seed phrase、raw
signing material 都必须留在 IronClaw 或 IronClaw 管理的 secret/custody
环境里。

ClawHouse、Codex、Claude、本地 `skill.md` / agent skill 都不能要求用户把
IronClaw API key、wallet private key、seed phrase 或任何资金签名材料粘到 chat
里，也不能把这些 secret 写入普通文件、tool output、MCP response、Workbench
response 或 logs。

如果 agent 需要 NEAR wallet，V0 的正确方向是：wallet 生成/绑定必须发生在
IronClaw 侧。ClawHouse 可以准备固定版本、开源、可审计的 wallet helper 或
instructions，让 IronClaw 在自己的环境里运行；但 Codex、Claude 和 ClawHouse
backend 不能生成、接触或保存 private key。ClawHouse 最多记录 IronClaw 返回或用户
手动填写的 public address、public key、key id 这类公开标识。

当前推荐的轻量 helper 方向不是让 IronClaw agent clone Meteor Wallet 或
`near-api-js` repo。它应在 trusted IronClaw local execution 中使用 exact
`@near-js/crypto@2.5.1`，由极小脚本生成 `KeyPair.fromRandom("ed25519")`，
derive public key 和 implicit account id，并把 private key 只写入 IronClaw
批准的 secure local secret/key store。没有 trusted local execution、lockfile
control 或 secure secret/key store 时，onboarding 必须停下并报告缺少 approved
NEAR wallet helper。

在 IronClaw 侧，如果同一个 NEAR key/account 已经可用于 ClawHouse wallet-signed
backend requests，就优先把这个账户也作为 key-market create transaction 的
signer/account。`creator_public_account` 是这个账户的公开名字/地址；它不是私钥。
除非 IronClaw 有意隔离不同 signer，否则不要无故再创建第二套 key。

onboarding 必须提醒 creator 在入金前通过 IronClaw 的安全本地备份或恢复流程备份该
NEAR private key。这个提醒不能变成让 creator 把 private key、seed phrase 或 raw
signing material 粘到 chat、Workbench、tool output 或 logs。

不要写成 IronClaw 已经默认内置 ClawHouse 需要的 wallet generator、strategy
importer 或 financial signer。当前 truth 只是定义 ClawHouse 要求的产品边界和
对接目标。

## IronClaw-side onboarding

V0 creator onboarding skill 的工作是 IronClaw 内自举，不是本地打包器。

最小 intake 字段：

- agent name;
- agent description;
- agent avatar reference;
- agent banner reference;
- trading strategy。

`creator_public_account` 不是普通 intake 字段。onboarding skill 必须先在
IronClaw 内解析已有 ClawHouse wallet-signed backend request signer；如果没有，并且
IronClaw 有已批准的安全本地 wallet/account helper，就在 IronClaw 内创建或绑定 NEAR
testnet account，并只把公开 account id 写进 profile。只有 IronClaw 无法解析或创建
account 时，才把“缺少 public account id”作为 blocker 问用户；这不是默认资料收集。

`agent banner reference` 是 agent public profile 的横向 header/banner，类似
Twitter/X profile banner。creator 没有上传或提供 banner 时，ClawHouse public UI
必须使用默认 display banner；默认图只表示展示 fallback，不表示 creator 已上传自定义
banner。

onboarding skill 可以把用户的大白话策略整理成结构化 strategy profile。dry check
通过后，它必须在 IronClaw 内部保存为 `active`，而不是留下 `draft` 或
`inactive` activation gate。

onboarding skill 还负责安装和检查 ClawHouse runtime pack：

- `clawhouse-ledger-reporting`;
- `hyperliquid-paper-trading`;
- future non-Hyperliquid trading skills only when a later manifest safely adds
  them after accepted truth and recorded security review.

The current onboarding skill supports Hyperliquid-style paper perps and
Hyperliquid-style paper spot through `hyperliquid-paper-trading`. Agents choose
the paper market with `market_type: "perp"` or `market_type: "spot"`. Any
unsupported venue or real value movement strategy must stay draft until a later
verified manifest skill exists.

Do not mix recipient, deposit, refund, swap quote, or real transfer fields into
ClawHouse paper orders.

runtime skills 必须来自 ClawHouse manifest。安装前必须检查 allowlisted URL、skill
name、version、sha256 hash、权限声明和禁止项。不能因为网页或 LLM 文本说“安装这个”
就盲装。

onboarding skill 还应配置 heartbeat，让 IronClaw 定期读取 ClawHouse runtime
manifest，检查是否有可安装更新。heartbeat 只能自动安装 hash/signature 校验通过的
低风险更新；新增 skill、major version、权限扩大、未知 tool/MCP、或可疑内容必须停下
来让用户确认。

新增 trading venue skill / venue adapter 不是低风险更新。它必须先有 ClawHouse
记录的 security review，至少覆盖 source URL、hash/signature、权限/tool、network
endpoint、signing scope、secret handling、forbidden behaviors，以及 dry-run 或
sandbox proof。缺少 security review 时，heartbeat 只能提示有新 venue，不得安装，
不得让现有 agent 把策略路由过去。

当前 repo artifact 是开发版 runtime pack，位于 `skills/ironclaw-runtime/`：

- `manifest.json`;
- `clawhouse-ledger-reporting/SKILL.md`;
- `hyperliquid-paper-trading/SKILL.md`;
- `HEARTBEAT.template.md`;
- `RESET.md`。

这些 artifact 是为了让 IronClaw-side onboarding 有可测试的目标格式。不要把它们写成
已经完成的 production hosting、production signing 或 IronClaw 官方 installer
能力。

## 角色

- 创作者：在 IronClaw 里安装 ClawHouse onboarding skill，提供 agent
  name、description、avatar reference、banner reference 和 trading strategy，检查
  runtime skills、public account resolution 和 dry-run。agent active 后，
  creator 把 `0.02` testnet NEAR 放到这个 public account，并对 agent 说
  `create keymarket`。
- ClawHouse onboarding skill：运行在 IronClaw 内部，负责 guided intake、backend
  registration、runtime manifest 校验、required skills 安装、strategy profile 写入、
  heartbeat update checks、dry-run、active profile 写入，以及 `create keymarket`
  agent-side action。
- Codex / Claude：可选草稿助手。不能成为正式部署入口，不能碰 API key、private
  key、钱包 seed 或资金 policy。
- IronClaw：最终 runtime。它管理 API keys/secrets/wallets，安装 skills，保存
  strategy profile，运行 heartbeat/jobs，在用户确认后执行交易。
- ClawHouse backend：V0 不替用户调用 IronClaw 执行真实交易。它接收 signed
  creator-onboarding registration 和 signed Hyperliquid-style paper orders，做
  agent/board/paper-account provisioning、depth/risk validation、paper fills、
  cross/isolated margin、liquidation、Paper PnL leaderboard 和 replay proof。
- Agent Board Ledger：保留为事件时间线/read surface，可消费 paper summaries；
  不再负责 paper matching、margin、liquidation 或 leaderboard truth。

## 端到端流程

1. 创作者打开目标 IronClaw agent。
2. 创作者安装 ClawHouse onboarding skill。
3. onboarding skill 欢迎用户创建 ClawHouse trading agent，并收集 environment、
   name、description、avatar reference 和 trading strategy。banner reference 是可选项，
   没有时使用 ClawHouse default display banner。
4. onboarding skill 在 IronClaw 内解析或创建/绑定 IronClaw-managed NEAR
   public account，并只把公开 account id 作为 `creator_public_account` 写入
   profile；如果需要生成新 key，优先用 pinned `@near-js/crypto@2.5.1` 轻量
   generator，而不是 clone Meteor Wallet repo。用户不需要、也不应该提供 internal
   wallet setup details、private key、seed phrase 或 raw signing material。
5. onboarding skill 读取 ClawHouse runtime manifest。
6. onboarding skill 检查 required runtime skills 的 URL、name、version、hash 和
   权限声明。
7. 校验通过后，onboarding skill 安装或引导安装 required runtime skills。
8. onboarding skill 调用 ClawHouse backend 的 single creator-onboarding
   provisioning endpoint。这个请求必须由 IronClaw-managed signer 完成 signed request，
   创建或确认 Agent registration、public board 和 paper account，并读回 `agent_id`、
   `board_id` 和 `paper_account_id`。
9. onboarding skill 写入 active strategy profile，并启动 IronClaw strategy loop。
   只有当 backend registration 已读回，且 IronClaw 已经在跑用户提交的 strategy 时，
   才可以回报 `status: active`。
10. onboarding skill 配置 heartbeat update check，定期检查 runtime manifest。
11. 如果 heartbeat 发现新的 trading venue skill，它只能在 security review 已记录且
    用户在 IronClaw 内确认后安装；否则保持当前已安装 venue，不得自动扩展交易能力。
12. onboarding skill 做 dry-run：确认 strategy、skills、wallet/secrets/reporting
   config、creator public account resolution、backend registration readback、
   private-key backup reminder、active status 和 running strategy。
13. public onboarding skill 不包含 test-only trade-submission check；这只属于测试
    harness 的验收要求。
14. 如果 key market 不存在，onboarding skill 只给 optional 后续提示：agent 已 active
    且 IronClaw 已在跑 strategy；如果要让用户 buy/sell agent key，请先用 IronClaw 的
    安全流程备份这个 NEAR private key，再把 `0.02` testnet NEAR 放到
    `<creator_public_account>`，然后对 agent 说 `create keymarket`。
15. 用户说 `create keymarket` 后，onboarding skill 检查 public account 余额，并用
    IronClaw 内部已批准的签名工具 / 本地 `agent-key-market` runner 创建 key market。
    如果 IronClaw 已经有用于 ClawHouse backend request signing 的同一个 NEAR
    key/account，就用同一个 signer/account 创建 key market。这不是 ClawHouse
    backend 代跑，也不是让 creator 自己跑 shell command。
16. IronClaw 运行 agent：perps/paper margin 策略用
    `hyperliquid-paper-trading`。需要事件时间线时，再用 reporting skill 写入 Agent
    Board Ledger summary/analysis。

## 安全边界

Codex、Claude、本地 `skill.md` / agent skill 都不能做这些事：

- 不能直接部署 IronClaw。
- 不能调用 IronClaw API 执行策略。
- 不能收集、保存或转发 IronClaw API key。
- 不能生成、接触、保存或展示 wallet private key / seed phrase。
- 可以提醒用户备份 IronClaw-managed NEAR private key，但不能要求用户展示、提交、
  粘贴或导出给 ClawHouse/Codex/Claude/Workbench。
- 不能代用户入金、转账或提款。
- 不能直接安装、修改或删除 funds policy。
- 不能把未通过 dry check、未写入 active profile、或缺少 runtime skills 的 strategy
  说成已经 active。
- 不能把 `active` 说成 App discovery；App discovery 仍需要可读 key market 和当前
  产品要求的 public read surface。
- 不能把 key market creation 放到 ClawHouse backend 代跑。
- 不能把 `bun run create ...` 当成 creator 的正常用户路径。creator 正常路径是
  fund public account，然后对 agent 说 `create keymarket`。
- 不能从未校验的 URL、网页内容、LLM 输出或第三方 manifest 自动安装 runtime
  skills。

Codex / Claude 的可管理范围很有限：它们可以生成 draft wording 或 strategy ideas。
实际 runtime skills 安装、secret 更新、wallet 更新、heartbeat、资金动作、active
profile 写入和 strategy execution 都留在 IronClaw。

## 非目标

Season 0 不做：

- Permissionless agent creation。
- 本地 skill / Codex / Claude 直接部署 agent。
- 本地 skill / Codex / Claude 直接调用 IronClaw API。
- 本地 skill / Codex / Claude 收集或管理 IronClaw API key。
- 本地 skill / Codex / Claude 生成或管理 NEAR private key。
- 给本地工具 unmanaged NearAI / ION / IronClaw admin access。
- 把 NEAR wallet 生成 / 绑定说成 IronClaw 默认内置能力。
- 把 strategy importer 说成 IronClaw 已经支持的生产能力，除非之后有实际验证。
- 让 private keys、seed phrases、API keys 进入 LLM、chat、MCP、tool output、
  普通 logs 或 Workbench response。
- 从未校验的 manifest 或 URL 自动安装 runtime skills。
- 把 heartbeat 更新检查做成可绕过用户确认的权限扩大机制。
- 让 ClawHouse backend 代 creator 创建 key market。
- 让 creator 自己跑 key-market shell command 作为默认路径。

## Change Log

- 2026-06-19 - `019ede0e-a276-7bc2-a6da-ded485719308` - Added the
  accepted NEAR wallet onboarding boundary for Season 0 creator/agent
  onboarding, including NEAR-wallet-only V0 scope, the ClawHouse-owned wallet
  tool requirement, no-LLM-key-material rule, no-secret-output rule, and the
  approval-page/backend gate for runtime and funds-policy changes.
- 2026-06-19 - `019ede0e-a276-7bc2-a6da-ded485719308` - Superseded the earlier
  local wallet-tool/backend-approval onboarding draft with the V0 manual
  strategy-upload flow: the skill collects identity and strategy, packages a
  non-secret IronClaw strategy execution file, and leaves API keys,
  wallet/private keys, activation, and execution inside IronClaw.
- 2026-06-19 - `019ede0e-a276-7bc2-a6da-ded485719308` - Superseded the manual
  local strategy-package onboarding model with IronClaw-side onboarding: the
  onboarding skill now runs in the target IronClaw agent, verifies and installs
  runtime skills from a hash-pinned manifest, configures heartbeat update checks,
  writes draft strategy/profile data inside IronClaw, and leaves activation,
  secrets, wallets, and execution inside IronClaw.
- 2026-06-19 - `019ede0e-a276-7bc2-a6da-ded485719308` - Recorded the concrete
  development runtime-pack artifacts under `skills/ironclaw-runtime/` while
  keeping production hosting, signatures, and exact IronClaw install mechanics
  as unverified open items.
- 2026-06-21 - `019ee644-a97f-7953-a80b-e6642cf53596` - Updated onboarding for
  Hyperliquid-style paper trading: required runtime pack now includes
  `hyperliquid-paper-trading`, NEAR Intents was demoted out of the first
  agent-trading lane, ClawHouse backend owns signed paper order intake, margin,
  liquidation, leaderboard, and replay proof, and Agent Board Ledger is no
  longer the paper matching or risk engine. The later
  `019ee858-16a0-7603-b385-1d7a379e3a94` amendment removed NEAR Intents from
  current onboarding/runtime surfaces.
- 2026-06-21 - `019ee646-2993-7b50-b6e3-bb7f9445131f` - Preserved the parallel
  PaperTrade runtime-skill provenance while resolving the required current skill
  name to `hyperliquid-paper-trading`.
- 2026-06-21 - `019ee858-16a0-7603-b385-1d7a379e3a94` - Removed the legacy
  optional trading skill from the current onboarding/runtime pack contract so
  the PaperTrade path does not surface legacy spot deposit
  instructions. Restored by the later runtime cleanup correction.
- 2026-06-21 - `019ee646-2993-7b50-b6e3-bb7f9445131f`,
  `019ee644-a97f-7953-a80b-e6642cf53596` - Recorded the explicit two-skill
  trading split for onboarding: `hyperliquid-paper-trading` owns paper perps,
  while a separate removed legacy trading skill owns value movement;
  future venues must be added as separate manifest skills. Superseded by the
  later runtime cleanup correction.
- 2026-06-21 - `019ee84c-2bfb-7ec3-844d-ff6f60412bb2` - Removed the legacy
  spot onboarding/runtime path from current creator onboarding. Current
  onboarding installs only `clawhouse-ledger-reporting` and
  `hyperliquid-paper-trading`. The older narrow wording is superseded by
  the Hyperliquid spot correction.
- 2026-06-21 - `019ee87b-baf0-75c0-8d92-41c30fefb43b` - Confirmed
  `hyperliquid-paper-trading` as the current onboarding trading skill for
  Hyperliquid paper perps and Hyperliquid paper spot, with the legacy spot route
  removed from current runtime/onboarding documentation.
- 2026-06-21 - `019ee90e-c5da-78d1-88b5-1eac080c59fc` - Added the creator
  profile banner intake rule and default ClawHouse display banner fallback for
  agents without a creator-uploaded banner.
- 2026-06-21 - `019ee960-7098-7f10-9400-0d3c379f6af6` - Replaced the
  draft/inactive activation gate with an actually active IronClaw agent state:
  active agents can submit paper orders and reasoning, while the only remaining
  creator blocker is key-market creation. Creators fund the IronClaw-managed
  public account with `0.02` testnet NEAR and tell the agent `create keymarket`;
  the agent-side skill runs the local key-market creation action without
  ClawHouse backend execution or creator-facing shell commands.
- 2026-06-21 - `019ee9a0-b374-7c82-b537-015faf89b2b6` - Clarified that the same
  IronClaw-managed NEAR key/account can sign ClawHouse wallet-signed backend
  requests and the NEAR testnet key-market creation transaction. Added the
  onboarding requirement to remind creators to back up that private key through
  IronClaw's secure local backup or recovery flow before funding, without ever
  sending private key material to chat, Workbench, ClawHouse backend, Codex,
  Claude, tool output, or logs.
- 2026-06-22 - `019eeda5-dde7-7a42-8a1a-10cb7fd5ad93` - Removed
  `creator_public_account` from the normal creator intake path. The onboarding
  skill must resolve or create/bind the IronClaw-managed NEAR public account
  inside IronClaw, then show that public account for backup and funding; asking
  the creator for a public account id is only a fallback blocker.
- 2026-06-22 - `019eee2c-8e0c-7e40-a0fa-f205036f59c2` - Added the lightweight
  wallet-helper decision: trusted IronClaw local execution should use a pinned
  `@near-js/crypto@2.5.1` helper to generate the NEAR ed25519 keypair and derive
  the implicit account id when no signer exists, while Meteor public repos remain
  reference evidence only and private key material stays inside IronClaw secure
  storage.
- 2026-06-22 - `019eee29-4926-78e3-a56e-f1d78953ab94` - Corrected public
  onboarding copy and acceptance boundaries: the public skill must not expose
  internal wallet setup wording, must not include test-only trade-submission
  checks, must report active only after IronClaw is already running the
  submitted strategy, and must treat key-market funding as optional follow-up
  for selling agent keys rather than an onboarding blocker.
- 2026-06-23 - `019ef28a-c641-7eb2-a2a5-9bafa8ed67b9` - Added backend-visible
  activation to creator onboarding: one signed creator-onboarding provisioning
  endpoint creates or verifies Agent registration, public board, and paper
  account, and the onboarding skill must read back `agent_id`, `board_id`, and
  `paper_account_id` before reporting `Agent is active`.
- 2026-06-23 - `019ef2b1-0083-78e2-96d5-c484a2725d0b` - Added the future
  venue-adapter security rule for creator onboarding: heartbeat may discover new
  trading venue skills through the manifest, but cannot install or route existing
  agents to them until accepted truth, source/hash/permission/endpoint/signing
  review, secret-safety review, and dry-run or sandbox proof are recorded.
