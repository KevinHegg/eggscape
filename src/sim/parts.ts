/** The six simple machines. A cart carries three, and each works on its own: nothing to press. */
export type PartId = "lever" | "wedge" | "plane" | "pulley" | "screw" | "wheel";

export interface PartDef {
  id: PartId;
  /** The simple machine it is. */
  machine: string;
  /** What it's called on the cart. */
  name: string;
  /** One word, for the small badge shown during the run. */
  verb: string;
  /** One line for the build card. */
  blurb: string;
  /** Seconds its motion shows once it has acted. */
  active: number;
  /** Seconds before it can act again. */
  cooldown: number;
  /** How many times it can act at all; unlimited when absent. */
  charges?: number;
}

export const PARTS: Record<PartId, PartDef> = {
  lever: {
    id: "lever",
    machine: "Lever",
    name: "Batting Arm",
    verb: "Bat",
    blurb: "Bats a stone back at the tower that threw it, then takes a while to cock again.",
    active: 0.3,
    cooldown: 6,
  },
  wedge: {
    id: "wedge",
    machine: "Wedge",
    name: "Plough",
    verb: "Plough",
    blurb: "Shoulders crates and rubble out of the road.",
    active: 0.4,
    cooldown: 0,
  },
  plane: {
    id: "plane",
    machine: "Inclined plane",
    name: "Sloped Roof",
    verb: "Roof",
    blurb: "Turns aside three stones or volleys. Each one costs it a plank.",
    active: 0.5,
    cooldown: 0,
    charges: 3,
  },
  pulley: {
    id: "pulley",
    machine: "Pulley",
    name: "Hoist",
    verb: "Hoist",
    blurb: "Swings gifts aboard from half the road away.",
    active: 0.5,
    cooldown: 0,
  },
  screw: {
    id: "screw",
    machine: "Screw",
    name: "Hay Press",
    verb: "Press",
    blurb: "Packs the hay tight, so every bale takes a harder knock.",
    active: 0,
    cooldown: 0,
  },
  wheel: {
    id: "wheel",
    machine: "Wheel and axle",
    name: "Great Wheels",
    verb: "Wheels",
    blurb: "Grip through oil, and a quicker lean.",
    active: 0,
    cooldown: 0,
  },
};

export const PART_IDS = Object.keys(PARTS) as PartId[];
export const SLOTS = 3;
