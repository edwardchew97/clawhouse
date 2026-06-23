# Install ClawHouse Skills

Start from the Skill Directory:

```text
skill_install(name="clawhouse-skill-directory", url="https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/clawhouse-skill-directory/SKILL.md")
```

Then run `$clawhouse-skill-directory`.

The directory routes to `clawhouse-creator-onboarding` for backend registration
and paper trading. Key-market creation is optional and uses small NEAR testnet
funding sent to the generated public account.

Do not install a signer daemon, policy engine, wallet app, or separate local
tool for this flow. The selected local runtime handles helper code as an
agent-side execution detail.

Never paste private keys, seed phrases, API keys, or raw signing material into
chat, logs, Workbench output, MCP output, or repo files.
