/** 90 ft. The bags drawn in the scene use these same centers. */
export const BASE_DISTANCE = 27.432;

export const BAG = {
  third: [BASE_DISTANCE, 0.7] as [number, number],
  second: [BASE_DISTANCE, BASE_DISTANCE] as [number, number],
  first: [0.7, BASE_DISTANCE] as [number, number],
  home: [0, 0] as [number, number],
  mound: [BASE_DISTANCE / 2, BASE_DISTANCE / 2] as [number, number],
};
