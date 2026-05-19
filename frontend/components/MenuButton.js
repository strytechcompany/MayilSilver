import React, { useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { moderateScale, spacing } from '../utils/responsive';

const MenuButton = ({ title, icon, onPress }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.95,
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
    <Animated.View style={[styles.buttonWrapper, { transform: [{ scale }] }]}>
      <TouchableOpacity 
        style={styles.button} 
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
      >
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name={icon} size={28} color="#C0C0C0" />
        </View>
        <Text style={styles.buttonText}>{title}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  buttonWrapper: {
    width: '48%',
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  button: {
    backgroundColor: '#0F172A', // Primary Navy/Black
    borderColor: '#C0C0C0', // Silver border
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: moderateScale(112),
  },
  iconContainer: {
    backgroundColor: 'rgba(192, 192, 192, 0.1)', // Subtle silver background
    padding: spacing.sm,
    borderRadius: 12,
    marginBottom: spacing.sm,
  },
  buttonText: {
    color: '#C0C0C0', // Silver text
    fontSize: moderateScale(14),
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default MenuButton;
