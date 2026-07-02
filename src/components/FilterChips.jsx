// Renders the three prototype-style filter chips with an "on" state for the
// current filter. Pure UI — the parent owns the state and re-queries Firestore.
export default function FilterChips({ options, value, onChange }) {
  return (
    <div className="filter-row">
      {options.map(o => (
        <div
          key={o}
          className={`chip ${value === o ? 'on' : ''}`}
          onClick={() => onChange(o)}
        >
          {o}
        </div>
      ))}
    </div>
  )
}
