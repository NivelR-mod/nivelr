import { Link } from 'react-router-dom';
import heroNivelr from '../../assets/hero-nivelr.jpg';

const ROLE_CARDS = [
  {
    title: 'Explorateur',
    desc: 'Varie tes séances et ouvre de nouveaux chemins.',
    image: '/style-explorateur.svg'
  },
  {
    title: 'Pilier',
    desc: 'Stabilise l’équipe avec une régularité solide.',
    image: '/style-pilier.svg'
  },
  {
    title: 'Stratège',
    desc: 'Optimise tes choix pour progresser sans excès.',
    image: '/style-stratege.svg'
  },
  {
    title: 'Performeur',
    desc: 'Accélère sur les moments clés de la saison.',
    image: '/style-performeur.svg'
  }
];

const BENEFIT_CARDS: Array<{
  title: string;
  lead: string;
  points: string[];
  outro: string;
  image: string;
  objectPosition?: string;
  imageClassName?: string;
}> = [
  {
    title: 'Une motivation durable',
    lead: 'Tu visualises ta progression séance après séance, ce qui renforce l’engagement sur la durée.',
    points: [
      'Chaque séance alimente une progression mesurable',
      'Les semaines actives sont valorisées',
      'Les saisons donnent un cap clair',
      'Les retours réguliers évitent la perte de motivation'
    ],
    outro: 'Ce n’est pas un pic d’intensité. C’est une constance qui s’installe.',
    image: '/motivation.jpg',
    objectPosition: 'center 0%'
  },
  {
    title: 'Un cadre clair pour progresser',
    lead: 'Les missions, paliers et objectifs transforment tes efforts en étapes concrètes.',
    points: [
      'Des missions adaptées à ton niveau',
      'Des paliers visibles et atteignables',
      'Une progression mesurée dans le temps',
      'Des saisons structurées pour rester engagé'
    ],
    outro: 'Chaque séance compte. Chaque étape a une utilité.',
    image: '/cadre.jpg'
  },
  {
    title: 'Une pratique accessible à tous',
    lead: 'Que tu débutes ou que tu sois déjà régulier, la structure reste claire et motivante.',
    points: [
      'Des objectifs adaptés à ton rythme',
      'Une progression basée sur la régularité, pas uniquement la performance',
      'Un système lisible, sans jargon complexe',
      'Une dynamique collective non compétitive'
    ],
    outro: 'Pas besoin d’être le plus rapide. Il suffit d’être présent.',
    image: '/accessible.jpg'
  }
];

const STEP_CARDS: Array<{
  id: string;
  title: string;
  desc: string;
  tone: 'is-run' | 'is-mission' | 'is-power';
  icon: 'SESSION' | 'MISSION' | 'LEVEL';
}> = [
  {
    id: '01',
    title: 'Ajoute ta séance',
    desc: 'Distance, durée, ressenti: ton entraînement est enregistré en quelques secondes.',
    tone: 'is-run',
    icon: 'SESSION'
  },
  {
    id: '02',
    title: 'Valide tes missions',
    desc: 'Tu avances pas à pas avec des objectifs clairs et motivants.',
    tone: 'is-mission',
    icon: 'MISSION'
  },
  {
    id: '03',
    title: 'Monte en puissance',
    desc: 'Ton style et tes paliers débloquent de nouveaux leviers de progression.',
    tone: 'is-power',
    icon: 'LEVEL'
  }
];

function StepIcon({ kind }: { kind: 'SESSION' | 'MISSION' | 'LEVEL' }): JSX.Element {
  if (kind === 'SESSION') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 18h14M7 18v-6l2-2h6l2 2v6" />
        <path d="M9 8l2-2h2l2 2" />
        <circle cx="9" cy="13" r="1.2" />
        <circle cx="15" cy="13" r="1.2" />
      </svg>
    );
  }
  if (kind === 'MISSION') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 5v2M12 17v2M5 12h2M17 12h2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 18l4-5 3 3 5-8 2 1" />
      <path d="M5 6h14M5 18h14" />
      <circle cx="17" cy="8" r="1.2" />
    </svg>
  );
}

export default function Explications(): JSX.Element {
  return (
    <section className="page explications-page">
      <header className="card premium-section explications-hero">
        <img src={heroNivelr} alt="NIVELR - visuel hero" className="explications-hero-bg" />
        <div className="explications-hero-overlay" />
        <div className="explications-hero-content">
          <p className="explications-kicker">NIVELR · Earn Your Level.</p>
          <h1>Rends ta régularité sportive addictive.</h1>
          <p className="explications-sport-tagline">
            Suis tes séances. Débloque des paliers. Avance en équipe.
          </p>
          <div className="explications-sport-chips">
            <span>Booster ta régularité</span>
            <span>Gamifier ta pratique</span>
            <span>Avancer dans l&apos;aventure</span>
          </div>
          <p>
            Chaque séance compte. L&apos;objectif: te faire revenir semaine après semaine.
          </p>
          <div className="explications-hero-actions">
            <Link to="/add-session">Ajouter ma séance</Link>
            <Link to="/missions">Voir mes missions</Link>
            <Link to="/guide-xp">Comprendre l&apos;XP</Link>
          </div>
        </div>
      </header>

      <section className="card premium-section explications-steps">
        <h2>Comment ça marche</h2>
        <div className="explications-steps-grid">
          {STEP_CARDS.map((step) => (
            <article key={step.id} className={step.tone}>
              <div className="explications-step-head">
                <span className="explications-step-badge">{step.id}</span>
                <span className={`explications-step-icon-chip ${step.tone}`} aria-hidden="true">
                  <StepIcon kind={step.icon} />
                </span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card premium-section explications-roles">
        <h2>Les styles de coureurs</h2>
        <div className="explications-roles-grid">
          {ROLE_CARDS.map((role) => (
            <article key={role.title}>
              <img src={role.image} alt={role.title} className="explications-role-image" />
              <h3>{role.title}</h3>
              <p>{role.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card premium-section explications-not">
        <h2>Ce que NIVELR t&apos;apporte</h2>
        <div className="explications-benefits-stack">
          {BENEFIT_CARDS.map((item, index) => (
            <article
              key={item.title}
              className={`explications-benefit-row ${index % 2 === 1 ? 'is-reverse' : ''}`}
            >
              <div className="explications-benefit-copy">
                <h3>{item.title}</h3>
                <p className="explications-benefit-lead">{item.lead}</p>
                <ul className="explications-benefit-points">
                  {item.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <p className="explications-benefit-outro">{item.outro}</p>
              </div>
              <img
                src={item.image}
                alt={item.title}
                className={`explications-benefit-image ${item.imageClassName ?? ''}`.trim()}
                style={item.objectPosition ? { objectPosition: item.objectPosition } : undefined}
              />
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
