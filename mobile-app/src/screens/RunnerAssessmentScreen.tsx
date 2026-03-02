import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { FadeInView } from '../components/FadeInView';
import { GradientScreen } from '../components/GradientScreen';
import { PremiumCard } from '../components/PremiumCard';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  evaluateRunnerProfile,
  formatRunnerArchetype,
  formatRunnerLevel,
  getRunnerArchetypeDescription,
  getRunnerArchetypeMotivation,
  getRunnerProfileWhyLines
} from '../domain/runnerProfile';
import { useAppContext } from '../state/AppContext';
import { RunnerAssessmentAnswers, RunnerMotivation, RunnerObjective } from '../types/models';
import { colors } from '../ui/theme';

const DEFAULT_ANSWERS: RunnerAssessmentAnswers = {
  consistencyMonths: 'DEBUT_REPRISE',
  sessionsPerWeek: 'S0_1',
  weeklyKm: 'UNKNOWN',
  longestRecentRun: 'LT_30',
  easyPaceTalk: 'ESSOUFFLE',
  injuryLast6Months: 'NO',
  objective8Weeks: ['REPRISE_REGULARITE'],
  usualRecovery: 'LIMITE',
  availableDays: 'D2',
  motivation: ['ROUTINE']
};

type MultiKey = 'objective8Weeks' | 'motivation';
type SingleKey = Exclude<keyof RunnerAssessmentAnswers, MultiKey>;
type AnyOption = RunnerAssessmentAnswers[SingleKey] | RunnerObjective | RunnerMotivation;

type QuestionDefinition =
  | {
      key: SingleKey;
      label: string;
      options: Array<{ value: RunnerAssessmentAnswers[SingleKey]; label: string }>;
      multiple?: false;
    }
  | {
      key: MultiKey;
      label: string;
      options: Array<{ value: RunnerObjective | RunnerMotivation; label: string }>;
      multiple: true;
      minSelections: number;
      helper: string;
    };

const QUESTIONS: QuestionDefinition[] = [
  {
    key: 'consistencyMonths',
    label: 'Depuis combien de temps cours-tu régulièrement ?',
    options: [
      { value: 'DEBUT_REPRISE', label: 'Je débute / je reprends' },
      { value: 'M1_3', label: '1–3 mois' },
      { value: 'M3_12', label: '3–12 mois' },
      { value: 'Y1_3', label: '1–3 ans' },
      { value: 'Y3_PLUS', label: '3+ ans' }
    ]
  },
  {
    key: 'sessionsPerWeek',
    label: 'Combien de séances de course fais-tu par semaine ?',
    options: [
      { value: 'S0_1', label: '0–1' },
      { value: 'S2', label: '2' },
      { value: 'S3', label: '3' },
      { value: 'S4_PLUS', label: '4+' }
    ]
  },
  {
    key: 'weeklyKm',
    label: 'Volume hebdo moyen (km) ?',
    options: [
      { value: 'UNKNOWN', label: 'Je ne sais pas' },
      { value: 'KM_LT_10', label: '< 10' },
      { value: 'KM_10_20', label: '10–20' },
      { value: 'KM_20_35', label: '20–35' },
      { value: 'KM_35_50', label: '35–50' },
      { value: 'KM_50_PLUS', label: '50+' }
    ]
  },
  {
    key: 'longestRecentRun',
    label: 'Ta sortie la plus longue récente ?',
    options: [
      { value: 'LT_30', label: '< 30 min' },
      { value: 'M30_45', label: '30–45 min' },
      { value: 'M45_60', label: '45–60 min' },
      { value: 'M60_90', label: '60–90 min' },
      { value: 'M90_PLUS', label: '90+ min' }
    ]
  },
  {
    key: 'easyPaceTalk',
    label: 'À allure facile, tu peux parler ?',
    options: [
      { value: 'ESSOUFFLE', label: 'Je suis vite essoufflé' },
      { value: 'QUELQUES_PHRASES', label: 'Quelques phrases' },
      { value: 'CONVERSATION', label: 'Conversation complète' }
    ]
  },
  {
    key: 'injuryLast6Months',
    label: 'Blessure course sur les 6 derniers mois ?',
    options: [
      { value: 'NO', label: 'Non' },
      { value: 'LIGHT', label: 'Oui, légère' },
      { value: 'STOP_2PLUS', label: 'Oui, arrêt > 2 semaines' }
    ]
  },
  {
    key: 'objective8Weeks',
    label: 'Objectif principal sur 8 semaines ?',
    multiple: true,
    minSelections: 1,
    helper: 'Tu peux sélectionner plusieurs objectifs.',
    options: [
      { value: 'REPRISE_REGULARITE', label: 'Reprendre / régulier' },
      { value: 'FORME_GENERALE', label: 'Forme générale' },
      { value: 'PREPA_COURSE', label: 'Préparer une course' },
      { value: 'PERFORMANCE', label: 'Performance / chrono' },
      { value: 'SANTE_POIDS', label: 'Santé / perte de poids' }
    ]
  },
  {
    key: 'usualRecovery',
    label: 'Ressenti après une semaine classique ?',
    options: [
      { value: 'FATIGUE_DOULEURS', label: 'Souvent fatigué / douleurs' },
      { value: 'LIMITE', label: 'Ça passe mais limite' },
      { value: 'RECUP_BIEN', label: 'Je récupère bien' }
    ]
  },
  {
    key: 'availableDays',
    label: 'Combien de jours peux-tu reellement courir ?',
    options: [
      { value: 'D1', label: '1' },
      { value: 'D2', label: '2' },
      { value: 'D3', label: '3' },
      { value: 'D4_PLUS', label: '4+' }
    ]
  },
  {
    key: 'motivation',
    label: 'Qu’est-ce qui te motive le plus ?',
    multiple: true,
    minSelections: 1,
    helper: 'Sélection multiple autorisée.',
    options: [
      { value: 'ROUTINE', label: 'Tenir une routine' },
      { value: 'VARIER', label: 'Explorer et varier' },
      { value: 'DEPASSEMENT', label: 'Me dépasser' },
      { value: 'STRUCTUREE', label: 'Progression structurée' }
    ]
  }
];

