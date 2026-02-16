import { BACKEND_FLAGS } from '../../backend/config';

export default function Subscription(): JSX.Element {
  return (
    <section className="page">
      <h1>Abonnement</h1>
      <p className="page-subtitle">
        Saison 1 gratuite pour lancer la communauté. Le système premium sera activé ensuite.
      </p>

      <article className="card premium-section">
        <h2>Etat actuel</h2>
        <p>
          Paiement actif: <strong>{String(BACKEND_FLAGS.subscriptionEnabled)}</strong>
        </p>
        <p>
          Tant que la saison 1 est gratuite, l’accès aux modules principaux reste ouvert.
        </p>
      </article>

      <div className="list">
        <article className="card premium-section">
          <h2>Plan Gratuit (actuel)</h2>
          <p>Accès complet à la saison 1 + suivi des séances + missions.</p>
        </article>
        <article className="card premium-section">
          <h2>Plan Premium (préparation)</h2>
          <p>Débloquera les saisons avancées et avantages exclusifs après la phase bêta.</p>
        </article>
      </div>
    </section>
  );
}
