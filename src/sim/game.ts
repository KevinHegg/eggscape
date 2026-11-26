import RAPIER from "@dimforge/rapier3d-compat";
import { COURSE, courseEnd, heightAt, slopeAt, type CourseDef, type PickupKind, type TowerDef } from "./course";
import { PARTS, type PartId } from "./parts";

/** Fixed simulation step. Slow motion changes how many steps run, never the step. */
export const STEP = 1 / 60;
const G = 9.81;

// The cart.
const START_SPEED = 8;
const MIN_SPEED = 9;
const PUSH = 4.5;
const DRAG = 0.0068;
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
const LEAN_LAG = 0.16;
const LEAN_MAX = 0.34;
const LEAN_BASE = 0.46;
const LEAN_PER_MAN = 0.18;
const HEADING_GAIN = 1.1;
export const MAX_MEN = 3;

// The egg.
const JOLT_FLOOR = 0.55;
const JOLT_SCALE = 13;
const BRACE = 0.2;
const HAY_POINTS = 22;
const MAX_HAY = 2;

// Threats.
const WINDUP = 0.85;
const FLIGHT = 1.3;
const RELOAD = 2.3;
const STONE_MASS = 16;
const STONE_RADIUS = 0.42;
const ARCHER_WINDUP = 0.95;
const ARCHER_RELOAD = 1.4;
const ARROW_DAMAGE = 12;
const SWAT_RANGE = 10;
const SWAT_FLIGHT = 0.9;
const SHIELD_RANGE = 2.9;
const BLAST_TOWERS = 17;
const BLAST_PROPS = 11;
const BLAST_DAMAGE = 10;
const HOP = 4.9;
const SURGE = 6.5;

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
export type BreakCause = "jolt" | "spilled" | "fell";

export type GameEvent =
  | { type: "windup"; tower: string }
  | { type: "launch"; tower: string }
  | { type: "aim"; tower: string }
  | { type: "volley"; tower: string; blocked: boolean; lostMan: boolean }
  | { type: "swat"; count: number }
  | { type: "whiff" }
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
  | { type: "finish" };

export type PropKind = "stone" | "crate" | "man" | "hay" | "beam" | "shell";

/** A loose physical thing the view draws by id. */
export interface Prop {
  id: number;
  kind: PropKind;
  body: RAPIER.RigidBody;
  /** Half extents, or radius in x for round things. */
  size: Vec3;
  age: number;
  flung: boolean;
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
}

export interface Marker {
  id: number;
  at: Vec3;
  /** Seconds until the stone lands. */
  t: number;
  total: number;
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
}

export interface Input {
  /** -1 leans left, 1 leans right. */
  lean: number;
  /** Machines fired this step. */
  fire: readonly PartId[];
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
  /** Smoothed lean, -1..1. */
  lean = 0;
  slick = false;
  grounded = true;
  /** How hard he was shaken this step, for the view's wobble. */
  jolt = 0;

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
  private tipTime = 0;
  private ploughSide = 1;

  static async create(build: readonly PartId[], course: CourseDef = COURSE): Promise<Game> {
    await initPhysics();
    return new Game(build, course);
  }

