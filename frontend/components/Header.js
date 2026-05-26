import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const Header = ({ title, subtitle, subtitleNode, rightIcon, onRightPress, showBack, onBackPress }) => {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.leftSection}>
          {showBack && (
            <TouchableOpacity onPress={onBackPress} style={styles.backButton}>
              <MaterialCommunityIcons name="arrow-left" size={24} color="#111827" />
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.title}>{title}</Text>
            {subtitleNode ? subtitleNode : subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
        
        {rightIcon && (
          <TouchableOpacity style={styles.rightButton} onPress={onRightPress}>
            <MaterialCommunityIcons name={rightIcon} size={22} color="#4B5563" />
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: horizontalPadding,
  },
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  title: {
    fontSize: moderateScale(20),
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: moderateScale(13),
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  rightButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Header;
