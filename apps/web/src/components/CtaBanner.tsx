import { Link } from 'react-router-dom';

interface Props {
  title: string;
  description: string;
  buttonLabel?: string;
}

export default function CtaBanner({ title, description, buttonLabel = 'Otwórz analizator →' }: Props) {
  return (
    <section>
      <div className="section-inner">
        <div className="cta-banner">
          <h2>{title}</h2>
          <p>{description}</p>
          <Link to="/#analyzer" className="btn-light">{buttonLabel}</Link>
        </div>
      </div>
    </section>
  );
}
