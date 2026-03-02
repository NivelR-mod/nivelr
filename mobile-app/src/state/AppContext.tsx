import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { createSession } from '../domain/sessions';
import { shouldSuggestReassessment } from '../domain/runnerProfile';
import { supabase } from '../lib/supabase';
import { loadRemoteState, saveRemoteState } from '../services/remoteState';
import { createDefaultState, getLevelFromXp, getXpTotal } from './appState';
import { AppState, RunnerAssessmentSnapshot, SessionInput } from '../types/models';

interface ActionResult {
  ok: boolean;
  error?: string;
}

interface AppContextValue {
  session: Session | null;
  loading: boolean;
  syncing: boolean;
  stateHydrated: boolean;
  appState: AppState;
  xpTotal: number;
  level: number;
  runnerAssessment?: RunnerAssessmentSnapshot;
  shouldPromptRunnerAssessment: boolean;
  signIn: (email: string, password: string) => Promise<ActionResult>;
  signUp: (email: string, password: string) => Promise<ActionResult>;
  signOut: () => Promise<void>;
  addSession: (input: SessionInput) => Promise<ActionResult>;
  deleteSession: (id: string) => Promise<ActionResult>;
  applyRunnerAssessment: (assessment: RunnerAssessmentSnapshot) => Promise<ActionResult>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [stateHydrated, setStateHydrated] = useState(false);
  const [appState, setAppState] = useState<AppState>(createDefaultState());

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session ?? null))
      .finally(() => setLoading(false));

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setAppState(createDefaultState());
      setStateHydrated(true);
      return;
    }

    setStateHydrated(false);
    setSyncing(true);
    loadRemoteState(session.user.id)
      .then((result) => {
        if (result.error) {
          setAppState(createDefaultState());
          return;
        }
        setAppState(result.state ?? createDefaultState());
      })
      .finally(() => {
        setSyncing(false);
        setStateHydrated(true);
      });
  }, [session?.user?.id]);

  const persistState = async (nextState: AppState): Promise<ActionResult> => {
    if (!session?.user?.id) return { ok: false, error: 'not_authenticated' };
    setSyncing(true);
    const result = await saveRemoteState(session.user.id, nextState);
    setSyncing(false);
    if (!result.ok) return { ok: false, error: result.error ?? 'save_failed' };
    return { ok: true };
  };

  const signIn = async (email: string, password: string): Promise<ActionResult> => {
    if (!supabase) return { ok: false, error: 'supabase_not_configured' };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const signUp = async (email: string, password: string): Promise<ActionResult> => {
    if (!supabase) return { ok: false, error: 'supabase_not_configured' };
    const { error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const signOut = async (): Promise<void> => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const addSession = async (input: SessionInput): Promise<ActionResult> => {
    const created = createSession(input);
    const nextState: AppState = {
      ...appState,
      sessions: [created, ...appState.sessions]
    };
    setAppState(nextState);

    const saveResult = await persistState(nextState);
    if (!saveResult.ok) {
      setAppState(appState);
      return saveResult;
    }

    return { ok: true };
  };

  const deleteSession = async (id: string): Promise<ActionResult> => {
    const nextState: AppState = {
      ...appState,
      sessions: appState.sessions.filter((item) => item.id !== id)
    };
    setAppState(nextState);

    const saveResult = await persistState(nextState);
    if (!saveResult.ok) {
      setAppState(appState);
      return saveResult;
    }

    return { ok: true };
  };

  const xpTotal = useMemo(() => getXpTotal(appState), [appState]);
  const level = useMemo(() => getLevelFromXp(xpTotal), [xpTotal]);
  const shouldPrompt = useMemo(
    () => shouldSuggestReassessment(appState.runnerAssessment?.result.nextRecommendedAt),
    [appState.runnerAssessment?.result.nextRecommendedAt]
  );

  const applyRunnerAssessment = async (assessment: RunnerAssessmentSnapshot): Promise<ActionResult> => {
    const nextState: AppState = {
      ...appState,
      runnerAssessment: assessment
    };
    setAppState(nextState);
    const saveResult = await persistState(nextState);
    if (!saveResult.ok) {
      setAppState(appState);
      return saveResult;
    }
    return { ok: true };
  };

  const value = useMemo<AppContextValue>(
    () => ({
      session,
      loading,
      syncing,
      stateHydrated,
      appState,
      xpTotal,
      level,
      runnerAssessment: appState.runnerAssessment,
      shouldPromptRunnerAssessment: shouldPrompt,
      signIn,
      signUp,
      signOut,
      addSession,
      deleteSession,
      applyRunnerAssessment
    }),
    [session, loading, syncing, stateHydrated, appState, xpTotal, level, shouldPrompt]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useAppContext must be used inside AppProvider');
  return value;
}
