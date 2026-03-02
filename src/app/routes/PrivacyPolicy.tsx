export default function PrivacyPolicy(): JSX.Element {
  return (
    <section className="page legal-page">
      <h1>Politique de confidentialité</h1>
      <article className="card premium-section">
        <p className="page-subtitle">
          Dernière mise à jour: 21 février 2026
        </p>

        <h2>Données collectées</h2>
        <p>NIVELR peut traiter les données suivantes:</p>
        <ul>
          <li>Données de compte: email, pseudo, handle.</li>
          <li>Données d&apos;usage: séances, missions, niveaux, badges, progression.</li>
          <li>Préférences: consentement email, choix d&apos;interface.</li>
        </ul>

        <h2>Finalités du traitement</h2>
        <ul>
          <li>Créer et sécuriser le compte utilisateur.</li>
          <li>Fournir les fonctionnalités de suivi sportif et gamification.</li>
          <li>Envoyer des emails d&apos;information uniquement si consentement explicite.</li>
          <li>Assurer la maintenance et la sécurité du service.</li>
        </ul>

        <h2>Base légale</h2>
        <ul>
          <li>Exécution du service demandé par l&apos;utilisateur.</li>
          <li>Consentement pour les communications email non essentielles.</li>
          <li>Intérêt légitime pour la sécurité et la prévention des abus.</li>
        </ul>

        <h2>Durée de conservation</h2>
        <p>
          Les données sont conservées pendant la durée d&apos;utilisation du service, puis archivées ou supprimées
          selon les obligations légales applicables.
        </p>

        <h2>Droits des utilisateurs</h2>
        <p>Conformément au RGPD, vous pouvez demander:</p>
        <ul>
          <li>L&apos;accès à vos données.</li>
          <li>La rectification ou l&apos;effacement.</li>
          <li>La limitation ou l&apos;opposition au traitement.</li>
          <li>La portabilité de vos données.</li>
        </ul>
        <p>
          Contact RGPD: <strong>privacy@nivelr.app</strong>
        </p>
      </article>
    </section>
  );
}

