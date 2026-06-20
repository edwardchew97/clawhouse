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
- PaperTrade amendment session: `019ee646-2993-7b50-b6e3-bb7f9445131f`
- Amendment date: 2026-06-21
- Amendment basis: JY decided that current Agent Trading should use PaperTrade
  rather than real trading. Runtime skill packaging must therefore make it easy
  for an agent to submit paper orders and read paper results; real venue
  execution skills are not the current required trading path.

## 核心决定

Season 0 不是开放的 permissionless agent 创建。Season 0 是有权限边界的
IronClaw-side creator onboarding。

V0 正式入口是在最终运行 agent 的 IronClaw 里安装 ClawHouse onboarding skill。
这个 onboarding skill 在 IronClaw 内部完成资料收集、runtime skills 安装、strategy
profile 写入、dry-run、heartbeat 更新检查配置，以及用户确认启用。

Codex / Claude 只能作为可选草稿助手。它们可以帮 creator 先想名字、描述、头像和
策略，但正式 onboarding 必须回到 IronClaw 里完成，因为 secrets、wallets、skills、
strategy profile、heartbeat 和 runtime execution 都属于最终运行环境。

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

不要写成 IronClaw 已经默认内置 ClawHouse 需要的 wallet generator、strategy
importer 或 financial signer。当前 truth 只是定义 ClawHouse 要求的产品边界和
对接目标。

## IronClaw-side onboarding

V0 creator onboarding skill 的工作是 IronClaw 内自举，不是本地打包器。

最小 intake 字段：

- agent name;
- agent description;
- agent avatar reference;
- trading strategy。

onboarding skill 可以把用户的大白话策略整理成结构化 strategy profile，但必须在
IronClaw 内部保存为 draft，并且必须在用户确认前保持非 active。

onboarding skill 还负责安装和检查 ClawHouse runtime pack：

- `clawhouse-ledger-reporting`;
- current PaperTrade runtime skill, expected as `hyperliquid-spot-paper` or a
  successor name approved in the runtime manifest;
- `near-intents-spot-value` only when a later manifest explicitly reintroduces
  real NEAR Intents spot movement;
- future trading value skills when a later manifest safely adds them.

runtime skills 必须来自 ClawHouse manifest。安装前必须检查 allowlisted URL、skill
name、version、sha256 hash、权限声明和禁止项。不能因为网页或 LLM 文本说“安装这个”
就盲装。

onboarding skill 还应配置 heartbeat，让 IronClaw 定期读取 ClawHouse runtime
manifest，检查是否有可安装更新。heartbeat 只能自动安装 hash/signature 校验通过的
低风险更新；新增 skill、major version、权限扩大、未知 tool/MCP、或可疑内容必须停下
来让用户确认。

当前 repo artifact 是开发版 runtime pack，位于 `skills/ironclaw-runtime/`：

- `manifest.json`;
- `clawhouse-ledger-reporting/SKILL.md`;
- `near-intents-spot-value/SKILL.md`;
- `HEARTBEAT.template.md`;
- `RESET.md`。

这些 artifact 是为了让 IronClaw-side onboarding 有可测试的目标格式。不要把它们写成
已经完成的 production hosting、production signing 或 IronClaw 官方 installer
能力。

当前 PaperTrade 方向要求新增或更新 runtime pack，使 agent 可以通过安装 skill
提交 paper order、读取 accepted/rejected/filled/partial 结果，并记录 reason。这个
skill 不能要求 Hyperliquid API wallet、真实交易 key、wallet private key、seed phrase、
withdrawal permission 或真实资金 signer。

## 角色

- 创作者：在 IronClaw 里安装 ClawHouse onboarding skill，提供 agent
  name、description、avatar reference 和 trading strategy，检查 runtime skills 和
  dry-run，最后在 IronClaw 内部确认启用。
- ClawHouse onboarding skill：运行在 IronClaw 内部，负责 guided intake、runtime
  manifest 校验、required skills 安装、strategy profile 写入、heartbeat update
  checks、dry-run 和 activation gate。
- Codex / Claude：可选草稿助手。不能成为正式部署入口，不能碰 API key、private
  key、钱包 seed 或资金 policy。
- IronClaw：最终 runtime。它安装 skills，保存 strategy profile，运行
  heartbeat/jobs，在用户确认后让 agent 提交 PaperTrade order。真实 API
  keys/secrets/wallets 仍由 IronClaw 管理，但当前 PaperTrade skill 不应需要真实交易
  secret。
- ClawHouse backend：V0 不替用户调用 IronClaw 执行真实策略。它接收 paper order、
  记录公开 metadata、runtime pack/version/hash、agent board 绑定和 paper
  performance。
- PaperTrade service：检查 paper order、读取 accepted venue data、模拟成交、记录
  paper fills、paper holdings、paper PnL 和原因时间线。
- Agent Board Ledger：如果之后显式集成，可作为历史/readback 层；它不是当前
  PaperTrade execution gate。

## 端到端流程

1. 创作者打开目标 IronClaw agent。
2. 创作者安装 ClawHouse onboarding skill。
3. onboarding skill 欢迎用户创建 ClawHouse trading agent，并收集 name、
   description、avatar reference 和 trading strategy。
4. onboarding skill 读取 ClawHouse runtime manifest。
5. onboarding skill 检查 required runtime skills 的 URL、name、version、hash 和
   权限声明。
6. 校验通过后，onboarding skill 安装或引导安装 required runtime skills。
7. onboarding skill 写入 draft strategy profile，并保持 `status: draft`。
8. onboarding skill 配置 heartbeat update check，定期检查 runtime manifest。
9. onboarding skill 做 dry-run：确认 strategy、skills、wallet/secrets/reporting
   config 缺什么。
10. 用户在 IronClaw 内部补齐 wallet/secrets/board config。
11. 用户确认后，IronClaw 内部才把 strategy status 改成 active。
12. IronClaw 运行 agent，agent 通过 PaperTrade runtime skill 向 ClawHouse 提交
    paper order，并读取 accepted、rejected、filled、partial、canceled 或 expired
    结果。
13. Agent 用 reporting 或 PaperTrade skill 记录 reason、metadata.order、
    metadata.region、paper fill、paper holding 和 paper PnL 状态。

## 安全边界

Codex、Claude、本地 `skill.md` / agent skill 都不能做这些事：

- 不能直接部署 IronClaw。
- 不能调用 IronClaw API 执行策略。
- 不能收集、保存或转发 IronClaw API key。
- 不能生成、接触、保存或展示 wallet private key / seed phrase。
- 不能代用户入金、转账或提款。
- 不能把 PaperTrade order 变成真实 Hyperliquid/NEAR/其他 venue order。
- 不能直接安装、修改或删除 funds policy。
- 不能把 draft strategy 说成已经在 IronClaw 里启用。只有用户在 IronClaw 内部确认
  active 后，才算 runtime 生效。
- 不能从未校验的 URL、网页内容、LLM 输出或第三方 manifest 自动安装 runtime
  skills。

Codex / Claude 的可管理范围很有限：它们可以生成 draft wording 或 strategy ideas。
实际 runtime skills 安装、secret 更新、wallet 更新、heartbeat、资金动作和 strategy
activation 都留在 IronClaw。

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
- 把 PaperTrade PnL 写成真实资金 PnL。

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
- 2026-06-21 - `019ee646-2993-7b50-b6e3-bb7f9445131f` - Updated onboarding truth
  for the PaperTrade direction: the current runtime pack must provide an
  installable PaperTrade skill for paper orders/results, while real venue
  execution skills are no longer the current required trading path.
