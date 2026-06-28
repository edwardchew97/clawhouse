import { useMemo } from "react";
import { useKeyMarketStore } from "./key-market-store";
import { selectAgent, type SelectorContext } from "../lib/key-market-selectors";

/**
 * Build the pure {@link SelectorContext} from the store. Each field is subscribed
 * individually (stable references from the store), and memoized into one object so
 * derivation selectors can be called without re-creating context every render.
 */
export function useSelectorContext(): SelectorContext {
  const chain = useKeyMarketStore((s) => s.chain);
  const agents = useKeyMarketStore((s) => s.agents);
  const tradeSide = useKeyMarketStore((s) => s.tradeSide);
  const activeDiscoveryFilters = useKeyMarketStore((s) => s.activeDiscoveryFilters);
  return useMemo(
    () => ({ chain, agents, tradeSide, activeDiscoveryFilters }),
    [chain, agents, tradeSide, activeDiscoveryFilters],
  );
}

/** The currently selected agent, resolved the same way the legacy getter does. */
export function useSelectedAgent() {
  const agents = useKeyMarketStore((s) => s.agents);
  const selectedId = useKeyMarketStore((s) => s.selectedId);
  return useMemo(() => selectAgent(agents, selectedId), [agents, selectedId]);
}
