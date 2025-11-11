export const uid = (prefix = "id") =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
export const sumBy = <T,>(arr: T[], sel: (x: T) => number) =>
  arr.reduce((a, x) => a + sel(x), 0);
