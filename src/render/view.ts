import * as pc from "playcanvas";
import { courseEnd, heightAt, type CourseDef } from "../sim/course";
import { MAX_MEN, type Game, type GameEvent, type Prop, type Tower, type Vec3 } from "../sim/game";
import type { PartId } from "../sim/parts";

type Triple = readonly [number, number, number];
type Shape = "box" | "sphere" | "cylinder" | "cone" | "capsule";

/** An illuminated manuscript's paint box: vellum, lapis, vermilion, verdigris and gold leaf. */
const INK = {
  vellum: new pc.Color(0.93, 0.87, 0.72),
  vellumDark: new pc.Color(0.82, 0.74, 0.56),
  lapis: new pc.Color(0.14, 0.26, 0.6),
  vermilion: new pc.Color(0.82, 0.2, 0.12),
  verdigris: new pc.Color(0.22, 0.5, 0.42),
  gold: new pc.Color(0.93, 0.68, 0.14),
  ink: new pc.Color(0.11, 0.08, 0.07),
  road: new pc.Color(0.66, 0.6, 0.5),
  roadDark: new pc.Color(0.56, 0.5, 0.41),
  kerb: new pc.Color(0.42, 0.37, 0.32),
  grass: new pc.Color(0.5, 0.6, 0.3),
  grassDark: new pc.Color(0.36, 0.48, 0.25),
  oak: new pc.Color(0.52, 0.33, 0.16),
  oakDark: new pc.Color(0.33, 0.2, 0.1),
  iron: new pc.Color(0.2, 0.2, 0.22),
  stone: new pc.Color(0.6, 0.58, 0.54),
  egg: new pc.Color(0.98, 0.94, 0.83),
  yolk: new pc.Color(1, 0.72, 0.1),
  hay: new pc.Color(0.92, 0.76, 0.32),
  hen: new pc.Color(0.99, 0.97, 0.92),
  skin: new pc.Color(0.86, 0.66, 0.5),
  oil: new pc.Color(0.17, 0.12, 0.16),
  danger: new pc.Color(0.9, 0.12, 0.08),
  blast: new pc.Color(1, 0.55, 0.1),
};

interface Puff {
  entity: pc.Entity;
  life: number;
  total: number;
  velocity: pc.Vec3;
  size: number;
}

interface Arrow {
  entity: pc.Entity;
  from: pc.Vec3;
  to: pc.Vec3;
  t: number;
  blocked: boolean;
}

interface TowerLook {
  root: pc.Entity;
  arm: pc.Entity | null;
  load: pc.Entity | null;
  archers: pc.Entity[];
  fallen: number;
  swing: number;
}

/** PlayCanvas presentation. It reads the simulation and never writes it. */
export class View {
  readonly app: pc.Application;
  private readonly canvas: HTMLCanvasElement;
  private readonly materials = new Map<string, pc.StandardMaterial>();
  private readonly camera: pc.Entity;
  private scene: pc.Entity;
  private scenery = 0;

  private cart: pc.Entity | null = null;
  private king: pc.Entity | null = null;
  private kingArms: pc.Entity[] = [];
  private cracks: pc.Entity[] = [];
  private wheels: Array<{ pivot: pc.Entity; hub: pc.Entity }> = [];
  private men: pc.Entity[] = [];
  private bales: pc.Entity[] = [];
  private parts = new Map<PartId, pc.Entity>();
  private props = new Map<number, pc.Entity>();
  private markers = new Map<number, { ring: pc.Entity; core: pc.Entity }>();
  private towers = new Map<string, TowerLook>();
  private pickups = new Map<number, pc.Entity>();
  private hen: { root: pc.Entity; head: pc.Entity; wings: pc.Entity[] } | null = null;
  private yolk: pc.Entity | null = null;
  private puffs: Puff[] = [];
  private pool: pc.Entity[] = [];
  private arrows: Arrow[] = [];

  private wobble = new pc.Vec3();
  private wobbleSpeed = new pc.Vec3();
  private shake = 0;
  private clock = 0;
  private eye = new pc.Vec3(0, 12, 14);
  private gaze = new pc.Vec3(0, 0, -8);
  private snap = true;
  /** "preview" circles the cart for the build screen; "run" chases it down the hill. */
  mode: "run" | "preview" = "run";

  constructor(host: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-label", "The Great Eggscape");
    host.replaceChildren(this.canvas);
    this.app = new pc.Application(this.canvas, {
      mouse: new pc.Mouse(this.canvas),
      touch: new pc.TouchDevice(this.canvas),
      graphicsDeviceOptions: { antialias: true, alpha: false, powerPreference: "high-performance" },
    });
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    const handheld = matchMedia("(pointer: coarse)").matches;
    this.app.graphicsDevice.maxPixelRatio = Math.max(1, Math.min(window.devicePixelRatio, handheld ? 1.5 : 2));
    this.app.scene.ambientLight = new pc.Color(0.62, 0.58, 0.5);
    this.app.scene.exposure = 1.05;
    const fog = (this.app.scene as unknown as { fog?: { type: string; color: pc.Color; start: number; end: number } }).fog;
    if (fog) {
      fog.type = pc.FOG_LINEAR;
      fog.color = INK.vellum;
      fog.start = 70;
      fog.end = 190;
    }
    this.scenery = this.app.batcher.addGroup("scenery", false, 400).id;

    this.camera = new pc.Entity("camera");
    this.camera.addComponent("camera", { clearColor: INK.vellum, nearClip: 0.3, farClip: 260, fov: 50 });
    this.app.root.addChild(this.camera);

    const key = new pc.Entity("key");
    key.setEulerAngles(52, 32, 0);
    key.addComponent("light", {
      type: "directional",
      color: new pc.Color(1, 0.93, 0.78),
      intensity: 1.5,
      castShadows: true,
      shadowDistance: 70,
      shadowResolution: handheld ? 1024 : 2048,
      shadowBias: 0.25,
      normalOffsetBias: 0.05,
    });
    this.app.root.addChild(key);

    this.scene = new pc.Entity("scene");
    this.app.root.addChild(this.scene);
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.app.start();
  }

  resize(): void {
    this.app.resizeCanvas();
    const component = this.camera.camera;
    if (!component) return;
    const portrait = this.canvas.clientHeight > this.canvas.clientWidth;
    // On a phone the width is what's scarce: fix the view across the road.
    component.horizontalFov = portrait;
    component.fov = portrait ? 46 : 52;
  }

