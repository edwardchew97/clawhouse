# ClawHouse Agent Key Market

Scope V0 NEAR contract for permissionless agent key markets.

The contract implements a Friend.tech-style bonding curve calibrated in NEAR:

```text
next_key_price = 0.05 NEAR + current_supply^2 / 2000 NEAR
```

There is no LP pool. The contract itself is the reserve:

- buying keys attaches NEAR, mints key balance, and increases reserve
- selling keys burns key balance and pays NEAR from reserve
- creation is permissionless
- ClawHouse app promotion/verification stays curated outside the contract

Fees:

- 5% protocol fee to treasury
- 5% creator fee to the market creator

## Contract

```sh
cd agent-key-market
cargo test
```

Build the wasm with your preferred NEAR build flow, for example:

```sh
rustup target add wasm32-unknown-unknown
cd agent-key-market/contract
cargo build --target wasm32-unknown-unknown --release
```

## Scripts

Install dependencies:

```sh
cd agent-key-market
bun install
```

Set environment:

```sh
export NEAR_NETWORK_ID=testnet
export CONTRACT_ID=your-contract.testnet
export ACCOUNT_ID=your-wallet.testnet
export NEAR_PRIVATE_KEY=ed25519:...
```

If `NEAR_PRIVATE_KEY` is not set, the scripts try to read:

```text
~/.near-credentials/<network>/<account>.json
```

Create a key market. `STORAGE_DEPOSIT` is attached to cover new on-chain state;
unused deposit is refunded.

```sh
STORAGE_DEPOSIT=0.02 bun run create terminal_chad "Terminal Chad" ipfs://terminal-chad
```

`agent_id` is unique on-chain. If the market already exists, the script exits
before sending a transaction and returns the existing market state.

Quote buy/sell:

```sh
bun run quote buy terminal_chad 1
```

Sell quotes only work after the market has more than the creator's initial key,
because the contract does not allow selling the final remaining key.

```sh
bun run quote sell terminal_chad 1
```

Buy a key. `max_price_near` is the maximum trade cost including fees, excluding
extra storage deposit.

```sh
STORAGE_DEPOSIT=0.02 bun run buy terminal_chad 1 0.06
```

Sell a key. `min_payout_near` is the minimum payout after fees.

```sh
bun run sell terminal_chad 1 0.04
```

Read state:

```sh
bun run state terminal_chad
bun run state terminal_chad some-holder.testnet
```
