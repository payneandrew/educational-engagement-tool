/**
 * The heat scale for annotation counts on the Participation page: one hue (the theme's indigo), light
 * to dark, in three steps; zero is no fill. The legend and the cells both read this list, so they can't
 * disagree. Every cell's text is near-black or white, whichever clears 4.5:1 on its fill (the theme's
 * regular text color is too light for the lightest step).
 *
 * Colors are `--color-heat-*` in main.css (indigo 400 / 600 / 800), checked as an ordinal ramp: steps
 * ordered and clearly distinct, lightest step visible against the white card. Three steps because that
 * check needs visible gaps between steps, and indigo-500 can't carry readable text, so a fourth step
 * could only be the near-black indigo-950.
 */
export const HEAT_BINS = [
  { from: 1, label: '1', swatch: 'bg-heat-1', cell: 'bg-heat-1 text-slate-900' },
  { from: 2, label: '2–3', swatch: 'bg-heat-2', cell: 'bg-heat-2 text-white' },
  { from: 4, label: '4+', swatch: 'bg-heat-3', cell: 'bg-heat-3 text-white' },
] as const

/** The step a count falls in, or undefined for none. */
export const heatBin = (count: number): (typeof HEAT_BINS)[number] | undefined =>
  HEAT_BINS.findLast((bin) => count >= bin.from)
