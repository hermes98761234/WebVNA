# Translating WebVNA

English is the source language and the default. Ukrainian is the only translation so far. Everything lives in `src/i18n.ts`.

## Add a language

1. Extend the `Lang` union and the `LANGS` list (code and the language's own name):

   ```ts
   export type Lang = "en" | "uk" | "de";
   export const LANGS: [Lang, string][] = [["en", "English"], ["uk", "Українська"], ["de", "Deutsch"]];
   ```

2. Add a dictionary like `UK`. The key is the **exact English source string**, the value is the translation:

   ```ts
   const DE: Record<string, string> = {
     "Connect": "Verbinden",
     "fw {0}.{1}": "FW {0}.{1}",
   };
   ```

3. Make `translate()` use it. Today it is `lang === "uk" ? (UK[s] ?? s) : s`, so replace that with a lookup over a `Record<Lang, Dict>` when adding the second translation, and export the dictionary for the test as `UK` is.
4. Run `npm test`. The i18n test (`src/i18n.test.ts`) checks the dictionaries.

## Rules

- **Placeholders** `{0}`, `{1}` must appear in the translation exactly as in the key (same set; order may change). The test fails otherwise.
- Keep units, symbols and numbers as they are (`MHz`, `dB`, `Ω`).
- A missing key falls back to English, so partial translations are fine; say so in the PR.
- Keys must match the English text character for character, including punctuation and `…`. If you change an English string in the code, change its key in every dictionary.
- Strings go through `t()` / `useT()` in components and `tr()` in non-React code (canvas). Trace format labels from `FORMAT_BY_ID[..].label` are translated at display time.
- `src/lib/` is deliberately untranslated (no i18n there). Known English-only strings: the TDR legend, the calibration summary and the L/C match topology text.
- Canvas drawing hooks must include `lang` in their dependencies.

## PR checklist

- [ ] `Lang`, `LANGS` and the dictionary added; language selector shows the new entry
- [ ] Placeholders match; `npm test` passes
- [ ] `npm run typecheck` and `npm run lint` pass
- [ ] Checked a few screens in the browser (long words can overflow narrow buttons, especially on mobile)
- [ ] Listed in the PR any strings left untranslated
