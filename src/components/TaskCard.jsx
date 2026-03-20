import './TaskCard.css'

const PRIORITY_COLORS = { critical: '#ef4444', high: '#f59e0b', medium: '#6c63ff', low: '#22c55e' }
const CLIENT_PALETTE = ['#6c63ff','#22c55e','#f59e0b','#3b82f6','#ec4899','#14b8a6','#f97316','#8b5cf6']

function clientColor(name) {
  if (!name) return '#6c63ff'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % CLIENT_PALETTE.length
  return CLIENT_PALETTE[h]
}

export default function TaskCard({ task, isDragging, isDragOver, onDragStart, onDragEnd, onDragOver, onDrop, onClick }) {
  const p = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium
  const cc = clientColor(task.client)

  return (
    <div
      className={`task-card ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
    >
      <div className="card-priority-bar" style={{ background: p }} />
      <div className="card-inner">
        <div className="card-title">{task.title}</div>
        {task.description && (
          <div className="card-desc">{task.description.slice(0, 80)}{task.description.length > 80 ? '…' : ''}</div>
        )}
        <div className="card-footer">
          {task.client && (
            <span className="card-client" style={{ background: cc + '22', color: cc }}>{task.client}</span>
          )}
          <div className="card-meta">
            <span className="priority-label" style={{ color: p }}>{task.priority}</span>
            {task.notes?.length > 0 && (
              <span className="notes-badge">{task.notes.length} note{task.notes.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
