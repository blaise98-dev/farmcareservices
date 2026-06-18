import { useQuery } from '@tanstack/react-query';
import { getPredictions, getHealthRisks, getMilkYieldPreds } from '../lib/api';
import { HBarChart, BarChart as EBar, ChartCard } from '../components/ChartKit';
import { Brain, AlertTriangle, TrendingUp, Activity } from 'lucide-react';
import { format } from 'date-fns';

const PRED_COLOR = {
  MilkYield: '#00BCD4', HealthRisk: '#F44336', HeatDetection: '#FF9800', FeedEfficiency: '#4CAF50'
};

const CONF_COLOR = (pct) => pct >= 90 ? '#4CAF50' : pct >= 80 ? '#FF9800' : '#F44336';

export default function Predictions() {
  const { data: all = [] } = useQuery({ queryKey: ['predictions'], queryFn: getPredictions });
  const { data: risks = [] } = useQuery({ queryKey: ['health-risks'], queryFn: getHealthRisks });
  const { data: milkPreds = [] } = useQuery({ queryKey: ['milk-yield-preds'], queryFn: getMilkYieldPreds });

  // Group by type
  const byType = all.reduce((acc, p) => {
    if (!acc[p.prediction_type]) acc[p.prediction_type] = [];
    acc[p.prediction_type].push(p);
    return acc;
  }, {});

  const milkChart = milkPreds.map(p => ({
    cow: p.cow_name,
    predicted: Number(p.predicted_value).toFixed(1),
    confidence: Number(p.confidence_percent).toFixed(0),
    date: p.prediction_date ? format(new Date(p.prediction_date), 'MMM d') : '',
  }));

  const riskChart = risks.map(r => ({
    cow: r.cow_name,
    risk:       Number(r.predicted_value).toFixed(0),
    confidence: Number(r.confidence_percent).toFixed(0),
    health:     r.health_status,
    fill:       Number(r.predicted_value) >= 85 ? '#F44336' : Number(r.predicted_value) >= 70 ? '#FF9800' : '#4CAF50',
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
        {[
          { label: 'Total Predictions', val: all.length, color: '#1E4D7B', icon: Brain },
          { label: 'Health Risks', val: risks.length, color: '#F44336', icon: AlertTriangle },
          { label: 'Milk Forecasts', val: milkPreds.length, color: '#00BCD4', icon: TrendingUp },
          { label: 'Avg Confidence', val: all.length ? `${(all.reduce((s,p) => s + Number(p.confidence_percent),0) / all.length).toFixed(0)}%` : '--', color: '#4CAF50', icon: Activity },
        ].map(({ label, val, color, icon: Icon }) => (
          <div key={label} className="stat-card" style={{ borderLeftColor: color }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="label">{label}</span>
              <Icon size={18} color={color} />
            </div>
            <span className="value" style={{ color }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Health Risk chart */}
      {risks.length > 0 && (
        <div className="card" style={{ borderTop: '4px solid #F44336' }}>
          <div className="section-header">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={18} color="#F44336" />
              Health Risk Forecast — Next 1–3 Days
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <ChartCard title="Risk Level %" sub="Alert ≥85% · Warning ≥70%">
              <HBarChart data={riskChart.map(r => ({ name: r.cow, value: Number(r.risk) }))}
                unit="%" colorFn={(d) => Number(d.value) >= 85 ? '#F44336' : Number(d.value) >= 70 ? '#FF9800' : '#4CAF50'}
                height={Math.max(160, risks.length * 44)} />
            </ChartCard>
            <ChartCard title="Confidence %" sub="Model confidence in prediction">
              <HBarChart data={riskChart.map(r => ({ name: r.cow, value: Number(r.confidence) }))}
                unit="%" color="#9C27B0" height={Math.max(160, risks.length * 44)} />
            </ChartCard>
          </div>
        </div>
      )}

      {/* Milk Yield predictions chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ChartCard title="🥛 Milk Yield Forecast" sub="Predicted output — next 2 days">
          <HBarChart data={milkChart.map(r => ({ name: r.cow, value: Number(r.predicted) }))}
            unit=" L" color="#00BCD4" height={220} />
        </ChartCard>

        {/* All predictions table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>📋 All Predictions</h2>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Cow</th><th>Type</th><th>Value</th><th>Conf%</th><th>Date</th></tr>
              </thead>
              <tbody>
                {all.map(p => (
                  <tr key={p.prediction_id}>
                    <td style={{ fontWeight: 600 }}>{p.cow_name}</td>
                    <td>
                      <span style={{
                        fontSize: 11, padding: '2px 7px', borderRadius: 20, fontWeight: 600,
                        background: `${PRED_COLOR[p.prediction_type] || '#999'}22`,
                        color: PRED_COLOR[p.prediction_type] || '#333',
                      }}>{p.prediction_type}</span>
                    </td>
                    <td style={{ fontWeight: 700, color: PRED_COLOR[p.prediction_type] || '#333' }}>
                      {Number(p.predicted_value).toFixed(1)}
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: CONF_COLOR(Number(p.confidence_percent)) }}>
                        {Number(p.confidence_percent).toFixed(0)}%
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {p.prediction_date ? format(new Date(p.prediction_date), 'MMM d') : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* All predictions grouped bar chart */}
      {all.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>🐄 Predicted Values by Cow</h2>
          <ResponsiveContainer width="100%" height={Math.max(200, all.length * 36)}>
            <BarChart
              data={all.map(p => ({
                label: `${p.cow_name} — ${p.prediction_type}`,
                value: Number(p.predicted_value).toFixed(1),
                confidence: Number(p.confidence_percent).toFixed(0),
                fill: PRED_COLOR[p.prediction_type] || '#999',
              }))}
              layout="vertical"
              margin={{ top: 4, right: 60, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="label" type="category" tick={{ fontSize: 10 }} width={170} />
              <Tooltip formatter={(v, n) => [`${v}`, n === 'value' ? 'Predicted' : 'Confidence %']} />
              <Legend iconSize={10} />
              <Bar dataKey="value" name="Predicted Value" radius={[0, 6, 6, 0]}>
                <LabelList dataKey="value" position="right" style={{ fontSize: 11, fontWeight: 700 }} />
                {all.map((p, i) => <Cell key={i} fill={PRED_COLOR[p.prediction_type] || '#999'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
