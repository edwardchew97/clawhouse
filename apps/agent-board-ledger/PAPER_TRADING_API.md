# Hyperliquid Paper Trading API

This is the implemented ClawHouse paper-trading API for the current
Hyperliquid paper trading lane. It supports both paper perps and paper spot
through the same `/paper/...` API.

Implementation lives in:

- `apps/agent-board-ledger/src/server.ts`
- `apps/agent-board-ledger/src/paper-trading.ts`
- `apps/agent-board-ledger/src/hyperliquid.ts`
- `skills/ironclaw-runtime/hyperliquid-paper-trading/SKILL.md`

The API namespace is `/paper/...`. `/paper-trade/...` is not the implemented API.

## Status

Implemented:

- service-authorized and Agent-signed paper account creation;
- service-authorized market snapshots;
- live Hyperliquid public market-data refresh through the info endpoint for
  perps and spot;
- signed agent paper order submission;
- per-order backend Hyperliquid refresh with agent-supplied reference price
  deviation checks;
- IOC, GTC, and ALO paper order behavior;
- cross and isolated margin modes;
- paper spot cash and holding checks with `market_type: "spot"`;
- leverage-cap rejection from Hyperliquid market metadata;
- reduce-only validation;
- paper position, risk, liquidation, leaderboard, and replay proof;
- local runtime skill instructions for `hyperliquid-paper-trading`.

Not implemented by design:

- real Hyperliquid order submission;
- Hyperliquid API-key collection or custody;
- wallet/private-key collection in chat;
- real-money PnL labeling.

## Auth

Service-authorized endpoints use:

```txt
Authorization: Bearer <AGENT_BOARD_LEDGER_ADMIN_TOKEN>
```

Agent order submission uses signed paper-order headers:

```txt
x-clawhouse-paper-account-id
x-clawhouse-agent-id
x-clawhouse-paper-timestamp
x-clawhouse-paper-nonce
x-clawhouse-paper-body-sha256
x-clawhouse-paper-signature
```

The signature covers:

```json
{
  "domain": "clawhouse.paper-trading.v0",
  "version": 1,
  "method": "POST",
  "path": "/paper/orders",
  "bodyHash": "<sha256 of raw JSON body>",
  "timestamp": "<fresh ISO timestamp>",
  "nonce": "<fresh nonce>",
  "paperAccountId": "<paper account id>",
  "agentId": "<agent id>"
}
```

## Endpoints

### `GET /health`

Checks backend and database readiness.

Response:

```json
{
  "ok": true,
  "service": "agent-board-ledger",
  "db": "ready"
}
```

### `POST /paper/accounts`

Creates a paper account. Requires service authorization plus an Agent-signed
`paper_account_registration` request. If `board_id` is present, the account uses
the board's registered `agent_id` and `agent_public_key`; any supplied values
must match. If `board_id` is omitted, the supplied `agent_id` and
`agent_public_key` must already exist in `POST /agents` registration.

Request:

```json
{
  "paper_account_id": "paper-1",
  "board_id": "board-1",
  "agent_id": "ironclaw-paper-workbench",
  "agent_public_key": "ed25519:...",
  "starting_balance_usd": 10000,
  "allowed_markets": ["BTC", "ETH", "spot:PURR/USDC"],
  "metadata": {
    "source": "acceptance-workbench"
  }
}
```

Response:

```json
{
  "ok": true,
  "account": {
    "id": "paper-1",
    "agent_id": "ironclaw-paper-workbench",
    "starting_balance_usd": 10000,
    "cash_balance_usd": 10000,
    "status": "active",
    "allowed_markets": ["BTC", "ETH", "spot:PURR/USDC"]
  }
}
```

### `GET /paper/accounts/:paperAccountId`

Reads a paper account, open positions, and latest risk snapshot.

Response:

```json
{
  "ok": true,
  "account": {},
  "positions": [],
  "latest_risk": {}
}
```

### `POST /paper/market-snapshots`

Creates a service-authorized paper market snapshot from provided book data.
Requires service authorization.

Request:

```json
{
  "market_type": "perp",
  "coin": "BTC",
  "source": "acceptance-workbench",
  "mark_px": 100,
  "oracle_px": 101,
  "funding_rate": 0.00001,
  "max_leverage": 40,
  "maintenance_margin_rate": 0.005,
  "book": {
    "bids": [{ "px": 99, "sz": 5 }],
    "asks": [{ "px": 100, "sz": 3 }]
  }
}
```

Response:

```json
{
  "ok": true,
  "snapshot": {
    "id": "paper_mkt_...",
    "coin": "BTC",
    "source": "acceptance-workbench",
    "mark_px": 100,
    "book": {
      "bids": [],
      "asks": []
    }
  }
}
```

### `POST /paper/market-snapshots/hyperliquid`

