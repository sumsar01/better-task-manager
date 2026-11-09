// Mirrors TeamColors in the mac app (MilestoneComponents.swift) so a team has the
// same colour on both. Red and green are deliberately absent — they mean
// "critical" and "done/ready" here.
export const TEAM_PALETTE = [
  "#0a84ff", // blue
  "#5e5ce6", // indigo
  "#00c7be", // mint
  "#e86fb5", // soft magenta: system pink read as "critical" red next to the flame
  "#ac8e68", // brown
  "#32ade6", // cyan
  "#30b0c7", // teal
  "#ffcc00", // yellow
  "#ff9500", // orange
  "#af52de", // purple
  "#7385f2",
] as const;

const FNV_OFFSET = BigInt("0xcbf29ce484222325");
const FNV_PRIME = BigInt("0x100000001b3");
const MASK = (BigInt(1) << BigInt(64)) - BigInt(1);

function hashSlot(name: string): number {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(name)) {
    hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & MASK;
  }
  return Number(hash % BigInt(TEAM_PALETTE.length));
}

/** Hashing alone puts some teams on the same colour. Teams seen together are
 * assigned as a group, probing past taken slots in name order, so the same set
 * of teams always gets the same distinct colours. */
export function teamColors(names: Iterable<string>): Map<string, string> {
  const slots = new Map<string, number>();
  const used = new Set<number>();
  for (const name of [...new Set(names)].sort()) {
    let slot = hashSlot(name);
    for (let i = 0; i < TEAM_PALETTE.length && used.has(slot); i++) {
      slot = (slot + 1) % TEAM_PALETTE.length;
    }
    used.add(slot);
    slots.set(name, slot);
  }
  return new Map([...slots].map(([name, slot]) => [name, TEAM_PALETTE[slot]]));
}

/** Colour for a team seen on its own, when the rest of its milestone isn't known. */
export function teamColor(name: string): string {
  return TEAM_PALETTE[hashSlot(name)];
}
