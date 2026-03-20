import './TaskCard.css'

const PRIORITY_COLORS = { critical: '#ef4444', high: '#f59e0b', medium: '#6c63ff', low: '#22c55e' }

export default function TaskCard({ task, isDragging, isDragOver, onDragStart, onDragEnd, onDragOver, onDrop, onClick, horizontal }) {
  const p = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium

  return (
    <div
      className={`task-card ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''} ${horizontal ? 'horizontal' : ''}`}
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
        {!horizontal && task.description && (
          <div className="card-desc">{task.description.slice(0, 100)}{task.description.length > 100 ? '…' : ''}</div>
        )}
        <div className="card-footer">
          <span className="priority-label" style={{ color: p }}>{task.priority}</span>
          {task.notes?.length > 0 && (
            <span className="notes-badge">{task.notes.length} note{task.notes.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
    </div>
  )
}
