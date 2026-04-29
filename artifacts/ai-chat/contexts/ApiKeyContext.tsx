import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const STORAGE_KEY = "@ai-chat/openrouter-api-key";

type ApiKeyContextValue = {
  apiKey: string | null;
  isLoaded: boolean;
  saveApiKey: (key: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
};

const ApiKeyContext = createContext<ApiKeyContextValue | undefined>(undefined);

export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        setApiKey(stored);
      } catch {
        setApiKey(null);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const saveApiKey = useCallback(async (key: string) => {
    const trimmed = key.trim();
    await AsyncStorage.setItem(STORAGE_KEY, trimmed);
    setApiKey(trimmed);
  }, []);

  const clearApiKey = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setApiKey(null);
  }, []);

  return (
    <ApiKeyContext.Provider value={{ apiKey, isLoaded, saveApiKey, clearApiKey }}>
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useApiKey() {
  const ctx = useContext(ApiKeyContext);
  if (!ctx) throw new Error("useApiKey must be used within ApiKeyProvider");
  return ctx;
}
