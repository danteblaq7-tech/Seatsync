export default function StatCard ({ label, value, tone = 'primary' }) {
  return (
    <div className={`stat-card ${tone}`}>
      <span className='stat-label'>{label}</span>
      <strong className='stat-value'>{value}</strong>
    </div>
  )
}
