import { KeychainAccess, SecureStorage } from "@aparajita/capacitor-secure-storage";

import { isNative } from "@/lib/platform";

const AUTH_STORAGE_PREFIX = "tok_auth_";

type AuthStorage = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
};

let secureStorageReady: Promise<void> | null = null;

async function ensureSecureStorageReady() {
  if (!secureStorageReady) {
    secureStorageReady = (async () => {
      await SecureStorage.setKeyPrefix(AUTH_STORAGE_PREFIX);
      await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly);
    })();
  }

  return secureStorageReady;
}

const webAuthStorage: AuthStorage = {
  getItem(key) {
    return localStorage.getItem(key);
  },
  setItem(key, value) {
    localStorage.setItem(key, value);
  },
  removeItem(key) {
    localStorage.removeItem(key);
  },
};

const nativeAuthStorage: AuthStorage = {
  async getItem(key) {
    await ensureSecureStorageReady();

    const secureValue = await SecureStorage.getItem(key);
    if (secureValue !== null) {
      return secureValue;
    }

    const legacyValue = localStorage.getItem(key);
    if (legacyValue === null) {
      return null;
    }

    await SecureStorage.setItem(key, legacyValue);
    localStorage.removeItem(key);
    return legacyValue;
  },

  async setItem(key, value) {
    await ensureSecureStorageReady();
    await SecureStorage.setItem(key, value);
    localStorage.removeItem(key);
  },

  async removeItem(key) {
    await ensureSecureStorageReady();
    await SecureStorage.removeItem(key);
    localStorage.removeItem(key);
  },
};

export const authStorage: AuthStorage = isNative()
  ? nativeAuthStorage
  : webAuthStorage;
