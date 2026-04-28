import { WeekPlan, DisciplineType } from '@tricoach/core';

interface Props {
  plan: WeekPlan;
}

const typeClass: Record<DisciplineType, string> = {
  swim:  'swim-day',
  bike:  'bike-day',
  run:   'run-day',
  brick: 'brick-day',
  rest:  'rest-day',
};

export default function AnalyzerPlan({ plan }: Props) {
  return (
    <>
      <div className="card">
        <div className="card-title">Rekomendowany plan na następny tydzień</div>
        {plan.days.map(day => (
          <div key={day.name} className={`plan-day ${typeClass[day.type]}`}>
            <div className="day-name">{day.name}</div>
            <div className="day-desc">{day.description}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-title">Kluczowe wskazówki</div>
        {plan.tips.map((tip, i) => (
          <div key={i} className="tip-item">{tip}</div>
        ))}
      </div>
    </>
  );
}
