import type { LegacyAgent } from "../../lib/key-market-types";
import { agentTitle } from "../../lib/key-market-selectors";

const ACCENTS = ["#63d8bd", "#69a7f5", "#e2b35e", "#76c989", "#e48169", "#aab6c5"];

function hashName(name: string) {
  return [...name].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
}

/**
 * Deterministic generated agent icon. Ported from the legacy `agentIcon` string
 * builder; same hash, accents, geometry, and initials so icons are identical.
 */
export function AgentIcon({ agent }: { agent: LegacyAgent }) {
  const title = String(agentTitle(agent));
  const hash = hashName(title);
  const accent = ACCENTS[hash % ACCENTS.length];
  const accentTwo = ACCENTS[(hash >>> 5) % ACCENTS.length];
  const rotation = hash % 360;
  const cut = 19 + (hash % 7);
  const id = `agent-${hash.toString(36)}`;

  return (
    <svg className="agent-icon" viewBox="0 0 64 64" role="img" aria-label={`${title} generated icon`}>
      <defs>
        <radialGradient id={`${id}-bg`} cx="30%" cy="20%" r="85%">
          <stop offset="0" stopColor="#353a40" />
          <stop offset="0.48" stopColor="#181b1f" />
          <stop offset="1" stopColor="#08090b" />
        </radialGradient>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={accent} stopOpacity=".95" />
          <stop offset="1" stopColor={accentTwo} stopOpacity=".38" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="31" fill={`url(#${id}-bg)`} stroke="#fff" strokeOpacity=".15" />
      <g transform={`rotate(${rotation} 32 32)`}>
        <path
          d={`M32 8 L${56 - cut / 3} ${cut} L56 42 L32 56 L8 42 L${8 + cut / 3} ${cut} Z`}
          fill="none"
          stroke={`url(#${id}-metal)`}
          strokeWidth="1.5"
          strokeOpacity=".8"
        />
        <circle cx="32" cy="9" r="2" fill={accent} />
        <circle cx="53" cy="39" r="1.5" fill={accentTwo} />
      </g>
      <circle cx="32" cy="32" r="18" fill="#0d0f12" stroke="#fff" strokeOpacity=".1" />
      <text x="32" y="36.5" textAnchor="middle" fill="#f7f8fa" fontFamily="system-ui, sans-serif" fontSize="13" fontWeight="800" letterSpacing=".7">
        {agent.initials as string}
      </text>
      <path d="M20 45 Q32 51 44 45" fill="none" stroke={accent} strokeWidth="1.4" strokeLinecap="round" opacity=".75" />
    </svg>
  );
}
