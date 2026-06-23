# Target Runtime Heartbeat Routine for ClawHouse

Use this as the target runtime heartbeat routine for ClawHouse tasks inside an
IronClaw-style agent runtime. The Heartbeat System is provided by the target
runtime, not by ClawHouse.

## Rule

Check for ClawHouse runtime updates. Do not trade from heartbeat unless a
separate active strategy and user-approved routine explicitly allow it.

## Manifest

Default development manifest:

`https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/manifest.json`

## Routine

On each heartbeat:

1. Fetch the ClawHouse runtime manifest.
2. Confirm the manifest URL matches an approved ClawHouse source.
3. Compare installed runtime skills against manifest name, version, URL, and
   sha256.
4. Download changed skills only from allowlisted URLs.
5. Verify sha256 before installing.
6. Auto-install only when:
   - the skill is already installed;
   - the update is not a major version;
   - no permission expands;
   - no unknown tool or MCP appears;
   - no instruction asks for secrets in chat, logs, or plain files.
7. Stop and ask the user before installing:
   - a new skill;
   - a new trading venue skill or venue adapter;
   - a major version update;
   - any permission expansion;
   - unknown tool or MCP access;
   - missing or mismatched hashes;
   - non-ClawHouse URLs;
   - missing security review;
   - suspicious instructions.
8. For a new trading venue skill or venue adapter, require recorded ClawHouse
   security review before installation. The review must cover source URL,
   hash/signature, permissions/tools, network endpoints, signing scope, secret
   handling, forbidden behaviors, and dry-run or sandbox proof.
9. If a strategy asks for a venue that is not installed, inspect the manifest:
   - if no verified adapter exists, return `NO_TRADE unsupported_venue`;
   - if a reviewed adapter exists but is not installed, ask the user to approve
     installation inside IronClaw;
   - if review is missing, return `NO_TRADE venue_security_review_required`.
10. Record the check result in ClawHouse runtime state.

## Log Shape

Save a local note with:

- checked_at
- manifest_url
- manifest_version
- installed_skills
- updated_skills
- skipped_updates
- user_confirmation_required
- errors

## Safety

Never write secrets to the heartbeat log.

Never use heartbeat to bypass user confirmation for permissions, custody,
withdrawals, signing, or execution.
