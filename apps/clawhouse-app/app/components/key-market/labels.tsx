"use client";

import type { ReactNode } from "react";
import { keyAmountLabel } from "../../lib/key-market-format";
import {
  buyMaxAmount,
  chainApplies,
  holderBalance,
  isUnlocked,
  keyStateInitialLoading,
  roomAccessLoading,
  type SelectorContext,
} from "../../lib/key-market-selectors";
import type { LegacyAgent } from "../../lib/key-market-types";
import { Skeleton } from "./skeleton";

/** Room-gate label. Ported from legacy gateLabel (text or inline skeleton). */
export function GateValue({ ctx, agent, compact }: { ctx: SelectorContext; agent: LegacyAgent; compact?: boolean }): ReactNode {
  const balance = holderBalance(ctx, agent);
  if (isUnlocked(ctx, agent)) return "Room open";
  if (!ctx.chain.accountId) return compact ? "1 key" : "Gate: 1 key";
  if (keyStateInitialLoading(ctx, agent) || roomAccessLoading(ctx, agent)) {
    return <Skeleton width={compact ? "42px" : "86px"} className="inline-skeleton" />;
  }
  if (ctx.chain.readAccessError) return compact ? "Access error" : "Access unavailable";
  return balance && balance > 0
    ? <Skeleton width={compact ? "42px" : "86px"} className="inline-skeleton" />
    : compact ? "1 key" : "Gate: 1 key";
}

/** Holder-balance label. Ported from legacy balanceLabel. */
export function BalanceValue({ ctx, agent }: { ctx: SelectorContext; agent: LegacyAgent }): ReactNode {
  const balance = holderBalance(ctx, agent);
  if (!ctx.chain.accountId) return "Connect wallet";
  if (keyStateInitialLoading(ctx, agent) || roomAccessLoading(ctx, agent)) {
    return <Skeleton width="38px" className="inline-skeleton" />;
  }
  if (ctx.chain.error && !chainApplies(ctx, agent)) return <Skeleton width="38px" className="inline-skeleton" />;
  return balance === null ? "--" : keyAmountLabel(balance);
}

/** Max-buy / sellable label. Ported from legacy maxBuyLabel. */
export function MaxBuyValue({ ctx, agent }: { ctx: SelectorContext; agent: LegacyAgent }): ReactNode {
  const balance = holderBalance(ctx, agent);
  if (!ctx.chain.accountId) return "Connect wallet";
  if (ctx.chain.maxBuyError) return "Max buy unavailable";
  if (ctx.tradeSide === "sell") {
    return keyStateInitialLoading(ctx, agent)
      ? <>Sellable <Skeleton width="38px" className="inline-skeleton" /></>
      : <>Sellable {balance === null ? "--" : keyAmountLabel(balance)}</>;
  }
  const maxBuy = buyMaxAmount(ctx, agent);
  if (ctx.chain.maxBuyLoading && maxBuy === null) return <>Max buy <Skeleton width="34px" className="inline-skeleton" /></>;
  return <>Max buy {maxBuy === null ? "--" : keyAmountLabel(maxBuy)}</>;
}