  // ---------------------------------------------------------------- building blocks

  private paint(name: string, color: pc.Color, options: { gloss?: number; glow?: number; opacity?: number } = {}): pc.StandardMaterial {
    const existing = this.materials.get(name);
    if (existing) return existing;
    const material = new pc.StandardMaterial();
    material.name = name;
    material.diffuse = color;
    material.gloss = options.gloss ?? 0.15;
    material.metalness = 0;
    material.useMetalness = true;
    if (options.glow) material.emissive = new pc.Color(color.r * options.glow, color.g * options.glow, color.b * options.glow);
    if (options.opacity !== undefined) {
      material.opacity = options.opacity;
      material.blendType = pc.BLEND_NORMAL;
      material.depthWrite = false;
    }
    material.update();
    this.materials.set(name, material);
    return material;
  }

  private get m() {
    return {
      road: this.paint("road", INK.road),
      roadDark: this.paint("road-dark", INK.roadDark),
      kerb: this.paint("kerb", INK.kerb),
      grass: this.paint("grass", INK.grass),
      grassDark: this.paint("grass-dark", INK.grassDark),
      oak: this.paint("oak", INK.oak),
      oakDark: this.paint("oak-dark", INK.oakDark),
      iron: this.paint("iron", INK.iron, { gloss: 0.5 }),
      stone: this.paint("stone", INK.stone),
      egg: this.paint("egg", INK.egg, { gloss: 0.6 }),
      yolk: this.paint("yolk", INK.yolk, { gloss: 0.7, glow: 0.25 }),
      hay: this.paint("hay", INK.hay),
      hen: this.paint("hen", INK.hen, { gloss: 0.2 }),
      gold: this.paint("gold", INK.gold, { gloss: 0.8, glow: 0.3 }),
      lapis: this.paint("lapis", INK.lapis),
      vermilion: this.paint("vermilion", INK.vermilion),
      verdigris: this.paint("verdigris", INK.verdigris),
      ink: this.paint("ink", INK.ink),
      skin: this.paint("skin", INK.skin),
      vellum: this.paint("vellum", INK.vellumDark),
      oil: this.paint("oil", INK.oil, { gloss: 0.95 }),
      danger: this.paint("danger", INK.danger, { glow: 0.7, opacity: 0.35 }),
      dangerCore: this.paint("danger-core", INK.danger, { glow: 0.9, opacity: 0.6 }),
      blast: this.paint("blast", INK.blast, { glow: 1 }),
      dust: this.paint("dust", INK.vellum, { glow: 0.2 }),
    };
  }

  private group(name: string, parent: pc.Entity, position: Triple = [0, 0, 0], euler: Triple = [0, 0, 0]): pc.Entity {
    const entity = new pc.Entity(name);
    entity.setLocalPosition(position[0], position[1], position[2]);
    entity.setLocalEulerAngles(euler[0], euler[1], euler[2]);
    parent.addChild(entity);
    return entity;
  }

  private shape(type: Shape, parent: pc.Entity, position: Triple, scale: Triple, material: pc.StandardMaterial, euler: Triple = [0, 0, 0], fixed = false): pc.Entity {
    const entity = new pc.Entity(type);
    entity.setLocalPosition(position[0], position[1], position[2]);
    entity.setLocalScale(scale[0], scale[1], scale[2]);
    entity.setLocalEulerAngles(euler[0], euler[1], euler[2]);
    entity.addComponent("render", { type, material, castShadows: true, receiveShadows: true, batchGroupId: fixed ? this.scenery : -1 });
    parent.addChild(entity);
    return entity;
  }

  private figure(parent: pc.Entity, position: Triple, coat: pc.StandardMaterial, fixed = false): pc.Entity {
    const root = this.group("figure", parent, position);
    this.shape("box", root, [0, 0.26, 0], [0.3, 0.44, 0.22], coat, [0, 0, 0], fixed);
    this.shape("sphere", root, [0, 0.6, 0], [0.26, 0.26, 0.26], this.m.skin, [0, 0, 0], fixed);
    this.shape("cone", root, [0, 0.76, 0], [0.3, 0.2, 0.3], this.m.iron, [0, 0, 0], fixed);
    return root;
  }

  // ---------------------------------------------------------------- the stage for one run

  load(game: Game): void {
    this.scene.destroy();
    this.scene = new pc.Entity("scene");
    this.app.root.addChild(this.scene);
    this.props.clear();
    this.markers.clear();
    this.towers.clear();
    this.pickups.clear();
    this.parts.clear();
    this.puffs = [];
    this.pool = [];
    this.arrows = [];
    this.men = [];
    this.bales = [];
    this.wheels = [];
    this.cracks = [];
    this.kingArms = [];
    this.yolk = null;
    this.wobble.set(0, 0, 0);
    this.wobbleSpeed.set(0, 0, 0);
    this.shake = 0;
    this.snap = true;

    this.buildCourse(game.course);
    for (const tower of game.towers) this.towers.set(tower.def.id, this.buildTower(tower));
    for (const pickup of game.pickups) {
      const root = this.group("pickup", this.scene, [pickup.pos.x, pickup.pos.y, pickup.pos.z]);
      if (pickup.kind === "hay") {
        this.shape("box", root, [0, 0.42, 0], [1.1, 0.75, 0.8], this.m.hay);
        this.shape("box", root, [0, 0.42, 0], [1.14, 0.1, 0.84], this.m.oakDark);
      } else if (pickup.kind === "man") {
        const man = this.figure(root, [0, 0, 0], this.m.vermilion);
        man.setLocalScale(1.5, 1.5, 1.5);
        this.shape("box", man, [0.24, 0.62, 0], [0.08, 0.36, 0.08], this.m.vermilion, [0, 0, -25]);
      } else {
        this.shape("cylinder", root, [0, 0.55, 0], [0.95, 1.1, 0.95], this.m.oak);
        this.shape("cylinder", root, [0, 0.55, 0], [1, 0.16, 1], this.m.vermilion);
        this.shape("cylinder", root, [0, 1.16, 0], [0.12, 0.3, 0.12], this.m.gold);
      }
      this.shape("cylinder", root, [0, 0.04, 0], [2.4, 0.03, 2.4], this.paint("pickup-ring", INK.gold, { glow: 0.6, opacity: 0.4 }));
      this.pickups.set(pickup.id, root);
    }
    this.buildCart(game);
    this.app.batcher.generate();
  }

