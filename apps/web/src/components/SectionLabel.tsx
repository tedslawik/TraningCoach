interface Props {
  discipline: 'tri' | 'swim' | 'bike' | 'run';
  children: React.ReactNode;
}

export default function SectionLabel({ discipline, children }: Props) {
  return <span className={`section-label ${discipline}`}>{children}</span>;
}
