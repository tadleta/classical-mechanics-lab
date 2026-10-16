import { BAG } from './diamond';
import {
  FIELDERS,
  REACTION_S,
  SPRINT_MPS,
  fenceCross,
  fenceRadiusMeters,
  fieldPoint,
  scorePlay,
  type Score,
} from './scoring';

/** Same drag the baseball scene applies while the ball is in the air. */
export const BALL_DRAG = 0.0034;
export const RUNNER_MPS = 6.5;
export const THROW_MPS = 36;
export const FIELDER_COLOR = '#e2e8f0';
export const BATTER_COLOR = '#f97316';

/** Right-handed batter, on the third-base side of the plate. */
export const BATTER = { x: 1.05, z: -0.85 };
/** Behind the plate, toward the camera. Not part of the scoring model. */
export const CATCHER = { x: -2.3, z: -2.3 };

export type LivePlay = {
  nonce: number;
  active: boolean;
  landed: boolean;
  time: number;
  ballX: number;
  ballY: number;
  ballZ: number;
  landingX: number | null;
  landingZ: number | null;
  launchAngle: number;
  speedMs: number;
  spray: number;
  ballRadius: number;
  play: Score | null;
  /** True once a fielder has the ball, so the physics ball can hide behind the glove and the throw. */
  fielded: boolean;
};

export function createLivePlay(): LivePlay {
  return {
    nonce: 0,
    active: false,
    landed: false,
    time: 0,
    ballX: 0,
    ballY: 0.15,
    ballZ: 0,
    landingX: null,
    landingZ: null,
    launchAngle: 25,
    speedMs: 42,
    spray: 0,
    ballRadius: 0.037,
    play: null,
    fielded: false,
  };
}

/** One clock for the single baseball scene. The animation reads it every frame without React state. */
export const livePlay = createLivePlay();

export type BoardCopy = {
  headline: string;
  detail: string;
  footer: string;
  color: string;
  bases: 0 | 1 | 2 | 3 | 4;
};

function basesOnBoard(result: string): 0 | 1 | 2 | 3 | 4 {
  if (result === 'Home run') return 4;
  if (result === 'Triple') return 3;
  if (result === 'Double') return 2;
  if (result === 'Single') return 1;
  return 0;
}

/** Where the batter-runner is when the play is over. Outs leave the bases empty. */
function situation(play: Score): string {
  if (play.kind === 'hr') return 'RUN SCORES';
  if (play.result === 'Triple') return 'RUNNER ON THIRD';
  if (play.result === 'Double') return 'RUNNER ON SECOND';
  if (play.result === 'Single') return 'RUNNER ON FIRST';
  if (play.kind === 'foul') return 'FOUL BALL';
  return '1 OUT';
}

export function boardCopy(input: {
  active: boolean;
  play: Score | null;
  distanceM: number;
  speedMs: number;
  angle: number;
  hangTimeS: number;
}): BoardCopy {
  const feet = Math.round(input.distanceM * 3.28084);
  const mph = Math.round(input.speedMs / 0.44704);
  const detail = `${feet} FT    EV ${mph} MPH    LA ${Math.round(input.angle)}°`;
  if (!input.active) {
    return { headline: 'PLAY BALL', detail: 'BATTER UP', footer: '', color: '#e2e8f0', bases: 0 };
  }
  if (!input.play) {
    return { headline: 'IN PLAY', detail, footer: '', color: '#e2e8f0', bases: 0 };
  }
  const color =
    input.play.kind === 'hr'
      ? '#fde047'
      : input.play.kind === 'hit'
        ? '#4ade80'
        : input.play.kind === 'foul'
          ? '#fdba74'
          : '#f8fafc';
  const contact = input.play.barrel ? 'BARREL' : input.play.hardHit ? 'HARD HIT' : input.play.hitType.toUpperCase();
  const who = input.play.fielder ? `  ·  ${input.play.fielder}` : '';
  return {
    headline: input.play.result.toUpperCase(),
    detail,
    footer: `${situation(input.play)}  ·  ${contact}  ·  ${input.hangTimeS.toFixed(1)}s${who}`,
    color,
    bases: basesOnBoard(input.play.result),
  };
}

