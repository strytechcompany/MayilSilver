import React, { useContext, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { loginUser } from '../services/api';
import { contentWidth, horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const { width, height } = Dimensions.get('window');

// Offline admin fallback (used when backend is unreachable)
const ADMIN_EMAIL = 'mayilsilver@gmail.com';
const ADMIN_PASSWORD = '123456';

const LoginScreen = () => {
  const { login } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [focusedInput, setFocusedInput] = useState(null);
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const buttonScale = useRef(new Animated.Value(1)).current;

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      alert(message);
      return;
    }

    Alert.alert(title, message);
  };

  const animateButton = (toValue) => {
    Animated.spring(buttonScale, {
      toValue,
      friction: 5,
      tension: 120,
      useNativeDriver: true,
    }).start();
  };

  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      showAlert('Login Failed', 'Email and password are required');
      return;
    }

    const result = await loginUser(normalizedEmail, password);

    if (result.success) {
      await login({
        gstBillEnabled: result.gstBillEnabled !== false,
        role:           result.role         || 'user',
        userId:         result.userId        || '',
        email:          result.email         || normalizedEmail,
        userName:       result.userName      || '',
        allowedPages:   Array.isArray(result.allowedPages) ? result.allowedPages : [],
      });
      return;
    }

    // Offline fallback: allow admin login when server is unreachable
    if (result.message?.includes('connection failed') || result.message?.includes('Network')) {
      if (normalizedEmail === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        await login({
          gstBillEnabled: true,
          role: 'admin',
          userId: '',
          email: normalizedEmail,
          userName: 'Admin',
        });
        return;
      }
    }

    showAlert('Login Failed', result.message || 'Invalid credentials');
  };

  return (
    <LinearGradient colors={['#EFF6FF', '#DBEAFE', '#F9FAFB']} style={styles.background}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
        style={styles.keyboardView}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.shell}>
              <View style={styles.brandSection}>
                <Image
                  source={require('../assets/logo.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
                <Text style={styles.title}>Mayil Silver</Text>
                <Text style={styles.subtitle}>Business Login</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Sign in to dashboard</Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Email</Text>
                  <Pressable
                    style={[styles.inputWrap, focusedInput === 'email' && styles.inputWrapFocused]}
                    onPress={() => emailInputRef.current?.focus()}
                  >
                    <MaterialCommunityIcons name="email-outline" size={20} color="#6B7280" />
                    <TextInput
                      ref={emailInputRef}
                      style={styles.input}
                      placeholder="mayilsilver@gmail.com"
                      placeholderTextColor="#9CA3AF"
                      value={email}
                      onChangeText={setEmail}
                      onFocus={() => setFocusedInput('email')}
                      onBlur={() => setFocusedInput(null)}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      returnKeyType="next"
                      textContentType="emailAddress"
                      onSubmitEditing={() => passwordInputRef.current?.focus()}
                    />
                  </Pressable>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Password</Text>
                  <Pressable
                    style={[styles.inputWrap, focusedInput === 'password' && styles.inputWrapFocused]}
                    onPress={() => passwordInputRef.current?.focus()}
                  >
                    <MaterialCommunityIcons name="lock-outline" size={20} color="#6B7280" />
                    <TextInput
                      ref={passwordInputRef}
                      style={styles.input}
                      placeholder="Enter password"
                      placeholderTextColor="#9CA3AF"
                      value={password}
                      onChangeText={setPassword}
                      onFocus={() => setFocusedInput('password')}
                      onBlur={() => setFocusedInput(null)}
                      secureTextEntry
                      autoComplete="password"
                      returnKeyType="done"
                      textContentType="password"
                      onSubmitEditing={handleLogin}
                    />
                  </Pressable>
                </View>

                <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                  <Pressable
                    style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                    onPress={handleLogin}
                    onPressIn={() => animateButton(0.98)}
                    onPressOut={() => animateButton(1)}
                  >
                    <Text style={styles.buttonText}>Login</Text>
                    <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
                  </Pressable>
                </Animated.View>
              </View>

              <Text style={styles.footerText}>Secure access for Mayil Silver operations</Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  shell: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: horizontalPadding,
    paddingVertical: spacing.xl,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: 26,
  },
  logo: {
    width: Math.min(width * 0.7, 285),
    height: Math.min(height * 0.2, 185),
    marginBottom: spacing.lg,
    borderBottomLeftRadius: 50,
    borderBottomRightRadius: 50,
    borderTopLeftRadius: 50,
    borderTopRightRadius: 10, 
  },
  title: {
    fontSize: moderateScale(22),
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: moderateScale(15),
    fontWeight: '600',
    color: '#2563EB',
    marginTop: 6,
    textAlign: 'center',
  },
  card: {
    width: contentWidth,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 10,
  },
  cardTitle: {
    fontSize: moderateScale(18),
    fontWeight: '700',
    color: '#111827',
    marginBottom: 22,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: moderateScale(13),
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  inputWrap: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 14,
  },
  inputWrapFocused: {
    borderColor: '#2563EB',
    backgroundColor: '#FFFFFF',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  input: {
    flex: 1,
    fontSize: moderateScale(15),
    color: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 10,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  button: {
    minHeight: 52,
    width: '100%',
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
  buttonPressed: {
    backgroundColor: '#1D4ED8',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: moderateScale(16),
    fontWeight: '800',
  },
  footerText: {
    color: '#6B7280',
    fontSize: moderateScale(12),
    fontWeight: '500',
    marginTop: 22,
    textAlign: 'center',
  },
});

export default LoginScreen;