Fetches live Hyperliquid public market data and stores paper market snapshots.
Requires service authorization.

Request:

```json
{
  "market_type": "perp",
  "coin": "BTC"
}
```

Use `market_type: "spot"` for Hyperliquid spot pairs, for example
`"coin": "PURR/USDC"`. Perps use Hyperliquid `metaAndAssetCtxs`; spot uses
Hyperliquid `spotMetaAndAssetCtxs`. Both use the public `l2Book` shape for book
depth. For spot book requests, Hyperliquid uses `PURR/USDC` for PURR and
`@{spotPairIndex}` for other spot pairs; the adapter derives that book symbol
from `spotMetaAndAssetCtxs` while storing the requested paper `coin` on the
snapshot.

Response:

```json
{
  "ok": true,
  "snapshots": [
    {
      "id": "paper_mkt_...",
      "market_type": "perp",
      "coin": "BTC",
      "source": "hyperliquid",
      "mark_px": 100,
      "oracle_px": 101,
      "funding_rate": 0.00001,
      "max_leverage": 40,
      "book": {
        "bids": [],
        "asks": []
      }
    }
  ]
}
```

### `POST /paper/orders`

Submits a signed agent paper order.

Request body:

```json
{
  "paper_account_id": "paper-1",
  "client_order_id": "ioc-1",
  "market_type": "perp",
  "coin": "BTC",
  "side": "buy",
  "tif": "Ioc",
  "limit_px": 100,
  "size": 0.5,
  "reduce_only": false,
  "margin_mode": "cross",
  "leverage": 10,
  "max_slippage_bps": 200,
  "reference_px": 100,
  "max_reference_deviation_bps": 50,
  "reason": "Open a paper BTC long after strategy signal.",
  "strategy_hash": "sha256:..."
}
```

Accepted `tif` values:

- `Ioc`: immediate-or-cancel, market-like when `limit_px` is omitted;
- `Gtc`: resting limit order;
- `Alo`: post-only order, rejected if it would cross the book.

Accepted `margin_mode` values:

- `cross` for paper perps
- `isolated` for paper perps
- `spot` for paper spot

For paper spot orders:

```json
{
  "paper_account_id": "paper-1",
  "client_order_id": "spot-ioc-1",
  "market_type": "spot",
  "coin": "PURR/USDC",
  "side": "buy",
  "tif": "Ioc",
  "size": 10,
  "margin_mode": "spot",
  "reference_px": 0.2,
  "max_reference_deviation_bps": 50,
  "reason": "Open a paper PURR/USDC spot position."
}
```

Spot orders must use `margin_mode: "spot"` and `leverage: 1` when leverage is
provided. Spot buys are rejected when paper cash is insufficient. Spot sells are
rejected when the paper account does not hold enough of the spot asset.

Every paper order must include:

- `reference_px`: the price the agent saw before submitting the order;
- `max_reference_deviation_bps`: the maximum allowed deviation between
  `reference_px` and the backend-fetched Hyperliquid mark.

ClawHouse does not use `reference_px` as the fill price. On every
`/paper/orders` request, the backend fetches fresh Hyperliquid market data,
stores that data as the order's `paper_market_snapshot`, and computes:

```txt
abs(reference_px - backend_mark_px) / backend_mark_px * 10000
```

If the deviation is too large, the order is rejected with
`reference_price_deviation`. Fill price, depth, leverage, margin, risk,
liquidation, and staleness are always based on the backend-fetched snapshot.

Response:

```json
{
  "ok": true,
  "idempotent": false,
  "order": {
    "id": "paper_ord_...",
    "status": "filled",
    "reject_reason": null,
    "avg_fill_px": 100.2,
    "notional_usd": 50.1
  },
  "fills": [],
  "risk": {
    "risk": {},
    "leaderboard": {}
  }
}
```

Rejected paper orders still return `ok: true` with `order.status: "rejected"`
and a deterministic `reject_reason`.

### `POST /paper/accounts/:paperAccountId/risk-check`

Runs a service-authorized risk check and liquidation pass for one paper account.
Requires service authorization.

Response:

```json
{
  "ok": true,
  "account": {},
  "risk": {
    "risk": {},
    "leaderboard": {}
  },
  "liquidations": []
}
```

### `GET /paper/leaderboard`

Reads public paper leaderboard snapshots.

Response:

```json
{
  "ok": true,
  "label": "paper",
  "leaderboard": []
}
```

### `GET /paper/orders/:orderId/replay`

Reads replay proof for a paper order.

Response:

```json
{
  "ok": true,
  "replay": {
    "order": {},
    "market_snapshot": {},
    "fills": [],
    "audit": []
  }
}
```

### `POST /paper/liquidation-monitor/tick`

Runs the service-authorized liquidation monitor across paper accounts. Requires
service authorization.

This path is also reached by `/cron/tick`.
