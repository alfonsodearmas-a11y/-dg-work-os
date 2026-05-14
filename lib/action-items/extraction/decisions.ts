// Pure helper used by the review submit endpoint to enforce that every
// extracted item has an explicit accept/reject before the extraction is
// closed. Prior version silently treated missing entries as rejections;
// see route header for the incident.

export function findUndecidedIndices(
  itemCount: number,
  decisions: ReadonlyArray<{ index: number }>,
): number[] {
  const decided = new Set(decisions.map(d => d.index));
  const out: number[] = [];
  for (let i = 0; i < itemCount; i++) if (!decided.has(i)) out.push(i);
  return out;
}
