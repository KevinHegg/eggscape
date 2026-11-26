/** Every three-machine cart, driven by the steady pilot: `npx tsx scripts/builds.ts`. */
import { idle, play, steady } from "../src/sim/autoplay";
import { PART_IDS, type PartId } from "../src/sim/parts";

const none = await play(["lever", "plane", "wedge"], idle);
console.log(`idle        ${none.phase.padEnd(6)} d=${none.distance.toFixed(0)} shell=${none.shell.toFixed(0)}`);
for (let a = 0; a < PART_IDS.length; a += 1) {
  for (let b = a + 1; b < PART_IDS.length; b += 1) {
    for (let c = b + 1; c < PART_IDS.length; c += 1) {
      const build = [PART_IDS[a]!, PART_IDS[b]!, PART_IDS[c]!] as PartId[];
      const out = await play(build, steady);
      console.log(`${build.join("+").padEnd(22)} ${out.phase.padEnd(6)} ${"*".repeat(out.stars).padEnd(3)} t=${out.time.toFixed(1)} shell=${out.shell.toFixed(0).padStart(3)} men=${out.men} d=${out.distance.toFixed(0)} ${out.cause ?? ""}`);
    }
  }
}
