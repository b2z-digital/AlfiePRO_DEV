// How much larger the labels drawn on the water are (a comfort setting: see comfort.ts). Read by the
// bank and top views each time they draw a label.
let k = 1;
export const labelScale = (): number => k;
export function setLabelScale(scale: number): void { k = Math.max(1, Math.min(1.6, scale || 1)); }
