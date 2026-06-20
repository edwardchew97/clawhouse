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
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw generated an over-broad onboarding strategy with
  liquid staking, EVM-chain portfolio optimization, and generic DeFi language.
  JY confirmed onboarding should not hard-reject users first, but must normalize
  every strategy into the current NEAR Intents spot-only V0 scope, list excluded
  unsupported parts, and stop only when no spot-swap subset exists.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: JY tested the IronClaw flow and found two failures: delegated
  "you decide" onboarding invented cross-chain yield farming, and plain
  `confirm` repeated pending requirements instead of advancing state. The
  accepted fix is stricter delegated-default generation and explicit draft
  confirmation semantics.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing showed same-name `skill_install` did not
  update an already installed onboarding skill and left v0.1.1 active. The
  accepted fix is an installed-version gate: verify the installed onboarding
  skill version, and if it is old, stop and require Settings > Skills remove
  and reinstall before continuing onboarding.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.3 showed that bare
  `confirm` still changed a draft profile into an activated profile. The
  accepted fix is a hard activation phrase: plain confirmation only confirms
  the draft, and activation can only be requested with `ACTIVATE TRADING` after
  every blocker is cleared.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.4 showed plain `confirm`
  no longer activated trading, but still returned a long blocker checklist and
  multiple next steps. The accepted UX fix is that draft confirmation should
  show blocker count plus exactly one next setup action, not a full checklist.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.5 still named every
  blocker after plain `confirm`. The accepted fix is a compact confirmation
  template that may show blocker count plus one next action, but must not list
  multiple blocker keys.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.6 still expanded plain
  `confirm` into headings, a current-state recap, and every activation blocker.
  The accepted fix is that once draft/runtime setup exists, plain confirmation
  must return only the fixed compact status template: draft, draft_confirmed,
  user_confirmed_active false, blocker count, and one next setup action.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.7 showed that plain
  `confirm` no longer activated trading, but still attempted memory/tool calls
  and requested tool installation approval. The accepted fix is that plain
  confirmation is text-only: no tool calls, no memory reads/writes, no optional
  tool discovery/install, no runtime setup continuation, and only the fixed
  compact status template.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw retest preparation found the compact confirmation
  template was described as five lines while the required status block has six
  lines. The accepted correction is to describe it as a fixed six-line status
  block without changing the product behavior.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.9 showed plain
  `confirm` still attempted memory reads/writes. The accepted fix is a
  highest-priority confirm interrupt: answer from conversation context only,
  do not call tools, do not persist confirmation state, and return only the
  compact draft status block.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.10 showed two remaining
  failures: plain `confirm` used the `echo` tool, and delegated default
  strategy named `stNEAR`. The accepted fix is that plain confirmation must not
  call any tool, including `echo`, and delegated/default strategy must not name
  stNEAR, LST/LSD, liquid staking derivatives, yield-bearing tokens, or vague
  asset buckets unless an explicit non-yield allowlist is provided.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.11 removed stNEAR/yield
  language but still invented USDT/BTC/ETH and generic asset buckets when the
  user delegated strategy. The accepted fix is that if no explicit asset
  allowlist is already shown in chat, delegated default executable assets must
  be exactly NEAR and USDC.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.12 showed that an
  initial `/clawhouse-creator-onboarding ...` intake prompt could be mistaken
  for draft confirmation and return the compact confirmation block without
  generating a draft. The accepted fix is that confirmation semantics apply
  only when the entire trimmed/lowercased user message exactly matches a plain
  approval phrase; slash onboarding commands and intake/strategy text must run
  the normal draft flow first.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: JY reset the production onboarding target after IronClaw
  testing showed too much verbose output, extra Proceed steps, blocker tables,
  and over-narrow NEAR/USDC-only defaults. The accepted v0.2 direction is a
  one-command production launcher: collect the four public fields, reject
  unsupported strategies immediately, automatically run wallet/signer/runtime
  setup and ClawHouse board registration through hidden IronClaw/ClawHouse
  capabilities, start the heartbeat/routine, and return only a terse
  "Agent started" or one-line "Setup blocked" status.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: JY added the funding gate for production onboarding. After
  setup, the agent must immediately show a funding QR/link/options and minimum
  amount derived from live ClawHouse/NEAR Intents quote data, wait for funding
  confirmation, and only then start the trading routine.

