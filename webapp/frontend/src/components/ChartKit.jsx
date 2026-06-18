/**
 * ChartKit — MooMe Professional Chart Component Library
 * Built on Apache ECharts via echarts-for-react.
 * All charts share a consistent design system: typography, spacing, colour, grid.
 */
import ReactECharts from 'echarts-for-react';

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

// ─── Base ECharts theme (applied to every chart) ──────────────────────────────
const BASE = {
  textStyle: { fontFamily: 'inherit', fontSize: 12, color: '#374151' },
  grid:      { left: 12, right: 12, top: 28, bottom: 12, containLabel: true },
  tooltip: {
    backgroundColor: '#fff',
    borderColor:     '#e5e7eb',
    borderWidth:     1,
    borderRadius:    10,
    padding:         [10, 14],
    textStyle:       { color: '#111827', fontSize: 12 },
    extraCssText:    'box-shadow: 0 4px 20px rgba(0,0,0,.12);',
  },
  legend: {
    itemWidth: 10, itemHeight: 10, borderRadius: 5,
    textStyle: { fontSize: 11, color: '#6b7280' },
    itemGap: 14,
  },
};

// Helper: merge BASE into an option object
const opt = (overrides) => ({ ...BASE, ...overrides,
  grid:    { ...BASE.grid,    ...(overrides.grid    || {}) },
  tooltip: { ...BASE.tooltip, ...(overrides.tooltip || {}) },
  legend:  overrides.legend  ? { ...BASE.legend, ...overrides.legend  } : undefined,
  textStyle: { ...BASE.textStyle },
});

// ─── Shared props ─────────────────────────────────────────────────────────────
const CHART_STYLE = { height: '100%', width: '100%' };
const DEFAULT_H   = 260;

// ─────────────────────────────────────────────────────────────────────────────
//  1. DONUT CHART — proportion of categories with centre KPI
// ─────────────────────────────────────────────────────────────────────────────
/**
 * data: [{ name, value, color? }]
 */
