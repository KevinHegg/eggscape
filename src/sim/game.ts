import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { COURSE, courseEnd, heightAt, slopeAt, type ClutterDef, type ClutterKind, type CourseDef, type MobDef } from "./course";

/** Fixed simulation step. Slow motion changes how many steps run, never the step. */
export const STEP = 1 / 60;
const G = 9.81;

// The cart. Gravity is her engine: the men only keep her from standing still.
const START_SPEED = 5;
const MIN_SPEED = 5;
const PUSH = 4.5;
const DRAG = 0.011;
/** The brake man's shoe on the wheel: it slows the cart to a walk but will not stop it. */
const BRAKE = 6;
export const BRAKE_FLOOR = 5;
const WHEEL_RADIUS = 0.4;
const SUSPENSION_REST = 0.34;
const WHEEL_AT: ReadonlyArray<readonly [number, number]> = [
  [-0.85, -1.0],
  [0.85, -1.0],
  [-0.85, 1.0],
  [0.85, 1.0],
];
const GRIP = 2.2;

// Leaning.
const LEAN_LAG = 0.1;
const LEAN_MAX = 0.52;
/** Above this speed the lean is eased off, so she crosses the street no faster at a gallop than at a trot. */
const LEAN_EASE = 10;
const LEAN_POWER = 1;
const HEADING_GAIN = 1.1;
export const MEN = 3;

// Who may touch whom. Rubble never trips the cart or turns the bell; the fences along the far
// street are there only for the bell and the wain.
const CART_GROUPS = (0x0002 << 16) | 0xffff;
const RUBBLE_GROUPS = (0x0004 << 16) | 0xfff5;
const ROLLER_GROUPS = (0x0008 << 16) | 0xfffb;
const FENCE_GROUPS = (0x0010 << 16) | 0x0008;

// The egg.
const JOLT_FLOOR = 0.55;
const SPRING_TRAVEL = 4.5;
const SPRING_RETURN = 9;
const JOLT_SCALE = 13;
const HAY_POINTS = 22;
export const START_HAY = 2;

// The gun.
export const START_AMMO = 3;
const GUN_COOLDOWN = 0.4;
/** She can only hit what is this close: a target lights when it comes into range. */
export const GUN_RANGE = 25;
const SHOT_SPEED = 44;
const SHOT_SCATTER = 2.4;

// The sling. One of the men has a bag of stones and no particular orders.
export const START_STONES = 12;
export const SLING_RANGE = 30;
const SLING_COOLDOWN = 0.18;
const STONE_SPEED = 60;
/** Seconds a cook keeps his head down after a stone finds him. */
export const DUCK = 2.5;
/** Seconds the whole kitchen stands and stares when the Queen loses her crown. */
const GASP = 3;

// The bell.
/** The tower lets go of the bell when it has fallen this far, in radians from upright. */
const BELL_AWAY = 1.08;
const BELL_RADIUS = 0.9;
const BELL_MASS = 240;
/** A bell is no ball: it rolls badly and soon lies still. */
const BELL_ROLL = 0.3;

// The mob.
/** Seconds a townsman stays in the gutter after diving out of the way. */
export const PANIC = 5.5;
const SEES_IT_COMING = 9;
const BOWL_REACH = 1.7;
const BELL_FRIGHT = 3.6;
const WAIN_FRIGHT = 3;
const THROW_REACH = 18;
const THROW_EVERY = 1.6;
const PAN_FLIGHT = 0.7;
const PAN_REACH = 1.4;
const PAN_DAMAGE = 7;
const WHACK_DAMAGE = 12;
const WAIN_SHOVE = 7;

/** Standing still this long, the Queen's cooks catch up. */
const CAUGHT_AFTER = 4;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type Phase = "run" | "won" | "broken";
export type BreakCause = "jolt" | "spilled" | "fell" | "mob" | "caught";
export type TargetKind = "windlass" | "wain" | "rank";

/** Something the gun can be laid on. It lights when it comes into range. */
export interface Target {
  id: string;
  kind: TargetKind;
  at: Vec3;
  lit: boolean;
  /** Hit already, or past shooting at. */
  done: boolean;
  /** A round is on its way to it. */
  doomed: boolean;
}

/** A round on its way. */
export interface Flight {
  id: number;
  from: Vec3;
  to: Vec3;
  t: number;
  total: number;
  target: string;
}

export type GameEvent =
  | { type: "shoot" }
  | { type: "sling"; to: Vec3 }
  | { type: "ping"; at: Vec3; what: "pan" | "cook" | "ground"; kind: number }
  | { type: "smash"; id: number; kind: ClutterKind; at: Vec3 }
  | { type: "bang"; at: Vec3; target: TargetKind }
  | { type: "dry"; why: "empty" | "aimless" | "stones" | "far" }
  | { type: "brake" }
  | { type: "letGo"; at: Vec3 }
  | { type: "bellLoose"; at: Vec3 }
  | { type: "slam"; at: Vec3 }
  | { type: "toll"; at: Vec3; hard: number }
  | { type: "panic"; id: number; rank: number }
  | { type: "bowled"; id: number; at: Vec3; by: Bowler }
  | { type: "regroup"; rank: number }
  | { type: "throw"; id: number }
  | { type: "pan"; at: Vec3; hit: boolean; kind: number }
  | { type: "wainOff"; at: Vec3 }
  | { type: "wainCrash"; at: Vec3 }
  | { type: "jolt"; amount: number; absorbed: number }
  | { type: "crack"; stage: number }
  | { type: "broken"; cause: BreakCause }
  | { type: "hayLost" }
  | { type: "air"; time: number; distance: number }
  | { type: "finish" };

export type PropKind = "hay" | "beam" | "shell" | "block" | "folk" | "shard" | "hen" | "crown";
export type Bowler = "bell" | "wain" | "shot" | "cart" | "pot";

/** A loose physical thing the view draws by id. */
export interface Prop {
  id: number;
  kind: PropKind;
  body: RAPIER.RigidBody;
  /** Half extents, or radius in x for round things. */
  size: Vec3;
  age: number;
}

export interface BellTower {
  /** Held by its rope, on its way down, or lying across the water as the bridge. */
  state: "held" | "falling" | "down";
  /** Radians from upright. */
  angle: number;
  /** Radians a second. */
  speed: number;
  body: RAPIER.RigidBody;
}

