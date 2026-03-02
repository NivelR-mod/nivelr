import { PropsWithChildren, useEffect, useRef } from 'react';
import { Animated, ViewStyle } from 'react-native';

interface FadeInViewProps extends PropsWithChildren {
  delay?: number;
  style?: ViewStyle;
}

export function FadeInView({ children, delay = 0, style }: FadeInViewProps): JSX.Element {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 280, delay, useNativeDriver: true })
    ]).start();
  }, [delay, opacity, translateY]);

  return <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}
