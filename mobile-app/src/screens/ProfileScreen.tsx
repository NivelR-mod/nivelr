import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FadeInView } from '../components/FadeInView';
import { GradientScreen } from '../components/GradientScreen';
import { PremiumCard } from '../components/PremiumCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAppContext } from '../state/AppContext';
import { colors } from '../ui/theme';
import {
  formatRunnerArchetype,
  formatRunnerLevel,
  getRunnerArchetypeDescription,
  getRunnerArchetypeMotivation
} from '../domain/runnerProfile';
import { RootStackParamList } from '../navigation/AppNavigator';

function maskEmail(email: string | undefined): string {
  if (!email) return 'Non renseigné';
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return email;
  if (localPart.length <= 2) return `${localPart[0] ?? '*'}***@${domain}`;
  return `${localPart.slice(0, 2)}***${localPart.slice(-2)}@${domain}`;
}

function shortId(id: string | undefined): string {
  if (!id) return '-';
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

export function ProfileScreen(): JSX.Element {
  const { session, signOut, runnerAssessment, shouldPromptRunnerAssessment } = useAppContext();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const onSignOut = async (): Promise<void> => {
    try {
      await signOut();
    } catch (error) {
      Alert.alert('Déconnexion', error instanceof Error ? error.message : 'Erreur inconnue');
    }
  };

  return (
    <GradientScreen>
      <FadeInView>
        <PremiumCard>
          <Text style={styles.title}>Profil</Text>
          <View style={styles.identityCard}>
            <Text style={styles.sectionTitle}>Compte</Text>
            <Text style={styles.value}>{maskEmail(session?.user.email)}</Text>
            <Text style={styles.meta}>ID: {shortId(session?.user.id)}</Text>
          </View>
        </PremiumCard>
      </FadeInView>

      <FadeInView delay={70}>
        <PremiumCard>
          <Text style={styles.sectionTitle}>Profil coureur</Text>
          {runnerAssessment ? (
            <View style={styles.runnerCard}>
              <Text style={styles.levelPill}>Niveau {formatRunnerLevel(runnerAssessment.result.level)}</Text>
              <Text style={styles.archetype}>{formatRunnerArchetype(runnerAssessment.result.archetype)}</Text>
              <Text style={styles.value}>{getRunnerArchetypeDescription(runnerAssessment.result.archetype)}</Text>
              <Text style={styles.meta}>
                {getRunnerArchetypeMotivation(runnerAssessment.result.archetype, runnerAssessment.result.level)}
              </Text>
              {shouldPromptRunnerAssessment ? (
                <Text style={styles.warning}>Un nouveau test est disponible (recommandé après 30 jours).</Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.value}>Questionnaire non complété.</Text>
          )}

          <PrimaryButton label="Faire / refaire le test" onPress={() => navigation.navigate('RunnerAssessment')} variant="ghost" />
        </PremiumCard>
      </FadeInView>
      <FadeInView delay={130}>
        <PremiumCard>
          <PrimaryButton label="Se déconnecter" onPress={onSignOut} variant="danger" />
        </PremiumCard>
      </FadeInView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  identityCard: {
    borderWidth: 1,
    borderColor: 'rgba(135,197,205,0.24)',
    borderRadius: 14,
    padding: 12,
    gap: 6,
    backgroundColor: 'rgba(12,20,30,0.7)'
  },
  runnerCard: {
    borderWidth: 1,
    borderColor: 'rgba(135,197,205,0.24)',
    borderRadius: 14,
    padding: 12,
    gap: 8,
    backgroundColor: 'rgba(12,20,30,0.7)'
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
  archetype: { color: '#f4fbff', fontSize: 30, fontWeight: '900', lineHeight: 34 },
  value: { color: '#ecf8ff', fontSize: 14, lineHeight: 21 },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  warning: { color: '#ffd39a', fontSize: 13, lineHeight: 20 }
});
