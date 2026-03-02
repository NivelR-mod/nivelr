import { CSSProperties, useMemo, useState } from 'react';
import SessionEditorModal from '../../components/SessionEditorModal';
import SessionCard from '../../components/SessionCard';
import { AppState, Session } from '../../types/models';
import sessionsFiltersBg from '../../assets/sessions-filtres-bg.jpg';

interface SessionsProps {
  state: AppState;
  onUpdateSession: (session: Session) => void;
  onDeleteSession: (sessionId: string) => void;
  onDuplicateSession: (session: Session) => void;
  onExportFiltered: (sessions: Session[]) => void;
}

export default function Sessions({
  state,
  onUpdateSession,
  onDeleteSession,
  onDuplicateSession,
  onExportFiltered
}: SessionsProps): JSX.Element {
  const [search, setSearch] = useState<string>('');
  const [sportFilter, setSportFilter] = useState<'ALL' | 'RUNNING' | 'OTHER'>('ALL');
  const [subtypeFilter, setSubtypeFilter] = useState<string>('ALL');
  const [periodFilter, setPeriodFilter] = useState<'ALL' | '7D' | '30D'>('ALL');
  const [sortBy, setSortBy] = useState<'DATE_DESC' | 'XP_DESC' | 'DURATION_DESC'>('DATE_DESC');
  const [minDuration, setMinDuration] = useState<string>('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState<boolean>(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);

  const subtypeOptions = useMemo(() => {
    const unique = new Set(state.sessions.map((session) => session.subtype));
    return ['ALL', ...Array.from(unique).sort()];
  }, [state.sessions]);

  const filtered = useMemo(() => {
    const nowMs = Date.now();
    const minDurationNum = minDuration ? Number(minDuration) : 0;

    return [...state.sessions]
      .filter((session) => (sportFilter === 'ALL' ? true : session.sportType === sportFilter))
      .filter((session) => (subtypeFilter === 'ALL' ? true : session.subtype === subtypeFilter))
      .filter((session) => {
        if (periodFilter === 'ALL') return true;
        const createdAt = new Date(session.createdAt).getTime();
        const maxAgeMs = periodFilter === '7D' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
        return nowMs - createdAt <= maxAgeMs;
      })
      .filter((session) => (minDurationNum > 0 ? session.durationMin >= minDurationNum : true))
      .filter((session) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        const haystack = [session.sportType, session.subtype, session.comment ?? '']
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        if (sortBy === 'XP_DESC') return b.xp - a.xp;
        if (sortBy === 'DURATION_DESC') return b.durationMin - a.durationMin;
        return +new Date(b.createdAt) - +new Date(a.createdAt);
      });
  }, [state.sessions, sportFilter, subtypeFilter, search, periodFilter, minDuration, sortBy]);

  const resetFilters = (): void => {
    setSearch('');
    setSportFilter('ALL');
    setSubtypeFilter('ALL');
    setPeriodFilter('ALL');
    setSortBy('DATE_DESC');
    setMinDuration('');
  };

  const filteredXp = filtered.reduce((sum, session) => sum + session.xp, 0);
  const filteredMinutes = filtered.reduce((sum, session) => sum + session.durationMin, 0);

  return (
    <section className="page page-sessions">
      <h1>Séances</h1>
      <p className="page-subtitle">Analyse, filtre et retrouve rapidement toutes tes séances.</p>
      {state.sessions.length === 0 ? <p>Aucune séance enregistrée.</p> : null}

      {state.sessions.length > 0 ? (
        <article
          className="card sessions-filters sessions-filters-photo premium-section"
          style={{ '--sessions-filters-bg-image': `url(${sessionsFiltersBg})` } as CSSProperties}
        >
          <div className="sessions-filters-head">
            <h2>Filtres</h2>
            <button
              type="button"
              className={`sessions-filters-toggle ${mobileFiltersOpen ? 'is-open' : ''}`}
              onClick={() => setMobileFiltersOpen((prev) => !prev)}
              aria-expanded={mobileFiltersOpen}
              aria-controls="sessions-filters-body"
            >
              <span>{mobileFiltersOpen ? 'Réduire' : 'Agrandir'}</span>
              <span aria-hidden="true">{mobileFiltersOpen ? '▴' : '▾'}</span>
            </button>
          </div>

          <div
            id="sessions-filters-body"
            className={`sessions-filters-body ${mobileFiltersOpen ? 'is-open' : ''}`}
          >
            <div className="sessions-filters-grid">
              <label>
                Recherche (sport, sous-type, commentaire)
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ex: running, EF, plaisir..."
                />
              </label>

              <label>
                Sport
                <select
                  value={sportFilter}
                  onChange={(e) =>
                    setSportFilter(e.target.value as 'ALL' | 'RUNNING' | 'OTHER')
                  }
                >
                  <option value="ALL">Tous</option>
                  <option value="RUNNING">RUNNING</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </label>
            </div>

            <div className="sessions-filters-actions">
              <button type="button" onClick={() => setShowAdvancedFilters((prev) => !prev)}>
                {showAdvancedFilters ? 'Masquer recherche approfondie' : 'Recherche approfondie'}
              </button>
            </div>

            {showAdvancedFilters ? (
              <div className="sessions-filters-grid">
                <label>
                  Période
                  <select
                    value={periodFilter}
                    onChange={(e) => setPeriodFilter(e.target.value as 'ALL' | '7D' | '30D')}
                  >
                    <option value="ALL">Toutes</option>
                    <option value="7D">7 derniers jours</option>
                    <option value="30D">30 derniers jours</option>
                  </select>
                </label>

                <label>
                  Tri
                  <select
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(e.target.value as 'DATE_DESC' | 'XP_DESC' | 'DURATION_DESC')
                    }
                  >
                    <option value="DATE_DESC">Plus récentes</option>
                    <option value="XP_DESC">XP décroissant</option>
                    <option value="DURATION_DESC">Durée décroissante</option>
                  </select>
                </label>

                <label>
                  Durée min (minutes)
                  <input
                    type="number"
                    min={0}
                    value={minDuration}
                    onChange={(e) => setMinDuration(e.target.value)}
                    placeholder="Ex: 30"
                  />
                </label>

                <label>
                  Sous-type
                  <select value={subtypeFilter} onChange={(e) => setSubtypeFilter(e.target.value)}>
                    {subtypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option === 'ALL' ? 'Tous' : option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            <div className="sessions-filters-actions">
              <p>
                Résultats : <strong>{filtered.length}</strong> / {state.sessions.length}
              </p>
              <p>
                Charge filtrée : <strong>{filteredMinutes} min</strong> · <strong>{filteredXp} XP</strong>
              </p>
              <button type="button" onClick={resetFilters}>
                Réinitialiser les filtres
              </button>
              <button type="button" onClick={() => onExportFiltered(filtered)}>
                Exporter ce résultat
              </button>
            </div>
          </div>
        </article>
      ) : null}

      <div className="list">
        {filtered.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onEdit={(selected) => setEditingSession(selected)}
            onDuplicate={onDuplicateSession}
            onDelete={(selected) => {
              const ok = window.confirm('Supprimer cette séance ?');
              if (ok) onDeleteSession(selected.id);
            }}
          />
        ))}
      </div>
      {state.sessions.length > 0 && filtered.length === 0 ? (
        <article className="card empty-state">Aucune séance ne correspond à ces filtres.</article>
      ) : null}
      {editingSession ? (
        <SessionEditorModal
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSave={(session) => {
            onUpdateSession(session);
            setEditingSession(null);
          }}
        />
      ) : null}
    </section>
  );
}
