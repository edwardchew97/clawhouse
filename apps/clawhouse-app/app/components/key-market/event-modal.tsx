"use client";

import { useEffect } from "react";
import { readableEventModel } from "../../lib/key-market-events";
import { legacyChartModel, legacyCloseEvent } from "../../lib/legacy-bridge";
import { agentTitle } from "../../lib/key-market-selectors";
import { useKeyMarketStore } from "../../store/key-market-store";
import { useSelectedAgent, useSelectorContext } from "../../store/use-key-market";

/**
 * Event detail modal. Ported from legacy renderBackendEventModal. The legacy layer
 * still gates opening (key/unlock), tracks activeEventId, and highlights the chart;
 * this renders the modal content and owns close (button / backdrop / Escape).
 */
export function EventModal() {
  const ctx = useSelectorContext();
  const agent = useSelectedAgent();
  const activeEventId = useKeyMarketStore((s) => s.activeEventId);
  useKeyMarketStore((s) => s.chain);

  useEffect(() => {
    if (!activeEventId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") legacyCloseEvent(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeEventId]);

  const event = agent && activeEventId
    ? legacyChartModel(agent)?.events.find((item) => item.id === activeEventId)
    : null;

  if (!agent || !activeEventId || !event) {
    return <div className="modal-backdrop" id="eventModal" hidden />;
  }

  const model = readableEventModel(ctx, event, agent);

  return (
    <div
      className="modal-backdrop"
      id="eventModal"
      onClick={(e) => { if (e.target === e.currentTarget) legacyCloseEvent(); }}
    >
      <section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <button className="modal-close" aria-label="Close event detail" onClick={() => legacyCloseEvent()}>Close</button>
        <div className="receipt-hero">
          <div className="receipt-title">
            <span className="lock-kicker">{agentTitle(agent)} / {event.time}</span>
            <h2 id="modalTitle">{model.title}</h2>
            <p>{model.summary}</p>
          </div>
        </div>

        <div className="trade-breakdown" aria-label="Trade breakdown">
          <div><label>Trade</label><strong>{model.action}</strong></div>
          <div><label>Direction</label><strong>{model.direction}</strong></div>
          <div><label>Venue</label><strong>{model.venue}</strong></div>
        </div>

        <div className="receipt-body">
          <div className="reason-panel">
            <h3>Why</h3>
            <p>{event.reason}</p>
            <span>{model.receipt}</span>
          </div>
        </div>

        <section className="comment-panel" aria-labelledby="modalCommentsTitle">
          <div>
            <h3 id="modalCommentsTitle">Comments</h3>
            <p>Not available yet. Ships later.</p>
          </div>
        </section>
      </section>
    </div>
  );
}
