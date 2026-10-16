// Play calls for the batted-ball lab.
//
// Home run: a fair ball whose bottom is above the drawn wall when it reaches
// the drawn fence. Fence distance depends on spray (about 340 ft at the lines,
// 400 ft in center). There is no single distance that is a home run.
//
// Hit type: Statcast launch-angle bands.
// https://www.mlb.com/glossary/statcast/launch-angle
//
// Barrel: Statcast's window. 98 mph is 26–30°. The window opens linearly to
// 8–50° at 116 mph.
// https://www.mlb.com/glossary/statcast/barrel
//
// Anything that stays in play is scored against an average MLB defense:
// fielders at the depths below, a 27 ft/s sprint, and a 0.45 s jump. Outs are
// plays a fielder can reach before the ball lands. The ball is not a home run
// just because it traveled a long way.

export const FOUL_POLE_M = 100.58; // 330 ft, the foul poles
export const CENTER_FIELD_M = 121.92; // 400 ft
export const WALL_HEIGHT_M = 4; // the fence mesh is 4 m tall, about 13 ft

const METERS_PER_FOOT = 0.3048;
export const SPRINT_MPS = 27 * METERS_PER_FOOT;
export const REACTION_S = 0.45;
const GLOVE_M = 2;
const PAST_FIELDER_M = 0; // carry beyond the assigned outfielder's depth
const GAP_DEGREES = 10;
const GAP_MIN_M = 85; // about 279 ft. Shorter gap balls are singles.
const CORNER_DEGREES = 10;

export type HitType = 'Ground ball' | 'Line drive' | 'Fly ball' | 'Popup';
export type PlayKind = 'hr' | 'hit' | 'out' | 'foul';

export type ScoreInput = {
  exitVeloMps: number;
  launchAngleDeg: number;
  landingX: number;
  landingZ: number;
  hangTimeS: number;
  clearedFence: boolean;
  hitWall: boolean;
  clearanceHeightM: number | null;
};

export type Score = {
  hitType: HitType;
  barrel: boolean;
  hardHit: boolean;
  result: string;
  reason: string;
  kind: PlayKind;
  fenceM: number;
  carryM: number;
  /** Defender the scorer sends to the ball, when there is one. */
  fielder: string | null;
};

export type Fielder = {
  name: string;
  x: number;
  z: number;
  group: 'infield' | 'outfield';
};

const DEG = Math.PI / 180;

/** Point on the field. Angle 0 is the left-field line (+X); π/2 is the right-field line (+Z). */
export function fieldPoint(thetaFromLfLine: number, radiusMeters: number): [number, number, number] {
  return [radiusMeters * Math.cos(thetaFromLfLine), 0, radiusMeters * Math.sin(thetaFromLfLine)];
}

function place(name: string, feet: number, degFromLfLine: number, group: Fielder['group']): Fielder {
  const r = feet * METERS_PER_FOOT;
  const t = degFromLfLine * DEG;
  const [x, , z] = fieldPoint(t, r);
  return { name, x, z, group };
}

// Depths are a straight-up average alignment, no shift.
// Left-field line is 0°, center is 45°, right-field line is 90°.
const INFIELD: Fielder[] = [
  place('3B', 110, 14, 'infield'),
  place('SS', 145, 32, 'infield'),
  place('2B', 145, 58, 'infield'),
  place('1B', 105, 76, 'infield'),
  // The mound drawn in the scene, 45 ft down each baseline.
  { name: 'P', x: 13.716, z: 13.716, group: 'infield' },
];

const OUTFIELD: Fielder[] = [
  place('LF', 290, 20, 'outfield'),
  place('CF', 320, 45, 'outfield'),
  place('RF', 290, 70, 'outfield'),
];

export const FIELDERS: readonly Fielder[] = [...INFIELD, ...OUTFIELD];
const ALL_FIELDERS = FIELDERS;

export function metersToFeet(meters: number): number {
  return meters / METERS_PER_FOOT;
}

function ft(meters: number): string {
  return `${Math.round(metersToFeet(meters))} ft`;
}

function secs(seconds: number): string {
  return `${seconds.toFixed(1)} s`;
}

/** Fence radius at an angle from the left-field line. Same curve as the mesh. */
export function fenceRadiusMeters(thetaFromLfLine: number): number {
  const theta = Math.min(Math.PI / 2, Math.max(0, thetaFromLfLine));
  const span = CENTER_FIELD_M - FOUL_POLE_M;
  return FOUL_POLE_M + span * Math.sin(theta * 2) * 0.85 + span * 0.15;
}

/** Spray is 0° at center, negative toward the left-field line. */
export function fenceMetersForSpray(sprayDeg: number): number {
  const theta = Math.PI / 4 + (sprayDeg * Math.PI) / 180;
  return fenceRadiusMeters(theta);
}

