import assert from "node:assert/strict";
import test from "node:test";
import { lungBenchmarkDirection } from "../app/game/benchmark-autoplay.js";

test("lung autoplay moves directly toward a distant target", () => {
	const direction = lungBenchmarkDirection({
		playerX: 100,
		playerY: 100,
		velocityX: 0,
		velocityY: 0,
		targetX: 400,
		targetY: 100,
	});

	assert.deepEqual(direction, { dx: 1, dy: 0 });
});

test("lung autoplay keeps moving through a nearby target", () => {
	const direction = lungBenchmarkDirection({
		playerX: 100,
		playerY: 100,
		velocityX: 0,
		velocityY: 240,
		targetX: 110,
		targetY: 100,
	});

	assert.deepEqual(direction, { dx: 0, dy: 1 });
});
