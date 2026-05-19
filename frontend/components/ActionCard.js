import React, { useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, Animated, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { moderateScale, spacing } from '../utils/responsive';

const ActionCard = ({ title, icon, onPress, style }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale }] }, style]}>
      <TouchableOpacity
        style={styles.card}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.8}
      >
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name={icon} size={28} color="#2563EB" />
        </View>
        <Text style={styles.title}>{title}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'flex-start',
    justifyContent: 'center',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: moderateScale(104),
  },
  wrapper: {
    width: '48%',
    marginBottom: spacing.md,
  },
  iconContainer: {
    backgroundColor: '#EFF6FF',
    padding: spacing.sm,
    borderRadius: 8,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: moderateScale(14),
    fontWeight: '600',
    color: '#111827',
    lineHeight: moderateScale(19),
  },
});

export default ActionCard;