export type FenceCross = {
  cleared: boolean;
  hitWall: boolean;
  clearanceHeightM: number | null;
};

/**
 * Did this step cross the fence? The ball clears when its bottom is above the
 * wall at the fence distance. A step that reaches the fence lower than that
 * hit the wall. Null means the step stayed inside.
 */
export function fenceCross(
  prevX: number,
  prevY: number,
  prevZ: number,
  x: number,
  y: number,
  z: number,
  ballRadius: number,
): FenceCross | null {
  if (x < -0.3 || z < -0.3) return null;
  const prevDist = Math.hypot(prevX, prevZ);
  const dist = Math.hypot(x, z);
  const fenceR = fenceRadiusMeters(Math.atan2(z, x));
  if (!(prevDist < fenceR && dist >= fenceR)) return null;
  const span = dist - prevDist;
  const t = span > 1e-6 ? (fenceR - prevDist) / span : 1;
  const bottom = prevY + (y - prevY) * t - ballRadius;
  if (bottom > WALL_HEIGHT_M) {
    return { cleared: true, hitWall: false, clearanceHeightM: bottom - WALL_HEIGHT_M };
  }
  return { cleared: false, hitWall: true, clearanceHeightM: null };
}

export function statcastHitType(launchAngleDeg: number): HitType {
  if (launchAngleDeg < 10) return 'Ground ball';
  if (launchAngleDeg < 25) return 'Line drive';
  if (launchAngleDeg < 50) return 'Fly ball';
  return 'Popup';
}

export function isHardHit(exitVeloMph: number): boolean {
  return exitVeloMph >= 95;
}

export function isBarrel(exitVeloMph: number, launchAngleDeg: number): boolean {
  if (exitVeloMph < 98) return false;
  const ev = Math.min(exitVeloMph, 116);
  const t = (ev - 98) / (116 - 98);
  const lower = 26 + (8 - 26) * t;
  const upper = 30 + (50 - 30) * t;
  return launchAngleDeg >= lower && launchAngleDeg <= upper;
}

function fieldSlice(theta: number): string {
  const deg = (theta * 180) / Math.PI;
  if (deg < 15) return 'down the left-field line';
  if (deg < 35) return 'to left field';
  if (deg < 55) return 'to center';
  if (deg < 75) return 'to right field';
  return 'down the right-field line';
}

function outName(hitType: HitType): string {
  if (hitType === 'Ground ball') return 'Ground out';
  if (hitType === 'Line drive') return 'Line out';
  if (hitType === 'Popup') return 'Pop out';
  return 'Fly out';
}

function arriveSeconds(awayM: number): number {
  return REACTION_S + Math.max(0, awayM - GLOVE_M) / SPRINT_MPS;
}

function bestCatch(
  landingX: number,
  landingZ: number,
  hangTimeS: number,
): { name: string; arriveS: number } | null {
  let best: { name: string; arriveS: number } | null = null;
  for (const fielder of ALL_FIELDERS) {
    const away = Math.hypot(fielder.x - landingX, fielder.z - landingZ);
    const arriveS = arriveSeconds(away);
    if (arriveS <= hangTimeS && (best === null || arriveS < best.arriveS)) {
      best = { name: fielder.name, arriveS };
    }
  }
  return best;
}

function groundOutFielder(
  ux: number,
  uz: number,
  horizontalMps: number,
): { name: string; ballS: number; fielderS: number } | null {
  let best: { name: string; ballS: number; fielderS: number } | null = null;
  for (const fielder of INFIELD) {
    const along = fielder.x * ux + fielder.z * uz;
    if (along < 1 || along > 50) continue;
    const lat = Math.hypot(fielder.x - ux * along, fielder.z - uz * along);
    const ballS = along / Math.max(horizontalMps, 0.5);
    const fielderS = arriveSeconds(lat);
    if (fielderS < ballS && (best === null || fielderS < best.fielderS)) {
      best = { name: fielder.name, ballS, fielderS };
    }
  }
  return best;
}

function assignedOutfielder(theta: number): Fielder {
  let best = OUTFIELD[0];
  let bestDiff = Infinity;
  for (const fielder of OUTFIELD) {
    const diff = Math.abs(Math.atan2(fielder.z, fielder.x) - theta);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = fielder;
    }
  }
  return best;
}

function nearestOutfieldGapDeg(theta: number): number {
  let best = Infinity;
  for (const fielder of OUTFIELD) {
    const diff = Math.abs(Math.atan2(fielder.z, fielder.x) - theta);
    if (diff < best) best = diff;
  }
  return (best * 180) / Math.PI;
}

function corner(theta: number): boolean {
  const deg = (theta * 180) / Math.PI;
  return deg <= CORNER_DEGREES || deg >= 90 - CORNER_DEGREES;
}

