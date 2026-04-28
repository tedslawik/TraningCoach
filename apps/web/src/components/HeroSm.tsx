import SectionLabel from './SectionLabel';

type Discipline = 'tri' | 'swim' | 'bike' | 'run';

interface Props {
  discipline: Discipline;
  label: string;
  title: React.ReactNode;
  subtitle: string;
}

export default function HeroSm({ discipline, label, title, subtitle }: Props) {
  return (
    <div className="hero-sm">
      <SectionLabel discipline={discipline}>{label}</SectionLabel>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}
