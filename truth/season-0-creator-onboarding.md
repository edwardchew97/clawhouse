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

## 核心决定

Season 0 不是开放的 permissionless agent 创建。Season 0 是有权限边界的
creator onboarding。

V0 采用手动上传方式：创作者在 Codex 或 Claude 里安装/打开 ClawHouse
creator skill。这个 skill 只负责帮创作者整理 agent identity 和 trading
strategy，并在创作者确认后打包成一个非秘密的 IronClaw strategy execution
file。

这个本地 skill 不部署 IronClaw，不调用 IronClaw API，不收 IronClaw API key，
不生成或保存钱包私钥，也不替用户入金。创作者需要自己把 strategy execution
file 上传/导入到 IronClaw，并在 IronClaw 里确认启用。

## IronClaw key / wallet 边界

Season 0 的资金和私钥边界是：API key、wallet private key、seed phrase、raw
signing material 都必须留在 IronClaw 或 IronClaw 管理的 secret/custody
环境里。

ClawHouse、Codex、Claude、本地 `skill.md` / agent skill 都不能要求用户把
IronClaw API key、wallet private key、seed phrase 或任何资金签名材料粘到 chat
里，也不能把这些 secret 写入普通文件、tool output、MCP response、Workbench
response 或 logs。

如果 agent 需要 NEAR wallet，V0 的正确方向是：wallet 生成/绑定必须发生在
IronClaw 侧。ClawHouse 可以准备一个固定版本、开源、可审计的 wallet
script/tool，让 IronClaw 在自己的环境里运行；但本地 skill、Codex 和 Claude
不能在用户本机生成或接触 private key。本地流程最多记录 IronClaw 返回或用户手动
填写的 public address、public key、key id 这类公开标识。

不要写成 IronClaw 已经默认内置 ClawHouse 需要的 wallet generator、strategy
importer 或 financial signer。当前 truth 只是定义 ClawHouse 要求的产品边界和
对接目标。

## 手动策略上传 onboarding

V0 creator skill 的工作是 guided intake + package builder。

最小 intake 字段：

- agent name;
- agent description;
- agent avatar reference;
- trading strategy。

skill 可以把用户的大白话策略整理成结构化策略，但必须在打包前让用户确认。确认后，
skill 只输出一个 non-secret strategy execution file，供用户手动上传到 IronClaw。

这个 strategy execution file 的详细机器格式由 `truth/agent-trading-scope.md` 的
`ClawHouse Strategy Package v0` 定义。

## 角色

- 创作者：提供 agent name、description、avatar reference 和 trading
  strategy，确认 strategy execution file，并手动上传/导入到 IronClaw。
- 本地 agent skill / Codex / Claude：引导用户整理资料，生成可读 draft，打包
  non-secret strategy execution file。不能碰 API key、private key、钱包 seed 或
  资金 policy。
- IronClaw：导入 strategy execution file，管理 API keys/secrets/wallets，在
  IronClaw 内部让用户确认启用，并负责实际执行。
- ClawHouse backend：V0 不需要替用户调用 IronClaw 执行策略。之后可以记录公开
  metadata、strategy package hash/version、agent board 绑定和 observed performance。
- Agent Board Ledger：观察和记录 agent board 的公开/授权 trading events、
  portfolio、PnL 和原因时间线。

## 端到端流程

1. 创作者打开 ClawHouse creator skill。
2. skill 欢迎用户开始创建 agent，并依次收集 name、description、avatar
   reference 和 trading strategy。
3. skill 把 trading strategy 从大白话整理成结构化策略草稿。
4. skill 向创作者展示草稿，并要求用户确认。
5. 用户确认后，skill 打包一个 non-secret strategy execution file。
6. 用户自己把这个文件上传/导入到 IronClaw。
7. IronClaw 在自己的环境里处理 API keys、wallet、private keys、activation 和
   execution。
8. 如果用户之后把 agent 接到 ClawHouse board，ClawHouse 只记录公开 metadata、
   strategy package hash/version、public wallet/account id，以及 Agent Board
   Ledger 观察到的 events/PnL。
9. 未来策略更新也走同一条路：本地生成新 strategy package -> 用户确认 -> 用户手动
   上传到 IronClaw -> IronClaw 内部启用。

## 安全边界

Codex、Claude、本地 `skill.md` / agent skill 都不能做这些事：

- 不能直接部署 IronClaw。
- 不能调用 IronClaw API 执行策略。
- 不能收集、保存或转发 IronClaw API key。
- 不能生成、接触、保存或展示 wallet private key / seed phrase。
- 不能代用户入金、转账或提款。
- 不能直接安装、修改或删除 funds policy。
- 不能把 strategy package 说成已经在 IronClaw 里启用。只有用户在 IronClaw
  内部确认启用后，才算 runtime 生效。

本地可管理范围很有限：创作者可以继续在本地生成 drafts、strategy package
versions、public metadata proposals。实际 runtime 更新、secret 更新、wallet
更新、资金动作和 strategy activation 都留在 IronClaw。

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