export function scorePlay(input: ScoreInput): Score {
  const hitType = statcastHitType(input.launchAngleDeg);
  const exitVeloMph = metersToFeet(input.exitVeloMps) * (3600 / 5280);
  const barrel = isBarrel(exitVeloMph, input.launchAngleDeg);
  const hardHit = isHardHit(exitVeloMph);
  const carryM = Math.hypot(input.landingX, input.landingZ);
  const theta = Math.atan2(input.landingZ, input.landingX);
  const fair = input.landingX >= -0.3 && input.landingZ >= -0.3 && theta >= -0.02 && theta <= Math.PI / 2 + 0.02;
  const fenceM = fenceRadiusMeters(fair ? theta : Math.min(Math.PI / 2, Math.max(0, theta)));
  const where = fieldSlice(fair ? theta : Math.PI / 4);
  const base = { hitType, barrel, hardHit, fenceM, carryM };

  const call = (result: string, reason: string, kind: PlayKind, fielder: string | null): Score => ({
    ...base,
    result,
    reason,
    kind,
    fielder,
  });

  if (input.clearedFence) {
    const over =
      input.clearanceHeightM === null || input.clearanceHeightM < 0.4
        ? 'just over'
        : `${ft(input.clearanceHeightM)} above`;
    return call(
      'Home run',
      `Cleared the ${ft(fenceM)} fence ${where}, ${over} the ${ft(WALL_HEIGHT_M)} wall. Carry ${ft(carryM)}.`,
      'hr',
      null,
    );
  }

  if (!fair) {
    return call('Foul', 'Landed outside the foul lines.', 'foul', null);
  }

  const shortBy = fenceM - carryM;
  const fenceNote =
    shortBy > 0
      ? `Carry ${ft(carryM)} ${where}, ${ft(shortBy)} short of the ${ft(fenceM)} fence.`
      : `Carry ${ft(carryM)} ${where}. The fence there is ${ft(fenceM)}.`;

  if (hitType === 'Ground ball') {
    const horizontal = input.exitVeloMps * Math.cos((input.launchAngleDeg * Math.PI) / 180);
    const ux = carryM > 0.5 ? input.landingX / carryM : Math.SQRT1_2;
    const uz = carryM > 0.5 ? input.landingZ / carryM : Math.SQRT1_2;
    const fielder = groundOutFielder(ux, uz, Math.abs(horizontal));
    if (fielder) {
      return call(
        'Ground out',
        `Ground ball. ${fielder.name} gets to the path in ${secs(fielder.fielderS)}; the ball takes ${secs(fielder.ballS)} to get there.`,
        'out',
        fielder.name,
      );
    }
    if (input.hitWall) {
      const result = corner(theta) ? 'Triple' : 'Double';
      return call(
        result,
        `Ground ball through the infield and off the ${ft(fenceM)} fence ${where}. It did not clear the wall.`,
        'hit',
        assignedOutfielder(theta).name,
      );
    }
    return call(
      'Single',
      `Ground ball through the infield ${where}. No infielder gets to the path before the ball.`,
      'hit',
      assignedOutfielder(theta).name,
    );
  }

  if (input.hitWall) {
    const result = corner(theta) ? 'Triple' : 'Double';
    return call(
      result,
      `Reached the ${ft(fenceM)} fence ${where} and stayed under the ${ft(WALL_HEIGHT_M)} wall.`,
      'hit',
      assignedOutfielder(theta).name,
    );
  }

  const catcher = bestCatch(input.landingX, input.landingZ, input.hangTimeS);
  if (catcher) {
    return call(
      outName(hitType),
      `${fenceNote} ${catcher.name} is there in ${secs(catcher.arriveS)} (hang time ${secs(input.hangTimeS)}).`,
      'out',
      catcher.name,
    );
  }

  const outfielder = assignedOutfielder(theta);
  const outfielderDepth = Math.hypot(outfielder.x, outfielder.z);
  const gapDeg = nearestOutfieldGapDeg(theta);
  if (carryM > outfielderDepth + PAST_FIELDER_M) {
    return call(
      'Double',
      `${fenceNote} It gets past ${outfielder.name}, who starts at ${ft(outfielderDepth)}, and nobody catches it.`,
      'hit',
      outfielder.name,
    );
  }
  if (gapDeg >= GAP_DEGREES && carryM >= GAP_MIN_M) {
    return call(
      'Double',
      `${fenceNote} It falls in the gap, ${Math.round(gapDeg)}° off the nearest outfielder, and nobody catches it in ${secs(input.hangTimeS)}.`,
      'hit',
      outfielder.name,
    );
  }

  return call(
    'Single',
    `${fenceNote} It drops in front of ${outfielder.name} and nobody reaches it in ${secs(input.hangTimeS)}.`,
    'hit',
    outfielder.name,
  );
}
