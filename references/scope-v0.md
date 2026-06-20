# Scope V0 Reference

Status: Reference. Implementation boundary for Scope V0.

Use this file when building the first ClawHouse code package. Accepted product
truth remains in `truth/`.

## Build Target

Create an accessible internal preview for the ClawHouse Scope V0 split-network
agent key market and agent trading loop.

Recommended package/subdirectory name:

- `agent-key-market/`

The implementation must support multiple agents. Scope V0 preview targets 3
ClawHouse-curated agents, with agent identity and displayed data coming from real
configuration, real chain state, real agent output, or real product events.

Do not use seed content. If a value cannot be sourced from a real configuration,
real onchain state, real agent run, or real product event, do not fabricate it.

## Preview Requirements

The accessible preview must let an internal user:

- connect a NEAR testnet wallet for key trading
- use the configured NEAR mainnet agent-trading / Intents funding path
- discover 3 ClawHouse-curated agents
- buy an agent key
- enter the agent's holder-facing room after buying
- see their key position
- read real agent short updates
- see real leaderboard/PnL inputs
- sell an agent key
- generate a receipt / share card

Scope V0 is not a local-script-only proof. Local scripts and internal tools are
still useful, but the product target is a preview that teammates can access.

## Contract Behavior

The contract should implement a Friend.tech-style bonding curve for agent keys.

The key market contract runs on NEAR testnet in Scope V0.

Key market creation is permissionless. Product promotion remains curated outside
the contract: ClawHouse can verify and promote selected markets in app code, but
the contract should not block unknown users from creating markets.

Minimum functions:

- `create_agent_key`
- `get_buy_price`
- `buy_key`
- `get_sell_price`
- `sell_key`
- `get_agent`
- `get_balance`
- `get_supply`
- `get_reserve`

Minimum state:

- agent id / slug
- agent owner or creator account
- metadata needed for display
- key supply
- NEAR reserve
- holder balances

## Trading Model

There is no LP pool.

The contract is the market maker:

- Buyer attaches NEAR.
- Contract mints key balance.
- Contract keeps NEAR in reserve.
- Seller burns key balance.
- Contract pays NEAR out from reserve.

Key buy/sell happens on the NEAR testnet key market contract. NEAR Intents must
not execute key buy/sell.

The first version should use this accepted NEAR-calibrated curve:

```text
next_key_price = 0.05 NEAR + current_supply^2 / 2000 NEAR
```

Fees:

- 5% protocol fee.
- 5% creator fee.

First key:

- `create_agent_key` mints one initial key to the creator.
- The final remaining key cannot be sold, so supply never returns to zero.

Trade protection:

- `buy_key` accepts `max_price`.
- `sell_key` accepts `min_payout`.
- These protect users from price movement between quote and execution.

The UI must show the current buy/sell quote before submitting a transaction and
refresh state after transaction completion.

User position means key position only:

- key balance
- entry cost
- current sell quote / exit testnet NEAR

Do not show copy-trading positions or user portfolio PnL in Scope V0.

## Holder-Facing Room

Scope V0 must include a first-party holder-facing room. Telegram is out of
scope and must not be treated as the room.

Minimum room features:

- access gate based on the user's holder balance for the agent key
- room header with agent identity, key price, holders, supply, reserve, and
  leaderboard/PnL summary
- real short updates emitted by the agent
- the user's key position for that agent
- recent real key activity for that agent market
- receipt / share card generation

The room must not include:

- chat
- Telegram mirror
- seed feed
- copy trading
- creator posting backend
- manually fabricated private-room content

The exact short-update payload is still an open product decision. Until that is
accepted, implementations should keep the interface narrow: update id, agent id,
timestamp, source/run reference, and short display body.

## Leaderboard And PnL

Leaderboard and PnL displayed in Scope V0 must be real. They can be narrow
because the preview has only 3 curated agents, but they cannot be seeded.

Acceptable sources include:

- real agent run output
- real NEAR mainnet trade/account/portfolio records connected to the agent
- real NEAR Intents records connected to agent funding / spot trading
- real product events

If the source is not available, omit the field or mark the agent as not ready.
Do not backfill with demo numbers.

## Network And Backend Config

Scope V0 uses a split-network preview:

- key trading / key market / holder gate: NEAR testnet
- agent trading / NEAR Intents funding path / agent PnL: NEAR mainnet

The implementation must keep these networks explicit in environment variables,
backend routes, response payloads, receipt/share-card labels, and UI copy. Do
not infer the network from defaults or from the user's wallet alone.

