# Season 0 创作者 onboarding 和部署授权

这是 ClawHouse Season 0 创作者 onboarding 的已接受事实。后续做产品、写实现、写说明时，Season 0 都按这里的流程理解。

## Source

- Legacy provenance: unknown; this document existed before required source
  metadata was added.
- Current edit session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Date: 2026-06-19
- Basis: JY confirmed that Season 0 creator/agent onboarding includes NEAR wallet
  onboarding, with V0 limited to NEAR wallet scope and strict no-secret,
  no-direct-deployment boundaries.

## 核心决定

Season 0 不是开放的 permissionless agent 创建。Season 0 是有权限边界的创作者 onboarding。

创作者可以在本地用 `skill.md` / agent skill，通过 Codex 或 Claude 生成格式化的 agent draft / capsule。这个本地 agent skill 只负责帮创作者整理和提交草稿，不负责部署，不拿 NearAI / ION 或 OutLayer 的管理员权限，也不直接管理资金策略。

真正的部署和策略更新，必须经过 ClawHouse 的网页确认页，由创作者明确批准后，才由 ClawHouse backend 执行。

## NEAR 钱包 onboarding

Season 0 创作者 / agent onboarding 包含 NEAR wallet onboarding。V0 只使用
NEAR wallet；其他 wallet 类型、chain signer 或资金签名方案都不是当前 V0
默认范围，除非 JY 之后单独确认。

正确的产品边界是：ClawHouse 必须提供一个简单的创作者-facing skill，并配套一个固定版本、开源的 NEAR wallet tool / repo / module，用来生成或绑定 agent wallet。

这是 ClawHouse 自己负责的 scope，或 ClawHouse 选择的 partner integration work，建立在 IronClaw / TEE / CVM primitives 之上。不要写成 IronClaw 已经默认内置 wallet generator 或 financial signer。

wallet tool 必须使用标准 crypto libraries 和 CSPRNG 生成 key material，不能用 LLM 生成 key material。

private keys 绝不能进入 LLM / chat context、tool output、MCP、普通 logs，或用户可见的 Workbench response。本地 skill 和工具流程只能返回或使用 public wallet address、public key、key id 这类公开标识。

本地 skill 可以准备 wallet 生成 / 绑定结果和 agent draft，但实际部署、runtime 更新、资金 policy 安装或更新仍然必须经过 ClawHouse approval page 和 ClawHouse backend。local skill 不能直接部署 IronClaw，也不能直接修改 funds policy。

## 角色

- 创作者：准备 agent 内容，检查权限和配置，最后在网页上明确批准。
- 本地 agent skill / Codex / Claude：在创作者本机生成 draft / capsule，并提交草稿请求。
- ClawHouse backend：接收草稿，返回 approval link；在网页批准后执行部署、配置和策略更新。
- ClawHouse approval page：让创作者查看 agent 内容、权限和变更，并点击批准。
- IronClaw：最终被部署和配置的 agent。
- NearAI：IronClaw agent 的部署运行环境之一。
- OutLayer：资金 policy 的安装和更新目标。

## 端到端流程

1. 创作者在本地准备 `skill.md` / agent skill。
2. 创作者用 Codex 或 Claude 生成格式化的 IronClaw agent draft / capsule。
3. 本地工具把 draft 提交给 ClawHouse backend。
4. ClawHouse backend 返回一个 approval link。
5. 创作者打开 ClawHouse approval page。
6. 创作者在网页上查看 agent 内容、权限、NearAI / ION 相关配置，以及 OutLayer funds policy 变更。
7. 创作者明确批准。
8. ClawHouse backend 才部署 / 配置 IronClaw agent 到 NearAI，并安装或更新 OutLayer funds policy。
9. 未来更新也走同一条路：本地生成 draft -> backend 返回 approval link -> 创作者网页批准 -> backend 执行。

## 安全边界

Codex、Claude、本地 `skill.md` / agent skill 都不能做这些事：

- 不能直接部署 IronClaw。
- 不能持有 NearAI / ION 管理员权限。
- 不能直接安装、修改或删除 OutLayer funds policy。
- 不能绕过 ClawHouse approval page 让 backend 执行运行时或资金策略变更。

部署后的本地可管理范围也很有限：创作者可以继续在本地生成 drafts、config changes、version proposals。实际 runtime 更新、NearAI / ION 配置更新、OutLayer policy 更新，仍然必须走 approval link、ClawHouse approval page 和 ClawHouse backend 执行。

## 非目标

Season 0 不做：

- Permissionless agent creation。
- 本地 skill / Codex / Claude 直接部署 agent。
- 本地 skill / Codex / Claude 直接编辑 OutLayer funds policy。
- 给本地工具 unmanaged NearAI / ION admin access。
- 把 NEAR wallet 生成 / 绑定说成 IronClaw 默认内置能力。
- 让 private keys 进入 LLM、chat、MCP、tool output、普通 logs 或 Workbench
  response。

## Change Log

- 2026-06-19 - `019ede0e-a276-7bc2-a6da-ded485719308` - Added the
  accepted NEAR wallet onboarding boundary for Season 0 creator/agent
  onboarding, including NEAR-wallet-only V0 scope, the ClawHouse-owned wallet
  tool requirement, no-LLM-key-material rule, no-secret-output rule, and the
  approval-page/backend gate for runtime and funds-policy changes.