  constructor(build: readonly PartId[], course: CourseDef = COURSE) {
    this.course = course;
    this.build = [...build];
    this.machines = this.build.map((part) => ({ part, active: 0, cooldown: 0 }));
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
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.7, 0.2, 1.15).setMass(90).setFriction(0.25).setRestitution(0.1), this.chassis);
    // The King himself, riding high.
    this.world.createCollider(RAPIER.ColliderDesc.ball(0.42).setTranslation(0, 0.78, 0.15).setMass(6).setFriction(0.3), this.chassis);

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
        pos: { x: def.side * (half + 3.4), y: heightAt(course, def.d), z: -def.d },
        alive: true,
        windup: 0,
        cooldown: 0,
        volleys: 2,
        target: null,
        marker: 0,
      });
    }
    for (const wall of course.barricades) this.stackCrates(wall);
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
    return Math.ceil(this.padding / HAY_POINTS - 1e-6);
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
    if (!this.over) for (const part of input.fire) this.fire(part);

    this.checkOil();
    this.steer(this.over ? 0 : input.lean);
    this.push();
    if (!this.over) {
      this.stepTowers();
      this.stepPickups();
      if (this.isActive("wedge")) this.plough();
      if (this.isActive("plane")) this.shield();
    }

    this.vehicle.updateVehicle(STEP);
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
    const power = this.slick ? 0.2 : LEAN_BASE + LEAN_PER_MAN * this.men;
    const assist = this.slick ? 0 : HEADING_GAIN;
    // A positive steering angle turns the nose left, hence the sign.
    const angle = clamp(-(this.lean * LEAN_MAX * power - assist * yaw), -0.4, 0.4);
    this.vehicle.setWheelSteering(0, angle);
    this.vehicle.setWheelSteering(1, angle);
    let contacts = 0;
    for (let wheel = 0; wheel < WHEEL_AT.length; wheel += 1) {
      this.vehicle.setWheelFrictionSlip(wheel, this.slick ? SLICK_GRIP : GRIP);
      if (this.vehicle.wheelIsInContact(wheel)) contacts += 1;
    }
    this.grounded = contacts >= 2;
  }

  private push(): void {
    const v = this.chassis.linvel();
    const mass = this.chassis.mass();
    const speed = Math.hypot(v.x, v.y, v.z);
    const impulse = { x: 0, y: 0, z: 0 };
    if (this.phase === "won") {
      // Home: the yard's straw brings the cart to rest.
      impulse.x -= v.x * mass * 1.5 * STEP;
      impulse.z -= v.z * mass * 1.5 * STEP;
    } else {
      const drag = this.isActive("wheel") ? 0 : DRAG * speed * mass * STEP;
      impulse.x -= v.x * drag;
      impulse.y -= v.y * drag;
      impulse.z -= v.z * drag;
      if (this.phase === "run" && this.grounded && -v.z < MIN_SPEED) {
        // The King's men put their shoulders to it.
        const slope = slopeAt(this.course, this.distance);
        const norm = Math.hypot(1, slope);
        impulse.y -= (slope / norm) * PUSH * mass * STEP;
        impulse.z -= (1 / norm) * PUSH * mass * STEP;
      }
    }
    this.chassis.applyImpulse(impulse, true);
  }

  private checkOil(): void {
    const p = this.chassis.translation();
    const d = -p.z;
    this.slick = this.grounded && this.course.oil.some((patch) => d >= patch.d0 && d <= patch.d1 && p.x >= patch.x0 && p.x <= patch.x1);
  }

  // ---------------------------------------------------------------- machines

  private fire(part: PartId): void {
    const machine = this.machine(part);
    if (!machine || machine.cooldown > 0) return;
    const def = PARTS[part];
    machine.active = def.active;
    machine.cooldown = def.cooldown;
    this.events.push({ type: "machine", part });
    if (part === "lever") this.swat();
    if (part === "screw") this.hop();
    if (part === "wheel") this.surge();
  }

  private swat(): void {
    const cart = this.chassis.translation();
    let count = 0;
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
      count += 1;
    }
    this.events.push(count > 0 ? { type: "swat", count } : { type: "whiff" });
  }

  private hop(): void {
    if (!this.grounded) return;
    const v = this.chassis.linvel();
    this.chassis.setLinvel({ x: v.x, y: HOP, z: v.z }, true);
    this.joltSkip = 3;
  }

  private surge(): void {
    const v = this.chassis.linvel();
    const flat = Math.hypot(v.x, v.z);
    const dir = flat > 1 ? { x: v.x / flat, z: v.z / flat } : { x: 0, z: -1 };
    this.chassis.setLinvel({ x: v.x + dir.x * SURGE, y: v.y, z: v.z + dir.z * SURGE }, true);
    this.joltSkip = 3;
  }

  /** The dropped prow flings loose things out of the road before they are struck. */
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
      this.events.push({ type: "plough", at: { ...p } });
    }
  }

  /** The raised plate turns a stone aside before it lands a blow. */
  private shield(): void {
    const cart = this.chassis.translation();
    const v = this.chassis.linvel();
    for (const prop of this.props) {
      if (prop.kind !== "stone" || prop.landed || prop.deflected || prop.returning !== undefined) continue;
      const p = prop.body.translation();
      if (Math.hypot(p.x - cart.x, p.y - cart.y, p.z - cart.z) > SHIELD_RANGE) continue;
      const side = p.x >= cart.x ? 1 : -1;
      prop.body.setLinvel({ x: side * 8, y: 7, z: v.z * 0.6 }, true);
      prop.deflected = true;
      this.dropMarker(prop.id);
      this.events.push({ type: "deflect", at: { ...p } });
    }
  }

  // ---------------------------------------------------------------- towers

  private stepTowers(): void {
    const d = this.distance;
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
      if (tower.cooldown > 0 || d < tower.def.from || d > tower.def.to) continue;
      if (tower.def.kind === "mangonel") {
        const cart = this.chassis.translation();
        const v = this.chassis.linvel();
        const lead = WINDUP + FLIGHT;
        const targetD = -(cart.z + v.z * lead);
        const reach = this.course.width / 2 - 0.7;
        tower.target = { x: clamp(cart.x + v.x * lead, -reach, reach), y: heightAt(this.course, targetD) + 0.55, z: -targetD };
        tower.marker = this.nextId++;
        this.markers.push({ id: tower.marker, at: { x: tower.target.x, y: heightAt(this.course, targetD) + 0.06, z: -targetD }, t: lead, total: lead });
        tower.windup = WINDUP;
        this.events.push({ type: "windup", tower: tower.def.id });
      } else if (tower.volleys > 0) {
        tower.windup = ARCHER_WINDUP;
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
    const blocked = this.isActive("plane");
    let lostMan = false;
    if (!blocked) {
      if (this.men > 0) {
        this.loseMan(tower.def.side);
        lostMan = true;
      } else {
        this.damage(ARROW_DAMAGE);
      }
    }
    this.events.push({ type: "volley", tower: tower.def.id, blocked, lostMan });
  }

  private destroyTower(tower: Tower): void {
    if (!tower.alive) return;
    tower.alive = false;
    tower.windup = 0;
    if (tower.target) this.dropMarker(tower.marker);
    tower.target = null;
    this.events.push({ type: "towerDown", tower: tower.def.id, at: { ...tower.pos } });
    for (let beam = 0; beam < 4; beam += 1) {
      this.spawn("beam", { x: 0.14, y: 0.14, z: 0.9 }, 5, { x: tower.pos.x, y: tower.pos.y + 1.2 + beam * 0.8, z: tower.pos.z + this.random() - 0.5 }, {
        x: -tower.def.side * (1.5 + this.random() * 2.5),
        y: 3 + this.random() * 3,
        z: this.random() * 4 - 2,
      });
    }
  }

  // ---------------------------------------------------------------- things on the road

  private stackCrates(wall: { d: number; x0: number; x1: number; rows: number }): void {
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
        this.props.push({ id: this.nextId++, kind: "crate", body, size: { x: half, y: half, z: half }, age: 0, flung: false });
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
    const shape = kind === "man" ? RAPIER.ColliderDesc.capsule(size.y, size.x) : RAPIER.ColliderDesc.cuboid(size.x, size.y, size.z);
    this.world.createCollider(shape.setMass(mass).setFriction(0.8).setRestitution(0.2), body);
    const prop: Prop = { id: this.nextId++, kind, body, size, age: 0, flung: true };
    this.props.push(prop);
    return prop;
  }

  private stepPickups(): void {
    const cart = this.chassis.translation();
    for (const pickup of this.pickups) {
      if (pickup.taken) continue;
      if (Math.hypot(pickup.pos.x - cart.x, pickup.pos.z - cart.z) > 1.7 || Math.abs(pickup.pos.y - cart.y) > 2.6) continue;
      this.take(pickup);
    }
  }

  private take(pickup: Pickup): void {
    pickup.taken = true;
    this.events.push({ type: "pickup", kind: pickup.kind, at: { ...pickup.pos } });
    if (pickup.kind === "hay") this.padding = Math.min(MAX_HAY * HAY_POINTS, this.padding + HAY_POINTS);
    if (pickup.kind === "man") this.men = Math.min(MAX_MEN, this.men + 1);
    if (pickup.kind === "keg") this.blast(pickup.pos);
  }

  private blast(at: Vec3): void {
    this.events.push({ type: "blast", at: { ...at } });
    for (const tower of this.towers) {
      if (Math.hypot(tower.pos.x - at.x, tower.pos.z - at.z) <= BLAST_TOWERS) this.destroyTower(tower);
    }
    for (const prop of this.props) {
      const p = prop.body.translation();
      const dx = p.x - at.x;
      const dz = p.z - at.z;
      const reach = Math.hypot(dx, dz);
      if (reach > BLAST_PROPS) continue;
      const force = 9 * (1 - reach / (BLAST_PROPS * 1.4));
      const norm = Math.max(0.5, reach);
      prop.body.setLinvel({ x: (dx / norm) * force + (this.random() * 4 - 2), y: 5 + this.random() * 5, z: (dz / norm) * force - 2 }, true);
      prop.flung = true;
    }
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
          if (keg) this.take(keg);
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
    const dx = v.x - this.prevVel.x;
    const dy = v.y - this.prevVel.y + G * STEP;
    const dz = v.z - this.prevVel.z;
    this.prevVel = { x: v.x, y: v.y, z: v.z };
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
    let amount = raw * (this.isActive("pulley") ? BRACE : 1);
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
    if (this.time > 80) return this.shatter("spilled");
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
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(half + 0.6, 0.3, length / 2)
          .setTranslation(0, mid.y - normal.y * 0.3, mid.z - normal.z * 0.3)
          .setRotation(rotation)
          .setFriction(1),
        road,
      );
      for (const side of [-1, 1]) {
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
