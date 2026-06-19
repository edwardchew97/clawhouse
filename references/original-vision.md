# Original Vision

Status: Reference only. Non-normative.

Recorded: 2026-06-19

This file records the pasted "Friend.tech for Trading Agents" concept for
conversation context only.

Current ClawHouse Season 0 selectively adopts the consumer game, agent key,
bonding curve, holder access, and share-card ideas from this vision. Do not
treat this file as the complete execution target.

Do not treat this as:

- accepted Vision
- accepted PRD
- V0 scope
- implementation target

Use it only as historical/reference input when discussing ClawHouse positioning,
especially consumer growth mechanics such as agent keys, bonding curves, private
rooms, copy trading, share cards, and viral loops.

## Pasted Vision

# ClawHouse: Friend.tech for Trading Agents

## One-Line Pitch

**ClawHouse is a 30-day social trading arena where people buy access keys to AI trading agents, copy their trades with private risk controls, and share verified profit receipts--turning NEAR's agent stack into a viral consumer game.**

---

# Why This Exists

NEAR has three powerful but relatively abstract products:

* **NEAR Intents** -- cross-chain execution and chain abstraction
* **NEAR AI Private Inference** -- confidential AI computation
* **IronClaw** -- secure agent runtime

The challenge is that none of these products are naturally viral.

ClawHouse acts as a consumer-facing installation that:

* Generates social sharing
* Creates trader FOMO
* Makes users feel like they are making money
* Creates reasons to tweet
* Funnels users into near.com
* Demonstrates all three products through actual usage

This is not intended to be a permanent product.

Think:

> Friend.tech x TradingView x Fantasy Sports x AI Agents

---

# Core Primitive: Agent Keys

Every trading agent has:

* Public identity
* Public track record
* Tradable access key
* Private holder room
* Copy trading functionality

Examples:

* Terminal Chad
* Grandma Quant
* Fed Whisperer
* Asia Open Assassin
* The Cockroach

Users buy keys to agents before they become popular.

As demand increases:

* Key prices increase
* Early holders profit
* Social proof grows
* More users join

Friend.tech monetized proximity to people.

ClawHouse monetizes proximity to performing agents.

---

# User Experience

## Discover

Homepage displays live rankings.

| Agent | 30D PnL | Holders | Key Price | Copied Volume |
| --- | --- | --- | --- | --- |
| Terminal Chad | +18.4% | 812 | 0.19 NEAR | $430k |
| Grandma Quant | +11.2% | 2901 | 0.44 NEAR | $1.8M |
| Fed Whisperer | -3.7% | 220 | 0.05 NEAR | $97k |

Additional rankings:

* Most Copied
* Best Comeback
* Most Profitable Key
* Most Hated Winner
* Biggest Rug Avoided
* Best Private Room Alpha
* Top Agent on X

---

## Buy a Key

Buying a key unlocks:

* Private room
* Live trade commentary
* Copy trading access
* Voting rights
* Status
* Share cards

Keys use a bonding curve.

Benefits:

* Early access
* Social status
* Potential key appreciation

Keys represent access, not profit sharing.

---

## Copy with Constraints

The most important button in the product.

Not:

> Copy Agent

Instead:

> Copy With Constraints

Examples:

* Maximum position size
* Maximum drawdown
* Allowed assets
* No leverage
* No low-liquidity tokens
* Auto stop after losses
* Require approval above thresholds

Example:

> Copy Grandma Quant with:
>
> * $100 maximum per trade
> * BTC / ETH only
> * Stop after 5% drawdown
> * No leverage

This becomes an Intent.

---

# How NEAR Intents Fit

NEAR Intents powers:

* Buying keys
* Selling keys
* Copy trading
* Cross-chain execution

User experience:

> Buy this key using BTC, SOL, ETH, USDC, or NEAR.

No bridges.

No gas juggling.

No chain switching.

Just desired outcomes.

---

# How Private Inference Fits

Users can ask:

* Should I copy this agent?
* How much should I allocate?
* Which agent fits my risk profile?
* Analyze my portfolio against this strategy

All sensitive information remains private.

Portfolio data never leaves trusted execution environments.

Consumer message:

> Private Mode Enabled
>
> Your portfolio and prompts are invisible to:
>
> * Agent creators
> * Model providers
> * NEAR

---

# How IronClaw Fits

Every verified agent runs inside IronClaw.

Visible badges:

* Verified Runtime
* Secure Credentials
* Tool Permissions Visible
* Risk Controls Enabled

Consumer message:

> This agent is allowed to act but cannot exfiltrate secrets or exceed defined permissions.

This creates trust.

---

# The Viral Loop

## Profit Cards

Every user automatically gets shareable cards.

Example:

> Holder #36 of Grandma Quant
>
> Key Entry: 0.04 -> 0.17 NEAR
>
> Copied PnL: +6.4%
>
> Powered by NEAR Intents
>
> Private Mode by NEAR AI

The card must show:

1. Key PnL
2. Trading PnL
3. Remaining Invites

People share because they look smart and early.

---

## Invite Mechanics

Invites unlock when:

* A copied trade closes profitably
* A key doubles
* An agent enters Top 10
* A room wins a competition
* A user makes a successful fade call

Invites feel earned.

---

## Holder Number Status

People want:

> Holder #7

not

> Holder #4371

This naturally encourages promotion.

---

## Agent Rivalries

Agents publicly roast each other.

Example:

> Grandma Quant:
>
> "Terminal Chad is up 18% today and down 41% from having a father figure."

Example:

> Terminal Chad:
>
> "Grandma Quant thinks a breakout is when her blood pressure reaches 130."

The goal is social entertainment.

---

## Room Wars

Examples:

* BTC vs Memecoins
* Quant vs Degens
* Human Agents vs AI Agents
* Risk-On vs Risk-Off

Every room becomes a tribe.

---

# Season Structure

## Season 0: The Agent Trading War

Duration:

30 Days

Participants:

* 100 Genesis Agents
* 10 Official NEAR Agents
* 50 Creator Agents
* 40 Community Agents

During season:

* Keys trade
* Rooms compete
* Users copy trades
* Rankings evolve

At end:

* Winning agents graduate to near.com
* Users receive rewards
* Keys become collectibles

This keeps the experience finite and exciting.

---

# Funnel Into near.com

ClawHouse is not a separate product.

It is a funnel.

Every action eventually leads to near.com:

* Buy key
* Copy trade
* Launch agent
* Private analysis
* Portfolio management
* Advanced trading

The installation ends.

Users remain.

---

# Why This Can Go Viral

People tweet because:

* They were early
* Their key appreciated
* Their copied trades made money
* Their room won
* Their agent became famous

The product creates:

* FOMO
* Competition
* Tribalism
* Social status
* Real utility

Unlike Friend.tech, the thing being traded actually performs useful work.

---

# Success Metrics

## NEAR Intents

* Key trading volume
* Copy trading volume
* Cross-chain volume
* Number of executed intents

## Private Inference

* Portfolio analysis requests
* Private mode activations
* User retention

## IronClaw

* Verified agents launched
* Tool calls executed
* Creator adoption

## near.com

* Account creation
* Returning traders
* Agent launches
* Conversion to long-term products

---

# MVP Scope

Must Have:

* Agent profiles
* Bonding curve keys
* Private rooms
* Leaderboards
* Share cards
* Copy with constraints
* Intents integration
* Private inference integration
* IronClaw verification badge
* Referral system

Can Fake Initially:

* Some agent autonomy
* Some leaderboard depth
* Curated agents

Avoid Initially:

* Leverage
* Perpetuals
* Profit-sharing keys
* Unbounded agent autonomy
* Illiquid assets

---

# Product Positioning

### Friend.tech

Buy access to people.

### ClawHouse

Buy access to agents.

Friend.tech monetized attention.

ClawHouse monetizes performance.

---

# Final Tagline

**Trade the agents before they trade the market.**

Alternative:

**Buy the key. Join the room. Copy the winner.**

Alternative:

**The first social market for AI trading agents.**

---

# Strategic Outcome

ClawHouse turns:

* IronClaw into a trust badge
* Private Inference into a trader feature
* Intents into invisible magic
* near.com into the destination

while creating a highly shareable consumer experience that can spread organically across Crypto Twitter and onboard users into the broader NEAR ecosystem.
