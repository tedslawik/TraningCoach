import Analyzer from '../components/analyzer/Analyzer';
import SectionLabel from '../components/SectionLabel';

export default function AnalyzerPage() {
  return (
    <section>
      <div className="section-inner narrow">
        <div className="analyzer-header">
          <SectionLabel discipline="tri">Analizator treningowy</SectionLabel>
          <h2>Twoje treningi</h2>
          <p>Dane pobierane automatycznie ze Stravy — możesz też edytować je ręcznie.</p>
        </div>
        <Analyzer />
      </div>
    </section>
  );
}
