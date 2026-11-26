import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import { COURSE, courseEnd, heightAt, slopeAt, type CourseDef, type PickupKind, type TowerDef, type WallDef } from "./course";
import { PARTS, type PartId } from "./parts";

/** Fixed simulation step. Slow motion changes how many steps run, never the step. */
export const STEP = 1 / 60;
const G = 9.81;

// The cart.
const START_SPEED = 8;
const MIN_SPEED = 7;
const PUSH = 4.5;
const DRAG = 0.011;
/** The brake man's shoe on the wheel: it slows the cart but will not stop it. */
const BRAKE = 5.5;
const BRAKE_FLOOR = 7;
const WHEEL_RADIUS = 0.4;
const SUSPENSION_REST = 0.34;
const WHEEL_AT: ReadonlyArray<readonly [number, number]> = [
  [-0.85, -1.0],
  [0.85, -1.0],
  [-0.85, 1.0],
  [0.85, 1.0],
];
const GRIP = 2.2;
const SLICK_GRIP = 0.18;

// Leaning.
const LEAN_LAG = 0.1;
const LEAN_MAX = 0.52;
/** Above this speed the lean is eased off, so she crosses the road no faster at a gallop than at a trot. */
const LEAN_EASE = 10;
const LEAN_BASE = 0.46;
const LEAN_PER_MAN = 0.18;
const GREAT_WHEELS = 1.3;
const HEADING_GAIN = 1.1;
export const MAX_MEN = 3;

// The egg.
/** Rubble, lost bales and fallen men tumble over the road and each other, but never trip the cart. */
const CART_GROUPS = (0x0002 << 16) | 0xffff;
const RUBBLE_GROUPS = (0x0004 << 16) | 0xfffd;
const JOLT_FLOOR = 0.55;
const SPRING_TRAVEL = 4.5;
const SPRING_RETURN = 9;
const JOLT_SCALE = 13;
const HAY_POINTS = 22;
const HAY_PRESSED = 1.6;
export const MAX_HAY = 4;
const START_HAY = 2;

// Threats.
const WINDUP = 0.85;
const FLIGHT = 1.3;
const RELOAD = 3.2;
/** Seconds after one tower starts before another may: one threat to read at a time. */
const LULL = 1.5;
const STONE_MASS = 16;
const STONE_RADIUS = 0.42;
const ARCHER_WINDUP = 1.3;
const ARCHER_RELOAD = 2.2;
const ARROW_DAMAGE = 12;
const ARROW_REACH = 2.1;
const STONE_REACH = 1.25;
const SWAT_RANGE = 5.5;
const SWAT_FLIGHT = 0.9;
const SHIELD_RANGE = 2.9;
const BLAST_TOWERS = 17;
const BLAST_PROPS = 11;
const BLAST_DAMAGE = 10;
const PICKUP_REACH = 1.9;
const HOIST_REACH = 4.4;

// The gun.
export const MAX_AMMO = 6;
const START_AMMO: readonly AmmoKind[] = ["shot", "shot"];
const GUN_COOLDOWN = 0.4;
const GUN_RANGE = 72;
const WALL_RANGE = 44;
const SHOT_SPEED = 44;
const SHOT_HOLE = 3.3;

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
/** Round shot knocks down one thing; a keg takes everything near it. */
export type AmmoKind = "shot" | "keg";

/** What the gun will hit if fired now. */
export interface Target {
  kind: "tower" | "wall";
  id: string;
  at: Vec3;
}

/** A round on its way. */
export interface Flight {
  id: number;
  kind: AmmoKind;
  from: Vec3;
  to: Vec3;
  t: number;
  total: number;
  target: Target;
}
export type BreakCause = "jolt" | "spilled" | "fell";

export type GameEvent =
  | { type: "windup"; tower: string }
  | { type: "launch"; tower: string }
  | { type: "aim"; tower: string }
  | { type: "volley"; tower: string; at: Vec3; hit: boolean; blocked: boolean; lostMan: boolean }
  | { type: "swat"; count: number }
  | { type: "brake" }
  | { type: "deflect"; at: Vec3 }
  | { type: "towerDown"; tower: string; at: Vec3 }
  | { type: "pickup"; kind: PickupKind; at: Vec3 }
  | { type: "blast"; at: Vec3 }
  | { type: "jolt"; amount: number; absorbed: number }
  | { type: "crack"; stage: number }
  | { type: "broken"; cause: BreakCause }
  | { type: "manLost" }
  | { type: "hayLost" }
  | { type: "machine"; part: PartId }
  | { type: "plough"; at: Vec3 }
  | { type: "land"; at: Vec3 }
  | { type: "shoot"; kind: AmmoKind }
  | { type: "bang"; at: Vec3; hit: "tower" | "wall" }
  | { type: "dry"; why: "empty" | "aimless" }
  | { type: "air"; time: number; distance: number }
  | { type: "finish" };