export interface Bell {
  /** Still in the belfry, rolling loose, or come to rest. */
  state: "hung" | "loose" | "still";
  body: RAPIER.RigidBody | null;
  landed: boolean;
  quiet: number;
}

export interface Wain {
  state: "chocked" | "away" | "wrecked";
  body: RAPIER.RigidBody;
}

export interface Mobster {
  def: MobDef;
  pos: Vec3;
  /** Standing in the street, dived into the gutter, or out of it for good. */
  state: "stand" | "down" | "out";
  /** When a dived one gets up again. */
  until: number;
  /** When they next throw; -1 until the cart first comes in reach. */
  next: number;
}

/** A pan, a rolling pin, an egg beater: on its way to where the cart was going to be. */
export interface Pan {
  id: number;
  by: number;
  from: Vec3;
  to: Vec3;
  t: number;
  /** A stone is on its way to it. */
  doomed: boolean;
}

/** What a slung stone is meant for: something thrown, a cook, a piece of clutter, or just a spot. */
export type SlingAim = { pan: number } | { cook: number } | { clutter: number } | { at: Vec3 };

/** A stone from the sling, on its way. */
export interface Stone {
  id: number;
  from: Vec3;
  to: Vec3;
  t: number;
  total: number;
  aim: SlingAim;
}

export interface Clutter {
  def: ClutterDef;
  at: Vec3;
  /** Set off already. */
  done: boolean;
}

/** Where a thrown thing is, `t` seconds into its flight. */
export function panAt(pan: Pan, t: number = pan.t): Vec3 {
  const k = clamp(t / PAN_FLIGHT, 0, 1);
  return {
    x: pan.from.x + (pan.to.x - pan.from.x) * k,
    y: pan.from.y + (pan.to.y - pan.from.y) * k + Math.sin(k * Math.PI) * 2.2,
    z: pan.from.z + (pan.to.z - pan.from.z) * k,
  };
}

export interface Input {
  /** -1 leans left, 1 leans right. */
  lean: number;
  /** 0 lets her run, 1 is the brake hard on. */
  brake?: number;
  /** Fire this step: at the named target, or with `true` at whatever is next in range. */
  shoot?: string | boolean;
  /** Sling a stone this step. */
  sling?: SlingAim;
}

let ready: Promise<void> | null = null;

/** Load the physics engine once; await before making a Game. */
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

