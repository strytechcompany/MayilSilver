import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { moderateScale, screenWidth, spacing } from '../utils/responsive';

const DashboardCard = ({ title, value, icon, subtitle, color = '#2563EB', style, rightIcon, onRightIconPress }) => {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
            <MaterialCommunityIcons name={icon} size={20} color={color} />
          </View>
          <Text style={styles.title}>{title}</Text>
        </View>
        {rightIcon && (
          <TouchableOpacity onPress={onRightIconPress} style={styles.rightIconBtn}>
            <MaterialCommunityIcons name={rightIcon} size={18} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.content}>
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: spacing.md,
    width: Math.min(screenWidth * 0.42, 170),
    marginRight: spacing.sm,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightIconBtn: {
    padding: 4,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  title: {
    fontSize: moderateScale(13),
    fontWeight: '500',
    color: '#6B7280',
  },
  content: {
    marginTop: 4,
  },
  value: {
    fontSize: moderateScale(20),
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: moderateScale(12),
    color: '#6B7280',
    marginTop: 4,
  },
});

export default DashboardCard;
