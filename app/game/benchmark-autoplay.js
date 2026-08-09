export function lungBenchmarkDirection({ playerX, playerY, velocityX, velocityY, targetX, targetY }) {
	const tx = targetX - playerX;
	const ty = targetY - playerY;
	const distance = Math.hypot(tx, ty);
	const speed = Math.hypot(velocityX, velocityY);

	// Lung attacks travel in the movement direction. Keep flying through a nearby
	// target instead of orbiting it or instantly reversing after contact.
	if (distance < 72 && speed > 1) return { dx: velocityX / speed, dy: velocityY / speed };

	const length = distance || 1;
	return { dx: tx / length, dy: ty / length };
}