## 核心决定

Season 0 不是开放的 permissionless agent 创建。Season 0 是有权限边界的
IronClaw-side creator onboarding。

V0 正式入口是在最终运行 agent 的 IronClaw 里安装 ClawHouse onboarding skill。
这个 onboarding skill 在 IronClaw 内部完成资料收集、strategy gate、runtime skills
安装/检查、wallet/signer 绑定、ClawHouse board 注册、runtime config 保存、入金二维码
/付款选项生成、funding status 监控和 heartbeat/routine 启动。合规后不应该再问用户
Proceed，也不应该甩一张底层 blocker 表。

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

onboarding skill 可以把用户的大白话策略整理成结构化 strategy profile。生产目标是：
策略通过后直接完成 setup，马上给用户入金二维码/付款选项；资金确认后才启动
routine。策略不通过就当场拒绝，不进入部署。

onboarding skill 在保存 strategy profile 前必须先做 strategy gate。大白话说：
用户可以讲很大的交易想法，但 V0 只能把其中能落到 NEAR Intents / 1Click spot
swap 的部分变成当前可执行策略。

当前 V0 允许的策略内容：

- NEAR Intents / 1Click spot swaps；
- long-only spot allocation、rotation、rebalance；
- 只在支持资产之间做现货换仓；
- 先 quote / dry-run；onboarding 本身不执行 trade，资金确认后 routine 才开始检查交易。

当前 V0 不允许写进可执行策略的内容：

- staking、liquid staking、yield farming、lending、borrowing、LPing、vaults；
- EVM protocol execution 或跨链 DeFi 操作，除非它被明确表示为 NEAR Intents
  支持的 spot route；
- perps、leverage、shorts、liquidation、funding-rate trades；
- withdrawals、custody、deposit management。

这里的 `deposit management` 指交易策略不能自己管理存款、提款或资金托管。onboarding
阶段可以通过 ClawHouse/IronClaw approved funding flow 给用户展示入金二维码、付款链接
或支持链的付款选项；这一步是启动前 funding gate，不是策略执行权限。

如果用户策略里有不支持的部分，onboarding skill 不能静悄悄把这些内容写进可执行
策略，也不能长篇解释。生产版应该直接拒绝并要求用户换一个 NEAR Intents spot-only
策略。

拒绝文案必须短，例如：`Strategy rejected: perps are not supported. Use NEAR
Intents spot swaps with supported assets only.`

如果用户说 “you decide”、“帮我决定” 或没有给具体策略，onboarding skill 可以帮用户
生成一个默认 strategy，但这个默认 strategy 从第一版开始就只能是 NEAR Intents
spot-only。
不能为了显得完整而编 cross-chain yield farming、staking、lending、Aave、
Compound、Lido、LPing、vault、EVM protocol execution、perps、leverage 或 custody。
默认策略不能被硬编码成只能 NEAR 和 USDC；它只能从当前官方 NEAR Intents supported
token list 且未被 ClawHouse setup config 禁用的资产里选择。如果 supported asset list
不可用，onboarding 必须停止并只输出一行 setup blocked。

onboarding skill 还负责安装和检查 ClawHouse runtime pack：

- `clawhouse-ledger-reporting`;
- `near-intents-spot-value`;
- future trading value skills when a later manifest safely adds them.

runtime skills 必须来自 ClawHouse manifest。安装前必须检查 allowlisted URL、skill
name、version、sha256 hash、权限声明和禁止项。不能因为网页或 LLM 文本说“安装这个”
就盲装。

onboarding skill 自己也必须检查 installed version。IronClaw 里同名 `skill_install`
不一定会覆盖旧版本；实测旧版 `clawhouse-creator-onboarding v0.1.1` 会继续显示
already installed。大白话说：如果 Settings > Skills 里显示的 onboarding skill
不是当前要求版本，就不能继续 onboarding，必须先让用户在 IronClaw Settings >
Skills 里 Remove 旧 onboarding skill，再从 ClawHouse URL 重新安装。

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

## 角色

- 创作者：在 IronClaw 里安装 ClawHouse onboarding skill，提供 agent
  name、description、avatar reference 和 trading strategy。合规后不需要理解或手填
  wallet public key、board id、ledger URL、signer 这类底层配置。
