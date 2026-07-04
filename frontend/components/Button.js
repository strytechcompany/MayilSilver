import React, { useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const Button = ({ title, icon, onPress, style, textStyle, variant = 'primary' }) => {
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

  const isPrimary = variant === 'primary';

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        style={[styles.button, isPrimary ? styles.primary : styles.secondary]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.8}
      >
        {icon && <MaterialCommunityIcons name={icon} size={20} color={isPrimary ? '#C0C0C0' : '#0F172A'} style={styles.icon} />}
        <Text style={[styles.text, isPrimary ? styles.primaryText : styles.secondaryText, textStyle]}>
          {title}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  primary: {
    backgroundColor: '#0F172A',
    borderColor: '#C0C0C0',
  },
  secondary: {
    backgroundColor: '#FFFFFF',
    borderColor: '#C0C0C0',
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryText: {
    color: '#C0C0C0',
  },
  secondaryText: {
    color: '#0F172A',
  },
  icon: {
    marginRight: 8,
  },
});

export default Button;
