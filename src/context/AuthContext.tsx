import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { disableNativeNotificationDevice } from '@/services/notificationService';
import { supabase } from '@/utils/supabase';

WebBrowser.maybeCompleteAuthSession();

interface SignUpResult {
  confirmationRequired: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  recoveryMode: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<SignUpResult>;
  signInWithGoogle: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendSignupConfirmation: (email: string) => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  updateAvatarUrl: (avatarUrl: string | null) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  clearRecoveryMode: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function accountRedirectUrl() {
  return Linking.createURL('account');
}

function authError(error: { message: string } | null, fallback: string) {
  if (!error) return;
  if (/provider is not enabled|unsupported provider/i.test(error.message)) {
    throw new Error('Google sign-in is not enabled for CHC yet. Please use email for now.');
  }
  throw new Error(error.message || fallback);
}

async function applyAuthCallback(url: string) {
  const parsed = new URL(url);
  const query = new URLSearchParams(parsed.search);
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const getParameter = (key: string) => query.get(key) ?? fragment.get(key);
  const callbackError = getParameter('error_description') ?? getParameter('error');

  if (callbackError) {
    throw new Error(decodeURIComponent(callbackError.replace(/\+/g, ' ')));
  }

  const code = getParameter('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authError(error, 'Unable to finish signing in.');
    return;
  }

  const accessToken = getParameter('access_token');
  const refreshToken = getParameter('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    authError(error, 'Unable to finish signing in.');
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
    });

    const initialize = async () => {
      if (Platform.OS !== 'web') {
        try {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl) await applyAuthCallback(initialUrl);
        } catch (error) {
          console.warn('Unable to process the initial CHC sign-in link:', error);
        }
      }
      const { data, error } = await supabase.auth.getSession();
      if (error) console.warn('Unable to restore CHC session:', error.message);
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    };
    void initialize();

    const linkSubscription = Platform.OS === 'web'
      ? null
      : Linking.addEventListener('url', ({ url }) => {
        void applyAuthCallback(url).catch((error) => {
          console.warn('Unable to process CHC sign-in link:', error);
        });
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      linkSubscription?.remove();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    authError(error, 'Unable to sign in.');
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: accountRedirectUrl(),
        data: { full_name: displayName.trim() },
      },
    });
    authError(error, 'Unable to create your account.');
    return { confirmationRequired: data.session == null };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const redirectTo = accountRedirectUrl();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: Platform.OS !== 'web',
      },
    });
    authError(error, 'Unable to start Google sign-in.');

    if (Platform.OS !== 'web') {
      if (!data.url) throw new Error('Google did not return a sign-in URL.');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success') {
        await applyAuthCallback(result.url);
      } else if (result.type !== 'dismiss' && result.type !== 'cancel') {
        throw new Error('Google sign-in did not complete.');
      }
    }
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: accountRedirectUrl(),
    });
    authError(error, 'Unable to send a password reset email.');
  }, []);

  const resendSignupConfirmation = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: accountRedirectUrl() },
    });
    authError(error, 'Unable to resend the confirmation email.');
  }, []);

  const updateDisplayName = useCallback(async (displayName: string) => {
    const { error } = await supabase.auth.updateUser({
      data: { full_name: displayName.trim() },
    });
    authError(error, 'Unable to update your profile.');
  }, []);

  const updateAvatarUrl = useCallback(async (avatarUrl: string | null) => {
    const { error } = await supabase.auth.updateUser({
      data: { chc_avatar_url: avatarUrl },
    });
    authError(error, 'Unable to update your profile photo.');
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    authError(error, 'Unable to update your password.');
    setRecoveryMode(false);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await disableNativeNotificationDevice();
    } catch (error) {
      console.warn('Unable to detach this device from CHC notifications before sign-out:', error);
    }
    const { error } = await supabase.auth.signOut();
    authError(error, 'Unable to sign out.');
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    recoveryMode,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    sendPasswordReset,
    resendSignupConfirmation,
    updateDisplayName,
    updateAvatarUrl,
    updatePassword,
    clearRecoveryMode: () => setRecoveryMode(false),
    signOut,
  }), [
    loading,
    recoveryMode,
    resendSignupConfirmation,
    sendPasswordReset,
    session,
    signInWithEmail,
    signInWithGoogle,
    signOut,
    signUpWithEmail,
    updateDisplayName,
    updateAvatarUrl,
    updatePassword,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
