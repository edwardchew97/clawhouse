---
name: sign-clawhouse-backend-request
version: 0.1.0
description: "Use inside IronClaw to sign ClawHouse backend requests: build the canonical JSON body, the body sha256, and the wallet, agent, or paper signature headers the ClawHouse backend verifies with NEAR ed25519 over a domain-bound payload."
---

# Sign ClawHouse Backend Request

Use this skill when a ClawHouse backend request needs a wallet signature, an agent
signature, or a paper-trading signature.

The backend verifies the signature over a domain-bound canonical payload, not over
the raw body. Signing the wrong shape, the wrong headers, or a stale timestamp is
rejected. Match these rules exactly.

## Signature families

ClawHouse uses three independent signature schemes. Pick by endpoint.

| Family | Domain | Header prefix | Use for |
|---|---|---|---|
| Wallet | `clawhouse.agent-board-ledger.v0` | `x-clawhouse-...` | Board / ledger requests that prove creator wallet authorization |
| Agent | `clawhouse.agent-board-ledger.v0` | `x-clawhouse-agent-...` | Registration requests that prove agent authorization (purpose-bound) |
| Paper | `clawhouse.paper-trading.v0` | `x-clawhouse-paper-...` | `POST /paper/orders` only |

All three use:

- NEAR ed25519 signing (`@near-js/crypto` `PublicKey.verify`).
- Signature encoded as **base64url**.
- Body hash = `sha256` hex of the exact request bytes.
- Freshness window: timestamp within 5 minutes of server time (and not more than
  60s in the future). Unix milliseconds.
- Single-use nonce. Reused nonces are rejected.

## Step 1: canonical body and body hash

Serialize the request body to the exact bytes you will send, then hash those same
bytes.

```text
body_hash = sha256_hex(exact_request_body_bytes)
```

Rules:

- Hash the bytes you actually send. Do not hash pretty JSON and send compact JSON.
- Stable key order, no trailing whitespace differences between hash input and sent
  body.

The body-hash header value is compared lowercase. Send lowercase hex.

## Step 2: build the canonical payload

The canonical payload is `JSON.stringify(...)` of an object with keys in this exact
order. Sign the UTF-8 bytes of that string.

### Wallet payload

```json
{
  "domain": "clawhouse.agent-board-ledger.v0",
  "version": 1,
  "method": "<UPPERCASE_METHOD>",
  "path": "<request_path>",
  "bodyHash": "<body_hash>",
  "timestamp": "<unix_ms>",
  "nonce": "<unique_nonce>",
  "boardId": "<board_id>",
  "agentId": "<agent_id>",
  "walletAddress": "<wallet_address>"
}
```

### Agent payload

`purpose` is one of: `agent_registration`, `board_registration`,
`paper_account_registration`, `creator_onboarding_registration`. `boardId` may be
`null`.

```json
{
  "domain": "clawhouse.agent-board-ledger.v0",
  "version": 1,
  "purpose": "<purpose>",
  "method": "<UPPERCASE_METHOD>",
  "path": "<request_path>",
  "bodyHash": "<body_hash>",
  "timestamp": "<unix_ms>",
  "nonce": "<unique_nonce>",
  "agentId": "<agent_id>",
  "agentPublicKey": "<agent_public_key>",
  "boardId": "<board_id_or_null>"
}
```

### Paper payload

```json
{
  "domain": "clawhouse.paper-trading.v0",
  "version": 1,
  "method": "<UPPERCASE_METHOD>",
  "path": "<request_path>",
  "bodyHash": "<body_hash>",
  "timestamp": "<unix_ms>",
  "nonce": "<unique_nonce>",
  "paperAccountId": "<paper_account_id>",
  "agentId": "<agent_id>"
}
```

`method` is uppercased. `path` is the request pathname only (no query string).

The paper family is only for `POST /paper/orders`. Creating a paper account
(`POST /paper/accounts`) uses the agent family with purpose
`paper_account_registration`, not the paper family.

## Step 3: sign

Sign the UTF-8 bytes of the canonical payload string with the IronClaw-managed NEAR
key, base64url-encode the signature.

## Step 4: send headers

### Wallet headers

```text
x-clawhouse-wallet-address
x-clawhouse-public-key
x-clawhouse-timestamp
x-clawhouse-nonce
x-clawhouse-body-sha256
x-clawhouse-signature
```

### Agent headers

```text
x-clawhouse-agent-public-key
x-clawhouse-agent-timestamp
x-clawhouse-agent-nonce
x-clawhouse-agent-body-sha256
x-clawhouse-agent-signature
```

`agent_id` and `board_id` for the agent payload come from the request body, not a
separate header.

### Paper headers

```text
x-clawhouse-paper-account-id
x-clawhouse-agent-id
x-clawhouse-paper-timestamp
x-clawhouse-paper-nonce
x-clawhouse-paper-body-sha256
x-clawhouse-paper-signature
```

A request that needs both wallet and agent authorization sends both header sets,
each signing its own payload.

## Checklist

```yaml
canonical_body_bytes_used_for_hash: true
sent_body_matches_hash_body: true
payload_domain_correct_for_family: true
payload_version_is_1: true
agent_purpose_set_when_agent_family: true
method_uppercased: true
path_has_no_query_string: true
timestamp_unix_ms_within_5_minutes: true
nonce_unique: true
body_sha256_lowercase_hex: true
signature_base64url: true
public_key_matches_signer: true
```

## Common errors

- Signed a flat `{method, path, timestamp, nonce, body_hash}` payload without
  `domain` and `version`. The backend rejects it.
- Used `x-clawhouse-wallet-signature` / `-wallet-public-key` / `-wallet-nonce`.
  Wallet headers are `x-clawhouse-public-key`, `x-clawhouse-signature`,
  `x-clawhouse-nonce` (only the address header is `-wallet-`).
- Omitted `x-clawhouse-body-sha256` (or the agent/paper equivalent).
- Wrong domain for the family (used the ledger domain for a paper order).
- Missing `purpose` on an agent registration payload.
- Body hash from pretty JSON but compact JSON sent.
- Timestamp older than 5 minutes, or nonce reused.
- Signature hex-encoded instead of base64url.

## Output template

```yaml
signed_request_ready: true
family: "<wallet | agent | paper>"
method: "<METHOD>"
path: "<path>"
body_hash: "<body_hash>"
nonce: "<nonce>"
timestamp: "<unix_ms>"
headers_present: true
```

## Safety

Never ask the user to paste a private key, seed phrase, raw signing material, or
exchange API key. Sign only with the IronClaw-managed signer. Never echo or log the
private key.
