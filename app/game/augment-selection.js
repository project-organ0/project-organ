const TIER_ORDER = [1, 2, 3, 4];

export function createAugmentCatalog(entries) {
  return new Map(entries.map(entry => [entry.id, entry]));
}

export function getAugmentBranch(catalog, id) {
  const entry = catalog.get(id);
  return entry?.parent ?? id;
}

export function isAugmentUnlocked(catalog, acquiredCards, id) {
  const parent = catalog.get(id)?.parent;
  return !parent || acquiredCards.includes(parent);
}

export function getTierBand(state, config) {
  const [middleLevel, lateLevel, finalLevel] = config.tierSystem.levelThresholds;
  if (state.stage >= 3 || state.level >= finalLevel) return "final";
  if (state.stage >= 2 || state.level >= lateLevel) return "late";
  if (state.stage >= 1 || state.level >= middleLevel) return "middle";
  return "awakened";
}

export function getAugmentOfferWeight(state, card, catalog, config) {
  const branch = getAugmentBranch(catalog, card.id);
  const sameBranch = state.acquiredCards.some(id => getAugmentBranch(catalog, id) === branch);
  const weights = config.branchWeighting;
  const softened = state.lastAugmentBranch === branch && state.augmentBranchStreak >= weights.softenAfterConsecutivePicks;
  const branchWeight = sameBranch ? (softened ? weights.softenedSameBranch : weights.sameBranch) : 1;
  const levelWeight = (state.cardLevels[card.id] || 0) > 0 ? weights.ownedCardLevelUp : 1;
  return Math.min(weights.combinedCap, branchWeight * levelWeight);
}

export function getAvailableAugments({ state, cards, catalog, excluded = new Set(), weakestTier = 4 }) {
  return cards.filter(card => card.main === state.mainClass
    && (state.cardLevels[card.id] || 0) < card.maxLevel
    && isAugmentUnlocked(catalog, state.acquiredCards, card.id)
    && card.tier <= weakestTier
    && !excluded.has(card.id));
}

export function pickTieredAugment({ state, cards, catalog, config, excluded = new Set(), weakestTier = 4, random = Math.random }) {
  const candidates = getAvailableAugments({ state, cards, catalog, excluded, weakestTier });
  if (!candidates.length) return undefined;

  const chances = config.tierSystem.chances[getTierBand(state, config)];
  const tierCounts = TIER_ORDER.map(tier => candidates.filter(card => card.tier === tier).length);
  const weights = candidates.map(card => chances[card.tier - 1]
    / Math.max(1, tierCounts[card.tier - 1])
    * getAugmentOfferWeight(state, card, catalog, config));
  const total = weights.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    const fallbackWeights = candidates.map(card => getAugmentOfferWeight(state, card, catalog, config));
    return pickWeighted(candidates, fallbackWeights, random);
  }
  return pickWeighted(candidates, weights, random);
}

export function recordAugmentPick(state, catalog, id) {
  const branch = getAugmentBranch(catalog, id);
  if (state.lastAugmentBranch === branch) state.augmentBranchStreak++;
  else {
    state.lastAugmentBranch = branch;
    state.augmentBranchStreak = 1;
  }
}

function pickWeighted(items, weights, random) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  let roll = random() * total;
  for (let index = 0; index < items.length; index++) {
    roll -= weights[index];
    if (roll <= 0) return items[index];
  }
  return items[items.length - 1];
}
