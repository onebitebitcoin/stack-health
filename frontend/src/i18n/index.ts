import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import koCommon from './locales/ko/common.json'
import koAuth from './locales/ko/auth.json'
import koFeed from './locales/ko/feed.json'
import koUpload from './locales/ko/upload.json'
import koChallenge from './locales/ko/challenge.json'
import koProfile from './locales/ko/profile.json'
import koAdmin from './locales/ko/admin.json'
import koErrors from './locales/ko/errors.json'
import koNotification from './locales/ko/notification.json'
import koSurvey from './locales/ko/survey.json'

import enCommon from './locales/en/common.json'
import enAuth from './locales/en/auth.json'
import enFeed from './locales/en/feed.json'
import enUpload from './locales/en/upload.json'
import enChallenge from './locales/en/challenge.json'
import enProfile from './locales/en/profile.json'
import enAdmin from './locales/en/admin.json'
import enErrors from './locales/en/errors.json'
import enNotification from './locales/en/notification.json'
import enSurvey from './locales/en/survey.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ko: {
        common: koCommon,
        auth: koAuth,
        feed: koFeed,
        upload: koUpload,
        challenge: koChallenge,
        profile: koProfile,
        admin: koAdmin,
        errors: koErrors,
        notification: koNotification,
        survey: koSurvey,
      },
      en: {
        common: enCommon,
        auth: enAuth,
        feed: enFeed,
        upload: enUpload,
        challenge: enChallenge,
        profile: enProfile,
        admin: enAdmin,
        errors: enErrors,
        notification: enNotification,
        survey: enSurvey,
      },
    },
    fallbackLng: 'ko',
    supportedLngs: ['ko', 'en'],
    defaultNS: 'common',
    ns: ['common', 'auth', 'feed', 'upload', 'challenge', 'profile', 'admin', 'errors', 'notification', 'survey'],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'app-language',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
