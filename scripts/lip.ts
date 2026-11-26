/** The crossing, step by step: is the fallen tower flush with both banks? `npx tsx scripts/lip.ts` */
import { driver } from "../src/sim/autoplay";
import { Game } from "../src/sim/game";

const game = await Game.create();
const pilot = driver();
let worst = 0;
while (!game.over && game.distance < 100) {
  const before = game.speed;
  game.step(pilot(game));
  const d = game.distance;
  if (d > 76 && d < 96) {
    worst = Math.max(worst, game.jolt);
    if (game.tick % 4 === 0 || game.jolt > 0.4) console.log(`d=${d.toFixed(2)} y=${game.position.y.toFixed(2)} v=${game.speed.toFixed(2)} dv=${(game.speed - before).toFixed(2)} jolt=${game.jolt.toFixed(2)} brake=${game.braking} grounded=${game.grounded} shell=${game.shell.toFixed(0)}`);
  }
}
console.log(`worst jolt on the crossing ${worst.toFixed(2)} m/s (hurts above 0.55 after the springs)`);
