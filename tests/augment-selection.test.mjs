import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createAugmentCatalog,
  getAugmentBranch,
  getAugmentOfferWeight,
  getAvailableAugments,
  getTierBand,
  recordAugmentPick,
} from "../app/game/augment-selection.js";

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const entries = await readJson("../app/game/augment-catalog.json");
const config = await readJson("../app/game/augment-balance.json");
const catalog = createAugmentCatalog(entries);
const cards = entries.map(entry => ({ ...entry, maxLevel: 3 }));

const makeState = overrides => ({
  mainClass: "brain",
  stage: 0,
  level: 3,
  acquiredCards: [],
  cardLevels: {},
  lastAugmentBranch: null,
  augmentBranchStreak: 0,
  ...overrides,
});

test("catalog contains four augments for every class", () => {
  assert.equal(entries.length, 20);
  for (const main of ["heart", "brain", "liver", "lung", "muscle"]) {
    assert.equal(entries.filter(entry => entry.main === main).length, 4);
  }
  assert.equal(new Set(entries.map(entry => entry.id)).size, 20);
});

test("children unlock only after their parent is acquired", () => {
  const locked = getAvailableAugments({ state: makeState(), cards, catalog });
  assert.deepEqual(locked.map(card => card.id).sort(), ["brain_focus", "brain_frenzy"]);

  const unlocked = getAvailableAugments({
    state: makeState({ acquiredCards: ["brain_focus"], cardLevels: { brain_focus: 1 } }),
    cards,
    catalog,
  });
  assert.ok(unlocked.some(card => card.id === "brain_chain"));
  assert.equal(getAugmentBranch(catalog, "brain_chain"), "brain_focus");
});

test("stage or level advances the tier probability band", () => {
  assert.equal(getTierBand(makeState(), config), "awakened");
  assert.equal(getTierBand(makeState({ level: 6 }), config), "middle");
  assert.equal(getTierBand(makeState({ stage: 2, level: 2 }), config), "late");
  assert.equal(getTierBand(makeState({ stage: 3, level: 2 }), config), "final");
});

test("same branch weighting grows, caps, and softens after repeated picks", () => {
  const card = cards.find(entry => entry.id === "brain_chain");
  const state = makeState({
    acquiredCards: ["brain_focus"],
    cardLevels: { brain_chain: 1 },
    lastAugmentBranch: "brain_focus",
    augmentBranchStreak: 1,
  });
  assert.equal(getAugmentOfferWeight(state, card, catalog, config), 1.5);

  recordAugmentPick(state, catalog, "brain_chain");
  assert.equal(state.augmentBranchStreak, 2);
  assert.ok(Math.abs(getAugmentOfferWeight(state, card, catalog, config) - 1.3225) < 1e-10);

  recordAugmentPick(state, catalog, "brain_frenzy");
  assert.equal(state.lastAugmentBranch, "brain_frenzy");
  assert.equal(state.augmentBranchStreak, 1);
});
