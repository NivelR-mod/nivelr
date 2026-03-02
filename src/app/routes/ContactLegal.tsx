import { FormEvent, useMemo, useState } from 'react';
import { getCurrentSessionUser } from '../../backend/localAuth';
import { sendContactEmail } from '../../backend/contactEmail';

const CONTACT_SUBJECT_OPTIONS = [
  { value: 'SUPPORT', label: 'Support technique' },
  { value: 'COMPTE', label: 'Compte et connexion' },
  { value: 'ABONNEMENT', label: 'Abonnement / paiement' },
  { value: 'RGPD', label: 'RGPD et données personnelles' },
  { value: 'BUG', label: 'Signaler un bug' },
  { value: 'AUTRE', label: 'Autre demande' }
] as const;

export default function ContactLegal(): JSX.Element {
  const session = getCurrentSessionUser();
  const [subject, setSubject] = useState<(typeof CONTACT_SUBJECT_OPTIONS)[number]['value']>('SUPPORT');
  const [replyEmail, setReplyEmail] = useState(session?.email ?? '');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const subjectLabel = useMemo(
    () => CONTACT_SUBJECT_OPTIONS.find((option) => option.value === subject)?.label ?? 'Demande',
    [subject]
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const normalizedReplyEmail = replyEmail.trim().toLowerCase();
    const trimmedMessage = message.trim();
    if (!normalizedReplyEmail || !normalizedReplyEmail.includes('@')) {
      setError('Renseigne une adresse email valide.');
      return;
    }
    if (trimmedMessage.length < 10) {
      setError('Ton message doit contenir au moins 10 caractères.');
      return;
    }

    setSending(true);
    const result = await sendContactEmail({
      replyEmail: normalizedReplyEmail,
      subject: subjectLabel,
      message: trimmedMessage,
      senderName: session?.displayName ?? undefined
    });
    setSending(false);

    if (!result.ok) {
      setError(result.error ?? "Envoi impossible pour l'instant.");
      return;
    }

    setMessage('');
    setSuccess('Message envoyé. Tu recevras une réponse par email.');
  };

  return (
    <section className="page legal-page">
      <h1>Contact</h1>
      <p className="page-subtitle">
        Pour toute question légale, RGPD ou support utilisateur. Réponse sous 2 à 5 jours ouvrés.
      </p>
      <p className="form-hint">
        Ton message est envoyé depuis le backend sécurisé NIVELR.
      </p>

      <form className="card premium-section form contact-form" onSubmit={onSubmit}>
        <h2>Écrire un message</h2>
        <div className="contact-form-grid">
          <label>
            Objet
            <select
              value={subject}
              onChange={(event) => setSubject(event.target.value as typeof subject)}
              required
            >
              {CONTACT_SUBJECT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Ton email de réponse
            <input
              type="email"
              value={replyEmail}
              onChange={(event) => setReplyEmail(event.target.value)}
              placeholder="ton.email@exemple.com"
              required
            />
          </label>
        </div>

        <label>
          Message
          <textarea
            className="contact-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Décris précisément ta demande..."
            minLength={10}
            required
          />
        </label>

        {error ? <p className="error pseudo-error-note">{error}</p> : null}
        {success ? <p className="inline-info">Message envoyé. Tu recevras une réponse par email.</p> : null}

        <button type="submit" disabled={sending}>
          {sending ? 'Envoi en cours...' : 'Envoyer'}
        </button>
      </form>
    </section>
  );
}
