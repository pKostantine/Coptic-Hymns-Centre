import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/chc/ui/AppHeader';
import BottomTabBar from '@/components/chc/ui/BottomTabBar';
import Icon from '@/components/chc/ui/Icon';
import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useReadingPreferences } from '@/context/ReadingPreferencesContext';
import { pickAndUploadProfileAvatar, removeProfileAvatar } from '@/services/profileAvatarService';
import type { AppLanguage } from '@/utils/preferencesStorage';

const APP_LANGUAGE_OPTIONS: { key: AppLanguage; label: string; arabic: string }[] = [
  { key: 'en', label: 'English', arabic: 'الإنجليزية' },
  { key: 'ar', label: 'Arabic', arabic: 'العربية' },
];

export default function AccountScreen() {
  const { preferences } = useReadingPreferences();
  const { user, loading, recoveryMode } = useAuth();
  const isArabic = preferences.appLanguage === 'ar';

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Head><title>Account - Coptic Hymns Centre</title></Head>
      <AppHeader
        title={{ english: 'Account', arabic: 'الحساب' }}
        visibleLanguages={{ english: !isArabic, arabic: isArabic }}
      />
      <NowPlayingAwareScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          {loading ? <ActivityIndicator color={COLORS.gold} style={styles.loader} /> : null}
          {!loading && user ? <SignedInAccount key={user.id} recoveryMode={recoveryMode} /> : null}
          {!loading && !user ? <SignedOutAccount /> : null}
          <AppSettingsSection />
        </View>
      </NowPlayingAwareScrollView>
      <BottomTabBar active="account" />
    </SafeAreaView>
  );
}

