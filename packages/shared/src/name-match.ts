import { normName } from "./keys.js";

export type DirectoryUserLite = {
  username: string;
  displayName: string;
  givenName?: string | null;
  surname?: string | null;
  searchName: string;
};

export type SuggestedUser = {
  username: string;
  displayName: string;
  score: number;
  ambiguous: boolean;
};

function tokenize(s: string): string[] {
  return normName(s)
    .split(" ")
    .filter((t) => t.length > 0);
}

function tokenScore(query: string, candidate: string): number {
  if (query === candidate) return 1;
  const shorter = query.length <= candidate.length ? query : candidate;
  const longer = query.length <= candidate.length ? candidate : query;
  if (shorter.length >= 3 && longer.startsWith(shorter)) return 0.7;
  if (query.length <= 2 && candidate.startsWith(query)) return 0.5;
  return 0;
}

export function suggestDirectoryUsers(
  assignedTo: string,
  users: DirectoryUserLite[],
  limit = 5,
): SuggestedUser[] {
  const queryTokens = tokenize(assignedTo).filter((t) => t.length > 1 || t.length === 1);
  if (queryTokens.length === 0) return [];

  const scored = users
    .map((user) => {
      const candidateTokens = tokenize(user.searchName || user.displayName);
      if (candidateTokens.length === 0) return null;
      let total = 0;
      for (const q of queryTokens) {
        let best = 0;
        for (const c of candidateTokens) {
          const s = tokenScore(q, c);
          if (s > best) best = s;
          if (best === 1) break;
        }
        total += best;
      }
      const score = total / queryTokens.length;
      return score >= 0.6
        ? { username: user.username, displayName: user.displayName, score }
        : null;
    })
    .filter((r): r is { username: string; displayName: string; score: number } => r !== null);

  scored.sort((a, b) => (b.score - a.score) || a.displayName.localeCompare(b.displayName));
  const top = scored.slice(0, limit);
  const maxScore = top.length > 0 ? top[0].score : 0;
  const tied = top.filter((r) => r.score === maxScore).length >= 2;

  return top.map((r) => ({ ...r, ambiguous: tied && r.score === maxScore }));
}