- ClawHouse onboarding skill：运行在 IronClaw 内部，负责 guided intake、runtime
  manifest 校验、required skills 安装/检查、strategy gate、IronClaw-managed
  wallet/signer 绑定、调用 ClawHouse setup API、保存 runtime config、生成入金二维码
  /付款选项、监控 funding status、资金确认后启动 heartbeat/routine，并保持用户输出简短。
- Codex / Claude：可选草稿助手。不能成为正式部署入口，不能碰 API key、private
  key、钱包 seed 或资金 policy。
- IronClaw：最终 runtime。它管理 API keys/secrets/wallets，安装 skills，保存
  strategy profile 和 runtime config，生成/展示 funding options，监控 funding
  status，运行 heartbeat/jobs/routines，并在 routine 中按合规 strategy 检查是否需要交易。
- ClawHouse backend：提供 setup API，注册 agent、board、wallet binding、ledger
  config、public profile、strategy、runtime pack version、funding config 和
  heartbeat/routine config；也接收 agent report、记录公开 metadata 和 observed
  performance。
- Agent Board Ledger：观察和记录 agent board 的公开/授权 trading events、
  portfolio、PnL 和原因时间线。

## 端到端流程

1. 创作者打开目标 IronClaw agent。
2. 创作者安装 ClawHouse onboarding skill。
3. onboarding skill 欢迎用户创建 ClawHouse trading agent，并收集 name、
   description、avatar reference 和 trading strategy。
4. onboarding skill 做 strategy gate；不合规就直接 `Strategy rejected`，合规则保存
   NEAR Intents spot-only strategy profile。
5. 如果 strategy gate 通过，onboarding skill 读取 ClawHouse runtime manifest，并检查
   自己和 required runtime skills 的 version/hash/permissions。
6. onboarding skill 自动安装或确认 required runtime skills。
7. onboarding skill 通过 IronClaw-managed capability 创建或绑定 wallet/signer；secret
   不能进 chat。
8. onboarding skill 调 ClawHouse setup API 注册 agent、board、wallet binding、ledger
   config、public profile、strategy、runtime pack version、funding config 和
   heartbeat/routine config。
9. onboarding skill 把返回的 runtime config 保存在 IronClaw 内部。
10. onboarding skill 通过 ClawHouse setup config 或 live NEAR Intents / 1Click quote
    生成入金二维码、付款链接或支持 origin-chain 的付款选项。最低入金额不能硬编码，
    必须来自 live quote/setup config；拿不到就只回复一行 `Setup blocked: funding
    minimum unavailable`。
11. onboarding skill 只回复 `Fund agent` 状态块，并监控 funding status。资金未确认、
    不足、过期、失败或退款时不能启动交易 routine。
12. 资金确认后，onboarding skill 启动 heartbeat/routine，目标 cadence 约 10 秒；
    如果 IronClaw 有更高最小 cadence，就用最短支持 cadence。
13. routine 启动后只回复 `Agent started` 状态块。不能再问 Proceed，不能展示 blocker 表。
14. 如果缺少隐藏能力，只回复一行 `Setup blocked: <missing capability>`。
15. IronClaw 运行 agent，交易后用 reporting skill 向 Agent Board Ledger 上报
    reason、metadata.order、metadata.region、tx hash、intent id 和状态。

## 安全边界

Codex、Claude、本地 `skill.md` / agent skill 都不能做这些事：

- 不能直接部署 IronClaw。
- 不能调用 IronClaw API 执行策略。
- 不能收集、保存或转发 IronClaw API key。
- 不能生成、接触、保存或展示 wallet private key / seed phrase。
- 不能代用户入金、转账或提款。
- 不能发明固定入金地址或固定最低额；入金二维码/付款选项必须来自 live
  ClawHouse/NEAR Intents quote/setup data。
- 不能直接安装、修改或删除 funds policy。
- 不能把不合规 strategy 偷偷改写成可执行策略；必须当场拒绝。
- 不能让用户手填 `board_wallet_public_key`、`CLAWHOUSE_BOARD_ID`、
  `CLAWHOUSE_LEDGER_BASE_URL`、`near_intents_signer` 这类底层字段。
