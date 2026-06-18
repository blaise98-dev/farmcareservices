import { useMemo } from 'react';
import hierarchy from '../../public/Rwanda_hierarchy.json';

const LABEL_STYLE = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: 'var(--text-secondary)', textTransform: 'uppercase',
  letterSpacing: .5, marginBottom: 6,
};
const INPUT_STYLE = {
  width: '100%', padding: '9px 12px',
  borderRadius: 8, border: '2px solid var(--border)',
  fontSize: 13, outline: 'none', fontFamily: 'inherit',
  background: '#fff', boxSizing: 'border-box',
};

const focusColor = '#4CAF50';

function Select({ label, value, onChange, options, placeholder, disabled }) {
  return (
    <div>
      <label style={LABEL_STYLE}>{label}</label>
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        style={{ ...INPUT_STYLE, color: value ? 'inherit' : 'var(--text-secondary)', opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
        onFocus={e => e.target.style.borderColor = focusColor}
        onBlur={e => e.target.style.borderColor = 'var(--border)'}
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

export default function RwandaLocationFields({ location, onChange }) {
  const { province = '', district = '', sector = '', cell = '', village = '' } = location;

  const provinces = useMemo(() => Object.keys(hierarchy).sort(), []);

  const districts = useMemo(() => {
    if (!province) return [];
    return Object.keys(hierarchy[province] || {}).sort();
  }, [province]);

  const sectors = useMemo(() => {
    if (!province || !district) return [];
    return Object.keys((hierarchy[province] || {})[district] || {}).sort();
  }, [province, district]);

  const cells = useMemo(() => {
    if (!province || !district || !sector) return [];
    return Object.keys(((hierarchy[province] || {})[district] || {})[sector] || {}).sort();
  }, [province, district, sector]);

  const villages = useMemo(() => {
    if (!province || !district || !sector || !cell) return [];
    return (((hierarchy[province] || {})[district] || {})[sector] || {})[cell] || [];
  }, [province, district, sector, cell]);

  const handle = (field) => (e) => {
    const val = e.target.value;
    const downstream = {
      province:  { district: '', sector: '', cell: '', village: '' },
      district:  { sector: '', cell: '', village: '' },
      sector:    { cell: '', village: '' },
      cell:      { village: '' },
    };
    onChange({ ...location, [field]: val, ...(downstream[field] || {}) });
  };

  return (
    <>
      <div style={{ gridColumn: '1 / -1', paddingBottom: 2 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>📍</span> Location (Rwanda)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Select label="Province" value={province} onChange={handle('province')} options={provinces} placeholder="Select province" />
          <Select label="District" value={district} onChange={handle('district')} options={districts} placeholder={province ? 'Select district' : '— select province first —'} disabled={!province} />
          <Select label="Sector" value={sector} onChange={handle('sector')} options={sectors} placeholder={district ? 'Select sector' : '— select district first —'} disabled={!district} />
          <Select label="Cell" value={cell} onChange={handle('cell')} options={cells} placeholder={sector ? 'Select cell' : '— select sector first —'} disabled={!sector} />
        </div>
        <div style={{ marginTop: 14 }}>
          <Select label="Village" value={village} onChange={handle('village')} options={villages} placeholder={cell ? 'Select village' : '— select cell first —'} disabled={!cell} />
        </div>
      </div>
    </>
  );
}