  private buildCourse(course: CourseDef): void {
    const half = course.width / 2;
    const m = this.m;
    for (const piece of course.pieces) {
      const run = piece.d1 - piece.d0;
      const rise = piece.y1 - piece.y0;
      const length = Math.hypot(run, rise);
      const angle = Math.asin(rise / length);
      const degrees = (angle * 180) / Math.PI;
      const normal = { y: Math.cos(angle), z: Math.sin(angle) };
      const mid = { y: (piece.y0 + piece.y1) / 2, z: -(piece.d0 + piece.d1) / 2 };
      const tilt: Triple = [degrees, 0, 0];
      this.shape("box", this.scene, [0, mid.y - normal.y * 0.3, mid.z - normal.z * 0.3], [course.width + 1.2, 0.6, length], m.road, tilt, true);
      for (const side of [-1, 1]) {
        this.shape("box", this.scene, [side * (half + 0.3), mid.y + normal.y * 0.3, mid.z + normal.z * 0.3], [0.6, 0.9, length], m.kerb, tilt, true);
        this.shape("box", this.scene, [side * (half + 45.6), mid.y - normal.y * 0.5, mid.z - normal.z * 0.5], [90, 0.6, length + 0.4], m.grass, tilt, true);
      }
      // Cobble bands, so speed can be seen.
      for (let d = Math.ceil(piece.d0 / 6) * 6; d < piece.d1; d += 6) {
        this.shape("box", this.scene, [0, heightAt(course, d) + 0.012, -d], [course.width, 0.03, 0.5], m.roadDark, tilt, true);
      }
    }
    // Trees and standing stones down both verges.
    for (let d = 8; d < courseEnd(course) - 10; d += 9) {
      for (const side of [-1, 1]) {
        const jitter = Math.sin(d * 12.9898 + side * 78.233) * 43758.5453;
        const unit = jitter - Math.floor(jitter);
        const x = side * (half + 9 + unit * 26);
        const y = heightAt(course, d) - 0.2;
        const tall = 2.4 + unit * 2.6;
        this.shape("cylinder", this.scene, [x, y + 0.6, -d], [0.3, 1.2, 0.3], m.oakDark, [0, 0, 0], true);
        this.shape("cone", this.scene, [x, y + 1.1 + tall / 2, -d], [1.9, tall, 1.9], unit > 0.5 ? m.grassDark : m.verdigris, [0, 0, 0], true);
      }
    }
    for (const patch of course.oil) {
      const d = (patch.d0 + patch.d1) / 2;
      const slope = Math.atan2(heightAt(course, patch.d0) - heightAt(course, patch.d1), patch.d1 - patch.d0);
      const tilt: Triple = [(-slope * 180) / Math.PI, 0, 0];
      const wide = patch.x1 - patch.x0;
      const long = patch.d1 - patch.d0;
      const x = (patch.x0 + patch.x1) / 2;
      // A spill, not a slab: three pooled blots and a sheen.
      for (const [dx, dd, w, l] of [[0, 0, 1, 0.8], [-0.14, 0.24, 0.72, 0.5], [0.14, -0.24, 0.72, 0.5]] as const) {
        this.shape("cylinder", this.scene, [x + dx * wide, heightAt(course, d + dd * long) + 0.03, -(d + dd * long)], [wide * w, 0.03, long * l], m.oil, tilt, true);
      }
      this.shape("cylinder", this.scene, [x - wide * 0.12, heightAt(course, d - long * 0.1) + 0.05, -(d - long * 0.1)], [wide * 0.36, 0.02, long * 0.22], this.paint("oil-sheen", new pc.Color(0.5, 0.38, 0.56), { gloss: 0.95 }), tilt, true);
    }
    // The gate he flees from.
    const gate = this.group("gate", this.scene, [0, 0, 13]);
    this.shape("box", gate, [0, 4.5, 0], [16, 9, 2.4], m.stone, [0, 0, 0], true);
    this.shape("box", gate, [0, 2.2, -1.25], [4.4, 4.4, 0.2], m.ink, [0, 0, 0], true);
    for (const side of [-1, 1]) {
      this.shape("cylinder", gate, [side * 8.5, 6, 0], [4.4, 12, 4.4], m.stone, [0, 0, 0], true);
      this.shape("cone", gate, [side * 8.5, 14, 0], [5.2, 4.4, 5.2], m.vermilion, [0, 0, 0], true);
      this.shape("box", gate, [side * 4.6, 10.2, -1.3], [0.2, 4, 0.2], m.oakDark, [0, 0, 0], true);
      this.shape("box", gate, [side * 4.6 - side * 0.9, 11.2, -1.3], [1.7, 1.2, 0.06], m.verdigris, [0, 0, 0], true);
    }
    // Home: the finishing banner, the nest, and the Empress Hen.
    const lineY = heightAt(course, course.finish);
    for (const side of [-1, 1]) this.shape("cylinder", this.scene, [side * (half + 0.3), lineY + 3, -course.finish], [0.24, 6, 0.24], m.oakDark, [0, 0, 0], true);
    this.shape("box", this.scene, [0, lineY + 5.4, -course.finish], [course.width + 0.8, 1, 0.08], m.lapis, [0, 0, 0], true);
    this.shape("box", this.scene, [0, lineY + 4.8, -course.finish], [course.width + 0.8, 0.14, 0.1], m.gold, [0, 0, 0], true);

    const roostY = heightAt(course, course.roost);
    const roost = this.group("roost", this.scene, [0, roostY, -course.roost]);
    this.shape("cylinder", roost, [0, 0.35, 2.2], [9.5, 0.7, 7], m.oak, [0, 0, 0], true);
    this.shape("cylinder", roost, [0, 0.55, 2.2], [8.4, 0.7, 6], m.hay, [0, 0, 0], true);
    const hen = this.group("hen", roost, [0, 0.4, -1.6]);
    this.shape("sphere", hen, [0, 2.3, 0], [6, 4.8, 6.4], m.hen);
    this.shape("sphere", hen, [0, 3.2, -2.9], [2.2, 2.6, 2.8], m.hen, [-30, 0, 0]);
    const head = this.group("head", hen, [0, 5.3, 1.9]);
    this.shape("sphere", head, [0, 0, 0], [2.2, 2.3, 2.2], m.hen);
    this.shape("cone", head, [0, -0.1, 1.25], [0.7, 0.9, 0.7], m.gold, [90, 0, 0]);
    this.shape("sphere", head, [0, -0.75, 0.95], [0.4, 0.7, 0.36], m.vermilion);
    for (const side of [-1, 1]) this.shape("sphere", head, [side * 0.62, 0.3, 0.86], [0.26, 0.3, 0.2], m.ink);
    for (const [offset, tall] of [[-0.35, 0.6], [0.15, 0.8], [0.6, 0.55]] as const) this.shape("sphere", head, [0, 1.2, offset - 0.1], [0.34, tall, 0.5], m.vermilion);
    this.shape("cylinder", head, [0, 1.25, 0.45], [1.1, 0.22, 1.1], m.gold);
    for (let spike = 0; spike < 5; spike += 1) {
      const turn = (spike / 5) * Math.PI * 2;
      this.shape("cone", head, [Math.cos(turn) * 0.46, 1.52, 0.45 + Math.sin(turn) * 0.46], [0.2, 0.42, 0.2], m.gold);
    }
    const wings = [-1, 1].map((side) => {
      const wing = this.group("wing", hen, [side * 2.8, 2.6, 0.2]);
      this.shape("sphere", wing, [side * 0.5, -0.2, 0], [1.6, 3, 4.2], m.hen, [0, 0, side * -12]);
      return wing;
    });
    this.hen = { root: hen, head, wings };
  }

