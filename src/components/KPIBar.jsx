import './KPIBar.css'

function fmtHours(ms) {
  const h = ms / 3600000
  return h < 0.1 ? '0h' : h.toFixed(1) + 'h'
}

export default function KPIBar({ todayMs, weekMs, completedToday, totalTasks, inProgress, blocked }) {
  return (
    <div className="kpi-bar">
      <div className="kpi-card"><div className="kpi-label">Today</div><div className="kpi-val">{fmtHours(todayMs)}</div></div>
      <div className="kpi-card"><div className="kpi-label">This Week</div><div className="kpi-val">{fmtHours(weekMs)}</div></div>
      <div className="kpi-card"><div className="kpi-label">Done Today</div><div className="kpi-val">{completedToday}</div></div>
      <div className="kpi-card"><div className="kpi-label">Total Tasks</div><div className="kpi-val">{totalTasks}</div></div>
      <div className="kpi-card"><div className="kpi-label">In Progress</div><div className="kpi-val accent">{inProgress}</div></div>
      <div className="kpi-card"><div className="kpi-label">Blocked</div><div className="kpi-val danger">{blocked}</div></div>
    </div>
  )
}