export function DonutChart({ data = [], height = DEFAULT_H, centerLabel, centerValue, title }) {
  const total = data.reduce((s, d) => s + Number(d.value || 0), 0);
  const option = opt({
    title: title ? { text: title, left: 0, top: 0, textStyle: { fontSize: 14, fontWeight: 700, color: '#111827' } } : undefined,
    tooltip: { ...BASE.tooltip, trigger: 'item', formatter: ({ name, value, percent }) => `<b>${name}</b><br/>${value} &nbsp;<span style="color:#6b7280">(${percent}%)</span>` },
    legend: { ...BASE.legend, orient: 'vertical', right: 10, top: 'center' },
    series: [{
      type:         'pie',
      radius:       ['42%', '68%'],
      center:       ['40%', '50%'],
      avoidLabelOverlap: true,
      itemStyle:    { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label:        { show: false },
      emphasis:     { label: { show: false }, itemStyle: { shadowBlur: 16, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,.2)' } },
      data: data.map((d, i) => ({
        name:      d.name,
        value:     Number(d.value || 0),
        itemStyle: { color: d.color || PALETTE[i % PALETTE.length] },
      })),
    }],
    graphic: (centerValue || centerLabel) ? [{
      type: 'group', left: 'center', top: 'center',
      children: [
        { type: 'text', style: { text: centerValue ?? String(total), textAlign: 'center', fontSize: 22, fontWeight: 800, fill: '#111827' } },
        { type: 'text', top: 26, style: { text: centerLabel ?? 'total', textAlign: 'center', fontSize: 11, fill: '#6b7280' } },
      ],
    }] : undefined,
  });
  return <ReactECharts option={option} style={{ ...CHART_STYLE, height }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  2. VERTICAL BAR CHART — category comparisons
// ─────────────────────────────────────────────────────────────────────────────
export function BarChart({ data = [], xKey = 'name', series = [], height = DEFAULT_H, title, unit = '', colors, stacked = false, showLabel = false }) {
  const option = opt({
    title: title ? { text: title, textStyle: { fontSize: 14, fontWeight: 700, color: '#111827' } } : undefined,
    tooltip: { ...BASE.tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,0,0,.04)' } },
      formatter: (params) => {
        let html = `<b>${params[0].axisValue}</b><br/>`;
        params.forEach(p => { html += `<span style="color:${p.color}">■</span> ${p.seriesName}: <b>${p.value}${unit}</b><br/>`; });
        return html;
      }
    },
    legend: series.length > 1 ? { ...BASE.legend, bottom: 0 } : undefined,
    grid: { ...BASE.grid, bottom: series.length > 1 ? 36 : 12 },
    xAxis: { type: 'category', data: data.map(d => d[xKey]), axisLine: { lineStyle: { color: '#e5e7eb' } }, axisTick: { show: false }, axisLabel: { fontSize: 11, color: '#6b7280', rotate: data.length > 7 ? 30 : 0 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 11, color: '#6b7280', formatter: v => `${v}${unit}` }, splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } }, axisLine: { show: false }, axisTick: { show: false } },
    series: series.map((s, si) => ({
      name:      s.name || s.key,
      type:      'bar',
      stack:     stacked ? 'total' : undefined,
      barMaxWidth: 48,
      barCategoryGap: '38%',
      itemStyle: { borderRadius: stacked ? 0 : [4, 4, 0, 0], color: (colors && colors[s.key]) || s.color || PALETTE[si % PALETTE.length] },
      emphasis:  { itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,.15)' } },
      label:     showLabel ? { show: true, position: 'top', fontSize: 11, fontWeight: 700, color: '#374151', formatter: p => p.value ? `${p.value}${unit}` : '' } : { show: false },
      data:      data.map(d => d[s.key] ?? 0),
    })),
  });
  return <ReactECharts option={option} style={{ ...CHART_STYLE, height }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  3. HORIZONTAL BAR — rankings, comparisons with long labels
// ─────────────────────────────────────────────────────────────────────────────
export function HBarChart({ data = [], labelKey = 'name', valueKey = 'value', height, unit = '', color = '#1E4D7B', title, colorFn }) {
  const h = height ?? Math.max(180, data.length * 38);
  const option = opt({
    title: title ? { text: title, textStyle: { fontSize: 14, fontWeight: 700, color: '#111827' } } : undefined,
    tooltip: { ...BASE.tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,0,0,.04)' } },
      formatter: (params) => `<b>${params[0].axisValue}</b><br/><b>${params[0].value}${unit}</b>`
    },
    grid: { left: 12, right: 60, top: title ? 32 : 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#6b7280' }, splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } }, axisLine: { show: false }, axisTick: { show: false } },
    yAxis: { type: 'category', data: data.map(d => d[labelKey]), inverse: false, axisLabel: { fontSize: 11, color: '#374151', width: 120, overflow: 'truncate' }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#e5e7eb' } } },
    series: [{
      type:       'bar',
      barMaxWidth: 28,
      itemStyle:  { borderRadius: [0, 4, 4, 0], color: colorFn ? undefined : color },
      emphasis:   { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,.12)' } },
      label:      { show: true, position: 'right', fontSize: 11, fontWeight: 700, color: '#374151', formatter: p => `${p.value}${unit}` },
      data: data.map((d, i) => ({
        value:     d[valueKey] ?? 0,
        itemStyle: colorFn ? { color: colorFn(d, i), borderRadius: [0, 4, 4, 0] } : undefined,
      })),
    }],
  });
  return <ReactECharts option={option} style={{ ...CHART_STYLE, height: h }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  4. LINE / AREA CHART — time-series trends
// ─────────────────────────────────────────────────────────────────────────────
export function LineChart({ data = [], xKey = 'date', series = [], height = DEFAULT_H, title, unit = '', smooth = true, area = false, markLine }) {
  const option = opt({
    title: title ? { text: title, textStyle: { fontSize: 14, fontWeight: 700, color: '#111827' } } : undefined,
    tooltip: { ...BASE.tooltip, trigger: 'axis',
      formatter: (params) => {
        let html = `<b>${params[0].axisValue}</b><br/>`;
        params.forEach(p => { html += `<span style="color:${p.color}">■</span> ${p.seriesName}: <b>${p.value}${unit}</b><br/>`; });
        return html;
      }
    },
    legend: series.length > 1 ? { ...BASE.legend, bottom: 0 } : undefined,
    grid: { ...BASE.grid, bottom: series.length > 1 ? 36 : 12 },
    xAxis: { type: 'category', boundaryGap: false, data: data.map(d => d[xKey]), axisLine: { lineStyle: { color: '#e5e7eb' } }, axisTick: { show: false }, axisLabel: { fontSize: 11, color: '#6b7280' } },
    yAxis: { type: 'value', axisLabel: { fontSize: 11, color: '#6b7280', formatter: v => `${v}${unit}` }, splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } }, axisLine: { show: false }, axisTick: { show: false } },
    series: series.map((s, si) => {
      const col = s.color || PALETTE[si % PALETTE.length];
      return {
        name:        s.name || s.key,
        type:        'line',
        smooth,
        symbol:      'circle', symbolSize: 5,
        lineStyle:   { width: 2.5, color: col },
        itemStyle:   { color: col, borderWidth: 2, borderColor: '#fff' },
        areaStyle:   area ? { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: col + '33' }, { offset: 1, color: col + '05' }] } } : undefined,
        markLine:    markLine ? { silent: true, lineStyle: { type: 'dashed', color: '#9ca3af' }, data: markLine } : undefined,
        data:        data.map(d => d[s.key] ?? null),
      };
    }),
  });
  return <ReactECharts option={option} style={{ ...CHART_STYLE, height }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  5. STACKED AREA — cumulative contribution over time
// ─────────────────────────────────────────────────────────────────────────────
export function StackedAreaChart({ data = [], xKey = 'date', series = [], height = DEFAULT_H, title, unit = '' }) {
  return <LineChart data={data} xKey={xKey} series={series} height={height} title={title} unit={unit} area smooth stacked />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  6. GAUGE — single KPI with arc visual
// ─────────────────────────────────────────────────────────────────────────────
export function GaugeChart({ value = 0, max = 100, label = '', unit = '', color = '#1E4D7B', height = 180, warn, warnThreshold }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const col = warn ? '#F44336' : color;
  const option = {
    series: [{
      type:       'gauge',
      startAngle: 200, endAngle: -20,
      min: 0, max,
      radius:     '88%',
      center:     ['50%', '60%'],
      progress:   { show: true, width: 14, roundCap: true, itemStyle: { color: col } },
      axisLine:   { lineStyle: { width: 14, color: [[1, '#f3f4f6']] } },
      axisTick:   { show: false },
      splitLine:  { show: false },
      axisLabel:  { show: false },
      pointer:    { show: false },
      anchor:     { show: false },
      title:      { show: true, offsetCenter: [0, '25%'], color: '#6b7280', fontSize: 11, fontFamily: 'inherit' },
      detail:     { valueAnimation: true, offsetCenter: [0, '-5%'], fontSize: 20, fontWeight: 800, color: col,
                    formatter: v => `${Number(v).toFixed(1)}${unit}`, fontFamily: 'inherit' },
      data: [{ value, name: label }],
    }],
  };
  return <ReactECharts option={option} style={{ ...CHART_STYLE, height }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  7. RADAR CHART — multi-dimensional comparison
// ─────────────────────────────────────────────────────────────────────────────
export function RadarChart({ indicators = [], series = [], height = DEFAULT_H, title }) {
  const option = opt({
    title: title ? { text: title, textStyle: { fontSize: 14, fontWeight: 700, color: '#111827' } } : undefined,
    tooltip: { ...BASE.tooltip, trigger: 'item' },
    legend: series.length > 1 ? { ...BASE.legend, bottom: 0 } : undefined,
    radar: { indicator: indicators, splitLine: { lineStyle: { color: '#f3f4f6' } }, axisLine: { lineStyle: { color: '#e5e7eb' } }, axisName: { color: '#6b7280', fontSize: 11 } },
    series: series.map((s, si) => ({
      type:      'radar',
      name:      s.name,
      areaStyle: { opacity: .2 },
      lineStyle: { color: s.color || PALETTE[si % PALETTE.length], width: 2 },
      itemStyle: { color: s.color || PALETTE[si % PALETTE.length] },
      data:      [{ value: s.values, name: s.name }],
    })),
  });
  return <ReactECharts option={option} style={{ ...CHART_STYLE, height }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  8. TREEMAP — hierarchical proportions
// ─────────────────────────────────────────────────────────────────────────────
export function TreemapChart({ data = [], height = DEFAULT_H, title, unit = '' }) {
  const option = {
    tooltip: { ...BASE.tooltip, formatter: ({ name, value }) => `<b>${name}</b>: ${value}${unit}` },
    title: title ? { text: title, textStyle: { fontSize: 14, fontWeight: 700, color: '#111827' } } : undefined,
    series: [{
      type:         'treemap',
      width:        '100%', height: '100%',
      breadcrumb:   { show: false },
      roam:         false,
      nodeClick:    false,
      itemStyle:    { borderColor: '#fff', borderWidth: 2, gapWidth: 2 },
      label:        { show: true, fontSize: 12, fontWeight: 700, color: '#fff',
                      formatter: ({ name, value }) => value > 0 ? `${name}\n${value}${unit}` : name },
      emphasis:     { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,.2)' } },
      data: data.map((d, i) => ({ name: d.name, value: d.value, itemStyle: { color: d.color || PALETTE[i % PALETTE.length] } })),
    }],
  };
  return <ReactECharts option={option} style={{ ...CHART_STYLE, height }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  9. WATERFALL / P&L CHART — cumulative cost-revenue flow
// ─────────────────────────────────────────────────────────────────────────────
export function WaterfallChart({ data = [], xKey = 'name', valueKey = 'value', height = DEFAULT_H, title, unit = ' RWF' }) {
  let running = 0;
  const placeholders = [];
  const bars = [];
  data.forEach(d => {
    const v = Number(d[valueKey] || 0);
    placeholders.push(v >= 0 ? running : running + v);
    bars.push(Math.abs(v));
    running += v;
    d._col = v >= 0 ? '#4CAF50' : '#F44336';
  });
  const option = opt({
    title: title ? { text: title, textStyle: { fontSize: 14, fontWeight: 700, color: '#111827' } } : undefined,
    tooltip: { ...BASE.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const bar = params.find(p => p.seriesName === 'Value');
        if (!bar) return '';
        const v = data[bar.dataIndex]?.[valueKey] ?? 0;
        return `<b>${bar.axisValue}</b><br/>${Number(v) >= 0 ? '+' : ''}${Number(v).toLocaleString('en-RW')}${unit}`;
      }
    },
    xAxis: { type: 'category', data: data.map(d => d[xKey]), axisLabel: { fontSize: 11, color: '#6b7280' }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#e5e7eb' } } },
    yAxis: { type: 'value', axisLabel: { fontSize: 11, color: '#6b7280', formatter: v => `${(v/1000).toFixed(0)}K` }, splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } }, axisLine: { show: false }, axisTick: { show: false } },
    series: [
      { name: 'Base', type: 'bar', stack: 'wf', itemStyle: { color: 'transparent' }, emphasis: { disabled: true }, data: placeholders },
      { name: 'Value', type: 'bar', stack: 'wf', barMaxWidth: 40,
        itemStyle: { borderRadius: [4, 4, 0, 0], color: (p) => data[p.dataIndex]?._col || '#1E4D7B' },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,.12)' } },
        label: { show: true, position: 'top', fontSize: 10, fontWeight: 700, color: '#374151',
                 formatter: p => { const v = data[p.dataIndex]?.[valueKey] ?? 0; return `${Number(v) >= 0 ? '+' : ''}${(Number(v)/1000).toFixed(1)}K`; } },
        data: bars,
      },
    ],
  });
  return <ReactECharts option={option} style={{ ...CHART_STYLE, height }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  10. SCATTER PLOT — correlation between two metrics
// ─────────────────────────────────────────────────────────────────────────────
export function ScatterChart({ data = [], xName = 'X', yName = 'Y', height = DEFAULT_H, title, unit = '', colorKey, colorMap }) {
  const option = opt({
    title: title ? { text: title, textStyle: { fontSize: 14, fontWeight: 700, color: '#111827' } } : undefined,
    tooltip: { ...BASE.tooltip, trigger: 'item',
      formatter: p => `<b>${p.data.name || ''}</b><br/>${xName}: <b>${p.data.value[0]}${unit}</b><br/>${yName}: <b>${p.data.value[1]}${unit}</b>`
    },
    xAxis: { type: 'value', name: xName, nameLocation: 'middle', nameGap: 28, axisLabel: { fontSize: 11, color: '#6b7280' }, splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } }, axisLine: { lineStyle: { color: '#e5e7eb' } } },
    yAxis: { type: 'value', name: yName, nameLocation: 'middle', nameGap: 40, axisLabel: { fontSize: 11, color: '#6b7280' }, splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{
      type:       'scatter',
      symbolSize: 10,
      itemStyle:  { opacity: .85, borderWidth: 1.5, borderColor: '#fff' },
      emphasis:   { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,.2)', symbolSize: 14 } },
      data: data.map((d, i) => ({
        name:      d.name || '',
        value:     [d.x, d.y],
        itemStyle: { color: (colorKey && colorMap?.[d[colorKey]]) || PALETTE[i % PALETTE.length] },
      })),
    }],
  });
  return <ReactECharts option={option} style={{ ...CHART_STYLE, height }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  11. HEATMAP — matrix intensity (e.g. health × stage)
// ─────────────────────────────────────────────────────────────────────────────
export function HeatmapChart({ xData = [], yData = [], data = [], height = DEFAULT_H, title, unit = '' }) {
  const option = {
    tooltip: { ...BASE.tooltip, formatter: p => `${p.data[1]} / ${p.data[0]}: <b>${p.data[2]}${unit}</b>` },
    title: title ? { text: title, textStyle: { fontSize: 14, fontWeight: 700, color: '#111827' } } : undefined,
    grid: { left: 12, right: 12, top: title ? 40 : 10, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: xData, splitArea: { show: true }, axisLabel: { fontSize: 10, color: '#6b7280', rotate: xData.length > 5 ? 30 : 0 }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#e5e7eb' } } },
    yAxis: { type: 'category', data: yData, splitArea: { show: true }, axisLabel: { fontSize: 11, color: '#374151' }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#e5e7eb' } } },
    visualMap: { min: 0, max: Math.max(...data.map(d => d[2] || 0), 1), calculable: false, show: false,
      inRange: { color: ['#f0fdf4', '#4CAF50', '#166534'] } },
    series: [{ type: 'heatmap', data, label: { show: true, fontSize: 11, fontWeight: 700, color: '#374151' }, itemStyle: { borderRadius: 4 }, emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,.12)' } } }],
  };
  return <ReactECharts option={option} style={{ ...CHART_STYLE, height }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  12. BULLET / PROGRESS BAR — target vs actual
// ─────────────────────────────────────────────────────────────────────────────
export function BulletChart({ items = [], height, unit = '' }) {
  const h = height ?? Math.max(120, items.length * 52);
  const option = opt({
    tooltip: { ...BASE.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 12, right: 60, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#6b7280', formatter: v => `${v}${unit}` }, splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } }, axisLine: { show: false }, axisTick: { show: false } },
    yAxis: { type: 'category', data: items.map(d => d.label), axisTick: { show: false }, axisLine: { lineStyle: { color: '#e5e7eb' } }, axisLabel: { fontSize: 11, color: '#374151' } },
    series: [
      { name: 'Target', type: 'bar', barWidth: 16, itemStyle: { color: '#e5e7eb', borderRadius: [0, 4, 4, 0] }, data: items.map(d => d.target ?? 0), z: 1 },
      { name: 'Actual', type: 'bar', barWidth: 10, barGap: '-100%',
        itemStyle: { color: p => { const d = items[p.dataIndex]; return Number(d.actual) >= Number(d.target) ? '#4CAF50' : '#1E4D7B'; }, borderRadius: [0, 3, 3, 0] },
        label: { show: true, position: 'right', fontSize: 11, fontWeight: 700, color: '#374151', formatter: p => `${p.value}${unit}` },
        data: items.map(d => d.actual ?? 0), z: 2,
      },
    ],
  });
  return <ReactECharts option={option} style={{ ...CHART_STYLE, height: h }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  13. FUNNEL CHART — stage/conversion flow
// ─────────────────────────────────────────────────────────────────────────────
export function FunnelChart({ data = [], height = DEFAULT_H, title, unit = '' }) {
  const option = opt({
    title: title ? { text: title, textStyle: { fontSize: 14, fontWeight: 700, color: '#111827' } } : undefined,
    tooltip: { ...BASE.tooltip, trigger: 'item', formatter: ({ name, value, percent }) => `<b>${name}</b><br/>${value}${unit} (${percent}%)` },
    series: [{
      type:       'funnel',
      left:       '10%', width: '80%', top: 20, bottom: 20,
      sort:       'descending',
      gap:        3,
      label:      { show: true, position: 'inside', fontSize: 12, fontWeight: 700, color: '#fff',
                    formatter: ({ name, value }) => `${name}\n${value}${unit}` },
      itemStyle:  { borderWidth: 0 },
      emphasis:   { label: { fontSize: 14 } },
      data: data.map((d, i) => ({ name: d.name, value: d.value, itemStyle: { color: d.color || PALETTE[i % PALETTE.length] } })),
    }],
  });
  return <ReactECharts option={option} style={{ ...CHART_STYLE, height }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Utility: CardChart wrapper (title + subtitle + optional action slot)
// ─────────────────────────────────────────────────────────────────────────────
export function ChartCard({ title, sub, children, action, style }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#111827' }}>{title}</h2>
          {sub && <p style={{ fontSize: 11, color: '#6b7280', margin: '3px 0 0' }}>{sub}</p>}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
      {children}
    </div>
  );
}
