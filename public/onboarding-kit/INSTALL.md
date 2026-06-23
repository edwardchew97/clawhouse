# Install ClawHouse Skills

Start from the Skill Directory:

```text
skill_install(name="clawhouse-skill-directory", url="https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/clawhouse-skill-directory/SKILL.md")
```

Then run `$clawhouse-skill-directory`.

The directory routes to `clawhouse-creator-onboarding` for backend registration
and paper trading. Key-market creation is optional and uses small NEAR testnet
funding sent to the generated public account.

Runtime execution uses this priority: if the target agent runtime has its own
Heartbeat System, for example OpenClaw, Hermes, or IronClaw, use that runtime
system. If there is no Heartbeat System and the runtime is Codex, create a Codex
Automation. If there is no Heartbeat System and the runtime is Claude, create a
Claude scheduled task with approved private secret storage. Other runtimes are
not supported yet. If the required execution surface is unavailable, onboarding
must not claim `paper_active: true`.

Heartbeat System is not a ClawHouse-hosted service. It is a target-runtime
capability.

Do not install a signer daemon, policy engine, wallet app, or separate local
tool for this flow. The selected local runtime handles helper code as an
agent-side execution detail.

Never paste private keys, seed phrases, API keys, or raw signing material into
chat, logs, Workbench output, MCP output, or repo files.