Required runtime config:

| Area | Network | Purpose | Required config / URL |
| --- | --- | --- | --- |
| Preview app | n/a | accessible internal frontend | `CLAWHOUSE_PREVIEW_APP_URL` |
| Product backend | n/a | app API base URL | `CLAWHOUSE_APP_API_BASE_URL` |
| Key market RPC | NEAR testnet | key buy/sell/read state | `CLAWHOUSE_KEY_NEAR_NETWORK_ID=testnet`, `CLAWHOUSE_KEY_NEAR_RPC_URL` |
| Key market contract | NEAR testnet | agent key market contract | `CLAWHOUSE_KEY_MARKET_CONTRACT_ID` |
| Key explorer | NEAR testnet | key tx links for receipts/share cards | `CLAWHOUSE_KEY_NEAR_EXPLORER_URL` |
| Agent trading RPC | NEAR mainnet | agent trading/account reads | `CLAWHOUSE_AGENT_NEAR_NETWORK_ID=mainnet`, `CLAWHOUSE_AGENT_NEAR_RPC_URL` |
| NEAR Intents API | NEAR mainnet / production | funding / spot / supported funds | `CLAWHOUSE_INTENTS_API_BASE_URL`, default `https://1click.chaindefuser.com`; `CLAWHOUSE_INTENTS_TOKENS_URL`, default `https://1click.chaindefuser.com/v0/tokens` |
| NEAR Intents verifier | NEAR mainnet | verifier/deposit/withdraw accounting | `CLAWHOUSE_INTENTS_VERIFIER_CONTRACT_ID=intents.near` |
| Agent backend | n/a | agent runs, room updates, PnL records | `CLAWHOUSE_AGENT_API_BASE_URL` |

`CLAWHOUSE_APP_API_BASE_URL` must expose clear route ownership:

- `/api/config`: returns non-secret preview config, including what runs on
  testnet and what runs on mainnet
- `/api/key-market/*`: only talks to the NEAR testnet key market
- `/api/agents/*`: reads/manages internally curated agents and agent run state
- `/api/rooms/*`: reads holder rooms, agent updates, and key-gated room state
- `/api/leaderboard/*`: reads real agent trading / PnL / ranking inputs
- `/api/intents/*`: handles NEAR Intents mainnet funding / spot / supported
  funds only; it must not handle key buy/sell

Secrets, API keys, signing keys, and agent private config must never be returned
by `/api/config` or bundled into the frontend.

## NEAR Intents Boundary

NEAR Intents is a production mainnet funding and agent-trading layer for Scope
V0:

- spot / cross-chain swap
- deposit / withdrawal / funding path into usable NEAR mainnet agent-trading
  funds
- future copy-with-constraints expression, not active V0 execution

Scope V0 must integrate the real NEAR Intents production funding path, not a
placeholder button. Supported funds/assets should come from the actual
integration or API, not from a fake hardcoded demo list.

NEAR Intents has no testnet deployment, so Scope V0 uses the real production
mainnet path with small internal/dev accounts for funding / spot / agent trading.

NEAR Intents must not be used as the agent key market. Buy/sell key flows call
the NEAR testnet key market contract.

## Internal Scripts And Tools

Provide simple internal scripts or tools for:

- create / register an internally managed agent key market
- quote buy price
- buy key
- quote sell price
- sell key
- read state
- read room/update state
- inspect leaderboard/PnL inputs

Scripts should be easy to run by the ClawHouse team. Since Scope V0 uses NEAR
testnet for keys and NEAR mainnet for agent trading / Intents, credential and
account handling must be explicit and must not rely on committed secrets.

## Not In Scope

Do not include these in the first slice:

- LP pool creation.
- Key NFT wrappers.
- Referral logic.
- Public-facing agent onboarding.
- Permissionless agent creation.
- Seed content, seed feed, fake leaderboard, or fake PnL.
- Telegram.
- Holder chat.
- Copy trading execution.
- Mainnet key trading.
- External creator self-serve deployment.
- Public creator posting backend.
- OutLayer policy updates.
- Hyperliquid perps.
- Leverage, liquidation, or funding-rate mechanics.
- NEAR Intents executing key buy/sell.
- Old arena/PVE/three-venue proof league scope.

## Execution Note

When this is implemented, buying and selling keys should not require creating a
separate AMM pool. The only required liquidity is the NEAR reserve accumulated
inside the bonding-curve contract.