export type PropKind = "stone" | "crate" | "man" | "hay" | "beam" | "shell" | "block" | "archer";

/** A loose physical thing the view draws by id. */
export interface Prop {
  id: number;
  kind: PropKind;
  body: RAPIER.RigidBody;
  /** Half extents, or radius in x for round things. */
  size: Vec3;
  age: number;
  flung: boolean;
  /** Crates: the wall they were stacked in. */
  wall?: string;
  // Stones only.
  tower?: string;
  landed?: boolean;
  deflected?: boolean;
  /** Seconds until a swatted stone reaches the tower it came from. */
  returning?: number;
}

export interface Tower {
  def: TowerDef;
  /** Foot of the tower, beside the road. */
  pos: Vec3;
  alive: boolean;
  /** Seconds left of the wind-up; 0 when idle. */
  windup: number;
  cooldown: number;
  volleys: number;
  target: Vec3 | null;
  marker: number;
  /** A round is already on its way to it. */
  doomed: boolean;
}

export interface Marker {
  id: number;
  at: Vec3;
  /** Seconds until the stone or the arrows land. */
  t: number;
  total: number;
  kind: "stone" | "arrows";
  /** Stand inside this and it hits. */
  radius: number;
}

export interface Pickup {
  id: number;
  kind: PickupKind;
  pos: Vec3;
  taken: boolean;
}

export interface MachineState {
  part: PartId;
  active: number;
  cooldown: number;
  /** Times it can still act; Infinity for a machine that never wears out. */
  charges: number;
}

export interface Input {
  /** -1 leans left, 1 leans right. */
  lean: number;
  /** 0 lets her run, 1 is the brake hard on. */
  brake?: number;
  /** Fire the gun this step. */
  shoot?: boolean;
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

export class Game {
  readonly course: CourseDef;
  readonly build: readonly PartId[];
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
  men = MAX_MEN;
  /** Hay padding left, in points of jolt it will soak up. */
  padding = 0;
  /** What one bale soaks up. */
  readonly bale: number;
  /** How hard the brake is on, 0..1. */
  braking = 0;
  /** Smoothed lean, -1..1. */
  lean = 0;
  slick = false;
  grounded = true;
  /** How hard he was shaken this step, for the view's wobble. */
  jolt = 0;
  /** Seconds off the ground in the present leap. */
  airtime = 0;
  /** Rounds aboard, next to fire first. */
  ammo: AmmoKind[] = [...START_AMMO];
  /** What the gun is laid on. */
  target: Target | null = null;
  readonly flights: Flight[] = [];

  readonly machines: MachineState[];
  readonly towers: Tower[] = [];
  readonly markers: Marker[] = [];
  readonly props: Prop[] = [];
  readonly pickups: Pickup[] = [];

  private events: GameEvent[] = [];
  private nextId = 1;
  private seed = 0x9e3779b9;
  private prevVel: Vec3;
  private joltSkip = 12;
  /** How much of a landing the springs can still take, in metres per second. */
  private spring = SPRING_TRAVEL;
  private tipTime = 0;
  private ploughSide = 1;
  private gunCooldown = 0;
  private lull = 0;
  private airFrom = 0;
  private readonly doomedWalls = new Set<string>();

  static async create(build: readonly PartId[], course: CourseDef = COURSE): Promise<Game> {
    await initPhysics();
    return new Game(build, course);
  }

