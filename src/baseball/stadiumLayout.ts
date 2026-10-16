import { fenceRadiusMeters, fieldPoint } from './scoring';

export const MAX_SEATS = 2800;
export const GRASS_BAND_WIDTH = 3.2;

const GRASS_BAND_RADII = [50, 64, 78, 90];
const FACADE_EXTRA = 46;

function polar(deg: number, extra: number): [number, number, number] {
  const theta = (deg * Math.PI) / 180;
  return fieldPoint(theta, fenceRadiusMeters(theta) + extra);
}

export function seatLayout(): { x: number; y: number; z: number }[] {
  const seats: { x: number; y: number; z: number }[] = [];
  const push = (x: number, y: number, z: number) => {
    if (seats.length >= MAX_SEATS) return;
    seats.push({ x, y, z });
  };

  for (let deck = 0; deck < 3; deck++) {
    for (let row = 0; row < 6; row++) {
      const y = 6.5 + deck * 5.4 + row * 0.55;
      const pad = 12 + deck * 7.5 + row * 1.25;
      const cols = 40;
      for (let col = 0; col <= cols; col++) {
        const theta = (col / cols) * (Math.PI / 2);
        const [x, , z] = fieldPoint(theta, fenceRadiusMeters(theta) + pad);
        push(x, y, z);
      }
    }
  }

  for (let side = 0; side < 2; side++) {
    for (let deck = 0; deck < 3; deck++) {
      for (let row = 0; row < 4; row++) {
        const y = 2.2 + deck * 4.4 + row * 0.5;
        const foul = 9 + deck * 4.5 + row * 1.2;
        for (let step = 0; step < 20; step++) {
          const along = 16 + step * 4.6;
          if (side === 0) push(along, y, -foul);
          else push(-foul, y, along);
        }
      }
    }
  }

  return seats;
}

export function grassBands(): { radius: number; points: [number, number, number][] }[] {
  return GRASS_BAND_RADII.map((radius) => {
    const count = 36;
    const points: [number, number, number][] = [];
    for (let i = 0; i <= count; i++) {
      const theta = (i / count) * (Math.PI / 2);
      points.push(fieldPoint(theta, radius));
    }
    return { radius, points };
  });
}

export function scoreboardAnchor(): [number, number, number] {
  const theta = Math.PI / 4;
  const [x, , z] = fieldPoint(theta, fenceRadiusMeters(theta) + 5.5);
  return [x, 12, z];
}

/** Facade boxes. rot is rotation.y: local +X points outward, local +Z runs along the arc. */
export function facadeBlocks(): { x: number; z: number; rot: number }[] {
  const blocks = [];
  for (let i = 0; i <= 24; i++) {
    const theta = (i / 24) * (Math.PI / 2);
    const [x, , z] = fieldPoint(theta, fenceRadiusMeters(theta) + FACADE_EXTRA);
    blocks.push({ x, z, rot: -theta });
  }
  return blocks;
}

export function lightTowerPositions(): [number, number, number][] {
  return [
    [118, 0, -24],
    [-24, 0, 118],
    polar(18, 20),
    polar(72, 20),
  ];
}
