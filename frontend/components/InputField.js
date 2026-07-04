import React, { useState } from 'react';
import { StyleSheet, TextInput, View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { moderateScale, spacing } from '../utils/responsive';

const InputField = ({ label, icon, style, error, ...props }) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[
        styles.inputContainer, 
        isFocused && styles.inputFocused,
        error && styles.inputError
      ]}>
        {icon && <MaterialCommunityIcons name={icon} size={20} color={isFocused ? '#2563EB' : '#9CA3AF'} style={styles.icon} />}
        <TextInput
          style={styles.input}
          placeholderTextColor="#9CA3AF"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: moderateScale(13),
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    minHeight: moderateScale(48),
  },
  inputFocused: {
    borderColor: '#2563EB',
    backgroundColor: '#FFFFFF',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: moderateScale(15),
    color: '#111827',
  },
  errorText: {
    color: '#EF4444',
    fontSize: moderateScale(12),
    marginTop: 4,
  },
});

export default InputField;
