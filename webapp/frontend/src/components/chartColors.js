/**
 * Shared chart colour tokens, used by ChartKit and pages that colour chart data.
 */

// ─── Design tokens ────────────────────────────────────────────────────────────
export const PALETTE = [
  '#1E4D7B', '#4CAF50', '#FF9800', '#E91E63', '#00BCD4',
  '#9C27B0', '#FF5722', '#4DB6AC', '#5C6BC0', '#78909C',
  '#2196F3', '#26C6DA', '#8BC34A', '#FFC107', '#607D8B',
];

export const HEALTH_COLORS  = { Healthy: '#4CAF50', Warning: '#FF9800', Critical: '#F44336', 'Under Treatment': '#9C27B0' };
export const BREED_COLORS   = { Friesian: '#1E4D7B', Ayrshire: '#00BCD4', Jersey: '#FF9800' };
export const SEX_COLORS     = { Female: '#E91E63', Male: '#1565c0' };
export const STAGE_COLORS   = {
  Calf: '#00BCD4', Weaner: '#26C6DA', Yearling: '#4DB6AC',
  'Bull Calf': '#78909C', Heifer: '#E91E63', Steer: '#5C6BC0',
  Bull: '#1E4D7B', Cow: '#4CAF50', 'Dry Cow': '#9C27B0',
  'Lactating Cow': '#2196F3', 'Senior Cow': '#FF9800', 'Senior Bull': '#FF5722',
};
