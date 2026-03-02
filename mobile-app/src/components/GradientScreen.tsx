import { PropsWithChildren } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients } from '../ui/theme';

interface GradientScreenProps extends PropsWithChildren {
  scrollable?: boolean;
  contentStyle?: ViewStyle;
}

export function GradientScreen({ children, scrollable = true, contentStyle }: GradientScreenProps): JSX.Element {
  const content = scrollable ? (
    <ScrollView contentContainerStyle={[styles.scrollContent, contentStyle]}>{children}</ScrollView>
  ) : (
    children
  );

  return (
    <LinearGradient colors={[...gradients.app]} style={styles.root}>
      <SafeAreaView style={styles.root}>{content}</SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 34 }
});
