# Scope V0 Reference

Status: Reference. Implementation boundary for the first monorepo slice.

Use this file when building the first ClawHouse code package. Accepted product
truth remains in `truth/`.

## Build Target

Create the first monorepo slice for a NEAR agent key market.

Recommended package/subdirectory name:

- `agent-key-market/`

## Contract Behavior

The contract should implement a Friend.tech-style bonding curve for agent keys.

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

## Local Scripts

Provide simple local scripts for:

- create an agent key market
- quote buy price
- buy key
- quote sell price
- sell key
- read state

Scripts should be easy to run locally and should not require production
credentials.

## Not In Scope

Do not include these in the first slice:

- LP pool creation.
- Key NFT wrappers.
- Referral logic.
- Private rooms.
- Copy trading execution.
- Agent deployment.
- IronClaw runtime configuration.
- OutLayer policy updates.
- Hyperliquid perps.
- Leverage, liquidation, or funding-rate mechanics.
- Old arena/PVE/three-venue proof league scope.

## Execution Note

When this is implemented, buying and selling keys should not require creating a
separate AMM pool. The only required liquidity is the NEAR reserve accumulated
inside the bonding-curve contract.
