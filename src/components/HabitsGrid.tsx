import type { Habit } from '../lib/compare';

interface HabitsGridProps {
  habits: Habit[];
}

export function HabitsGrid({ habits }: HabitsGridProps) {
  return (
    <>
      <div className="section-title">
        <h2>🛡️ Habits that change the curve</h2>
      </div>
      <div className="habits">
        {habits.map((h, i) => (
          <div key={h.id} className="glass-card habit">
            <div className="habit-top">
              <span className="habit-emoji">{h.emoji}</span>
              <span className="habit-rank">#{i + 1}</span>
              <span className={`conf conf-${h.confidence}`}>{h.confidence}</span>
            </div>
            <h3>{h.title}</h3>
            <p className="habit-action">{h.action}</p>
            <p className="habit-why">{h.why}</p>
            <p className="habit-cite">📚 {h.citation}</p>
          </div>
        ))}
      </div>
    </>
  );
}
