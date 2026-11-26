/** The six simple machines. A cart carries three; each is one button during the run. */
export type PartId = "lever" | "wedge" | "plane" | "pulley" | "screw" | "wheel";

export interface PartDef {
  id: PartId;
  /** The simple machine it is. */
  machine: string;
  /** What it's called on the cart. */
  name: string;
  /** The one-word button. */
  verb: string;
  /** One line for the build card. */
  blurb: string;
  /** Seconds the effect lasts once fired. */
  active: number;
  /** Seconds before it can fire again. */
  cooldown: number;
}

export const PARTS: Record<PartId, PartDef> = {
  lever: {
    id: "lever",
    machine: "Lever",
    name: "Batting Arm",
    verb: "Swat",
    blurb: "Bats a stone back at the tower that threw it.",
    active: 0.3,
    cooldown: 2.2,
  },
  wedge: {
    id: "wedge",
    machine: "Wedge",
    name: "Plough",
    verb: "Smash",
    blurb: "Drops the prow and flings a barricade aside.",
    active: 1.6,
    cooldown: 3.4,
  },
  plane: {
    id: "plane",
    machine: "Inclined plane",
    name: "Sloped Shield",
    verb: "Shield",
    blurb: "Arrows and stones glance off for a moment.",
    active: 1.5,
    cooldown: 3.4,
  },
  pulley: {
    id: "pulley",
    machine: "Pulley",
    name: "Hoisted Cradle",
    verb: "Brace",
    blurb: "Hangs the King clear so a jolt passes under him.",
    active: 1.6,
    cooldown: 3.0,
  },
  screw: {
    id: "screw",
    machine: "Screw",
    name: "Aerial Screw",
    verb: "Hop",
    blurb: "A short lift over oil or a low obstacle.",
    active: 0.6,
    cooldown: 3.0,
  },
  wheel: {
    id: "wheel",
    machine: "Wheel and axle",
    name: "Flywheel",
    verb: "Surge",
    blurb: "A burst of speed that leaves a stone behind you.",
    active: 1.0,
    cooldown: 4.0,
  },
};

export const PART_IDS = Object.keys(PARTS) as PartId[];
export const SLOTS = 3;
