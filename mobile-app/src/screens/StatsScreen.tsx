import { StyleSheet, Text, View } from 'react-native';
import { FadeInView } from '../components/FadeInView';
import { GradientScreen } from '../components/GradientScreen';
import { PremiumCard } from '../components/PremiumCard';
import { useAppContext } from '../state/AppContext';
import { colors } from '../ui/theme';

export function StatsScreen(): JSX.Element {
  const { appState, xpTotal, level } = useAppContext();

  const totalMinutes = appState.sessions.reduce((sum, session) => sum + session.durationMin, 0);
  const totalDistance = appState.sessions.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0);
  const recent = appState.sessions.slice(0, 5);

  return (
    <GradientScreen>
      <FadeInView>
        <PremiumCard>
          <Text style={styles.title}>Statistiques</Text>
          <Text style={styles.subtitle}>Ton niveau réel, synchronisé avec le même compte web.</Text>
          <View style={styles.metrics}>
            <Metric label="XP total" value={String(xpTotal)} />
            <Metric label="Niveau" value={String(level)} />
            <Metric label="Minutes" value={String(totalMinutes)} />
          </View>
          <View style={styles.metrics}>
            <Metric label="Km cumulés" value={totalDistance.toFixed(1)} />
            <Metric label="Séances" value={String(appState.sessions.length)} />
          </View>
        </PremiumCard>
      </FadeInView>

      <FadeInView delay={80}>
        <PremiumCard>
          <Text style={styles.title}>Séances récentes</Text>
          {recent.length === 0 ? <Text style={styles.empty}>Aucune donnée pour le moment.</Text> : null}
          {recent.map((session) => (
            <View key={session.id} style={styles.recentRow}>
              <Text style={styles.recentText}>
                {session.subtype} · {new Date(session.createdAt).toLocaleDateString()}
              </Text>
              <Text style={styles.recentMeta}>
                {session.durationMin} min{session.distanceKm ? ` · ${session.distanceKm} km` : ''} · +{session.xp} XP
              </Text>
            </View>
          ))}
        </PremiumCard>
      </FadeInView>
    </GradientScreen>
  );
}

interface MetricProps {
  label: string;
  value: string;
}

function Metric({ label, value }: MetricProps): JSX.Element {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  metrics: { flexDirection: 'row', gap: 8 },
  metricCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.03)'
  },
  metricLabel: { color: colors.muted, fontSize: 12 },
  metricValue: { color: colors.accent2, fontSize: 24, fontWeight: '900' },
  empty: { color: colors.muted, fontSize: 14 },
  recentRow: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(130,199,210,0.2)',
    paddingVertical: 8,
    gap: 2
  },
  recentText: { color: '#eef9fd', fontWeight: '700' },
  recentMeta: { color: colors.muted, fontSize: 13 }
});