  constructor(build: readonly PartId[], course: CourseDef = COURSE) {
    this.course = course;
    this.build = [...build];
    this.machines = this.build.map((part) => ({ part, active: 0, cooldown: 0, charges: PARTS[part].charges ?? Infinity }));
    this.bale = HAY_POINTS * (this.has("screw") ? HAY_PRESSED : 1);
    this.padding = START_HAY * this.bale;
    this.world = new RAPIER.World({ x: 0, y: -G, z: 0 });
    this.world.timestep = STEP;
    this.layRoad();

    const startD = 2;
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

    for (const def of course.towers) {
      const half = course.width / 2;
      this.towers.push({
        def,
        pos: { x: def.side * (half + 2.9), y: heightAt(course, def.d), z: -def.d },
        alive: true,
        windup: 0,
        cooldown: 0,
        volleys: 3,
        target: null,
        marker: 0,
        doomed: false,
      });
    }
    for (const wall of course.walls) this.stackCrates(wall);
    for (const item of course.pickups) {
      this.pickups.push({ id: this.nextId++, kind: item.kind, pos: { x: item.x, y: heightAt(course, item.d), z: -item.d }, taken: false });
    }
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

  /** Distance travelled from the gate. */
  get distance(): number {
    return -this.chassis.translation().z;
  }

  get speed(): number {
    const v = this.chassis.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  /** 0 at the gate, 1 at the roost. */
  get progress(): number {
    return clamp(this.distance / this.course.finish, 0, 1);
  }

  get hay(): number {
    return Math.ceil(this.padding / this.bale - 1e-6);
  }

  get over(): boolean {
    return this.phase !== "run";
  }

  /** Stars for a finished run: home, an unbroken shell, and every man still aboard. */
  get stars(): number {
    if (this.phase !== "won") return 0;
    return 1 + (this.stage === 0 ? 1 : 0) + (this.men >= MAX_MEN ? 1 : 0);
  }

  machine(part: PartId): MachineState | undefined {
    return this.machines.find((machine) => machine.part === part);
  }

  has(part: PartId): boolean {
    return this.build.includes(part);
  }

  isActive(part: PartId): boolean {
    return (this.machine(part)?.active ?? 0) > 0;
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

    for (const machine of this.machines) {
      machine.active = Math.max(0, machine.active - STEP);
      machine.cooldown = Math.max(0, machine.cooldown - STEP);
    }
    this.gunCooldown = Math.max(0, this.gunCooldown - STEP);
    this.aim();
    if (!this.over && input.shoot) this.shoot();
    this.stepFlights();

    this.checkOil();
    this.steer(this.over ? 0 : input.lean);
    this.push(this.over ? 0 : clamp(input.brake ?? 0, 0, 1));
    if (!this.over) {
      this.stepTowers();
      this.stepPickups();
      if (this.has("wedge")) this.plough();
      if (this.has("lever")) this.bat();
      if (this.has("plane")) this.roof();
    }

    this.vehicle.updateVehicle(STEP, undefined, CART_GROUPS);
    this.world.step();

    this.stepProps();
    this.stepMarkers();
    this.feelJolt();
    if (!this.over) this.judge();
  }

  private steer(leanInput: number): void {
    this.lean += (clamp(leanInput, -1, 1) - this.lean) * Math.min(1, STEP / LEAN_LAG);
    const forward = rotate(this.chassis.rotation(), { x: 0, y: 0, z: -1 });
    const yaw = Math.atan2(forward.x, -forward.z); // positive: nose to the right
    const power = this.slick ? 0.2 : (LEAN_BASE + LEAN_PER_MAN * this.men) * (this.has("wheel") ? GREAT_WHEELS : 1);
    const assist = this.slick ? 0 : HEADING_GAIN;
    // A positive steering angle turns the nose left, hence the sign.
    const ease = Math.min(1, LEAN_EASE / Math.max(1, -this.chassis.linvel().z));
    const angle = clamp(-(this.lean * LEAN_MAX * power * ease - assist * yaw), -0.4, 0.4);
    this.vehicle.setWheelSteering(0, angle);
    this.vehicle.setWheelSteering(1, angle);
    let contacts = 0;
    for (let wheel = 0; wheel < WHEEL_AT.length; wheel += 1) {
      this.vehicle.setWheelFrictionSlip(wheel, this.slick ? SLICK_GRIP : GRIP);
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
        // The shoe bites the wheel. It will slow her to a trot, never to a stand.
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

  private checkOil(): void {
    const p = this.chassis.translation();
    const d = -p.z;
    this.slick = !this.has("wheel") && this.grounded && this.course.oil.some((patch) => d >= patch.d0 && d <= patch.d1 && p.x >= patch.x0 && p.x <= patch.x1);
  }

  // ---------------------------------------------------------------- machines

  /** The batting arm swings by itself at the first stone to come close, then has to be cocked again. */
  private bat(): void {
    const arm = this.machine("lever");
    if (!arm || arm.cooldown > 0) return;
    const cart = this.chassis.translation();
    for (const prop of this.props) {
      if (prop.kind !== "stone" || prop.landed || prop.deflected || prop.returning !== undefined) continue;
      const p = prop.body.translation();
      if (Math.hypot(p.x - cart.x, p.y - cart.y, p.z - cart.z) > SWAT_RANGE) continue;
      const tower = this.towers.find((candidate) => candidate.def.id === prop.tower);
      if (!tower) continue;
      const to = { x: tower.pos.x, y: tower.pos.y + 3.2, z: tower.pos.z };
      prop.body.setLinvel(
        { x: (to.x - p.x) / SWAT_FLIGHT, y: (to.y - p.y) / SWAT_FLIGHT + 0.5 * G * SWAT_FLIGHT, z: (to.z - p.z) / SWAT_FLIGHT },
        true,
      );
      prop.returning = SWAT_FLIGHT;
      this.dropMarker(prop.id);
      arm.active = PARTS.lever.active;
      arm.cooldown = PARTS.lever.cooldown;
      this.events.push({ type: "machine", part: "lever" }, { type: "swat", count: 1 });
      return;
    }
  }

  /** The prow flings loose things out of the road before they are struck. */
  private plough(): void {
    const cart = this.chassis.translation();
    const v = this.chassis.linvel();
    for (const prop of this.props) {
      if (prop.flung || prop.kind === "man" || prop.kind === "shell") continue;
      if (prop.kind === "stone" && !prop.landed) continue;
      const p = prop.body.translation();
      const ahead = cart.z - p.z;
      if (ahead < -0.4 || ahead > 4.2 || Math.abs(p.x - cart.x) > 1.75 || Math.abs(p.y - cart.y) > 1.9) continue;
      let side = Math.sign(p.x - cart.x);
      if (Math.abs(p.x - cart.x) < 0.25) {
        side = this.ploughSide;
        this.ploughSide = -this.ploughSide;
      }
      prop.body.setLinvel({ x: side * (6 + this.random() * 4), y: 5 + this.random() * 3, z: v.z * 1.1 }, true);
      prop.body.setAngvel({ x: this.random() * 8 - 4, y: this.random() * 8 - 4, z: this.random() * 8 - 4 }, true);
      prop.flung = true;
      const prow = this.machine("wedge");
      if (prow) prow.active = PARTS.wedge.active;
      this.events.push({ type: "plough", at: { ...p } });
    }
  }

  /** The sloped roof turns a stone aside before it lands a blow, and loses a plank doing it. */
  private roof(): void {
    const roof = this.machine("plane");
    if (!roof) return;
    const cart = this.chassis.translation();
    const v = this.chassis.linvel();
    for (const prop of this.props) {
      if (prop.kind !== "stone" || prop.landed || prop.deflected || prop.returning !== undefined) continue;
      const p = prop.body.translation();
      if (roof.charges <= 0) return;
      if (Math.hypot(p.x - cart.x, p.y - cart.y, p.z - cart.z) > SHIELD_RANGE) continue;
      roof.charges -= 1;
      roof.active = PARTS.plane.active;
      const side = p.x >= cart.x ? 1 : -1;
      prop.body.setLinvel({ x: side * 8, y: 7, z: v.z * 0.6 }, true);
      prop.deflected = true;
      this.dropMarker(prop.id);
      this.events.push({ type: "deflect", at: { ...p } });
    }
  }

  // ---------------------------------------------------------------- the gun

  /** Whether any of a wall's crates still stand where they were stacked. */
  wallStands(wall: WallDef): boolean {
    return this.props.some((prop) => prop.wall === wall.id && !prop.flung && Math.abs(-prop.body.translation().z - wall.d) < 1.2);
  }

  /** Lay the gun on whatever is next in the way: the nearest tower or standing wall ahead. */
  private aim(): void {
    this.target = null;
    if (this.over) return;
    const cart = this.chassis.translation();
    const d = -cart.z;
    let nearest = Infinity;
    for (const tower of this.towers) {
      const ahead = tower.def.d - d;
      if (!tower.alive || tower.doomed || ahead < -3 || ahead > GUN_RANGE || ahead >= nearest) continue;
      nearest = ahead;
      this.target = { kind: "tower", id: tower.def.id, at: { x: tower.pos.x, y: tower.pos.y + 2.6, z: tower.pos.z } };
    }
    // A cart with a plough has no quarrel with a barricade: keep the gun for the towers.
    for (const wall of this.has("wedge") ? [] : this.course.walls) {
      const ahead = wall.d - d;
      if (ahead < 7 || ahead > WALL_RANGE || ahead >= nearest || this.doomedWalls.has(wall.id) || !this.wallStands(wall)) continue;
      nearest = ahead;
      // Aim at the stretch of wall in front of the cart, so the hole is where it's wanted.
      const x = clamp(cart.x, wall.x0 + 0.9, wall.x1 - 0.9);
      this.target = { kind: "wall", id: wall.id, at: { x, y: heightAt(this.course, wall.d) + 0.8, z: -wall.d } };
    }
  }

  private shoot(): void {
    if (this.gunCooldown > 0) return;
    if (this.ammo.length === 0 || !this.target) {
      this.gunCooldown = 0.3;
      this.events.push({ type: "dry", why: this.ammo.length === 0 ? "empty" : "aimless" });
      return;
    }
    const kind = this.ammo.shift()!;
    const target = this.target;
    const cart = this.chassis.translation();
    const from = { x: cart.x, y: cart.y + 1.3, z: cart.z - 0.9 };
    const reach = Math.hypot(target.at.x - from.x, target.at.y - from.y, target.at.z - from.z);
    this.flights.push({ id: this.nextId++, kind, from, to: { ...target.at }, t: 0, total: clamp(reach / SHOT_SPEED, 0.32, 1.2), target });
    if (target.kind === "tower") {
      const tower = this.towers.find((candidate) => candidate.def.id === target.id);
      if (tower) tower.doomed = true;
    } else {
      this.doomedWalls.add(target.id);
    }
    this.gunCooldown = GUN_COOLDOWN;
    this.events.push({ type: "shoot", kind });
  }

  private stepFlights(): void {
    for (let index = this.flights.length - 1; index >= 0; index -= 1) {
      const flight = this.flights[index]!;
      flight.t += STEP;
      if (flight.t < flight.total) continue;
      this.flights.splice(index, 1);
      this.doomedWalls.delete(flight.target.id);
      if (flight.kind === "keg") {
        this.blast(flight.to);
        continue;
      }
      this.events.push({ type: "bang", at: { ...flight.to }, hit: flight.target.kind });
      if (flight.target.kind === "tower") {
        const tower = this.towers.find((candidate) => candidate.def.id === flight.target.id);
        if (tower) this.destroyTower(tower);
      } else {
        this.scatter(flight.to, SHOT_HOLE, 8);
      }
    }
  }

  /** Throw every loose thing within `reach` of a point outwards. */
  private scatter(at: Vec3, reach: number, force: number): void {
    for (const prop of this.props) {
      const p = prop.body.translation();
      const dx = p.x - at.x;
      const dz = p.z - at.z;
      const away = Math.hypot(dx, dz);
      if (away > reach || Math.abs(p.y - at.y) > reach + 2) continue;
      const push = force * (1 - away / (reach * 1.5));
      const norm = Math.max(0.5, away);
      prop.body.setLinvel({ x: (dx / norm) * push + (this.random() * 4 - 2), y: 4.5 + this.random() * 5, z: (dz / norm) * push - 2.5 }, true);
      prop.body.setAngvel({ x: this.random() * 10 - 5, y: this.random() * 10 - 5, z: this.random() * 10 - 5 }, true);
      prop.flung = true;
    }
  }

  // ---------------------------------------------------------------- towers

  private stepTowers(): void {
    const d = this.distance;
    this.lull = Math.max(0, this.lull - STEP);
    for (const tower of this.towers) {
      if (!tower.alive) continue;
      tower.cooldown = Math.max(0, tower.cooldown - STEP);
      if (tower.windup > 0) {
        tower.windup -= STEP;
        if (tower.windup <= 0) {
          tower.windup = 0;
          if (tower.def.kind === "mangonel") this.launch(tower);
          else this.volley(tower);
        }
        continue;
      }
      if (tower.cooldown > 0 || this.lull > 0 || d < tower.def.from || d > tower.def.to) continue;
      const cart = this.chassis.translation();
      const v = this.chassis.linvel();
      if (tower.def.kind === "mangonel") {
        const lead = WINDUP + FLIGHT;
        const targetD = -(cart.z + v.z * lead);
        const reach = this.course.width / 2 - 0.7;
        tower.target = { x: clamp(cart.x + v.x * lead, -reach, reach), y: heightAt(this.course, targetD) + 0.55, z: -targetD };
        tower.marker = this.nextId++;
        this.markers.push({ id: tower.marker, at: { x: tower.target.x, y: heightAt(this.course, targetD) + 0.06, z: -targetD }, t: lead, total: lead, kind: "stone", radius: STONE_REACH });
        tower.windup = WINDUP;
        this.lull = LULL;
        this.events.push({ type: "windup", tower: tower.def.id });
      } else if (tower.volleys > 0) {
        // Archers shoot at where the cart is going to be. Be somewhere else.
        const targetD = -(cart.z + v.z * ARCHER_WINDUP);
        const reach = this.course.width / 2 - 1;
        tower.target = { x: clamp(cart.x + v.x * ARCHER_WINDUP, -reach, reach), y: heightAt(this.course, targetD) + 0.06, z: -targetD };
        tower.marker = this.nextId++;
        this.markers.push({ id: tower.marker, at: { ...tower.target }, t: ARCHER_WINDUP, total: ARCHER_WINDUP, kind: "arrows", radius: ARROW_REACH });
        tower.windup = ARCHER_WINDUP;
        this.lull = LULL;
        this.events.push({ type: "aim", tower: tower.def.id });
      }
    }
  }

  private launch(tower: Tower): void {
    const target = tower.target;
    if (!target) return;
    const from = { x: tower.pos.x - tower.def.side * 0.6, y: tower.pos.y + 4.2, z: tower.pos.z };
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(from.x, from.y, from.z)
        .setLinvel((target.x - from.x) / FLIGHT, (target.y - from.y) / FLIGHT + 0.5 * G * FLIGHT, (target.z - from.z) / FLIGHT)
        .setAngvel({ x: this.random() * 6 - 3, y: this.random() * 6 - 3, z: this.random() * 6 - 3 })
        .setCcdEnabled(true),
    );
    this.world.createCollider(RAPIER.ColliderDesc.ball(STONE_RADIUS).setMass(STONE_MASS).setFriction(0.7).setRestitution(0.25), body);
    this.props.push({ id: tower.marker, kind: "stone", body, size: { x: STONE_RADIUS, y: STONE_RADIUS, z: STONE_RADIUS }, age: 0, flung: false, tower: tower.def.id, landed: false, deflected: false });
    tower.cooldown = RELOAD;
    tower.target = null;
    this.events.push({ type: "launch", tower: tower.def.id });
  }

  private volley(tower: Tower): void {
    tower.volleys -= 1;
    tower.cooldown = ARCHER_RELOAD;
    const cart = this.chassis.translation();
    const at = tower.target ?? { ...cart };
    tower.target = null;
    const hit = Math.hypot(cart.x - at.x, cart.z - at.z) <= ARROW_REACH;
    let blocked = false;
    let lostMan = false;
    if (hit) {
      const roof = this.machine("plane");
      if (roof && roof.charges > 0) {
        roof.charges -= 1;
        roof.active = PARTS.plane.active;
        blocked = true;
      } else if (this.men > 0) {
        this.loseMan(tower.def.side);
        lostMan = true;
      } else {
        this.damage(ARROW_DAMAGE);
      }
    }
    this.events.push({ type: "volley", tower: tower.def.id, at, hit, blocked, lostMan });
  }

  private destroyTower(tower: Tower): void {
    if (!tower.alive) return;
    tower.alive = false;
    tower.windup = 0;
    if (tower.target) this.dropMarker(tower.marker);
    tower.target = null;
    this.events.push({ type: "towerDown", tower: tower.def.id, at: { ...tower.pos } });
    // It comes apart: most of it away from the road, some of it onto it.
    const side = tower.def.side;
    const fling = (kind: PropKind, size: Vec3, mass: number, height: number): void => {
      const outward = this.random() < 0.8 ? 1 : -1;
      this.spawn(kind, size, mass, { x: tower.pos.x + this.random() * 1.6 - 0.8, y: tower.pos.y + height, z: tower.pos.z + this.random() * 1.6 - 0.8 }, {
        x: side * outward * (1.5 + this.random() * 5),
        y: 5 + this.random() * 7,
        z: this.random() * 9 - 5.5,
      });
    };
    const stone = tower.def.kind === "archers";
    for (let piece = 0; piece < (stone ? 9 : 4); piece += 1) fling("block", { x: 0.34, y: 0.3, z: 0.34 }, 5, 0.8 + this.random() * 3.6);
    for (let piece = 0; piece < (stone ? 2 : 6); piece += 1) fling("beam", { x: 0.13, y: 0.13, z: 0.95 }, 4, 1.4 + this.random() * 2.6);
    if (stone) for (let archer = 0; archer < 3; archer += 1) fling("archer", { x: 0.2, y: 0.22, z: 0.2 }, 6, 4.9);
  }

  // ---------------------------------------------------------------- things on the road

  private stackCrates(wall: WallDef): void {
    const half = 0.45;
    const count = Math.max(1, Math.round((wall.x1 - wall.x0) / (half * 2 + 0.06)));
    const pitch = (wall.x1 - wall.x0) / count;
    const base = heightAt(this.course, wall.d);
    for (let row = 0; row < wall.rows; row += 1) {
      for (let index = 0; index < count; index += 1) {
        const body = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(wall.x0 + pitch * (index + 0.5), base + half + 0.02 + row * half * 2, -wall.d)
            .setSleeping(true),
        );
        this.world.createCollider(RAPIER.ColliderDesc.cuboid(half, half, half).setMass(13).setFriction(0.9).setRestitution(0.05), body);
        this.props.push({ id: this.nextId++, kind: "crate", body, size: { x: half, y: half, z: half }, age: 0, flung: false, wall: wall.id });
      }
    }
  }

  private spawn(kind: PropKind, size: Vec3, mass: number, at: Vec3, velocity: Vec3): Prop {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(at.x, at.y, at.z)
        .setLinvel(velocity.x, velocity.y, velocity.z)
        .setAngvel({ x: this.random() * 10 - 5, y: this.random() * 10 - 5, z: this.random() * 10 - 5 }),
    );
    const shape = kind === "man" || kind === "archer" ? RAPIER.ColliderDesc.capsule(size.y, size.x) : RAPIER.ColliderDesc.cuboid(size.x, size.y, size.z);
    this.world.createCollider(shape.setMass(mass).setFriction(0.8).setRestitution(0.2).setCollisionGroups(RUBBLE_GROUPS), body);
    const prop: Prop = { id: this.nextId++, kind, body, size, age: 0, flung: true };
    this.props.push(prop);
    return prop;
  }

  private stepPickups(): void {
    const cart = this.chassis.translation();
    for (const pickup of this.pickups) {
      if (pickup.taken) continue;
      const away = Math.hypot(pickup.pos.x - cart.x, pickup.pos.z - cart.z);
      const hoist = this.machine("pulley");
      if (away > (hoist ? HOIST_REACH : PICKUP_REACH) || Math.abs(pickup.pos.y - cart.y) > 2.6) continue;
      // Munitions wait on the road until there's room in the rack.
      if ((pickup.kind === "shot" || pickup.kind === "keg") && this.ammo.length >= MAX_AMMO) continue;
      if (hoist && away > PICKUP_REACH) {
        hoist.active = PARTS.pulley.active;
        this.events.push({ type: "machine", part: "pulley" });
      }
      this.take(pickup);
    }
  }

  private take(pickup: Pickup): void {
    pickup.taken = true;
    this.events.push({ type: "pickup", kind: pickup.kind, at: { ...pickup.pos } });
    if (pickup.kind === "hay") this.padding = Math.min(MAX_HAY * this.bale, this.padding + this.bale);
    if (pickup.kind === "man") this.men = Math.min(MAX_MEN, this.men + 1);
    if (pickup.kind === "shot") this.ammo.push(...(["shot", "shot"] as const).slice(0, MAX_AMMO - this.ammo.length));
    // A keg jumps the queue: pick one up and the next shot is the big one.
    if (pickup.kind === "keg") this.ammo.unshift("keg");
  }

  private blast(at: Vec3): void {
    this.events.push({ type: "blast", at: { ...at } });
    for (const tower of this.towers) {
      if (Math.hypot(tower.pos.x - at.x, tower.pos.z - at.z) <= BLAST_TOWERS) this.destroyTower(tower);
    }
    this.scatter(at, BLAST_PROPS, 10);
    const cart = this.chassis.translation();
    if (Math.hypot(cart.x - at.x, cart.z - at.z) < 7) {
      const v = this.chassis.linvel();
      this.chassis.setLinvel({ x: v.x, y: Math.max(v.y, 0) + 2.4, z: v.z - 3 }, true);
      this.joltSkip = 3;
      this.damage(BLAST_DAMAGE);
    }
  }

  private loseMan(side: number): void {
    if (this.men <= 0) return;
    this.men -= 1;
    const cart = this.chassis.translation();
    const v = this.chassis.linvel();
    this.spawn("man", { x: 0.2, y: 0.22, z: 0.2 }, 8, { x: cart.x - side * 0.6, y: cart.y + 1, z: cart.z + 0.6 }, { x: -side * 3.5, y: 4.2, z: v.z * 0.5 });
    this.events.push({ type: "manLost" });
  }

  private stepProps(): void {
    const cart = this.chassis.translation();
    for (let index = this.props.length - 1; index >= 0; index -= 1) {
      const prop = this.props[index]!;
      prop.age += STEP;
      const p = prop.body.translation();
      const road = heightAt(this.course, -p.z);
      let gone = p.z > cart.z + 26 || p.y < road - 25;
      if (prop.kind === "stone") {
        if (prop.returning !== undefined) {
          prop.returning -= STEP;
          if (prop.returning <= 0) {
            const tower = this.towers.find((candidate) => candidate.def.id === prop.tower);
            if (tower) this.destroyTower(tower);
            gone = true;
          }
        } else if (!prop.landed && (p.y <= road + STONE_RADIUS + 0.12 || prop.age > FLIGHT + 0.25)) {
          prop.landed = true;
          this.events.push({ type: "land", at: { ...p } });
          const keg = this.pickups.find((pickup) => !pickup.taken && pickup.kind === "keg" && Math.hypot(pickup.pos.x - p.x, pickup.pos.z - p.z) < 2.2);
          if (keg) {
            // A stone on a keg lying in the road sets it off where it lies.
            keg.taken = true;
            this.blast(keg.pos);
          }
        }
        if (prop.age > 9) gone = true;
      } else if (prop.kind !== "crate" && prop.age > 10) {
        gone = true;
      }
      if (gone) {
        this.world.removeRigidBody(prop.body);
        this.props.splice(index, 1);
      }
    }
  }

  private stepMarkers(): void {
    for (let index = this.markers.length - 1; index >= 0; index -= 1) {
      const marker = this.markers[index]!;
      marker.t -= STEP;
      if (marker.t <= -0.15) this.markers.splice(index, 1);
    }
  }

  private dropMarker(id: number): void {
    const index = this.markers.findIndex((marker) => marker.id === id);
    if (index >= 0) this.markers.splice(index, 1);
  }

  // ---------------------------------------------------------------- the egg

  /** Only a jolt hurts him: how sharply the cart's velocity changed this step. */
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
    this.damage((change - JOLT_FLOOR) * JOLT_SCALE);
  }

