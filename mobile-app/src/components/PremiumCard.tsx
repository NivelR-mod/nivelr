import { PropsWithChildren } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients } from '../ui/theme';

interface PremiumCardProps extends PropsWithChildren {
  style?: ViewStyle;
}

export function PremiumCard({ children, style }: PremiumCardProps): JSX.Element {
  return (
    <LinearGradient colors={[...gradients.card]} style={[styles.gradient, style]}>
      <View style={styles.inner}>{children}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden'
  },
  inner: {
    padding: 14,
    gap: 10,
    backgroundColor: 'rgba(8, 15, 24, 0.4)'
  }
});
