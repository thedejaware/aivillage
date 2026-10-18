/** Texts for the inspector's Popularity and Friends rows, and their ⓘ tips. */

/** Rank among all villagers, e.g. "#5 of 10" (#1 = most liked). */
export function popularityText(rank: number, villagerCount: number): string {
  return rank > 0 && villagerCount > 0 ? `#${rank} of ${villagerCount}` : "—";
}

export function popularityTip(name: string): string {
  return (
    `How much the other twins like ${name}, compared with everyone else (#1 = most liked). ` +
    `To climb: chat, bond at the lawn or the café, and do activities together. ` +
    `You can ask: "go chat with Sena" or "take Grace to the cinema".`
  );
}

/** e.g. "5 liked · 1 rival" */
export function friendsText(liked: number, rivals: number): string {
  return `${liked} liked · ${rivals} rival${rivals === 1 ? "" : "s"}`;
}

export function friendsTip(name: string): string {
  return (
    `Liked: twins ${name} likes. Rivals: twins ${name} dislikes. ` +
    `Feelings change with every chat and activity.`
  );
}