  private buildTower(tower: Tower): TowerLook {
    const m = this.m;
    const root = this.group("tower", this.scene, [tower.pos.x, tower.pos.y - 0.2, tower.pos.z]);
    const side = tower.def.side;
    if (tower.def.kind === "mangonel") {
      this.shape("box", root, [0, 0.35, 0], [3, 0.7, 3], m.stone);
      for (const z of [-0.9, 0.9]) {
        this.shape("box", root, [0.5 * side, 1.9, z], [0.24, 3, 0.24], m.oak, [0, 0, side * 16]);
        this.shape("box", root, [-0.5 * side, 1.9, z], [0.24, 3, 0.24], m.oak, [0, 0, side * -16]);
      }
      this.shape("cylinder", root, [0, 3.2, 0], [0.3, 2.2, 0.3], m.iron, [90, 0, 0]);
      const arm = this.group("arm", root, [0, 3.2, 0]);
      this.shape("box", arm, [0, 1.3, 0], [0.2, 3.8, 0.2], m.oakDark);
      this.shape("box", arm, [0, -0.9, 0], [0.7, 0.7, 0.7], m.iron);
      this.shape("cylinder", arm, [0, 3.2, 0], [0.9, 0.2, 0.9], m.oak);
      const load = this.shape("sphere", arm, [0, 3.55, 0], [0.84, 0.84, 0.84], m.stone);
      this.shape("box", root, [1.3 * side, 2.6, 1.2], [0.1, 4.4, 0.1], m.oakDark);
      this.shape("box", root, [1.3 * side, 4.3, 0.7], [0.06, 0.9, 1], m.vermilion);
      return { root, arm, load, archers: [], fallen: 0, swing: 0 };
    }
    this.shape("cylinder", root, [0, 2.2, 0], [3, 4.4, 3], m.stone);
    this.shape("cylinder", root, [0, 4.6, 0], [3.5, 0.5, 3.5], m.kerb);
    this.shape("cone", root, [0, 7.2, 0], [1.2, 2.2, 1.2], m.lapis);
    this.shape("cylinder", root, [0, 5.6, 0], [0.16, 2, 0.16], m.oakDark);
    const archers = [-0.8, 0, 0.8].map((z) => {
      const archer = this.figure(root, [-side * 1.1, 4.8, z], m.lapis);
      archer.setLocalScale(1.3, 1.3, 1.3);
      this.shape("box", archer, [-side * 0.2, 0.36, 0], [0.05, 0.6, 0.05], m.oakDark);
      return archer;
    });
    return { root, arm: null, load: null, archers, fallen: 0, swing: 0 };
  }