  private damage(raw: number): void {
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
    if (this.shell <= 0) this.shatter("jolt");
  }

  private shatter(cause: BreakCause): void {
    if (this.phase !== "run") return;
    this.phase = "broken";
    this.cause = cause;
    this.shell = 0;
    this.stage = 3;
    this.markers.length = 0;
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
    if (this.time > 120) return this.shatter("spilled");
    if (d >= this.course.finish) {
      this.phase = "won";
      this.markers.length = 0;
      this.events.push({ type: "finish" });
    }
  }

  // ---------------------------------------------------------------- the world

  private layRoad(): void {
    const road = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const half = this.course.width / 2;
    for (const piece of this.course.pieces) {
      const run = piece.d1 - piece.d0;
      const rise = piece.y1 - piece.y0;
      const length = Math.hypot(run, rise);
      const angle = Math.asin(rise / length);
      const rotation = { x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) };
      const normal = { y: Math.cos(angle), z: Math.sin(angle) };
      const mid = { y: (piece.y0 + piece.y1) / 2, z: -(piece.d0 + piece.d1) / 2 };
      // A bridge that has lost a side is only as wide as what is left of it, with no kerb on the broken edge.
      const left = piece.x0 ?? -half;
      const right = piece.x1 ?? half;
      const low = left <= -half ? left - 0.6 : left;
      const high = right >= half ? right + 0.6 : right;
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid((high - low) / 2, 0.3, length / 2)
          .setTranslation((low + high) / 2, mid.y - normal.y * 0.3, mid.z - normal.z * 0.3)
          .setRotation(rotation)
          .setFriction(1),
        road,
      );
      for (const side of [-1, 1]) {
        if (side < 0 ? left > -half : right < half) continue;
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.3, 0.45, length / 2)
            .setTranslation(side * (half + 0.3), mid.y + normal.y * 0.3, mid.z + normal.z * 0.3)
            .setRotation(rotation)
            .setFriction(0.15),
          road,
        );
      }
    }
    // The back of the roost yard.
    const end = courseEnd(this.course);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(half + 0.6, 2, 0.5).setTranslation(0, heightAt(this.course, end) + 2, -end - 0.5), road);
  }

  private random(): number {
    // mulberry32: the run must replay exactly, so no Math.random here.
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