/** Yaw for a blob whose face is local +z. atan2(dx, dz) sends +z along (dx, dz). */
export function yawFacing(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

export function launchVelocity(speedMs: number, angleDeg: number, sprayDeg: number) {
  const launch = (angleDeg * Math.PI) / 180;
  const direction = Math.PI / 4 + (sprayDeg * Math.PI) / 180;
  const horizontal = speedMs * Math.cos(launch);
  return {
    x: horizontal * Math.cos(direction),
    y: speedMs * Math.sin(launch),
    z: horizontal * Math.sin(direction),
  };
}

type Actor = {
  name: string;
  x: number;
  z: number;
  homeX: number;
  homeZ: number;
  faceX: number;
  faceZ: number;
  moving: boolean;
  role: 'field' | 'hit' | 'catcher';
};

export type ThrowBall = {
  active: boolean;
  x: number;
  y: number;
  z: number;
  sx: number;
  sz: number;
  tx: number;
  tz: number;
  u: number;
  dur: number;
};

export type PlaySim = {
  nonce: number;
  actors: Actor[];
  waypoint: number;
  peeled: boolean;
  hold: number;
  threw: boolean;
  holding: string | null;
  throwBall: ThrowBall;
  prediction: Score | null;
  predX: number;
  predZ: number;
};

function roster(): Actor[] {
  const actors: Actor[] = FIELDERS.map((fielder) => ({
    name: fielder.name,
    x: fielder.x,
    z: fielder.z,
    homeX: fielder.x,
    homeZ: fielder.z,
    faceX: -fielder.x,
    faceZ: -fielder.z,
    moving: false,
    role: 'field' as const,
  }));
  actors.push({
    name: 'C',
    x: CATCHER.x,
    z: CATCHER.z,
    homeX: CATCHER.x,
    homeZ: CATCHER.z,
    faceX: 1,
    faceZ: 1,
    moving: false,
    role: 'catcher',
  });
  actors.push({
    name: 'B',
    x: BATTER.x,
    z: BATTER.z,
    homeX: BATTER.x,
    homeZ: BATTER.z,
    faceX: BAG.mound[0] - BATTER.x,
    faceZ: BAG.mound[1] - BATTER.z,
    moving: false,
    role: 'hit',
  });
  return actors;
}

export function createPlaySim(): PlaySim {
  return {
    nonce: -1,
    actors: roster(),
    waypoint: 0,
    peeled: false,
    hold: 0,
    threw: false,
    holding: null,
    throwBall: { active: false, x: 0, y: 0, z: 0, sx: 0, sz: 0, tx: 0, tz: 0, u: 0, dur: 1 },
    prediction: null,
    predX: 0,
    predZ: 0,
  };
}

type ThrowTarget = 'first' | 'second' | 'third' | 'mound' | 'home';

type Plan = {
  fielder: string | null;
  bases: 0 | 1 | 2 | 3 | 4;
  peelOff: boolean;
  pickup: boolean;
  throwTo: ThrowTarget | null;
  carryToFirst: boolean;
  ground: boolean;
};

function closestOutfielder(x: number, z: number): string {
  const theta = Math.atan2(z, x);
  let best = 'CF';
  let bestDiff = Infinity;
  for (const fielder of FIELDERS) {
    if (fielder.group !== 'outfield') continue;
    const diff = Math.abs(Math.atan2(fielder.z, fielder.x) - theta);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = fielder.name;
    }
  }
  return best;
}

function insideFence(x: number, z: number): [number, number] {
  const radius = Math.hypot(x, z);
  if (radius < 1) return [x, z];
  const theta = Math.atan2(z, x);
  if (theta < -0.04 || theta > Math.PI / 2 + 0.04) return [x, z];
  const fence = fenceRadiusMeters(theta) - 4;
  if (radius <= fence) return [x, z];
  const [px, , pz] = fieldPoint(theta, fence);
  return [px, pz];
}

function runnerBases(play: Score): 0 | 1 | 2 | 3 | 4 {
  if (play.kind === 'hr') return 4;
  if (play.result === 'Triple') return 3;
  if (play.result === 'Double') return 2;
  if (play.result === 'Single' || play.result === 'Ground out') return 1;
  return 0;
}

export function planPlay(play: Score | null, x: number, z: number): Plan {
  if (!play) {
    return {
      fielder: closestOutfielder(x, z),
      bases: 1,
      peelOff: false,
      pickup: false,
      throwTo: null,
      carryToFirst: false,
      ground: false,
    };
  }
  const ground = play.hitType === 'Ground ball';
  const flyOut = play.kind === 'out' && !ground;
  const fielder = play.fielder ?? (play.kind === 'hr' || play.kind === 'foul' ? closestOutfielder(x, z) : null);
  let throwTo: ThrowTarget | null = null;
  if (play.kind !== 'hr' && play.kind !== 'foul') {
    if (ground && play.kind === 'out') throwTo = play.fielder === '1B' ? null : 'first';
    else if (flyOut) throwTo = play.fielder === 'P' ? null : 'mound';
    else if (play.result === 'Single') throwTo = 'second';
    else if (play.result === 'Double') throwTo = 'third';
    else if (play.result === 'Triple') throwTo = 'home';
  }
  return {
    fielder,
    bases: runnerBases(play),
    peelOff: play.kind === 'foul' || flyOut,
    pickup: play.kind !== 'hr',
    throwTo,
    carryToFirst: ground && play.kind === 'out' && play.fielder === '1B',
    ground,
  };
}