  private buildCart(game: Game): void {
    const m = this.m;
    const cart = this.group("cart", this.scene);
    this.cart = cart;
    this.shape("box", cart, [0, 0, 0], [1.4, 0.4, 2.3], m.oak);
    this.shape("box", cart, [0, 0.24, 0], [1.5, 0.08, 2.4], m.oakDark);
    for (const side of [-1, 1]) this.shape("box", cart, [side * 0.72, 0.42, 0], [0.08, 0.3, 2.3], m.vermilion);
    this.shape("box", cart, [0, 0.42, 1.14], [1.44, 0.3, 0.08], m.vermilion);
    for (let index = 0; index < 4; index += 1) {
      const pivot = this.group("wheel", cart);
      const hub = this.group("hub", pivot);
      this.shape("cylinder", hub, [0, 0, 0], [0.8, 0.16, 0.8], m.oakDark, [0, 0, 90]);
      this.shape("cylinder", hub, [0, 0, 0], [0.86, 0.1, 0.86], m.iron, [0, 0, 90]);
      this.shape("box", hub, [0, 0, 0], [0.2, 0.7, 0.1], m.gold);
      this.shape("box", hub, [0, 0, 0], [0.2, 0.1, 0.7], m.gold);
      this.wheels.push({ pivot, hub });
    }

    // The Egg King rides facing backwards, so he can see what's coming for him. So can you.
    const king = this.group("king", cart, [0, 0.28, 0.15]);
    this.king = king;
    this.shape("cylinder", king, [0, 0.08, 0], [0.7, 0.16, 0.7], m.lapis);
    this.shape("sphere", king, [0, 0.62, 0], [0.86, 1.06, 0.86], m.egg);
    this.shape("cylinder", king, [0, 0.42, 0], [0.9, 0.12, 0.9], m.vermilion);
    this.shape("box", king, [0, 0.42, 0.44], [0.16, 0.16, 0.06], m.gold);
    for (const side of [-1, 1]) {
      this.shape("sphere", king, [side * 0.15, 0.78, 0.36], [0.12, 0.15, 0.08], m.ink);
      this.shape("box", king, [side * 0.16, 0.92, 0.35], [0.16, 0.035, 0.05], m.ink, [0, 0, side * 16]);
      const arm = this.group("arm", king, [side * 0.42, 0.55, 0.05]);
      this.shape("box", arm, [side * 0.18, 0, 0], [0.36, 0.08, 0.08], m.egg);
      this.shape("sphere", arm, [side * 0.38, 0, 0], [0.14, 0.14, 0.14], m.egg);
      this.kingArms.push(arm);
    }
    this.shape("sphere", king, [0, 0.62, 0.4], [0.16, 0.07, 0.06], m.ink);
    this.shape("cylinder", king, [0, 1.16, 0], [0.42, 0.14, 0.42], m.gold);
    for (let spike = 0; spike < 5; spike += 1) {
      const turn = (spike / 5) * Math.PI * 2;
      this.shape("cone", king, [Math.cos(turn) * 0.17, 1.31, Math.sin(turn) * 0.17], [0.1, 0.2, 0.1], m.gold);
    }
    const crackAt: Array<[Triple, Triple, Triple]> = [
      [[0.12, 0.95, 0.3], [0.035, 0.3, 0.03], [0, 0, 28]],
      [[0.25, 0.83, 0.26], [0.035, 0.22, 0.03], [0, 0, -40]],
      [[-0.2, 0.62, 0.34], [0.035, 0.34, 0.03], [0, 0, -24]],
      [[-0.32, 0.5, 0.25], [0.035, 0.24, 0.03], [0, 0, 44]],
      [[0.02, 0.28, 0.36], [0.035, 0.3, 0.03], [0, 0, 62]],
    ];
    for (const [position, scale, euler] of crackAt) {
      const crack = this.shape("box", king, position, scale, m.ink, euler);
      crack.enabled = false;
      this.cracks.push(crack);
    }

    const posts: Triple[] = [[-0.52, 0.28, 0.9], [0.52, 0.28, 0.9], [-0.52, 0.28, -0.8]];
    for (const position of posts) this.men.push(this.figure(cart, position, m.vermilion));
    for (const side of [-1, 1]) {
      const bale = this.shape("box", cart, [side * 0.95, 0.2, 0.05], [0.4, 0.5, 0.9], m.hay);
      this.bales.push(bale);
    }

    for (const part of game.build) {
      const root = this.group(part, cart);
      this.parts.set(part, root);
      if (part === "lever") {
        root.setLocalPosition(0.58, 0.28, -0.78);
        this.shape("box", root, [0, 0.4, 0], [0.14, 0.8, 0.14], m.oakDark);
        const arm = this.group("swing", root, [0, 0.82, 0]);
        this.shape("box", arm, [0, 0, 0.75], [0.1, 0.1, 1.7], m.oak);
        this.shape("box", arm, [0, 0, 1.6], [0.14, 0.5, 0.5], m.gold);
      } else if (part === "wedge") {
        root.setLocalPosition(0, 0.05, -1.15);
        const prow = this.group("swing", root);
        for (const side of [-1, 1]) this.shape("box", prow, [side * 0.38, 0, -0.42], [1.05, 0.6, 0.1], m.iron, [0, side * -38, 0]);
        this.shape("box", prow, [0, 0.28, -0.76], [0.12, 0.12, 0.2], m.gold);
      } else if (part === "plane") {
        root.setLocalPosition(0, 0.28, -1.12);
        const plate = this.group("swing", root);
        this.shape("box", plate, [0, 0, 0.62], [1.6, 0.07, 1.24], m.lapis);
        this.shape("box", plate, [0, 0.045, 0.62], [1.2, 0.02, 0.9], m.gold);
      } else if (part === "pulley") {
        root.setLocalPosition(0, 0.28, 0.15);
        for (const side of [-1, 1]) this.shape("box", root, [side * 0.62, 1.05, 0], [0.1, 2.1, 0.1], m.oakDark);
        this.shape("box", root, [0, 2.1, 0], [1.4, 0.12, 0.12], m.oakDark);
        this.shape("cylinder", root, [0, 1.95, 0], [0.3, 0.1, 0.3], m.gold, [90, 0, 0]);
        this.shape("box", root, [0, 1.62, 0], [0.03, 0.6, 0.03], m.vellum);
      } else if (part === "screw") {
        root.setLocalPosition(0, 0.28, -0.52);
        this.shape("cylinder", root, [0, 0.75, 0], [0.08, 1.5, 0.08], m.oakDark);
        const spin = this.group("swing", root, [0, 1.1, 0]);
        for (const [y, wide, tilt] of [[0, 1.3, 14], [0.28, 0.95, -14], [0.54, 0.6, 14]] as const) {
          this.shape("cylinder", spin, [0, y, 0], [wide, 0.03, wide], m.vellum, [tilt, 0, tilt / 2]);
        }
      } else if (part === "wheel") {
        root.setLocalPosition(0, 0.72, 1.22);
        const spin = this.group("swing", root);
        this.shape("cylinder", spin, [0, 0, 0], [1.05, 0.12, 1.05], m.iron, [0, 0, 90]);
        this.shape("cylinder", spin, [0, 0, 0], [0.86, 0.14, 0.86], m.gold, [0, 0, 90]);
        this.shape("box", spin, [0, 0, 0], [0.16, 0.96, 0.1], m.iron);
      }
    }
  }

  // ---------------------------------------------------------------- every frame

