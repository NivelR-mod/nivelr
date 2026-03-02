import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type CookieConsentDecision = 'accepted' | 'refused' | 'custom';

interface CookieConsentRecord {
  version: number;
  decision: CookieConsentDecision;
  essential: true;
  analytics: boolean;
  updatedAt: string;
}

const COOKIE_CONSENT_KEY = 'nivelr_cookie_consent_v1';
const COOKIE_CONSENT_VERSION = 1;

function readConsent(): CookieConsentRecord | null {
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookieConsentRecord>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (
      (parsed.decision !== 'accepted' && parsed.decision !== 'refused' && parsed.decision !== 'custom') ||
      typeof parsed.analytics !== 'boolean'
    ) {
      return null;
    }
    return {
      version: COOKIE_CONSENT_VERSION,
      decision: parsed.decision,
      essential: true,
      analytics: parsed.analytics,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString()
    };
  } catch {
    return null;
  }
}

function writeConsent(record: CookieConsentRecord): void {
  localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(record));
  window.dispatchEvent(
    new CustomEvent('nivelr-cookie-consent-changed', {
      detail: record
    })
  );
}

export default function CookieConsentModal(): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    const existing = readConsent();
    if (existing) {
      setAnalytics(existing.analytics);
      setVisible(false);
      return;
    }
    setVisible(true);
  }, []);

  const save = (decision: CookieConsentDecision, analyticsEnabled: boolean): void => {
    const record: CookieConsentRecord = {
      version: COOKIE_CONSENT_VERSION,
      decision,
      essential: true,
      analytics: analyticsEnabled,
      updatedAt: new Date().toISOString()
    };
    writeConsent(record);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="cookie-consent-backdrop" role="dialog" aria-modal="true" aria-label="Préférences cookies">
      <article className="cookie-consent-card">
        <p className="cookie-consent-kicker">Cookies</p>
        <h2>Gère tes préférences</h2>
        <p>
          NIVELR utilise des cookies essentiels pour fonctionner. Tu peux accepter ou refuser les cookies
          optionnels de mesure d&apos;audience.
        </p>

        {showCustomize ? (
          <div className="cookie-consent-options">
            <label>
              <span>Cookies essentiels (obligatoires)</span>
              <input type="checkbox" checked readOnly disabled />
            </label>
            <label>
              <span>Mesure d&apos;audience (optionnel)</span>
              <input
                type="checkbox"
                checked={analytics}
                onChange={(event) => setAnalytics(event.target.checked)}
              />
            </label>
          </div>
        ) : null}

        <div className="cookie-consent-actions">
          <button type="button" className="btn-compact" onClick={() => save('refused', false)}>
            Tout refuser
          </button>
          <button type="button" className="btn-compact" onClick={() => save('accepted', true)}>
            Tout accepter
          </button>
          {!showCustomize ? (
            <button type="button" className="btn-compact" onClick={() => setShowCustomize(true)}>
              Personnaliser
            </button>
          ) : (
            <button type="button" className="btn-compact" onClick={() => save('custom', analytics)}>
              Enregistrer mes choix
            </button>
          )}
        </div>

        <p className="cookie-consent-link">
          Voir le détail: <Link to="/cookies">Politique cookies</Link>
        </p>
      </article>
    </div>
  );
}