function SignedOutAccount() {
  const auth = useAuth();
  const { preferences } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  const validateEmail = () => {
    const normalized = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new Error('Enter a valid email address.');
    return normalized;
  };

  const submit = async () => {
    if (busy) return;
    setError(null);
    setNotice(null);
    try {
      const normalizedEmail = validateEmail();
      if (password.length < 8) throw new Error('Your password must be at least 8 characters.');
      if (mode === 'signUp') {
        if (!displayName.trim()) throw new Error('Enter your name.');
        if (password !== confirmPassword) throw new Error('The passwords do not match.');
      }
      setBusy(true);
      if (mode === 'signIn') {
        await auth.signInWithEmail(normalizedEmail, password);
      } else {
        const result = await auth.signUpWithEmail(normalizedEmail, password, displayName);
        if (result.confirmationRequired) {
          setConfirmationEmail(normalizedEmail);
          setNotice('Check your email and open the confirmation link to finish creating your account.');
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to continue.');
    } finally {
      setBusy(false);
    }
  };

  const googleSignIn = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await auth.signInWithGoogle();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in with Google.');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setError(null);
    setNotice(null);
    try {
      const normalizedEmail = validateEmail();
      setBusy(true);
      await auth.sendPasswordReset(normalizedEmail);
      setNotice('Password reset instructions are on their way. Check your email.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send a reset email.');
    } finally {
      setBusy(false);
    }
  };

  const resendConfirmation = async () => {
    if (!confirmationEmail) return;
    setBusy(true);
    setError(null);
    try {
      await auth.resendSignupConfirmation(confirmationEmail);
      setNotice('A new confirmation email has been sent.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to resend the confirmation email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'حساب CHC الخاص بك' : 'Your CHC account'}</Text>
      <Text style={[styles.sectionBody, isArabic && styles.arabic]}>
        {isArabic
          ? 'احفظ الإعجابات والمتابعات وقوائم التشغيل وتقدّم التعلّم على أجهزتك.'
          : 'Keep your likes, follows, playlists, and learning progress with you across devices.'}
      </Text>

      <View accessibilityRole="tablist" style={styles.segmentedControl}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === 'signIn' }}
          style={[styles.segment, mode === 'signIn' && styles.segmentActive]}
          onPress={() => { setMode('signIn'); setError(null); setNotice(null); }}
        >
          <Text style={[styles.segmentText, mode === 'signIn' && styles.segmentTextActive]}>Sign in</Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === 'signUp' }}
          style={[styles.segment, mode === 'signUp' && styles.segmentActive]}
          onPress={() => { setMode('signUp'); setError(null); setNotice(null); }}
        >
          <Text style={[styles.segmentText, mode === 'signUp' && styles.segmentTextActive]}>Create account</Text>
        </Pressable>
      </View>

      <Pressable disabled={busy} style={styles.googleButton} onPress={() => void googleSignIn()}>
        <Text style={styles.googleMark}>G</Text>
        <Text style={styles.googleButtonText}>Continue with Google</Text>
      </Pressable>

      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>or use email</Text>
        <View style={styles.divider} />
      </View>

      {mode === 'signUp' ? (
        <Field label="Name">
          <TextInput autoCapitalize="words" autoComplete="name" value={displayName} onChangeText={setDisplayName} placeholder="Your name" placeholderTextColor={COLORS.muted} style={styles.input} />
        </Field>
      ) : null}

      <Field label="Email">
        <TextInput autoCapitalize="none" autoComplete="email" inputMode="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={COLORS.muted} style={styles.input} />
      </Field>

      <Field label="Password">
        <View style={styles.passwordField}>
          <TextInput autoCapitalize="none" autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} secureTextEntry={!showPassword} value={password} onChangeText={setPassword} placeholder="At least 8 characters" placeholderTextColor={COLORS.muted} style={styles.passwordInput} />
          <Pressable accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword((current) => !current)} style={styles.showButton}>
            <Icon name="eye-outline" size={20} color={showPassword ? COLORS.gold : COLORS.muted} />
          </Pressable>
        </View>
      </Field>

      {mode === 'signUp' ? (
        <Field label="Confirm password">
          <TextInput autoCapitalize="none" autoComplete="new-password" secureTextEntry={!showPassword} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Enter it again" placeholderTextColor={COLORS.muted} style={styles.input} />
        </Field>
      ) : null}

      {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
      {notice ? <Text accessibilityRole="alert" style={styles.noticeText}>{notice}</Text> : null}

      <Pressable disabled={busy} style={[styles.primaryButton, busy && styles.disabled]} onPress={() => void submit()}>
        {busy ? <ActivityIndicator color={COLORS.black} /> : <Text style={styles.primaryButtonText}>{mode === 'signIn' ? 'Sign in' : 'Create account'}</Text>}
      </Pressable>

      {mode === 'signIn' ? (
        <Pressable disabled={busy} style={styles.textButton} onPress={() => void resetPassword()}>
          <Text style={styles.textButtonText}>Forgot your password?</Text>
        </Pressable>
      ) : null}
      {confirmationEmail ? (
        <Pressable disabled={busy} style={styles.textButton} onPress={() => void resendConfirmation()}>
          <Text style={styles.textButtonText}>Resend confirmation email</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SignedInAccount({ recoveryMode }: { recoveryMode: boolean }) {
  const auth = useAuth();
  const { preferences } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const user = auth.user!;
  const currentName = typeof user.user_metadata.full_name === 'string' ? user.user_metadata.full_name : '';
  const avatarUrl = typeof user.user_metadata.avatar_url === 'string' ? user.user_metadata.avatar_url : null;
  const [displayName, setDisplayName] = useState(currentName);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordEditor, setShowPasswordEditor] = useState(recoveryMode);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const provider = user.app_metadata.provider === 'google' ? 'Google' : 'Email';
  const initials = (currentName || user.email || 'CHC')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const saveProfile = async () => {
    const trimmed = displayName.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await auth.updateDisplayName(trimmed);
      setNotice('Your profile has been updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update your profile.');
    } finally {
      setBusy(false);
    }
  };

  const changePhoto = async () => {
    if (avatarBusy) return;
    setAvatarBusy(true);
    setError(null);
    setNotice(null);
    try {
      const nextUrl = await pickAndUploadProfileAvatar(user.id);
      if (!nextUrl) return;
      await auth.updateAvatarUrl(nextUrl);
      setNotice('Your profile photo has been updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update your profile photo.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const clearPhoto = async () => {
    if (avatarBusy) return;
    setAvatarBusy(true);
    setError(null);
    setNotice(null);
    try {
      await auth.updateAvatarUrl(null);
      await removeProfileAvatar(user.id);
      setNotice('Your profile photo has been removed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove your profile photo.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const savePassword = async () => {
    setError(null);
    setNotice(null);
    if (newPassword.length < 8) {
      setError('Your new password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await auth.updatePassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordEditor(false);
      setNotice('Your password has been updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update your password.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.signOut();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out.');
      setBusy(false);
    }
  };

  return (
    <>
      <View style={[styles.section, styles.profileHero]}>
        <View style={styles.profileHeader}>
          <View style={styles.profileAvatar}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.profileAvatarImage} contentFit="cover" transition={150} />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
          </View>

          <View style={styles.profileIdentity}>
            <Text numberOfLines={1} style={styles.identityName}>{currentName || 'CHC listener'}</Text>
            <Text numberOfLines={1} style={styles.identityEmail}>{user.email}</Text>
            <Text style={styles.identityMeta}>{provider} account{user.email_confirmed_at ? ' · Verified' : ''}</Text>
          </View>
        </View>

        <View style={styles.profilePhotoActions}>
          <Pressable
            disabled={avatarBusy}
            style={[styles.photoButton, avatarBusy && styles.disabled]}
            onPress={() => void changePhoto()}
          >
            {avatarBusy ? <ActivityIndicator size="small" color={COLORS.goldBright} /> : <Icon name="person-circle-outline" size={18} color={COLORS.goldBright} />}
            <Text style={styles.photoButtonText}>{avatarUrl ? 'Change photo' : 'Add photo'}</Text>
          </Pressable>
          {avatarUrl ? (
            <Pressable disabled={avatarBusy} style={styles.removePhotoButton} onPress={() => void clearPhoto()}>
              <Text style={styles.removePhotoText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {recoveryMode ? (
        <View style={[styles.section, styles.recoverySection]}>
          <Text style={styles.sectionTitle}>Choose a new password</Text>
          <Text style={styles.sectionBody}>Finish recovering your account by setting a new password.</Text>
          <PasswordEditor password={newPassword} confirmation={confirmPassword} onPasswordChange={setNewPassword} onConfirmationChange={setConfirmPassword} busy={busy} onSave={() => void savePassword()} />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'الملف الشخصي' : 'Profile'}</Text>
        <Text style={[styles.sectionBody, isArabic && styles.arabic]}>
          {isArabic ? 'عدّل الاسم الذي يظهر في حساب CHC الخاص بك.' : 'Choose the name that appears on your CHC account.'}
        </Text>
        <Field label="Display name">
          <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} placeholder="Your name" placeholderTextColor={COLORS.muted} />
        </Field>
        <Pressable disabled={busy || !displayName.trim()} style={[styles.secondaryButton, (busy || !displayName.trim()) && styles.disabled]} onPress={() => void saveProfile()}>
          <Text style={styles.secondaryButtonText}>Save profile</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isArabic && styles.arabic]}>{isArabic ? 'الأمان' : 'Security'}</Text>
        <Text style={styles.accountDetailLabel}>Email</Text>
        <Text selectable style={styles.accountDetailValue}>{user.email}</Text>

        {!recoveryMode ? (
          <Pressable style={styles.disclosureRow} onPress={() => setShowPasswordEditor((current) => !current)}>
            <View>
              <Text style={styles.disclosureText}>Change password</Text>
              <Text style={styles.disclosureDescription}>Set a new password for email sign-in.</Text>
            </View>
            <Icon name={showPasswordEditor ? 'chevron-down' : 'chevron-forward'} size={18} color={COLORS.goldBright} />
          </Pressable>
        ) : null}
        {showPasswordEditor && !recoveryMode ? (
          <PasswordEditor password={newPassword} confirmation={confirmPassword} onPasswordChange={setNewPassword} onConfirmationChange={setConfirmPassword} busy={busy} onSave={() => void savePassword()} />
        ) : null}

        {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
        {notice ? <Text accessibilityRole="alert" style={styles.noticeText}>{notice}</Text> : null}
      </View>

      <View style={[styles.section, styles.signOutSection]}>
        <Pressable disabled={busy} style={styles.signOutButton} onPress={() => void signOut()}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </>
  );
}

function PasswordEditor({ password, confirmation, onPasswordChange, onConfirmationChange, busy, onSave }: {
  password: string;
  confirmation: string;
  onPasswordChange: (value: string) => void;
  onConfirmationChange: (value: string) => void;
  busy: boolean;
  onSave: () => void;
}) {
  return (
    <View style={styles.passwordEditor}>
      <Field label="New password">
        <TextInput secureTextEntry autoComplete="new-password" value={password} onChangeText={onPasswordChange} placeholder="At least 8 characters" placeholderTextColor={COLORS.muted} style={styles.input} />
      </Field>
      <Field label="Confirm new password">
        <TextInput secureTextEntry autoComplete="new-password" value={confirmation} onChangeText={onConfirmationChange} placeholder="Enter it again" placeholderTextColor={COLORS.muted} style={styles.input} />
      </Field>
      <Pressable disabled={busy} style={[styles.primaryButton, busy && styles.disabled]} onPress={onSave}>
        <Text style={styles.primaryButtonText}>Update password</Text>
      </Pressable>
    </View>
  );
}

function AppSettingsSection() {
  const router = useRouter();
  const { user } = useAuth();
  const { preferences, setAppLanguage, contentSyncStatus } = useReadingPreferences();
  const isArabic = preferences.appLanguage === 'ar';
  const syncLabel = !user
    ? (isArabic ? 'على هذا الجهاز' : 'On this device')
    : contentSyncStatus === 'syncing'
      ? (isArabic ? 'جارٍ المزامنة' : 'Syncing')
      : contentSyncStatus === 'error'
        ? (isArabic ? 'غير متصل' : 'Offline')
        : (isArabic ? 'تمت المزامنة' : 'Synced');

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeadingRow}>
        <Icon name="settings-outline" size={22} color={COLORS.goldBright} />
        <Text style={[styles.sectionTitle, styles.sectionHeadingTitle, isArabic && styles.arabic]}>{isArabic ? 'إعدادات التطبيق' : 'App settings'}</Text>
        <Text style={[styles.syncStatus, user && contentSyncStatus === 'error' && styles.syncStatusError]}>{syncLabel}</Text>
      </View>
      <Text style={styles.fieldLabel}>App language</Text>
      <View style={styles.languageOptions}>
        {APP_LANGUAGE_OPTIONS.map((option) => {
          const active = preferences.appLanguage === option.key;
          return (
            <Pressable key={option.key} accessibilityRole="radio" accessibilityState={{ checked: active }} style={[styles.languageButton, active && styles.languageButtonActive]} onPress={() => setAppLanguage(option.key)}>
              <View style={[styles.radioOuter, active && styles.radioOuterActive]}>{active ? <View style={styles.radioInner} /> : null}</View>
              <View style={styles.languageTextGroup}>
                <Text style={styles.languageLabel}>{option.label}</Text>
                <Text style={styles.languageArabic}>{option.arabic}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <SettingsLink label="Book settings" description="Reading languages, text, slideshow, and display" onPress={() => router.push('/book-settings')} />
      {Platform.OS !== 'web' ? (
        <SettingsLink label="Downloads and storage" description="Manage music and learning saved offline" onPress={() => router.push('/downloads')} />
      ) : null}
    </View>
  );
}

function SettingsLink({ label, description, onPress }: { label: string; description: string; onPress: () => void }) {
  return (
    <Pressable style={styles.settingsLink} onPress={onPress}>
      <View style={styles.settingsLinkText}>
        <Text style={styles.settingsLinkLabel}>{label}</Text>
        <Text style={styles.settingsLinkDescription}>{description}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={COLORS.goldBright} />
    </Pressable>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  profileHero: { borderColor: COLORS.goldLine, backgroundColor: COLORS.navy },
  profileHeader: { alignItems: 'center', flexDirection: 'row', gap: SPACING.md },
  profileAvatar: { alignItems: 'center', backgroundColor: COLORS.goldSoft, borderColor: COLORS.goldLine, borderRadius: 44, borderWidth: 1, height: 88, justifyContent: 'center', overflow: 'hidden', width: 88 },
  profileAvatarImage: { height: 88, width: 88 },
  profileIdentity: { flex: 1, minWidth: 0 },
  profilePhotoActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  photoButton: { alignItems: 'center', backgroundColor: COLORS.goldSoft, borderColor: COLORS.goldLine, borderRadius: RADII.pill, borderWidth: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 40, paddingHorizontal: SPACING.md },
  photoButtonText: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  removePhotoButton: { alignItems: 'center', borderColor: COLORS.border, borderRadius: RADII.pill, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: SPACING.md },
  removePhotoText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '700' },
  accountDetailLabel: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  accountDetailValue: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, marginTop: -8 },
  disclosureDescription: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, marginTop: 3 },
  signOutSection: { backgroundColor: 'transparent', borderWidth: 0, padding: 0 },

  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xl },
  container: { alignSelf: 'center', gap: SPACING.lg, maxWidth: 760, width: '100%' },
  loader: { marginVertical: SPACING.xl },
  section: { backgroundColor: COLORS.navyDark, borderColor: COLORS.border, borderRadius: RADII.lg, borderWidth: 1, gap: SPACING.md, padding: SPACING.lg },
  recoverySection: { borderColor: COLORS.goldLine, borderTopWidth: 1, paddingTop: SPACING.lg },
  sectionTitle: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 24, fontWeight: '700' },
  sectionBody: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 15, lineHeight: 22 },
  sectionHeadingRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm },
  sectionHeadingTitle: { flex: 1 },
  syncStatus: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 11, fontWeight: '800' },
  syncStatusError: { color: '#FF8A8A' },
  segmentedControl: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', padding: 3 },
  segment: { alignItems: 'center', borderRadius: 6, flex: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: SPACING.sm },
  segmentActive: { backgroundColor: COLORS.gold },
  segmentText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },
  segmentTextActive: { color: COLORS.black },
  googleButton: { alignItems: 'center', borderColor: COLORS.muted, borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', minHeight: 50, paddingHorizontal: SPACING.md },
  googleMark: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 18, fontWeight: '900', marginRight: SPACING.sm },
  googleButtonText: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '800' },
  dividerRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.sm },
  divider: { backgroundColor: COLORS.border, flex: 1, height: 1 },
  dividerText: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12 },
  field: { gap: 6 },
  fieldLabel: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, fontWeight: '800' },
  input: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 15, minHeight: 48, paddingHorizontal: SPACING.md },
  passwordField: { alignItems: 'center', backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row' },
  passwordInput: { color: COLORS.white, flex: 1, fontFamily: TYPOGRAPHY.body, fontSize: 15, minHeight: 46, paddingHorizontal: SPACING.md },
  showButton: { alignItems: 'center', height: 46, justifyContent: 'center', width: 46 },
  primaryButton: { alignItems: 'center', backgroundColor: COLORS.gold, borderRadius: 8, justifyContent: 'center', minHeight: 48, paddingHorizontal: SPACING.md },
  primaryButtonText: { color: COLORS.black, fontFamily: TYPOGRAPHY.body, fontSize: 15, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', borderColor: COLORS.goldLine, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: SPACING.md },
  secondaryButtonText: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },
  textButton: { alignItems: 'center', justifyContent: 'center', minHeight: 36 },
  textButtonText: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  errorText: { color: '#FF8A8A', fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 19 },
  noticeText: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 13, lineHeight: 19 },
  identityRow: { alignItems: 'center', flexDirection: 'row', gap: SPACING.md },
  avatar: { alignItems: 'center', backgroundColor: COLORS.navy, borderColor: COLORS.goldLine, borderRadius: 32, borderWidth: 1, height: 64, justifyContent: 'center', width: 64 },
  avatarText: { color: COLORS.goldBright, fontFamily: TYPOGRAPHY.title, fontSize: 21, fontWeight: '800' },
  identityText: { flex: 1, minWidth: 0 },
  identityName: { color: COLORS.white, fontFamily: TYPOGRAPHY.title, fontSize: 22, fontWeight: '700' },
  identityEmail: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 13, marginTop: 2 },
  identityMeta: { color: COLORS.learningBright, fontFamily: TYPOGRAPHY.body, fontSize: 11, marginTop: 5 },
  shortcutRow: { flexDirection: 'row', gap: SPACING.sm },
  shortcut: { alignItems: 'center', borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, flex: 1, gap: SPACING.sm, justifyContent: 'center', minHeight: 82, padding: SPACING.sm },
  shortcutText: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  disclosureRow: { alignItems: 'center', borderTopColor: COLORS.border, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48 },
  disclosureText: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },
  passwordEditor: { gap: SPACING.md },
  signOutButton: { alignItems: 'center', borderColor: 'rgba(214,69,69,0.7)', borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 46 },
  signOutText: { color: '#FF8A8A', fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },
  languageOptions: { flexDirection: 'row', gap: SPACING.sm },
  languageButton: { alignItems: 'center', borderColor: COLORS.border, borderRadius: 8, borderWidth: 1, flex: 1, flexDirection: 'row', gap: SPACING.sm, minHeight: 58, paddingHorizontal: SPACING.sm },
  languageButtonActive: { backgroundColor: COLORS.goldSoft, borderColor: COLORS.gold },
  radioOuter: { alignItems: 'center', borderColor: COLORS.muted, borderRadius: 10, borderWidth: 2, height: 20, justifyContent: 'center', width: 20 },
  radioOuterActive: { borderColor: COLORS.gold },
  radioInner: { backgroundColor: COLORS.gold, borderRadius: 5, height: 10, width: 10 },
  languageTextGroup: { flex: 1 },
  languageLabel: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 13, fontWeight: '800' },
  languageArabic: { color: COLORS.muted, fontFamily: TYPOGRAPHY.arabic, fontSize: 12, marginTop: 2, writingDirection: 'rtl' },
  settingsLink: { alignItems: 'center', borderTopColor: COLORS.border, borderTopWidth: 1, flexDirection: 'row', gap: SPACING.md, minHeight: 64, paddingVertical: SPACING.sm },
  settingsLinkText: { flex: 1 },
  settingsLinkLabel: { color: COLORS.white, fontFamily: TYPOGRAPHY.body, fontSize: 14, fontWeight: '800' },
  settingsLinkDescription: { color: COLORS.muted, fontFamily: TYPOGRAPHY.body, fontSize: 12, lineHeight: 17, marginTop: 3 },
  arabic: { fontFamily: TYPOGRAPHY.arabic, textAlign: 'right', writingDirection: 'rtl' },
});