  sync(game: Game, dt: number): void {
    this.clock += dt;
    const p = game.position;
    const q = game.rotation;
    const cart = this.cart;
    if (!cart) return;
    cart.setPosition(p.x, p.y, p.z);
    cart.setRotation(q.x, q.y, q.z, q.w);
    for (let index = 0; index < this.wheels.length; index += 1) {
      const wheel = game.wheel(index);
      const look = this.wheels[index]!;
      look.pivot.setLocalPosition(wheel.x, wheel.y, wheel.z);
      look.pivot.setLocalEulerAngles(0, (wheel.steer * 180) / Math.PI, 0);
      look.hub.setLocalEulerAngles((-wheel.spin * 180) / Math.PI, 0, 0);
    }

    // The King wobbles on a spring: knocked by every jolt, thrown by every lean.
    const kick = Math.min(3, game.jolt) * 9;
    this.wobbleSpeed.x += (Math.sin(this.clock * 31) * kick - this.wobble.x * 90 - this.wobbleSpeed.x * 7) * dt;
    this.wobbleSpeed.z += (Math.cos(this.clock * 27) * kick - game.lean * 520 - this.wobble.z * 90 - this.wobbleSpeed.z * 7) * dt;
    this.wobble.x += this.wobbleSpeed.x * dt;
    this.wobble.z += this.wobbleSpeed.z * dt;
    const braced = game.isActive("pulley");
    const broken = game.phase === "broken";
    const leap = game.phase === "won" ? Math.min(1, Math.max(0, (game.after - 0.9) / 0.9)) : 0;
    if (this.king) {
      this.king.enabled = !broken;
      const lift = braced ? 0.5 + Math.sin(this.clock * 9) * 0.04 : 0;
      const at = this.king.getLocalPosition();
      this.king.setLocalPosition(0, at.y + (0.28 + lift - at.y) * Math.min(1, dt * 14), 0.15);
      this.king.setLocalEulerAngles(clampDeg(this.wobble.x, 24), 0, clampDeg(this.wobble.z, 26));
      const panic = 20 + Math.min(60, game.speed * 2.5) + Math.sin(this.clock * 18) * (10 + game.stage * 12);
      this.kingArms.forEach((arm, index) => arm.setLocalEulerAngles(0, 0, (index === 0 ? -1 : 1) * panic));
      const shown = [0, 2, 4, 5][game.stage] ?? 5;
      this.cracks.forEach((crack, index) => (crack.enabled = index < shown));
      if (leap > 0) {
        const roostY = heightAt(game.course, game.course.roost);
        const from = cart.getPosition();
        const to = new pc.Vec3(0, roostY + 0.9, -game.course.roost + 5.2);
        const at = new pc.Vec3().lerp(from, to, leap);
        at.y += Math.sin(leap * Math.PI) * 3.4;
        this.king.setPosition(at);
        this.king.setEulerAngles(leap < 1 ? leap * 720 : 0, 180, 0);
      }
    }
    if (broken && !this.yolk) {
      this.yolk = this.group("yolk", cart, [0, 0.3, 0.15]);
      this.shape("cylinder", this.yolk, [0, 0, 0], [1.5, 0.05, 1.3], this.paint("albumen", new pc.Color(0.97, 0.95, 0.88), { gloss: 0.8 }));
      this.shape("sphere", this.yolk, [0.1, 0.1, 0], [0.6, 0.3, 0.6], this.m.yolk);
    }
    this.men.forEach((man, index) => {
      man.enabled = index < Math.min(MAX_MEN, game.men);
      man.setLocalEulerAngles(0, 0, -game.lean * 32);
    });
    this.bales.forEach((bale, index) => (bale.enabled = index < game.hay));
    this.syncParts(game, dt);
    this.syncProps(game);
    this.syncMarkers(game);
    this.syncTowers(game, dt);
    for (const pickup of game.pickups) {
      const look = this.pickups.get(pickup.id);
      if (!look) continue;
      look.enabled = !pickup.taken;
      look.setLocalEulerAngles(0, this.clock * 50, 0);
    }
    this.syncEffects(dt);
    if (this.hen) {
      const home = game.phase === "won";
      const settled = leap >= 1;
      const beat = home ? Math.sin(this.clock * (settled ? 3 : 9)) : Math.sin(this.clock * 1.6) * 0.2;
      this.hen.root.setLocalPosition(0, 0.4 + (home && !settled ? Math.abs(beat) * 0.5 : 0), settled ? -0.6 : -1.6);
      this.hen.head.setLocalEulerAngles(home ? 14 + beat * 10 : beat * 14, beat * 8, 0);
      this.hen.wings.forEach((wing, index) => wing.setLocalEulerAngles(0, 0, (index === 0 ? 1 : -1) * (home ? 35 + beat * 35 : 0)));
    }
    this.follow(game, dt);
  }

  private syncParts(game: Game, dt: number): void {
    for (const [part, root] of this.parts) {
      const state = game.machine(part);
      const swing = root.findByName("swing") as pc.Entity | null;
      if (!state || !swing) continue;
      const on = state.active > 0;
      if (part === "lever") swing.setLocalEulerAngles(0, on ? 90 - (1 - state.active / 0.3) * 330 : 90, 0);
      if (part === "wedge") ease(swing, on ? [0, -0.28, 0] : [0, 0.5, 0], on ? [0, 0, 0] : [-32, 0, 0], dt);
      if (part === "plane") ease(swing, [0, on ? 0.9 : 0, 0], on ? [-28, 0, 0] : [-76, 0, 0], dt);
      if (part === "screw") swing.rotateLocal(0, (on ? 1500 : 160) * dt, 0);
      if (part === "wheel") swing.rotateLocal((on ? -2200 : -500) * dt, 0, 0);
    }
  }

  private syncProps(game: Game): void {
    const alive = new Set<number>();
    for (const prop of game.props) {
      alive.add(prop.id);
      let look = this.props.get(prop.id);
      if (!look) {
        look = this.buildProp(prop);
        this.props.set(prop.id, look);
      }
      const p = prop.body.translation();
      const q = prop.body.rotation();
      look.setPosition(p.x, p.y, p.z);
      look.setRotation(q.x, q.y, q.z, q.w);
    }
    for (const [id, look] of this.props) {
      if (alive.has(id)) continue;
      look.destroy();
      this.props.delete(id);
    }
  }

