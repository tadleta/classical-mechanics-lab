// Would this same flight have cleared the fence in each 2026 MLB park?
// This lab's field is not one of the 30.
//
// Distances are the posted 2026 markers: left-field line, straightaway center,
// right-field line. Alleys are the straight line between those markers, except
// where a guide publishes the bend (Fenway's triangle, Oracle's Triples Alley,
// Yankee Stadium's alleys, Petco, Sutter Health Park, Globe Life Field).
// Kauffman's lines are the 2026 move, about 9 ft in from 330, tapering to 410
// in center. Wall height is 8 ft unless the playing fence is actually taller
// or shorter: the Green Monster, Pesky's Pole, Oracle's right-field wall,
// the Crawford Boxes, the Clemente Wall, Wrigley's brick, Chase's center-field
// wall, and Kauffman's lowered wall.

const FT = 0.3048;

export type TrajectoryPoint = { distM: number; bottomM: number };

export type ParkResult = {
  name: string;
  team: string;
  homeRun: boolean;
  fenceFt: number;
  wallFt: number;
};

type FencePoint = { deg: number; distanceFt: number; wallFt: number };

type Ballpark = {
  name: string;
  team: string;
  fence: FencePoint[];
};

function line(lf: number, cf: number, rf: number, wall = 8): FencePoint[] {
  return [
    { deg: 0, distanceFt: lf, wallFt: wall },
    { deg: 45, distanceFt: cf, wallFt: wall },
    { deg: 90, distanceFt: rf, wallFt: wall },
  ];
}

const BALLPARKS: Ballpark[] = [
  { name: 'American Family Field', team: 'Milwaukee Brewers', fence: line(342, 400, 345) },
  { name: 'Angel Stadium', team: 'Los Angeles Angels', fence: line(347, 396, 350) },
  { name: 'Busch Stadium', team: 'St. Louis Cardinals', fence: line(336, 400, 335) },
  { name: 'Chase Field', team: 'Arizona Diamondbacks', fence: [
    { deg: 0, distanceFt: 330, wallFt: 8 },
    { deg: 44, distanceFt: 407, wallFt: 8 },
    { deg: 45, distanceFt: 407, wallFt: 25 },
    { deg: 46, distanceFt: 407, wallFt: 8 },
    { deg: 90, distanceFt: 335, wallFt: 8 },
  ] },
  { name: 'Citi Field', team: 'New York Mets', fence: line(335, 408, 330) },
  { name: 'Citizens Bank Park', team: 'Philadelphia Phillies', fence: line(329, 401, 330) },
  { name: 'Comerica Park', team: 'Detroit Tigers', fence: line(342, 412, 330) },
  { name: 'Coors Field', team: 'Colorado Rockies', fence: line(347, 415, 350) },
  { name: 'Daikin Park', team: 'Houston Astros', fence: [
    { deg: 0, distanceFt: 315, wallFt: 19 },
    { deg: 22, distanceFt: 356, wallFt: 19 },
    { deg: 45, distanceFt: 399, wallFt: 9 },
    { deg: 90, distanceFt: 326, wallFt: 9 },
  ] },
  { name: 'Dodger Stadium', team: 'Los Angeles Dodgers', fence: line(330, 395, 330) },
  { name: 'Fenway Park', team: 'Boston Red Sox', fence: [
    { deg: 0, distanceFt: 310, wallFt: 37.17 },
    { deg: 24, distanceFt: 379, wallFt: 37.17 },
    { deg: 45, distanceFt: 389, wallFt: 17 },
    { deg: 62, distanceFt: 420, wallFt: 5 },
    { deg: 90, distanceFt: 302, wallFt: 3 },
  ] },
  { name: 'Globe Life Field', team: 'Texas Rangers', fence: [
    { deg: 0, distanceFt: 329, wallFt: 8 },
    { deg: 40, distanceFt: 410, wallFt: 8 },
    { deg: 45, distanceFt: 407, wallFt: 8 },
    { deg: 50, distanceFt: 410, wallFt: 8 },
    { deg: 90, distanceFt: 326, wallFt: 8 },
  ] },
  { name: 'Great American Ball Park', team: 'Cincinnati Reds', fence: line(328, 404, 325) },
  { name: 'Kauffman Stadium', team: 'Kansas City Royals', fence: [
    { deg: 0, distanceFt: 321, wallFt: 8.5 },
    { deg: 22.5, distanceFt: 383, wallFt: 8.5 },
    { deg: 45, distanceFt: 410, wallFt: 8.5 },
    { deg: 67.5, distanceFt: 383, wallFt: 8.5 },
    { deg: 90, distanceFt: 321, wallFt: 8.5 },
  ] },
  { name: 'loanDepot park', team: 'Miami Marlins', fence: line(345, 400, 335) },
  { name: 'Nationals Park', team: 'Washington Nationals', fence: line(336, 402, 335) },
  { name: 'Oracle Park', team: 'San Francisco Giants', fence: [
    { deg: 0, distanceFt: 339, wallFt: 8 },
    { deg: 45, distanceFt: 391, wallFt: 8 },
    { deg: 68, distanceFt: 415, wallFt: 8 },
    { deg: 90, distanceFt: 309, wallFt: 25 },
  ] },
  { name: 'Oriole Park at Camden Yards', team: 'Baltimore Orioles', fence: line(333, 400, 318) },
  { name: 'Petco Park', team: 'San Diego Padres', fence: [
    { deg: 0, distanceFt: 336, wallFt: 8 },
    { deg: 22.5, distanceFt: 386, wallFt: 8 },
    { deg: 45, distanceFt: 396, wallFt: 8 },
    { deg: 67.5, distanceFt: 391, wallFt: 8 },
    { deg: 90, distanceFt: 322, wallFt: 8 },
  ] },
  { name: 'PNC Park', team: 'Pittsburgh Pirates', fence: [
    { deg: 0, distanceFt: 325, wallFt: 6 },
    { deg: 45, distanceFt: 399, wallFt: 8 },
    { deg: 72, distanceFt: 352, wallFt: 21 },
    { deg: 90, distanceFt: 320, wallFt: 21 },
  ] },
  { name: 'Progressive Field', team: 'Cleveland Guardians', fence: line(325, 405, 325) },
  { name: 'Rate Field', team: 'Chicago White Sox', fence: line(330, 400, 335) },
  { name: 'Rogers Centre', team: 'Toronto Blue Jays', fence: line(328, 400, 328) },
  { name: 'Sutter Health Park', team: 'Athletics', fence: [
    { deg: 0, distanceFt: 330, wallFt: 8 },
    { deg: 22.5, distanceFt: 375, wallFt: 8 },
    { deg: 45, distanceFt: 403, wallFt: 8 },
    { deg: 67.5, distanceFt: 375, wallFt: 8 },
    { deg: 90, distanceFt: 325, wallFt: 8 },
  ] },
  { name: 'T-Mobile Park', team: 'Seattle Mariners', fence: line(331, 401, 326) },
  { name: 'Target Field', team: 'Minnesota Twins', fence: line(339, 404, 328) },
  { name: 'Tropicana Field', team: 'Tampa Bay Rays', fence: line(315, 404, 322) },
  { name: 'Truist Park', team: 'Atlanta Braves', fence: line(335, 400, 325) },
  { name: 'Wrigley Field', team: 'Chicago Cubs', fence: line(355, 400, 353, 11.5) },
  { name: 'Yankee Stadium', team: 'New York Yankees', fence: [
    { deg: 0, distanceFt: 318, wallFt: 8 },
    { deg: 22.5, distanceFt: 399, wallFt: 8 },
    { deg: 45, distanceFt: 408, wallFt: 8 },
    { deg: 67.5, distanceFt: 385, wallFt: 8 },
    { deg: 90, distanceFt: 314, wallFt: 8 },
  ] },
];

