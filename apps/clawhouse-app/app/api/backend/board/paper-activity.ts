export function paperAccountIdForBoard(board: unknown, paperLeaderboard: unknown, boardId: string) {
  const rows = arrayField(recordField(paperLeaderboard), "leaderboard");
  if (!rows.length) return null;
  const direct = rows.find((row) => stringField(recordField(row), "paper_account_id") === boardId);
  if (direct) return stringField(recordField(direct), "paper_account_id");

  const agentId = stringField(recordField(board), "agent_id");
  if (!agentId) return null;
  const agentRows = rows.filter((row) => stringField(recordField(row), "agent_id") === agentId);
  return agentRows.length === 1 ? stringField(recordField(agentRows[0]), "paper_account_id") : null;
}

function recordField(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