  private buildProp(prop: Prop): pc.Entity {
    const m = this.m;
    const root = this.group(prop.kind, this.scene);
    const s = prop.size;
    if (prop.kind === "stone") this.shape("sphere", root, [0, 0, 0], [s.x * 2, s.x * 2, s.x * 2], m.stone);
    else if (prop.kind === "crate") {
      this.shape("box", root, [0, 0, 0], [s.x * 2, s.y * 2, s.z * 2], m.oak);
      this.shape("box", root, [0, 0, 0], [s.x * 2.04, 0.14, s.z * 2.04], m.oakDark);
    } else if (prop.kind === "man") {
      const man = this.figure(root, [0, -0.4, 0], m.vermilion);
      man.setLocalScale(1, 1, 1);
    } else if (prop.kind === "hay") this.shape("box", root, [0, 0, 0], [s.x * 2, s.y * 2, s.z * 2], m.hay);
    else if (prop.kind === "beam") this.shape("box", root, [0, 0, 0], [s.x * 2, s.y * 2, s.z * 2], m.oakDark);
    else {
      this.shape("sphere", root, [0, 0, 0], [0.8, 0.5, 0.8], m.egg);
      this.shape("sphere", root, [0, 0.08, 0], [0.5, 0.3, 0.5], m.yolk);
    }
    return root;
  }

  private syncMarkers(game: Game): void {
    const alive = new Set<number>();
    for (const marker of game.markers) {
      alive.add(marker.id);
      let look = this.markers.get(marker.id);
      if (!look) {
        const ring = this.shape("cylinder", this.scene, [marker.at.x, marker.at.y, marker.at.z], [3.2, 0.02, 3.2], this.m.danger);
        const core = this.shape("cylinder", this.scene, [marker.at.x, marker.at.y + 0.02, marker.at.z], [0.1, 0.02, 0.1], this.m.dangerCore);
        for (const entity of [ring, core]) if (entity.render) entity.render.castShadows = false;
        look = { ring, core };
        this.markers.set(marker.id, look);
      }
      const k = 1 - Math.max(0, marker.t) / marker.total;
      const size = 0.2 + k * 3;
      look.core.setLocalScale(size, 0.02, size);
    }
    for (const [id, look] of this.markers) {
      if (alive.has(id)) continue;
      look.ring.destroy();
      look.core.destroy();
      this.markers.delete(id);
    }
  }

  private syncTowers(game: Game, dt: number): void {
    for (const tower of game.towers) {
      const look = this.towers.get(tower.def.id);
      if (!look) continue;
      const side = tower.def.side;
      if (!tower.alive) {
        look.fallen = Math.min(1, look.fallen + dt * 1.4);
        const k = look.fallen * look.fallen;
        look.root.setLocalEulerAngles(0, 0, -side * k * 84);
        look.root.setLocalPosition(tower.pos.x + side * k * 1.5, tower.pos.y - 0.2 - k * 1.2, tower.pos.z);
        continue;
      }
      if (look.arm) {
        // Cocked back away from the road, then flung over towards it.
        look.swing = Math.max(0, look.swing - dt * 2.2);
        const cocked = tower.windup > 0 ? 1 - tower.windup / 0.85 : 0;
        const angle = tower.windup > 0 ? -cocked * 62 : look.swing * 70;
        look.arm.setLocalEulerAngles(0, 0, side * angle);
        if (look.load) look.load.enabled = tower.windup > 0;
      }
      const drawn = tower.windup > 0 ? 1 + Math.sin(this.clock * 30) * 0.08 : 1;
      for (const archer of look.archers) archer.setLocalScale(1.3 * drawn, 1.3 * (tower.windup > 0 ? 1.25 : 1), 1.3 * drawn);
    }
  }

  private syncEffects(dt: number): void {
    for (let index = this.puffs.length - 1; index >= 0; index -= 1) {
      const puff = this.puffs[index]!;
      puff.life -= dt;
      if (puff.life <= 0) {
        puff.entity.enabled = false;
        this.pool.push(puff.entity);
        this.puffs.splice(index, 1);
        continue;
      }
      const k = 1 - puff.life / puff.total;
      const size = puff.size * Math.sin(Math.min(1, k * 1.15) * Math.PI) + 0.01;
      puff.entity.translate(puff.velocity.x * dt, puff.velocity.y * dt, puff.velocity.z * dt);
      puff.velocity.y -= 2 * dt;
      puff.entity.setLocalScale(size, size, size);
    }
    for (let index = this.arrows.length - 1; index >= 0; index -= 1) {
      const arrow = this.arrows[index]!;
      arrow.t += dt / 0.22;
      if (arrow.t >= 1.6) {
        arrow.entity.destroy();
        this.arrows.splice(index, 1);
        continue;
      }
      const at = new pc.Vec3();
      if (arrow.t <= 1) at.lerp(arrow.from, arrow.to, arrow.t);
      else if (arrow.blocked) at.copy(arrow.to).add(new pc.Vec3((arrow.to.x - arrow.from.x) * -0.2 * (arrow.t - 1), (arrow.t - 1) * 6, 2 * (arrow.t - 1)));
      else at.copy(arrow.to);
      arrow.entity.setPosition(at);
      arrow.entity.lookAt(arrow.to.x * 2 - arrow.from.x, arrow.to.y * 2 - arrow.from.y, arrow.to.z * 2 - arrow.from.z);
    }
  }

  private follow(game: Game, dt: number): void {
    const p = game.position;
    const portrait = this.canvas.clientHeight > this.canvas.clientWidth;
    let eye: pc.Vec3;
    let gaze: pc.Vec3;
    if (this.mode === "preview") {
      const turn = this.clock * 0.35;
      const back = portrait ? 6.2 : 4.6;
      eye = new pc.Vec3(p.x + Math.sin(turn) * back, p.y + 2.6, p.z + Math.cos(turn) * back);
      // On a phone the card covers the lower two thirds, so look below the cart to lift it up the screen.
      gaze = new pc.Vec3(p.x, p.y + (portrait ? -3.2 : 0.5), p.z);
    } else if (game.phase === "won" && game.after > 0.4) {
      const roostY = heightAt(game.course, game.course.roost);
      eye = new pc.Vec3(portrait ? 2.5 : 7, roostY + (portrait ? 7 : 5), -game.course.roost + (portrait ? 16.5 : 15));
      gaze = new pc.Vec3(0, roostY + (portrait ? 0.5 : 2.6), -game.course.roost + 3);
    } else {
      eye = new pc.Vec3(p.x * 0.55, p.y + (portrait ? 9.4 : 6.4), p.z + (portrait ? 9.5 : 9.5));
      gaze = new pc.Vec3(p.x * 0.75, p.y + 0.6, p.z - (portrait ? 3.5 : 7));
    }
    const k = this.snap ? 1 : Math.min(1, dt * (game.phase === "won" ? 2.2 : 7));
    this.snap = false;
    this.eye.lerp(this.eye, eye, k);
    this.gaze.lerp(this.gaze, gaze, k);
    this.shake = Math.max(0, this.shake - dt * 3.5);
    const jitter = this.shake * this.shake * 0.5;
    this.camera.setPosition(this.eye.x + Math.sin(this.clock * 71) * jitter, this.eye.y + Math.cos(this.clock * 83) * jitter, this.eye.z);
    this.camera.lookAt(this.gaze);
  }