export function RunnerAssessmentScreen(): JSX.Element {
  const { runnerAssessment, applyRunnerAssessment } = useAppContext();
  const [answers, setAnswers] = useState<RunnerAssessmentAnswers>(runnerAssessment?.answers ?? DEFAULT_ANSWERS);
  const [step, setStep] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  const stepOpacity = useRef(new Animated.Value(1)).current;
  const stepTranslate = useRef(new Animated.Value(0)).current;

  const question = QUESTIONS[step];
  const progress = Math.round(((step + 1) / QUESTIONS.length) * 100);
  const result = useMemo(() => evaluateRunnerProfile(answers), [answers]);
  const whyLines = useMemo(() => getRunnerProfileWhyLines(answers), [answers]);

  useEffect(() => {
    stepOpacity.setValue(0);
    stepTranslate.setValue(direction === 'next' ? 20 : -20);
    Animated.parallel([
      Animated.timing(stepOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(stepTranslate, { toValue: 0, duration: 220, useNativeDriver: true })
    ]).start();
  }, [step, direction, stepOpacity, stepTranslate]);

  const isSelected = (value: AnyOption): boolean => {
    if (question.multiple) {
      const current = answers[question.key] as string[];
      return current.includes(value as string);
    }
    return answers[question.key] === value;
  };

  const selectOption = (value: AnyOption): void => {
    if (question.multiple) {
      setAnswers((prev) => {
        const current = prev[question.key] as string[];
        const exists = current.includes(value as string);
        const next = exists ? current.filter((item) => item !== value) : [...current, value as string];
        if (!next.length) return prev;
        return { ...prev, [question.key]: next } as RunnerAssessmentAnswers;
      });
      return;
    }

    setAnswers((prev) => ({
      ...prev,
      [question.key]: value
    }));
  };

  const onNext = (): void => {
    if (question.multiple) {
      const selected = answers[question.key] as string[];
      if (selected.length < question.minSelections) {
        Alert.alert('Questionnaire', 'Sélectionne au moins un choix pour continuer.');
        return;
      }
    }

    if (step === QUESTIONS.length - 1) {
      setShowResult(true);
      return;
    }
    setDirection('next');
    setStep((prev) => prev + 1);
  };

  const onPrevious = (): void => {
    if (step === 0) return;
    setDirection('prev');
    setStep((prev) => prev - 1);
  };

  const onApply = async (): Promise<void> => {
    const saveResult = await applyRunnerAssessment({
      answers,
      result,
      appliedAt: new Date().toISOString()
    });
    if (!saveResult.ok) {
      Alert.alert('Profil coureur', saveResult.error ?? 'Sauvegarde impossible');
      return;
    }
    Alert.alert('Profil coureur', 'Profil appliqué et synchronisé.');
  };

  return (
    <GradientScreen>
      {!showResult ? (
        <FadeInView>
          <PremiumCard>
            <Text style={styles.title}>Profil coureur</Text>
            <View style={styles.stepRow}>
              <Text style={styles.stepBadge}>
                Étape {step + 1}/{QUESTIONS.length}
              </Text>
              <Text style={styles.sub}>{progress}%</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${progress}%` }]} />
            </View>

            <Animated.View style={{ opacity: stepOpacity, transform: [{ translateX: stepTranslate }] }}>
              <Text style={styles.question}>{question.label}</Text>
              {'helper' in question ? <Text style={styles.helper}>{question.helper}</Text> : null}
              <View style={styles.choices}>
                {question.options.map((option) => {
                  const active = isSelected(option.value as AnyOption);
                  return (
                    <Pressable
                      key={String(option.value)}
                      style={[styles.choice, active && styles.choiceActive]}
                      onPress={() => selectOption(option.value as AnyOption)}
                    >
                      <View style={[styles.dot, active && styles.dotActive]} />
                      <Text style={styles.choiceText}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>

            <View style={styles.actions}>
              <View style={styles.actionItem}>
                <PrimaryButton label="Precedent" onPress={onPrevious} variant="ghost" />
              </View>
              <View style={styles.actionItem}>
                <PrimaryButton
                  label={step === QUESTIONS.length - 1 ? 'Voir resultat' : 'Suivant'}
                  onPress={onNext}
                />
              </View>
            </View>
          </PremiumCard>
        </FadeInView>
      ) : (
        <FadeInView>
          <PremiumCard>
            <Text style={styles.title}>Resultat</Text>
            <View style={styles.hero}>
              <Text style={styles.levelPill}>Niveau {formatRunnerLevel(result.level)}</Text>
              <Text style={styles.profileName}>{formatRunnerArchetype(result.archetype)}</Text>
              <Text style={styles.profileDesc}>{getRunnerArchetypeDescription(result.archetype)}</Text>
            </View>
            <Text style={styles.metric}>{getRunnerArchetypeMotivation(result.archetype, result.level)}</Text>

            <View style={styles.whyCard}>
              <Text style={styles.whyTitle}>Pourquoi ce profil te correspond</Text>
              {whyLines.map((item) => (
                <Text key={item} style={styles.reco}>• {item}</Text>
              ))}
            </View>

            <View style={styles.whyCard}>
              <Text style={styles.whyTitle}>Cap de progression</Text>
              <Text style={styles.caution}>{result.caution}</Text>
            </View>
            <PrimaryButton label="Appliquer à mon profil" onPress={onApply} />
            <PrimaryButton label="Modifier mes réponses" onPress={() => setShowResult(false)} variant="ghost" />
          </PremiumCard>
        </FadeInView>
      )}
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 13 },
  helper: { color: colors.muted, fontSize: 12, marginBottom: 6 },
  stepRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepBadge: {
    color: '#e6f8fd',
    fontSize: 12,
    fontWeight: '800',
    borderWidth: 1,
    borderColor: 'rgba(135,205,212,0.45)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  track: {
    width: '100%',
    height: 11,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(134,202,213,0.34)'
  },
  fill: { height: '100%', backgroundColor: '#19b8b0' },
  question: { color: '#e9f9ff', fontSize: 17, fontWeight: '700', lineHeight: 24, marginTop: 10 },
  choices: { gap: 8, marginTop: 8 },
  choice: {
    borderWidth: 1,
    borderColor: 'rgba(136,196,204,0.35)',
    borderRadius: 12,
    padding: 11,
    backgroundColor: 'rgba(255,255,255,0.03)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  choiceActive: { borderColor: '#f4c071', backgroundColor: 'rgba(244,177,92,0.2)' },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(170,215,224,0.75)',
    backgroundColor: 'transparent'
  },
  dotActive: { borderColor: '#f4c071', backgroundColor: '#f4c071' },
  choiceText: { color: '#e8f6fb', fontWeight: '600', flex: 1, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8 },
  actionItem: { flex: 1 },
  hero: {
    borderWidth: 1,
    borderColor: 'rgba(132,202,213,0.34)',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 12,
    gap: 6
  },
  levelPill: {
    color: '#ffd8a1',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    borderWidth: 1,
    borderColor: 'rgba(246,188,111,0.7)',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
    alignSelf: 'flex-start'
  },
  profileName: { color: '#f4fbff', fontSize: 34, fontWeight: '900', lineHeight: 36 },
  profileDesc: { color: '#d4e9f2', fontSize: 15, lineHeight: 22 },
  metric: { color: '#e6f7ff', fontWeight: '700' },
  whyCard: {
    borderWidth: 1,
    borderColor: 'rgba(132,202,213,0.24)',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 10,
    gap: 4
  },
  whyTitle: { color: '#edf9ff', fontWeight: '800', fontSize: 14 },
  caution: { color: '#ffd4a0', lineHeight: 20 },
  reco: { color: '#b7cfdb', lineHeight: 20 }
});
