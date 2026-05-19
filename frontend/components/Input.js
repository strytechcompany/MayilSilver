import React, { useState } from 'react';
import { StyleSheet, TextInput, View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { moderateScale, spacing } from '../utils/responsive';

const Input = ({ label, icon, style, ...props }) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputContainer, isFocused && styles.inputFocused]}>
        {icon && <MaterialCommunityIcons name={icon} size={20} color="#64748B" style={styles.icon} />}
        <TextInput
          style={styles.input}
          placeholderTextColor="#94A3B8"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: moderateScale(14),
    color: '#0F172A',
    marginBottom: 8,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    minHeight: moderateScale(50),
  },
  inputFocused: {
    borderColor: '#C0C0C0',
    backgroundColor: '#FFFFFF',
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: moderateScale(16),
    color: '#0F172A',
  },
});

export default Input;
