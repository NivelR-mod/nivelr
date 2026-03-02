import { StyleSheet, Text, View } from 'react-native';
import { FadeInView } from '../components/FadeInView';
import { GradientScreen } from '../components/GradientScreen';
import { PremiumCard } from '../components/PremiumCard';
import { useAppContext } from '../state/AppContext';
import { colors } from '../ui/theme';

export function HomeScreen(): JSX.Element {
  const { session, appState, level, xpTotal, syncing } = useAppContext();

  return (
    <GradientScreen>
      <FadeInView>
        <View style={styles.header}>
          <Text style={styles.title}>NIVELR Mobile</Text>
          <Text style={styles.sub}>{session?.user.email}</Text>
        </View>
      </FadeInView>

      <FadeInView delay={60}>
        <PremiumCard>
          <Text style={styles.cardTitle}>Progression</Text>
          <Text style={styles.level}>Niveau {level}</Text>
          <Text style={styles.xp}>{xpTotal} XP cumulés</Text>
          <Text style={styles.meta}>{appState.sessions.length} séances enregistrées</Text>
        </PremiumCard>
      </FadeInView>

      <FadeInView delay={120}>
        <PremiumCard>
          <Text style={styles.cardTitle}>Etat cloud</Text>
          <Text style={styles.meta}>{syncing ? 'Synchronisation en cours...' : 'Données synchronisées avec Supabase'}</Text>
          <Text style={styles.meta}>Même compte et même progression que le web.</Text>
        </PremiumCard>
      </FadeInView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4 },
  title: { color: colors.text, fontWeight: '900', fontSize: 28 },
  sub: { color: colors.muted, fontSize: 13 },
  cardTitle: { color: colors.text, fontWeight: '800', fontSize: 18 },
  level: { color: colors.accent2, fontWeight: '900', fontSize: 34 },
  xp: { color: '#d8f1f7', fontWeight: '700', fontSize: 16 },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 20 }
});