function throwSpot(target: ThrowTarget): [number, number] {
  if (target === 'first') return [BAG.first[0] + 1.4, BAG.first[1] - 1.2];
  if (target === 'second') return BAG.second;
  if (target === 'third') return BAG.third;
  if (target === 'home') return [CATCHER.x, CATCHER.z];
  return BAG.mound;
}

function runnerRoute(plan: Plan, peeled: boolean): [number, number][] {
  if (plan.peelOff && peeled) return [BAG.home];
  if (plan.peelOff || plan.bases === 0) return plan.peelOff ? [BAG.first] : [];
  const all: [number, number][] = [BAG.first, BAG.second, BAG.third, BAG.home];
  return all.slice(0, plan.bases);
}

function moveToward(actor: Actor, tx: number, tz: number, speed: number, dt: number): boolean {
  const dx = tx - actor.x;
  const dz = tz - actor.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.35) {
    actor.x = tx;
    actor.z = tz;
    actor.moving = false;
    return true;
  }
  const step = Math.min(dist, speed * dt);
  actor.x += (dx / dist) * step;
  actor.z += (dz / dist) * step;
  actor.faceX = dx;
  actor.faceZ = dz;
  actor.moving = true;
  return false;
}

export function predictFlight(clock: LivePlay): { x: number; z: number; score: Score } | null {
  if (!clock.active) return null;
  const vel = launchVelocity(clock.speedMs, clock.launchAngle, clock.spray);
  let x = 0;
  let y = clock.ballRadius + 0.12;
  let z = 0;
  let vx = vel.x;
  let vy = vel.y;
  let vz = vel.z;
  const dt = 1 / 120;
  let cleared = false;
  let hitWall = false;
  let clearance: number | null = null;
  let hang = 0;
  for (let i = 0; i < 120 * 8; i++) {
    const prevX = x;
    const prevY = y;
    const prevZ = z;
    vy -= 9.81 * dt;
    const speed = Math.hypot(vx, vy, vz);
    if (speed > 1) {
      const drag = BALL_DRAG * speed * speed;
      vx -= (vx / speed) * drag * dt;
      vy -= (vy / speed) * drag * dt;
      vz -= (vz / speed) * drag * dt;
    }
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    hang += dt;
    if (!cleared && !hitWall) {
      const cross = fenceCross(prevX, prevY, prevZ, x, y, z, clock.ballRadius);
      if (cross?.cleared) {
        cleared = true;
        clearance = cross.clearanceHeightM;
      } else if (cross?.hitWall) hitWall = true;
    }
    if (hang > 0.4 && y <= clock.ballRadius && vy < 0) break;
  }
  return {
    x,
    z,
    score: scorePlay({
      exitVeloMps: clock.speedMs,
      launchAngleDeg: clock.launchAngle,
      landingX: x,
      landingZ: z,
      hangTimeS: hang,
      clearedFence: cleared,
      hitWall,
      clearanceHeightM: clearance,
    }),
  };
}

function resetActors(sim: PlaySim) {
  sim.actors = roster();
  sim.waypoint = 0;
  sim.peeled = false;
  sim.hold = 0;
  sim.threw = false;
  sim.holding = null;
  sim.throwBall.active = false;
  sim.prediction = null;
  sim.predX = 0;
  sim.predZ = 0;
}

