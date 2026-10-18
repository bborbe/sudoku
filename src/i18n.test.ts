import { describe, expect, it } from 'vitest'
import { browserLang, LANGS, nextLang, setLang, STRINGS, t } from './i18n'
import { TECHNIQUES } from './puzzle/logic'
import { BEYOND_LOGIC } from './puzzle/breakdown'

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('string tables', () => {
  it('every language has every key, each non-empty with the same placeholders as English', () => {
    const keys = Object.keys(STRINGS.en).sort()
    for (const lang of LANGS) {
      expect(Object.keys(STRINGS[lang]).sort()).toEqual(keys)
      for (const k of keys) {
        const s = STRINGS[lang][k as keyof typeof STRINGS.en]
        expect(s.trim(), `${lang}.${k}`).not.toBe('')
        expect(placeholders(s), `${lang}.${k}`).toEqual(placeholders(STRINGS.en[k as keyof typeof STRINGS.en]))
      }
    }
  })

  it('every solver technique, and the beyond-logic step, has a name in every language', () => {
    for (const name of [...TECHNIQUES.map(([n]) => n), BEYOND_LOGIC]) for (const lang of LANGS) expect(`tech_${name}` in STRINGS[lang], `${lang} ${name}`).toBe(true)
  })
})

describe('t', () => {
  it('fills placeholders in the current language', () => {
    setLang('de')
    expect(t('mistakes', { count: 2 })).toBe('Fehler: 2')
    setLang('en')
    expect(t('mistakes', { count: 2 })).toBe('Mistakes: 2')
  })
})

describe('browserLang', () => {
  it('picks German for any de* preference, else English', () => {
    expect(browserLang(['de-DE'])).toBe('de')
    expect(browserLang(['en-US', 'de-AT'])).toBe('de')
    expect(browserLang(['en-GB', 'fr'])).toBe('en')
    expect(browserLang([])).toBe('en')
  })

  it('nextLang cycles en ↔ de', () => {
    expect(nextLang('en')).toBe('de')
    expect(nextLang('de')).toBe('en')
  })
})
