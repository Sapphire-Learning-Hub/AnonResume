"use client";

import {
  createContext,
  startTransition,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useRouter } from "next/navigation";

import {
  defaultLocale,
  formatMessage,
  getMessages,
  localeCookieName,
  resolveLocale,
  type AppLocale,
  type AppMessages,
  type MessageKey,
} from "./messages";

interface I18nContextValue {
  locale: AppLocale;
  messages: AppMessages;
  setLocale: (locale: AppLocale) => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
}

const defaultMessages = getMessages(defaultLocale);

const I18nContext = createContext<I18nContextValue>({
  locale: defaultLocale,
  messages: defaultMessages,
  setLocale: () => {},
  t: (key, values) => formatMessage(defaultMessages, key, values),
});

export function I18nProvider({
  initialLocale,
  initialMessages,
  children,
}: PropsWithChildren<{
  initialLocale: AppLocale;
  initialMessages: AppMessages;
}>) {
  const router = useRouter();
  const [optimisticSnapshot, setOptimisticSnapshot] = useState(() => ({
    sourceLocale: initialLocale,
    sourceMessages: initialMessages,
    locale: initialLocale,
    messages: initialMessages,
  }));
  const activeSnapshot =
    optimisticSnapshot.sourceLocale === initialLocale &&
    optimisticSnapshot.sourceMessages === initialMessages
      ? optimisticSnapshot
      : {
          sourceLocale: initialLocale,
          sourceMessages: initialMessages,
          locale: initialLocale,
          messages: initialMessages,
        };
  const { locale, messages } = activeSnapshot;

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      messages,
      setLocale: (nextLocale) => {
        const resolvedLocale = resolveLocale(nextLocale);

        setOptimisticSnapshot({
          sourceLocale: initialLocale,
          sourceMessages: initialMessages,
          locale: resolvedLocale,
          messages: getMessages(resolvedLocale),
        });
        document.cookie = `${localeCookieName}=${resolvedLocale}; path=/; max-age=31536000; samesite=lax`;
        startTransition(() => {
          router.refresh();
        });
      },
      t: (key, values) => formatMessage(messages, key, values),
    }),
    [initialLocale, initialMessages, locale, messages, router],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