export function stepPlaySim(sim: PlaySim, clock: LivePlay, dt: number) {
  const step = Math.min(Math.max(dt, 0), 0.05);
  if (sim.nonce !== clock.nonce) {
    sim.nonce = clock.nonce;
    resetActors(sim);
    if (clock.active) {
      const predicted = predictFlight(clock);
      if (predicted) {
        sim.prediction = predicted.score;
        sim.predX = predicted.x;
        sim.predZ = predicted.z;
      }
    }
  }

  for (const actor of sim.actors) actor.moving = false;

  if (!clock.active) {
    for (const actor of sim.actors) {
      moveToward(actor, actor.homeX, actor.homeZ, SPRINT_MPS, step);
      if (!actor.moving) {
        actor.faceX = actor.role === 'hit' ? BAG.mound[0] - actor.x : -actor.x;
        actor.faceZ = actor.role === 'hit' ? BAG.mound[1] - actor.z : -actor.z;
      }
    }
    sim.holding = null;
    sim.throwBall.active = false;
    clock.fielded = false;
    return;
  }

  const play = clock.play ?? sim.prediction;
  const spotX = clock.landingX ?? sim.predX;
  const spotZ = clock.landingZ ?? sim.predZ;
  const plan = planPlay(play, spotX, spotZ);
  const fieldSpot = insideFence(spotX, spotZ);
  const released = clock.time >= REACTION_S;
  const runner = sim.actors.find((actor) => actor.name === 'B');
  const primary = sim.actors.find((actor) => actor.name === plan.fielder);

  if (plan.peelOff && clock.landed && !sim.peeled) {
    sim.peeled = true;
    sim.waypoint = 0;
  }
  const path = runnerRoute(plan, sim.peeled);

  if (runner && clock.time > 0.12) {
    if (path.length === 0) {
      moveToward(runner, runner.homeX, runner.homeZ, RUNNER_MPS, step);
    } else {
      // Waypoint is the base they are running to. A shorter call, such as a
      // single after they had started for second, sends them back to that base.
      const last = path.length - 1;
      if (sim.waypoint > last) sim.waypoint = last;
      const [wx, wz] = path[sim.waypoint];
      const arrived = moveToward(runner, wx, wz, RUNNER_MPS, step);
      if (arrived && sim.waypoint < last) sim.waypoint += 1;
    }
  }

  const homeRun = play?.kind === 'hr';
  if (primary && released && homeRun) {
    moveToward(primary, fieldSpot[0], fieldSpot[1], 3.2, step);
  } else if (primary && released) {
    const carrying = plan.carryToFirst && sim.holding === primary.name;
    const dest = carrying ? BAG.first : fieldSpot;
    moveToward(primary, dest[0], dest[1], SPRINT_MPS, step);
    const onBall = Math.hypot(primary.x - fieldSpot[0], primary.z - fieldSpot[1]) < 1.6;
    // A first baseman who fields the grounder keeps the ball all the way to the bag.
    // Dropping it on arrival made them run back and pick it up again.
    if (!carrying && clock.landed && plan.pickup && onBall && !sim.threw) {
      sim.holding = primary.name;
      if (plan.throwTo) {
        sim.hold += step;
        if (sim.hold > 0.4) {
          const [tx, tz] = throwSpot(plan.throwTo);
          const dur = Math.max(0.35, Math.hypot(tx - primary.x, tz - primary.z) / THROW_MPS);
          sim.throwBall = {
            active: true,
            x: primary.x,
            y: 1.7,
            z: primary.z,
            sx: primary.x,
            sz: primary.z,
            tx,
            tz,
            u: 0,
            dur,
          };
          sim.threw = true;
          sim.holding = null;
        }
      }
    }
  }

  const coverFirst = !homeRun && (plan.ground || clock.launchAngle < 10) && plan.fielder !== '1B';
  const coverSecond = !homeRun && !plan.ground && clock.launchAngle >= 10 && plan.fielder !== '2B';
  for (const actor of sim.actors) {
    if (actor.role !== 'field' || actor === primary) continue;
    if (actor.name === '1B' && coverFirst && released) {
      moveToward(actor, BAG.first[0] + 1.4, BAG.first[1] - 1.2, SPRINT_MPS, step);
      continue;
    }
    if (actor.name === '2B' && coverSecond && released) {
      moveToward(actor, BAG.second[0], BAG.second[1], SPRINT_MPS * 0.85, step);
      continue;
    }
    const away = Math.hypot(fieldSpot[0] - actor.homeX, fieldSpot[1] - actor.homeZ);
    if (released && away > 1 && play?.kind !== 'foul') {
      const shade = Math.min(4, away);
      const sx = actor.homeX + ((fieldSpot[0] - actor.homeX) / away) * shade;
      const sz = actor.homeZ + ((fieldSpot[1] - actor.homeZ) / away) * shade;
      moveToward(actor, sx, sz, 3.2, step);
    }
    if (!actor.moving) {
      actor.faceX = clock.ballX - actor.x;
      actor.faceZ = clock.ballZ - actor.z;
    }
  }

  const catcher = sim.actors.find((actor) => actor.name === 'C');
  if (catcher && !catcher.moving) {
    catcher.faceX = clock.ballX - catcher.x;
    catcher.faceZ = clock.ballZ - catcher.z;
  }
  if (runner && !runner.moving) {
    const dx = clock.ballX - runner.x;
    const dz = clock.ballZ - runner.z;
    if (dx * dx + dz * dz > 0.04) {
      runner.faceX = dx;
      runner.faceZ = dz;
    }
  }

  const ball = sim.throwBall;
  if (ball.active) {
    ball.u += step / ball.dur;
    const u = Math.min(ball.u, 1);
    ball.x = ball.sx + (ball.tx - ball.sx) * u;
    ball.z = ball.sz + (ball.tz - ball.sz) * u;
    ball.y = 1.7 + Math.sin(Math.PI * u) * 6;
    if (ball.u >= 1) ball.active = false;
  }

  clock.fielded = sim.holding !== null || sim.threw;
}