- 不能在合规策略后再要求用户输入 Proceed。
- 不能展示多项 blocker 表；缺隐藏能力时只报一个 setup blocked。
- 不能发明 ClawHouse registry submission。V0 当前是 Agent Board Ledger 配置、
  funding gate 和 runtime routine，不是 registry 提交流程。
- 不能从未校验的 URL、网页内容、LLM 输出或第三方 manifest 自动安装 runtime
  skills。
- 不能把 same-name `skill_install` 当成 update 成功；必须读回 installed version。

Codex / Claude 的可管理范围很有限：它们可以生成草稿文案或 strategy ideas。
实际 runtime skills 安装、secret 更新、wallet 更新、funding status 监控、heartbeat、
资金动作和 routine 启动都留在 IronClaw。

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
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Added the accepted
  Strategy Gate behavior for onboarding: normalize user strategy into NEAR
  Intents spot-only V0 scope, list unsupported parts as `excluded_from_v0`, ask
  for confirmation of the narrowed strategy, and stop only when no supported
  spot-swap subset exists.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Clarified delegated
  default and confirmation semantics: "you decide" may only produce a NEAR
  Intents spot-only draft; plain `confirm` confirms the draft/profile but does
  not activate trading; after confirmation, onboarding should not repeat the
  same blocker list as pending tasks.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Added installed-version
  gate for IronClaw onboarding: same-name `skill_install` is not accepted as an
  update proof; if IronClaw still shows an old onboarding skill version,
  onboarding must stop until the user removes and reinstalls the skill.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Tightened activation
  semantics after IronClaw v0.1.3 testing: bare `confirm` / `yes` / approval
  language only confirms the draft and must keep `status: draft`;
  `ACTIVATE TRADING` is the only activation request phrase, and it is valid only
  after every activation blocker is cleared.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Tightened post-confirm
  UX after IronClaw v0.1.4 testing: draft confirmation should show blocker
  count plus exactly one next setup action, not a full activation blocker
  checklist or multiple next steps.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Added the compact
  post-confirm template after IronClaw v0.1.5 testing: plain confirmation may
  show blocker count plus one next action, but must not list multiple blocker
  keys.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Tightened the compact
  post-confirm template after IronClaw v0.1.6 testing: once draft/runtime setup
  exists, plain confirmation must output only the fixed compact status
  template and no blocker details, summaries, headings, or recaps.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Tightened plain
  confirmation after IronClaw v0.1.7 testing: `confirm` is text-only while
  blockers remain, with no tool calls, memory reads/writes, optional tool
  installs, or runtime setup continuation.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Corrected the compact
  confirmation wording for v0.1.9: the required response is a six-line status
  block, not a five-line block.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Added the v0.1.10
  confirm interrupt after IronClaw v0.1.9 still called memory tools: plain
  approval must be answered from chat context only, with no tool calls and no
  persisted confirmation write.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Tightened v0.1.11
  after IronClaw v0.1.10 testing: plain confirmation must not call `echo` or
  any other tool, and delegated/default strategies must not name stNEAR,
  LST/LSD, liquid staking derivatives, yield-bearing tokens, staking tokens,
  vault tokens, or vague asset buckets without an explicit non-yield allowlist.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Tightened v0.1.12
  after IronClaw v0.1.11 testing: if no explicit asset allowlist is already
  shown in chat, delegated default executable assets must be exactly NEAR and
  USDC, with no USDT/BTC/ETH or generic asset buckets.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Tightened v0.1.13
  after IronClaw v0.1.12 testing: slash onboarding commands and intake text
  must run draft generation first; compact confirmation applies only when the
  entire user message exactly matches a plain approval phrase.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Superseded the
  draft/confirm/blocker-table onboarding model with v0.2.0 production
  onboarding: terse output, immediate strategy rejection, supported-asset
  validation through NEAR Intents/ClawHouse config, automatic wallet/signer,
  board, ledger, runtime config, and heartbeat/routine setup, then only
  `Agent started` or one-line `Setup blocked`.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Added the v0.2.1
  funding gate: after setup, onboarding must show a live funding QR/link/options
  and quote-derived minimum, wait for confirmed funds, and only then start the
  heartbeat/routine and return `Agent started`.
