// src/utils/userUtils.ts
// 统一用户身份解析与状态维护 (支持自定义工号、首席工程师标识与本地持久化)
import { useState, useEffect } from 'react';

export interface UserProfile {
  name: string;
  email: string;
  role: string;
  initials: string;
}

const DEFAULT_USER_EMAIL = 'WxxXIANXIN@gmail.com';
const DEFAULT_USER_NAME = 'WxxXIANXIN';
const DEFAULT_USER_ROLE = '敏华首席工程设计师';

export function resolveCurrentUser(): UserProfile {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('manwah_user') : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      const email = parsed.email || DEFAULT_USER_EMAIL;
      const name =
        parsed.user_metadata?.name ||
        parsed.name ||
        (email.includes('@') ? email.split('@')[0] : email) ||
        DEFAULT_USER_NAME;
      const role = parsed.role === 'admin' ? '敏华资深工程审签官' : DEFAULT_USER_ROLE;
      const initials = name.slice(0, 2).toUpperCase();
      return { name, email, role, initials };
    }
  } catch {}

  const customName = typeof localStorage !== 'undefined' ? localStorage.getItem('manwah_user_custom_name') : null;
  const name = customName || DEFAULT_USER_NAME;
  return {
    name,
    email: DEFAULT_USER_EMAIL,
    role: DEFAULT_USER_ROLE,
    initials: name.slice(0, 2).toUpperCase()
  };
}

export function useCurrentUser() {
  const [profile, setProfile] = useState<UserProfile>(resolveCurrentUser);

  useEffect(() => {
    const handleStorage = () => {
      setProfile(resolveCurrentUser());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const updateUserName = (newName: string) => {
    if (!newName.trim()) return;
    try {
      localStorage.setItem('manwah_user_custom_name', newName.trim());
      const raw = localStorage.getItem('manwah_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.name = newName.trim();
        parsed.user_metadata = { ...parsed.user_metadata, name: newName.trim() };
        localStorage.setItem('manwah_user', JSON.stringify(parsed));
      }
      setProfile(resolveCurrentUser());
    } catch {}
  };

  return { ...profile, updateUserName };
}
