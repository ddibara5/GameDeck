/**
 * Small four-cell stats strip fed by the v_library_stats view.
 * Renders quiet placeholders while stats are still loading.
 */
export default function StatsStrip({ stats, loading, finishedCount }) {
  const cells = [
    { label: 'Total games', value: stats ? stats.total_games ?? 0 : null },
    { label: 'Finished', value: loading ? null : finishedCount ?? 0 },
    {
      label: 'Total hours',
      value: stats ? Math.round((stats.total_minutes ?? 0) / 60) : null,
    },
    { label: 'Achievements', value: stats ? stats.total_achievements ?? 0 : null },
  ]

  return (
    <div className="stats-strip">
      {cells.map((cell) => (
        <div className="stat-cell" key={cell.label}>
          <div className="stat-value">{loading || cell.value === null ? '–' : cell.value}</div>
          <div className="stat-label">{cell.label}</div>
        </div>
      ))}
    </div>
  )
}