export const MLB_PARK_COUNT = BALLPARKS.length;

function fenceAt(park: Ballpark, degFromLfLine: number): FencePoint {
  const deg = Math.min(90, Math.max(0, degFromLfLine));
  const points = park.fence;
  if (deg <= points[0].deg) return points[0];
  for (let i = 1; i < points.length; i++) {
    const next = points[i];
    if (deg <= next.deg) {
      const prev = points[i - 1];
      const span = next.deg - prev.deg;
      const t = span > 0 ? (deg - prev.deg) / span : 0;
      return {
        deg,
        distanceFt: prev.distanceFt + (next.distanceFt - prev.distanceFt) * t,
        wallFt: prev.wallFt + (next.wallFt - prev.wallFt) * t,
      };
    }
  }
  return points[points.length - 1];
}

/** Height of the bottom of the ball when it reached `distM`. Null if it never got there. */
export function heightAtDistance(points: TrajectoryPoint[], distM: number): number | null {
  if (points.length === 0) return null;
  let prev = points[0];
  if (distM <= prev.distM) return prev.bottomM;
  for (let i = 1; i < points.length; i++) {
    const next = points[i];
    if (next.distM >= distM) {
      const span = next.distM - prev.distM;
      const t = span > 1e-6 ? (distM - prev.distM) / span : 1;
      return prev.bottomM + (next.bottomM - prev.bottomM) * t;
    }
    prev = next;
  }
  return null;
}

export function homeRunsByPark(
  landingX: number,
  landingZ: number,
  trajectory: TrajectoryPoint[],
): ParkResult[] {
  const fair = landingX >= -0.3 && landingZ >= -0.3;
  const deg = (Math.atan2(Math.max(landingZ, 0), Math.max(landingX, 0)) * 180) / Math.PI;

  return BALLPARKS.map((park) => {
    const fence = fenceAt(park, deg);
    const fenceM = fence.distanceFt * FT;
    const bottom = heightAtDistance(trajectory, fenceM);
    const homeRun = fair && bottom !== null && bottom > fence.wallFt * FT;
    return {
      name: park.name,
      team: park.team,
      homeRun,
      fenceFt: fence.distanceFt,
      wallFt: fence.wallFt,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