  // ---------------------------------------------------------------- effects

  private puff(at: Vec3, material: pc.StandardMaterial, size: number, life: number, velocity: Triple): void {
    let entity = this.pool.pop();
    if (!entity) {
      entity = new pc.Entity("puff");
      entity.addComponent("render", { type: "sphere", material, castShadows: false, receiveShadows: false });
      this.scene.addChild(entity);
    }
    if (entity.render) entity.render.material = material;
    entity.enabled = true;
    entity.setPosition(at.x, at.y, at.z);
    entity.setLocalScale(0.01, 0.01, 0.01);
    this.puffs.push({ entity, life, total: life, velocity: new pc.Vec3(velocity[0], velocity[1], velocity[2]), size });
  }

  private burst(at: Vec3, material: pc.StandardMaterial, count: number, size: number, speed: number): void {
    for (let index = 0; index < count; index += 1) {
      const turn = (index / count) * Math.PI * 2 + this.clock;
      this.puff({ x: at.x, y: at.y + 0.3, z: at.z }, material, size * (0.6 + ((index * 7) % 5) / 6), 0.5 + ((index * 3) % 4) / 8, [Math.cos(turn) * speed, 1.5 + ((index * 5) % 3), Math.sin(turn) * speed]);
    }
  }

  handle(event: GameEvent, game: Game): void {
    const m = this.m;
    const cart = game.position;
    if (event.type === "jolt") this.shake = Math.min(1.4, this.shake + (event.amount + event.absorbed) / 14);
    if (event.type === "jolt" && event.amount + event.absorbed > 4) this.burst({ x: cart.x, y: cart.y + 0.3, z: cart.z }, m.dust, 5, 0.6, 3);
    if (event.type === "crack") this.burst({ x: cart.x, y: cart.y + 1.2, z: cart.z }, m.egg, 6, 0.22, 4);
    if (event.type === "broken") {
      this.shake = 1.4;
      this.burst({ x: cart.x, y: cart.y + 1, z: cart.z }, m.yolk, 9, 0.4, 5);
      this.burst({ x: cart.x, y: cart.y + 1, z: cart.z }, m.egg, 9, 0.3, 6);
    }
    if (event.type === "land") this.burst(event.at, m.dust, 6, 0.8, 3.5);
    if (event.type === "deflect") this.burst(event.at, m.gold, 6, 0.3, 5);
    if (event.type === "plough") this.burst(event.at, m.dust, 3, 0.5, 3);
    if (event.type === "swat") this.burst({ x: cart.x + 0.8, y: cart.y + 1.2, z: cart.z - 1 }, m.gold, 7, 0.3, 6);
    if (event.type === "manLost" || event.type === "hayLost") this.burst({ x: cart.x, y: cart.y + 1, z: cart.z }, event.type === "hayLost" ? m.hay : m.vermilion, 5, 0.25, 4);
    if (event.type === "pickup" && event.kind !== "keg") this.burst({ x: event.at.x, y: event.at.y + 0.6, z: event.at.z }, event.kind === "hay" ? m.hay : m.gold, 8, 0.3, 4);
    if (event.type === "blast") {
      this.shake = 1.4;
      this.puff({ x: event.at.x, y: event.at.y + 1, z: event.at.z }, m.blast, 9, 0.45, [0, 2, 0]);
      this.burst(event.at, m.blast, 12, 1.2, 9);
      this.burst(event.at, m.dust, 10, 1.6, 6);
    }
    if (event.type === "towerDown") {
      this.burst({ x: event.at.x, y: event.at.y + 2.5, z: event.at.z }, m.dust, 12, 1.5, 5);
      this.burst({ x: event.at.x, y: event.at.y + 3.5, z: event.at.z }, m.gold, 6, 0.4, 7);
    }
    if (event.type === "launch") {
      const look = this.towers.get(event.tower);
      if (look) look.swing = 1;
    }
    if (event.type === "volley") {
      const tower = game.towers.find((candidate) => candidate.def.id === event.tower);
      if (!tower) return;
      for (let index = 0; index < 7; index += 1) {
        const entity = this.shape("box", this.scene, [0, 0, 0], [0.04, 0.04, 1.1], m.oakDark);
        const spread = (index - 3) * 0.28;
        this.arrows.push({
          entity,
          from: new pc.Vec3(tower.pos.x - tower.def.side, tower.pos.y + 5.2, tower.pos.z + spread),
          to: new pc.Vec3(cart.x + spread * 0.5, cart.y + 0.8 + (index % 3) * 0.2, cart.z + game.velocity.z * 0.22 + spread),
          t: -index * 0.05,
          blocked: event.blocked,
        });
      }
      if (event.blocked) this.burst({ x: cart.x, y: cart.y + 1.6, z: cart.z - 2 }, m.gold, 6, 0.25, 5);
    }
    if (event.type === "finish") {
      const roost = { x: 0, y: heightAt(game.course, game.course.roost) + 6, z: -game.course.roost };
      for (let index = 0; index < 4; index += 1) this.burst({ x: roost.x + (index - 1.5) * 2.5, y: roost.y, z: roost.z + 2 }, index % 2 ? m.gold : m.hen, 9, 0.45, 5);
    }
  }
}

function clampDeg(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

/** Ease an entity towards a local position and tilt. */
function ease(entity: pc.Entity, position: Triple, euler: Triple, dt: number): void {
  const k = Math.min(1, dt * 16);
  const at = entity.getLocalPosition();
  entity.setLocalPosition(at.x + (position[0] - at.x) * k, at.y + (position[1] - at.y) * k, at.z + (position[2] - at.z) * k);
  const now = entity.getLocalEulerAngles();
  entity.setLocalEulerAngles(now.x + (euler[0] - now.x) * k, now.y + (euler[1] - now.y) * k, now.z + (euler[2] - now.z) * k);
}
