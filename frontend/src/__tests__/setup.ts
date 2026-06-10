import '@testing-library/jest-dom'
import i18n from '../i18n'

// Force Korean locale in tests so text-based queries match Korean strings
i18n.changeLanguage('ko')