function rotate(q: Quat, v: Vec3): Vec3 {
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** A tower pivoting at its foot, `angle` radians from upright, falling away down the street. */
const tipped = (angle: number): Quat => ({ x: Math.sin(-angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) });

/** How hard a tower of this height is pulled over at `angle`: a rod falling about its foot. */
const topple = (height: number, angle: number): number => ((1.5 * G) / height) * Math.sin(angle);

/** Seconds until a falling tower lies down, from where it is now. What a watcher would judge by eye. */
export function fallTime(height: number, rest: number, angle: number, speed: number): number {
  let a = angle;
  let s = speed;
  let t = 0;
  while (a < rest && t < 20) {
    s += topple(height, a) * STEP;
    a += s * STEP;
    t += STEP;
  }
  return t;
}

export class Game {
  readonly course: CourseDef;
  readonly world: RAPIER.World;
  readonly chassis: RAPIER.RigidBody;
  private readonly vehicle: RAPIER.DynamicRayCastVehicleController;

  time = 0;
  tick = 0;
  phase: Phase = "run";
  cause: BreakCause | null = null;
  /** Seconds since the run ended. */
  after = 0;

  /** The King's shell, 100 down to 0. */
  shell = 100;
  stage = 0;
  readonly men = MEN;
  /** Hay padding left, in points of knock it will soak up. */
  padding = START_HAY * HAY_POINTS;
  /** How hard the brake is on, 0..1. */
  braking = 0;
  /** Smoothed lean, -1..1. */
  lean = 0;
  grounded = true;
  /** How hard he was shaken this step, for the view's wobble. */
  jolt = 0;
  /** Seconds off the ground in the present leap. */
  airtime = 0;
  /** Rounds left in the rack. */
  ammo = START_AMMO;
  /** Stones left in the sling bag. */
  stones = START_STONES;
  /** Pans that landed and townsfolk run into: none is a clean street. */
  knocks = 0;

  readonly targets: Target[] = [];
  /** What the Fire button would hit: the next thing in range. */
  target: Target | null = null;
  readonly flights: Flight[] = [];
  readonly tower: BellTower;
  readonly bell: Bell = { state: "hung", body: null, landed: false, quiet: 0 };
  readonly wain: Wain;
  readonly mob: Mobster[] = [];
  readonly pans: Pan[] = [];
  readonly stoneFlights: Stone[] = [];
  readonly clutter: Clutter[] = [];
  readonly props: Prop[] = [];

  private events: GameEvent[] = [];
  private nextId = 1;
  private seed = 0x9e3779b9;
  private prevVel: Vec3;
  private joltSkip = 12;
  /** How much of a landing the springs can still take, in metres per second. */
  private spring = SPRING_TRAVEL;
  private tipTime = 0;
  private stalled = 0;
  private gunCooldown = 0;
  private slingCooldown = 0;
  /** Until when the kitchen is too shocked to throw. */
  private gasp = 0;
  private airFrom = 0;
  private readonly regrouped = new Map<number, number>();

  static async create(course: CourseDef = COURSE): Promise<Game> {
    await initPhysics();
    return new Game(course);
  }

  constructor(course: CourseDef = COURSE) {
    this.course = course;
    this.world = new RAPIER.World({ x: 0, y: -G, z: 0 });
    this.world.timestep = STEP;
    this.layStreet();

    const startD = 0;
    this.chassis = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, heightAt(course, startD) + 0.8, -startD)
        .setLinvel(0, -START_SPEED * slopeAt(course, startD), -START_SPEED)
        .setAngularDamping(1.6)
        .setCcdEnabled(true)
        .setCanSleep(false)
        // Ballast slung low, so the cart rights itself after a knock.
        .setAdditionalMassProperties(70, { x: 0, y: -0.5, z: 0 }, { x: 60, y: 70, z: 28 }, { x: 0, y: 0, z: 0, w: 1 }),
    );
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.7, 0.2, 1.15).setMass(90).setFriction(0.25).setRestitution(0.1).setCollisionGroups(CART_GROUPS), this.chassis);
    // The King himself, riding high.
    this.world.createCollider(RAPIER.ColliderDesc.ball(0.42).setTranslation(0, 0.78, 0.15).setMass(6).setFriction(0.3).setCollisionGroups(CART_GROUPS), this.chassis);

    this.vehicle = this.world.createVehicleController(this.chassis);
    this.vehicle.indexUpAxis = 1;
    this.vehicle.setIndexForwardAxis = 2;
    for (const [x, z] of WHEEL_AT) {
      this.vehicle.addWheel({ x, y: -0.05, z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, SUSPENSION_REST, WHEEL_RADIUS);
    }
    for (let wheel = 0; wheel < WHEEL_AT.length; wheel += 1) {
      this.vehicle.setWheelSuspensionStiffness(wheel, 26);
      this.vehicle.setWheelSuspensionCompression(wheel, 2.4);
      this.vehicle.setWheelSuspensionRelaxation(wheel, 3.2);
      this.vehicle.setWheelMaxSuspensionTravel(wheel, 0.3);
      this.vehicle.setWheelMaxSuspensionForce(wheel, 9000);
      this.vehicle.setWheelFrictionSlip(wheel, GRIP);
      this.vehicle.setWheelSideFrictionStiffness(wheel, 1);
    }
    this.prevVel = { ...this.chassis.linvel() };

    this.tower = this.raiseTower();
    this.wain = this.parkWain();
    for (const def of course.mob) {
      this.mob.push({ def, pos: { x: def.x, y: heightAt(course, def.d), z: -def.d }, state: "stand", until: 0, next: -1 });
    }
    for (const def of course.clutter) {
      this.clutter.push({ def, at: { x: def.x, y: heightAt(course, def.d) + def.up, z: -def.d }, done: false });
    }
    const windlass = course.windlass;
    this.targets.push({ id: "windlass", kind: "windlass", at: { x: windlass.x, y: heightAt(course, windlass.d) + 1.1, z: -windlass.d }, lit: false, done: false, doomed: false });
    const wain = this.wain.body.translation();
    this.targets.push({ id: "wain", kind: "wain", at: { x: wain.x, y: wain.y - 0.3, z: wain.z - 1.5 }, lit: false, done: false, doomed: false });
    for (const rank of new Set(course.mob.map((def) => def.rank))) {
      this.targets.push({ id: `rank${rank}`, kind: "rank", at: { x: 0, y: 0, z: 0 }, lit: false, done: false, doomed: false });
    }
    this.aim();
  }

  // ---------------------------------------------------------------- reading the state

  get position(): Vec3 {
    return this.chassis.translation();
  }

  get rotation(): Quat {
    return this.chassis.rotation();
  }

  get velocity(): Vec3 {
    return this.chassis.linvel();
  }

  /** Distance travelled from the crest. */
  get distance(): number {
    return -this.chassis.translation().z;
  }

  get speed(): number {
    const v = this.chassis.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  /** 0 at the crest, 1 at the roost. */
  get progress(): number {
    return clamp(this.distance / this.course.finish, 0, 1);
  }

  get hay(): number {
    return Math.ceil(this.padding / HAY_POINTS - 1e-6);
  }

  get over(): boolean {
    return this.phase !== "run";
  }

  /** Stars for a finished street: home, an unbroken shell, and not a pan landed on him. */
  get stars(): number {
    if (this.phase !== "won") return 0;
    return 1 + (this.stage === 0 ? 1 : 0) + (this.knocks === 0 ? 1 : 0);
  }

  /** Seconds until the tower lies across the water: 0 once it does, Infinity while the rope holds. */
  get bridgeIn(): number {
    const tower = this.tower;
    if (tower.state === "down") return 0;
    if (tower.state === "held") return Infinity;
    return fallTime(this.course.tower.height, this.course.tower.rest, tower.angle, tower.speed);
  }

  /** How many of the mob are on their feet. */
  get standing(): number {
    return this.mob.filter((one) => one.state === "stand").length;
  }

  /** A wheel in the cart's own frame, for drawing. */
  wheel(index: number): { x: number; y: number; z: number; spin: number; steer: number } {
    const [x, z] = WHEEL_AT[index]!;
    const length = this.vehicle.wheelSuspensionLength(index) ?? SUSPENSION_REST;
    return { x, y: -0.05 - length, z, spin: this.vehicle.wheelRotation(index) ?? 0, steer: this.vehicle.wheelSteering(index) ?? 0 };
  }

  /** Free the physics world. The game must not be stepped afterwards. */
  dispose(): void {
    this.world.free();
  }

  takeEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ---------------------------------------------------------------- one step

  step(input: Input): void {
    this.tick += 1;
    this.time += STEP;
    if (this.over) this.after += STEP;

    this.gunCooldown = Math.max(0, this.gunCooldown - STEP);
    this.slingCooldown = Math.max(0, this.slingCooldown - STEP);
    this.aim();
    if (!this.over && input.shoot) this.shoot(input.shoot);
    if (!this.over && input.sling) this.sling(input.sling);
    this.stepFlights();
    this.stepStones();

    this.steer(this.over ? 0 : input.lean);
    this.push(this.over ? 0 : clamp(input.brake ?? 0, 0, 1));
    this.stepTower();

    this.vehicle.updateVehicle(STEP, undefined, CART_GROUPS);
    this.world.step();

    this.stepBell();
    this.stepWain();
    this.stepMob();
    this.stepPans();
    this.stepProps();
    this.feelJolt();
    if (!this.over) this.judge();
  }

  private steer(leanInput: number): void {
    this.lean += (clamp(leanInput, -1, 1) - this.lean) * Math.min(1, STEP / LEAN_LAG);
    const forward = rotate(this.chassis.rotation(), { x: 0, y: 0, z: -1 });
    const yaw = Math.atan2(forward.x, -forward.z); // positive: nose to the right
    // A positive steering angle turns the nose left, hence the sign.
    const ease = Math.min(1, LEAN_EASE / Math.max(1, -this.chassis.linvel().z));
    const angle = clamp(-(this.lean * LEAN_MAX * LEAN_POWER * ease - HEADING_GAIN * yaw), -0.4, 0.4);
    this.vehicle.setWheelSteering(0, angle);
    this.vehicle.setWheelSteering(1, angle);
    let contacts = 0;
    for (let wheel = 0; wheel < WHEEL_AT.length; wheel += 1) {
      if (this.vehicle.wheelIsInContact(wheel)) contacts += 1;
    }
    this.grounded = contacts >= 2;
    if (!this.grounded) {
      if (this.airtime === 0) this.airFrom = this.distance;
      this.airtime += STEP;
    } else {
      if (this.airtime > 0.5 && !this.over) this.events.push({ type: "air", time: this.airtime, distance: this.distance - this.airFrom });
      this.airtime = 0;
    }
  }

  private push(brake: number): void {
    const v = this.chassis.linvel();
    const mass = this.chassis.mass();
    const speed = Math.hypot(v.x, v.y, v.z);
    const impulse = { x: 0, y: 0, z: 0 };
    if (this.phase === "won") {
      // Home: the yard's straw brings the cart to rest.
      impulse.x -= v.x * mass * 1.5 * STEP;
      impulse.z -= v.z * mass * 1.5 * STEP;
    } else {
      const drag = DRAG * speed * mass * STEP;
      impulse.x -= v.x * drag;
      impulse.y -= v.y * drag;
      impulse.z -= v.z * drag;
      const was = this.braking;
      this.braking = this.phase === "run" && this.grounded ? brake : 0;
      if (this.braking > 0 && was === 0) this.events.push({ type: "brake" });
      if (this.braking > 0 && -v.z > BRAKE_FLOOR) {
        // The shoe bites the wheel. It will slow her to a walk, never to a stand.
        const bite = (Math.min(BRAKE * this.braking * STEP, -v.z - BRAKE_FLOOR) * mass) / Math.max(1, speed);
        impulse.x -= v.x * bite;
        impulse.y -= v.y * bite;
        impulse.z -= v.z * bite;
      } else if (this.phase === "run" && this.grounded && -v.z < MIN_SPEED) {
        // The King's men put their shoulders to it.
        const slope = slopeAt(this.course, this.distance);
        const norm = Math.hypot(1, slope);
        // Brought almost to a stand against something, they heave until it gives.
        const heave = PUSH * (-v.z < 2 ? 3 : 1);
        impulse.y -= (slope / norm) * heave * mass * STEP;
        impulse.z -= (1 / norm) * heave * mass * STEP;
      }
    }
    this.chassis.applyImpulse(impulse, true);
  }

  // ---------------------------------------------------------------- the gun

  /** Light what is in range, and lay the gun on the next thing worth a round. */
  private aim(): void {
    const cart = this.chassis.translation();
    const d = -cart.z;
    for (const target of this.targets) {
      if (target.kind === "rank") {
        // A rank is aimed at through whoever stands nearest the cart's own line down the street.
        const rank = Number(target.id.slice(4));
        let best: Mobster | null = null;
        for (const one of this.mob) {
          if (one.def.rank !== rank || one.state !== "stand") continue;
          if (!best || Math.abs(one.pos.x - cart.x) < Math.abs(best.pos.x - cart.x)) best = one;
        }
        target.done = !best && !this.mob.some((one) => one.def.rank === rank && one.state === "down");
        if (best) target.at = { x: best.pos.x, y: best.pos.y + 1, z: best.pos.z };
        else target.lit = false;
        if (!best) continue;
      }
      const ahead = -target.at.z - d;
      const reach = Math.hypot(target.at.x - cart.x, target.at.y - cart.y, target.at.z - cart.z);
      if (ahead < 2) target.done = true;
      target.lit = !this.over && !target.done && !target.doomed && reach <= GUN_RANGE;
    }
    // The winch first, then the wain, then whichever rank is nearest.
    this.target = this.targets.find((target) => target.lit) ?? null;
  }

  private shoot(choice: string | true): void {
    if (this.gunCooldown > 0) return;
    const target = choice === true ? this.target : (this.targets.find((candidate) => candidate.id === choice && candidate.lit) ?? null);
    if (this.ammo <= 0 || !target) {
      this.gunCooldown = 0.3;
      this.events.push({ type: "dry", why: this.ammo <= 0 ? "empty" : "aimless" });
      return;
    }
    this.ammo -= 1;
    target.doomed = true;
    target.lit = false;
    const cart = this.chassis.translation();
    const from = { x: cart.x, y: cart.y + 1.3, z: cart.z - 0.9 };
    const reach = Math.hypot(target.at.x - from.x, target.at.y - from.y, target.at.z - from.z);
    this.flights.push({ id: this.nextId++, from, to: { ...target.at }, t: 0, total: clamp(reach / SHOT_SPEED, 0.25, 1), target: target.id });
    this.gunCooldown = GUN_COOLDOWN;
    this.events.push({ type: "shoot" });
  }

  private stepFlights(): void {
    for (let index = this.flights.length - 1; index >= 0; index -= 1) {
      const flight = this.flights[index]!;
      flight.t += STEP;
      if (flight.t < flight.total) continue;
      this.flights.splice(index, 1);
      const target = this.targets.find((candidate) => candidate.id === flight.target);
      if (!target) continue;
      target.doomed = false;
      this.events.push({ type: "bang", at: { ...flight.to }, target: target.kind });
      if (target.kind === "windlass") {
        target.done = true;
        this.letGo(flight.to);
      } else if (target.kind === "wain") {
        target.done = true;
        this.unchock();
      } else {
        this.scatter(Number(target.id.slice(4)), flight.to);
      }
    }
  }

  /** A round in among a rank: whoever it lands by is out of it, and the rest of the rank dive. */
  private scatter(rank: number, at: Vec3): void {
    for (const one of this.mob) {
      if (one.def.rank !== rank || one.state === "out") continue;
      if (Math.hypot(one.pos.x - at.x, one.pos.z - at.z) <= SHOT_SCATTER) this.bowl(one, "shot", { x: (one.pos.x - at.x) * 3, y: 7, z: -3 });
      else this.dive(one);
    }
  }

  // ---------------------------------------------------------------- the sling

  /**
   * A stone at whatever was pointed at. It costs nothing to miss but the stone; it will knock a
   * thrown pan out of the air, put a cook's head down for a moment, and set off anything loose.
   */
  private sling(aim: SlingAim): void {
    if (this.slingCooldown > 0) return;
    if (this.stones <= 0) {
      this.slingCooldown = 0.3;
      this.events.push({ type: "dry", why: "stones" });
      return;
    }
    const cart = this.chassis.translation();
    const from = { x: cart.x - 0.5, y: cart.y + 1.2, z: cart.z - 0.8 };
    let to: Vec3;
    let total = 0;
    if ("pan" in aim) {
      const pan = this.pans.find((one) => one.id === aim.pan && !one.doomed);
      if (!pan) return;
      // A stone in time always gets there: it is laid off for where the thing will be.
      const left = PAN_FLIGHT - pan.t - STEP;
      if (left < STEP * 2) return;
      const now = panAt(pan);
      total = clamp(Math.hypot(now.x - from.x, now.y - from.y, now.z - from.z) / STONE_SPEED, 0.08, left);
      to = panAt(pan, pan.t + total);
      pan.doomed = true;
    } else if ("cook" in aim) {
      const one = this.mob.find((cook) => cook.def.id === aim.cook);
      if (!one || one.state === "out") return;
      to = { x: one.pos.x, y: one.pos.y + 1.1, z: one.pos.z };
    } else if ("clutter" in aim) {
      const thing = this.clutter.find((one) => one.def.id === aim.clutter);
      if (!thing || thing.done) return;
      to = { ...thing.at };
    } else {
      to = { ...aim.at };
    }
    let reach = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    if (reach > SLING_RANGE) {
      if (!("at" in aim)) {
        this.slingCooldown = 0.3;
        this.events.push({ type: "dry", why: "far" });
        return;
      }
      // A stone at nothing in particular just falls short.
      const k = SLING_RANGE / reach;
      to = { x: from.x + (to.x - from.x) * k, y: heightAt(this.course, -(from.z + (to.z - from.z) * k)), z: from.z + (to.z - from.z) * k };
      reach = SLING_RANGE;
    }
    if (total === 0) total = clamp(reach / STONE_SPEED, 0.1, 0.6);
    this.stones -= 1;
    this.slingCooldown = SLING_COOLDOWN;
    this.stoneFlights.push({ id: this.nextId++, from, to, t: 0, total, aim });
    this.events.push({ type: "sling", to: { ...to } });
  }

  private stepStones(): void {
    for (let index = this.stoneFlights.length - 1; index >= 0; index -= 1) {
      const stone = this.stoneFlights[index]!;
      stone.t += STEP;
      if (stone.t < stone.total) continue;
      this.stoneFlights.splice(index, 1);
      const aim = stone.aim;
      if ("pan" in aim) {
        const at = this.pans.findIndex((one) => one.id === aim.pan);
        if (at >= 0) {
          const pan = this.pans[at]!;
          this.pans.splice(at, 1);
          this.events.push({ type: "ping", at: { ...stone.to }, what: "pan", kind: pan.by });
          continue;
        }
      } else if ("cook" in aim) {
        const one = this.mob.find((cook) => cook.def.id === aim.cook);
        if (one?.state === "stand") {
          this.dive(one, DUCK);
          this.events.push({ type: "ping", at: { ...stone.to }, what: "cook", kind: one.def.id });
          continue;
        }
      } else if ("clutter" in aim) {
        const thing = this.clutter.find((one) => one.def.id === aim.clutter);
        if (thing && !thing.done) {
          this.smash(thing);
          continue;
        }
      }
      this.events.push({ type: "ping", at: { ...stone.to }, what: "ground", kind: 0 });
    }
  }

  /** Something in the village goes: whoever is under it is flattened, whoever is near it dives. */
  private smash(thing: Clutter): void {
    thing.done = true;
    const at = thing.at;
    const kind = thing.def.kind;
    this.events.push({ type: "smash", id: thing.def.id, kind, at: { ...at } });
    const inward = -Math.sign(at.x || 1);
    if (kind === "pot") {
      for (let piece = 0; piece < 4; piece += 1) this.spawn("shard", { x: 0.16, y: 0.1, z: 0.16 }, 2, { x: at.x, y: at.y - 0.2, z: at.z }, { x: this.random() * 4 - 2, y: this.random() * 2, z: this.random() * 4 - 2 });
    } else if (kind === "barrel") {
      for (let piece = 0; piece < 6; piece += 1) this.spawn("beam", { x: 0.07, y: 0.07, z: 0.5 }, 2, { x: at.x, y: at.y, z: at.z }, { x: inward * (1 + this.random() * 5), y: 3 + this.random() * 4, z: -2 - this.random() * 5 });
    } else if (kind === "coop") {
      for (let piece = 0; piece < 4; piece += 1) this.spawn("beam", { x: 0.06, y: 0.06, z: 0.4 }, 1, { x: at.x, y: at.y, z: at.z }, { x: inward * this.random() * 4, y: 3 + this.random() * 3, z: this.random() * 4 - 2 });
      for (let hen = 0; hen < 4; hen += 1) this.spawn("hen", { x: 0.22, y: 0.1, z: 0.22 }, 1, { x: at.x, y: at.y + 0.3, z: at.z }, { x: inward * (2 + this.random() * 4), y: 5 + this.random() * 3, z: -1 - this.random() * 6 });
    } else {
      // Her crown, off the balcony and into the street.
      this.spawn("crown", { x: 0.3, y: 0.14, z: 0.3 }, 1, { x: at.x, y: at.y + 0.3, z: at.z }, { x: inward * 3.5, y: 5, z: -1.5 });
      this.gasp = this.time + GASP;
    }
    for (const one of this.mob) {
      if (one.state === "out") continue;
      const away = Math.hypot(one.pos.x - at.x, one.pos.z - at.z);
      if (away <= thing.def.bowl) this.bowl(one, "pot", { x: inward * 2, y: 4, z: -3 });
      else if (away <= thing.def.fright) this.dive(one);
    }
  }

  // ---------------------------------------------------------------- the bell tower

  private raiseTower(): BellTower {
    const def = this.course.tower;
    const wide = def.x1 - def.x0;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation((def.x0 + def.x1) / 2, heightAt(this.course, def.d - 0.01), -def.d)
        .setRotation(tipped(def.lean)),
    );
    // In its own frame the tower stands up +Y, with the water behind its uphill face (z = 0).
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(wide / 2, def.height / 2, def.thick / 2).setTranslation(0, def.height / 2, -def.thick / 2).setFriction(1), body);
    // The corner stones stand proud of the wall. Lying down, they are the bridge's kerbs.
    for (const side of [-1, 1]) {
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.18, def.height / 2, 0.2).setTranslation(side * (wide / 2 - 0.18), def.height / 2, 0.2).setFriction(0.15), body);
    }
    // The capstan its rope is made fast to, on the edge of the quay.
    const post = this.course.windlass;
    const quay = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.4, 0.6, 0.4).setTranslation(post.x, heightAt(this.course, post.d) + 0.6, -post.d), quay);
    return { state: "held", angle: def.lean, speed: 0, body };
  }

  /** The rope is gone. The tower begins, very slowly, to go. */
  private letGo(at: Vec3): void {
    if (this.tower.state !== "held") return;
    this.tower.state = "falling";
    for (let piece = 0; piece < 6; piece += 1) {
      this.spawn("beam", { x: 0.1, y: 0.1, z: 0.7 }, 4, { x: at.x, y: at.y + 0.3, z: at.z }, { x: this.random() * 6 - 1, y: 4 + this.random() * 5, z: this.random() * 6 - 3 });
    }
    this.events.push({ type: "letGo", at: { ...at } });
  }

  private stepTower(): void {
    const tower = this.tower;
    if (tower.state !== "falling") return;
    const def = this.course.tower;
    tower.speed += topple(def.height, tower.angle) * STEP;
    tower.angle += tower.speed * STEP;
    if (this.bell.state === "hung" && tower.angle >= BELL_AWAY) this.looseBell();
    if (tower.angle >= def.rest) {
      // Down. It lies from bank to bank and from now on it is the street.
      tower.angle = def.rest;
      tower.speed = 0;
      tower.state = "down";
      tower.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
      tower.body.setRotation(tipped(def.rest), true);
      const far = def.d + Math.sin(def.rest) * def.height;
      const at = { x: (def.x0 + def.x1) / 2, y: heightAt(this.course, far + 0.1), z: -far };
      for (let piece = 0; piece < 10; piece += 1) {
        this.spawn("block", { x: 0.3, y: 0.26, z: 0.3 }, 5, { x: at.x + this.random() * 5 - 2.5, y: at.y + 0.6, z: at.z - this.random() * 2 }, {
          x: this.random() * 8 - 4,
          y: 3 + this.random() * 6,
          z: -2 - this.random() * 7,
        });
      }
      this.events.push({ type: "slam", at });
      return;
    }
    tower.body.setNextKinematicRotation(tipped(tower.angle));
  }

  /** The belfry gives way and the bell goes on by itself, as fast as the tower's top was moving. */
  private looseBell(): void {
    const def = this.course.tower;
    const tower = this.tower;
    const foot = tower.body.translation();
    const reach = def.height + BELL_RADIUS + 0.4;
    const up = Math.cos(tower.angle);
    const out = Math.sin(tower.angle);
    // The middle of the belfry, a little above the eaves.
    const at = { x: foot.x, y: foot.y + up * reach + out * (def.thick / 2), z: foot.z - out * reach + up * (def.thick / 2) };
    const ry = at.y - foot.y;
    const rz = at.z - foot.z;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(at.x, at.y, at.z)
        .setLinvel(0, tower.speed * rz, -tower.speed * ry)
        .setAngvel({ x: -tower.speed * 2, y: 0, z: 0 })
        .setAngularDamping(BELL_ROLL)
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
    this.world.createCollider(RAPIER.ColliderDesc.ball(BELL_RADIUS).setMass(BELL_MASS).setFriction(0.9).setRestitution(0.12).setCollisionGroups(ROLLER_GROUPS), body);
    this.bell.body = body;
    this.bell.state = "loose";
    for (let piece = 0; piece < 7; piece += 1) {
      this.spawn(piece % 2 ? "beam" : "block", piece % 2 ? { x: 0.1, y: 0.1, z: 0.8 } : { x: 0.3, y: 0.26, z: 0.3 }, 4, { x: at.x + this.random() * 3 - 1.5, y: at.y + this.random() * 1.5, z: at.z }, {
        x: this.random() * 6 - 3,
        y: tower.speed * rz * 0.6 + this.random() * 3,
        z: -tower.speed * ry * (0.5 + this.random() * 0.5),
      });
    }
    this.events.push({ type: "bellLoose", at });
  }

  private stepBell(): void {
    const bell = this.bell;
    if (bell.state !== "loose" || !bell.body) return;
    const p = bell.body.translation();
    const v = bell.body.linvel();
    const road = heightAt(this.course, -p.z);
    if (!bell.landed && p.y <= road + BELL_RADIUS + 0.2) {
      bell.landed = true;
      this.events.push({ type: "toll", at: { ...p }, hard: 1 });
    }
    if (p.y < road - 12) {
      // Into the water: it tolls no more.
      bell.state = "still";
      return;
    }
    const speed = Math.hypot(v.x, v.y, v.z);
    bell.quiet = bell.landed && speed < 0.35 ? bell.quiet + STEP : 0;
    if (bell.quiet > 0.6) {
      bell.state = "still";
      bell.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
    }
  }

  // ---------------------------------------------------------------- the wain

  private parkWain(): Wain {
    const def = this.course.wain;
    const slope = Math.atan(slopeAt(this.course, def.d));
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(def.x, heightAt(this.course, def.d) + 0.62 * Math.cos(slope), -def.d - 0.62 * Math.sin(slope))
        // Tilted to the street, and kept so: it runs down its own side like a thing on rails.
        .setRotation({ x: Math.sin(-slope / 2), y: 0, z: 0, w: Math.cos(slope / 2) })
        .lockRotations()
        .enabledTranslations(false, true, true)
        .setCanSleep(false),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.85, 0.6, 1.3)
        .setMass(180)
        .setFriction(0.02)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(0)
        .setCollisionGroups(ROLLER_GROUPS),
      body,
    );
    // The well at the bottom of its side of the street.
    const well = this.course.well;
    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(1.15, 0.8, 1.15).setTranslation(well.x, heightAt(this.course, well.d) + 0.6, -well.d).setRestitution(0), ground);
    // And the woolsacks at the bottom of the bell's side.
    const sacks = this.course.sacks;
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(1.2, 1, 1.1).setTranslation(sacks.x, heightAt(this.course, sacks.d) + 0.8, -sacks.d).setRestitution(0).setFriction(1), ground);
    return { state: "chocked", body };
  }

  /** The chock is shot out and the wain is away down the hill. */
  private unchock(): void {
    const wain = this.wain;
    if (wain.state !== "chocked") return;
    wain.state = "away";
    const slope = slopeAt(this.course, this.course.wain.d);
    const norm = Math.hypot(1, slope);
    wain.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    wain.body.setLinvel({ x: 0, y: (-slope / norm) * WAIN_SHOVE, z: (-1 / norm) * WAIN_SHOVE }, true);
    this.events.push({ type: "wainOff", at: { ...wain.body.translation() } });
  }

  private stepWain(): void {
    const wain = this.wain;
    if (wain.state !== "away") return;
    const p = wain.body.translation();
    const v = wain.body.linvel();
    if (-p.z - this.course.wain.d > 6 && Math.hypot(v.y, v.z) < 0.6) {
      wain.state = "wrecked";
      wain.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
      for (let piece = 0; piece < 8; piece += 1) {
        this.spawn(piece % 2 ? "beam" : "block", piece % 2 ? { x: 0.1, y: 0.1, z: 0.7 } : { x: 0.28, y: 0.2, z: 0.28 }, 4, { x: p.x + this.random() * 2 - 1, y: p.y + 0.8, z: p.z - 1 }, {
          x: this.random() * 8 - 4,
          y: 4 + this.random() * 5,
          z: -2 - this.random() * 5,
        });
      }
      this.events.push({ type: "wainCrash", at: { ...p } });
    }
  }

  // ---------------------------------------------------------------- the mob

  /** The bell and the wain, while they are moving fast enough to frighten anyone. */
  private rollers(): Array<{ x: number; d: number; by: "bell" | "wain"; fright: number; v: Vec3 }> {
    const out: Array<{ x: number; d: number; by: "bell" | "wain"; fright: number; v: Vec3 }> = [];
    if (this.bell.state === "loose" && this.bell.body && this.bell.landed) {
      const p = this.bell.body.translation();
      const v = this.bell.body.linvel();
      if (-v.z > 1.5) out.push({ x: p.x, d: -p.z, by: "bell", fright: BELL_FRIGHT, v });
    }
    if (this.wain.state === "away") {
      const p = this.wain.body.translation();
      const v = this.wain.body.linvel();
      if (-v.z > 1.5) out.push({ x: p.x, d: -p.z, by: "wain", fright: WAIN_FRIGHT, v });
    }
    return out;
  }

  private stepMob(): void {
    const cart = this.chassis.translation();
    const v = this.chassis.linvel();
    const d = -cart.z;
    const rollers = this.rollers();
    for (const one of this.mob) {
      if (one.state === "out") continue;
      // Whatever comes rolling down the street: those in its way go flying, those beside it dive.
      for (const roller of rollers) {
        const ahead = one.def.d - roller.d;
        const beside = Math.abs(one.pos.x - roller.x);
        if (ahead > SEES_IT_COMING || ahead < -1.5) continue;
        if (beside < BOWL_REACH) {
          if (ahead < 1) this.bowl(one, roller.by, { x: (one.pos.x - roller.x) * 4, y: 6.5, z: roller.v.z * 0.8 });
        } else if (beside < roller.fright && one.state === "stand") {
          this.dive(one);
        }
      }
      if (one.state === "down") {
        if (this.time < one.until) continue;
        one.state = "stand";
        one.next = this.time + 0.9;
        if (this.time - (this.regrouped.get(one.def.rank) ?? -9) > 1.5) {
          this.regrouped.set(one.def.rank, this.time);
          this.events.push({ type: "regroup", rank: one.def.rank });
        }
      }
      if (one.state !== "stand" || this.over) continue;
      // Run into one of them and it costs him a clout on the way through.
      if (Math.abs(one.pos.x - cart.x) < 1.15 && Math.abs(one.pos.z - cart.z) < 1.3 && Math.abs(one.pos.y - cart.y) < 2.5) {
        this.knocks += 1;
        this.bowl(one, "cart", { x: Math.sign(one.pos.x - cart.x || 1) * 4, y: 5, z: v.z * 0.9 });
        this.damage(WHACK_DAMAGE, "mob");
        continue;
      }
      const ahead = one.def.d - d;
      if (ahead > THROW_REACH || ahead < -3) continue;
      if (one.next < 0) one.next = this.time + 0.25 + this.random() * 0.9;
      if (this.time < one.next || this.time < this.gasp) continue;
      one.next = this.time + THROW_EVERY + this.random() * 0.4;
      // Thrown at where he will be if nothing changes. Change something.
      const reach = this.course.width / 2 - 0.5;
      const toD = -(cart.z + v.z * PAN_FLIGHT);
      this.pans.push({
        id: this.nextId++,
        by: one.def.id,
        from: { x: one.pos.x, y: one.pos.y + 1.6, z: one.pos.z },
        to: { x: clamp(cart.x + v.x * PAN_FLIGHT, -reach, reach), y: heightAt(this.course, toD) + 0.9, z: -toD },
        t: 0,
        doomed: false,
      });
      this.events.push({ type: "throw", id: one.def.id });
    }
  }

  private dive(one: Mobster, seconds: number = PANIC): void {
    if (one.state === "out") return;
    const fresh = one.state === "stand";
    one.state = "down";
    one.until = fresh ? this.time + seconds : Math.max(one.until, this.time + seconds);
    if (fresh) this.events.push({ type: "panic", id: one.def.id, rank: one.def.rank });
  }

  private bowl(one: Mobster, by: Bowler, velocity: Vec3): void {
    if (one.state === "out") return;
    one.state = "out";
    this.spawn("folk", { x: 0.26, y: 0.3, z: 0.26 }, 8, { x: one.pos.x, y: one.pos.y + 1, z: one.pos.z }, velocity);
    this.events.push({ type: "bowled", id: one.def.id, at: { ...one.pos }, by });
  }

  private stepPans(): void {
    const cart = this.chassis.translation();
    for (let index = this.pans.length - 1; index >= 0; index -= 1) {
      const pan = this.pans[index]!;
      pan.t += STEP;
      if (pan.t < PAN_FLIGHT) continue;
      this.pans.splice(index, 1);
      const hit = !this.over && Math.hypot(cart.x - pan.to.x, cart.z - pan.to.z) <= PAN_REACH && Math.abs(cart.y - pan.to.y) < 2.5;
      this.events.push({ type: "pan", at: { ...pan.to }, hit, kind: pan.by });
      if (hit) {
        this.knocks += 1;
        this.damage(PAN_DAMAGE, "mob");
      }
    }
  }

  // ---------------------------------------------------------------- loose things

  private spawn(kind: PropKind, size: Vec3, mass: number, at: Vec3, velocity: Vec3): Prop {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(at.x, at.y, at.z)
        .setLinvel(velocity.x, velocity.y, velocity.z)
        .setAngvel({ x: this.random() * 10 - 5, y: this.random() * 10 - 5, z: this.random() * 10 - 5 }),
    );
    const shape = kind === "folk" || kind === "hen" ? RAPIER.ColliderDesc.capsule(size.y, size.x) : RAPIER.ColliderDesc.cuboid(size.x, size.y, size.z);
    this.world.createCollider(shape.setMass(mass).setFriction(0.8).setRestitution(0.2).setCollisionGroups(RUBBLE_GROUPS), body);
    const prop: Prop = { id: this.nextId++, kind, body, size, age: 0 };
    this.props.push(prop);
    return prop;
  }

  private stepProps(): void {
    for (let index = this.props.length - 1; index >= 0; index -= 1) {
      const prop = this.props[index]!;
      prop.age += STEP;
      const p = prop.body.translation();
      if (prop.age > 9 || p.y < heightAt(this.course, -p.z) - 25) {
        this.world.removeRigidBody(prop.body);
        this.props.splice(index, 1);
      }
    }
  }

  // ---------------------------------------------------------------- the egg

  /** A jolt hurts him: how sharply the cart's velocity changed this step. */
  private feelJolt(): void {
    const v = this.chassis.linvel();
    let dx = v.x - this.prevVel.x;
    let dy = v.y - this.prevVel.y + G * STEP;
    let dz = v.z - this.prevVel.z;
    this.prevVel = { x: v.x, y: v.y, z: v.z };
    // The cart is sprung: coming down wheels first, the springs take the blow until they bottom out.
    this.spring = Math.min(SPRING_TRAVEL, this.spring + SPRING_RETURN * STEP);
    const up = rotate(this.chassis.rotation(), { x: 0, y: 1, z: 0 });
    const lift = dx * up.x + dy * up.y + dz * up.z;
    if (lift > 0 && up.y > 0.6) {
      const taken = Math.min(lift, this.spring);
      this.spring -= taken;
      dx -= up.x * taken;
      dy -= up.y * taken;
      dz -= up.z * taken;
    }
    const change = Math.hypot(dx, dy, dz);
    this.jolt = change;
    if (this.joltSkip > 0) {
      this.joltSkip -= 1;
      return;
    }
    if (this.phase !== "run" || change <= JOLT_FLOOR) return;
    this.damage((change - JOLT_FLOOR) * JOLT_SCALE, "jolt");
  }

  private damage(raw: number, cause: BreakCause): void {
    if (this.phase !== "run") return;
    let amount = raw;
    let absorbed = 0;
    if (this.padding > 0) {
      const bales = this.hay;
      absorbed = Math.min(this.padding, amount);
      this.padding -= absorbed;
      amount -= absorbed;
      if (this.hay < bales) {
        const cart = this.chassis.translation();
        const v = this.chassis.linvel();
        this.spawn("hay", { x: 0.4, y: 0.28, z: 0.3 }, 4, { x: cart.x, y: cart.y + 0.9, z: cart.z + 1 }, { x: this.random() * 4 - 2, y: 3.5, z: v.z * 0.4 });
        this.events.push({ type: "hayLost" });
      }
    }
    this.shell = Math.max(0, this.shell - amount);
    this.events.push({ type: "jolt", amount, absorbed });
    const stage = this.shell <= 0 ? 3 : this.shell <= 33 ? 2 : this.shell <= 66 ? 1 : 0;
    if (stage > this.stage) {
      this.stage = stage;
      this.events.push({ type: "crack", stage });
    }
    if (this.shell <= 0) this.shatter(cause);
  }

  private shatter(cause: BreakCause): void {
    if (this.phase !== "run") return;
    this.phase = "broken";
    this.cause = cause;
    this.shell = 0;
    this.stage = 3;
    const cart = this.chassis.translation();
    const v = this.chassis.linvel();
    for (const side of [-1, 1]) {
      this.spawn("shell", { x: 0.3, y: 0.2, z: 0.3 }, 2, { x: cart.x + side * 0.25, y: cart.y + 1, z: cart.z }, { x: v.x + side * 2.5, y: 4, z: v.z * 0.7 });
    }
    this.events.push({ type: "broken", cause });
  }

  private judge(): void {
    const p = this.chassis.translation();
    const d = -p.z;
    const up = rotate(this.chassis.rotation(), { x: 0, y: 1, z: 0 });
    this.tipTime = up.y < 0.2 ? this.tipTime + STEP : 0;
    if (this.tipTime > 0.7) return this.shatter("spilled");
    if (p.y < heightAt(this.course, d) - 5 || d > courseEnd(this.course) + 4) return this.shatter("fell");
    // She cannot stand still for long: the Queen's cooks are coming down the hill behind her.
    this.stalled = this.speed < 1.2 ? this.stalled + STEP : 0;
    if (this.stalled > CAUGHT_AFTER || this.time > 90) return this.shatter("caught");
    if (d >= this.course.finish) {
      this.phase = "won";
      this.events.push({ type: "finish" });
    }
  }

  // ---------------------------------------------------------------- the world

  private layStreet(): void {
    const street = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const half = this.course.width / 2;
    for (const piece of this.course.pieces) {
      const run = piece.d1 - piece.d0;
      const rise = piece.y1 - piece.y0;
      const length = Math.hypot(run, rise);
      const angle = Math.asin(rise / length);
      const rotation = { x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) };
      const normal = { y: Math.cos(angle), z: Math.sin(angle) };
      const mid = { y: (piece.y0 + piece.y1) / 2, z: -(piece.d0 + piece.d1) / 2 };
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(half + 0.6, 0.3, length / 2)
          .setTranslation(0, mid.y - normal.y * 0.3, mid.z - normal.z * 0.3)
          .setRotation(rotation)
          .setFriction(1),
        street,
      );
      for (const side of [-1, 1]) {
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.3, 0.45, length / 2)
            .setTranslation(side * (half + 0.3), mid.y + normal.y * 0.3, mid.z + normal.z * 0.3)
            .setRotation(rotation)
            .setFriction(0.15),
          street,
        );
        // House fronts, as far as the bell and the wain are concerned.
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.3, 2, length / 2)
            .setTranslation(side * (half + 0.9), mid.y + normal.y * 1.8, mid.z + normal.z * 1.8)
            .setRotation(rotation)
            .setCollisionGroups(FENCE_GROUPS),
          street,
        );
      }
    }
    // The back of the roost yard.
    const end = courseEnd(this.course);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(half + 0.6, 2, 0.5).setTranslation(0, heightAt(this.course, end) + 2, -end - 0.5), street);
  }

  private random(): number {
    // mulberry32: the run must replay exactly, so no Math.random here.
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
