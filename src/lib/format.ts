import { pokemonById } from '../data/dataset';
import type { CalcResult } from '../types';
import { getActiveLanguage, localeFor, pokemonName, type Language } from './i18n';

export function formatNumber(value: number, digits = 0, language: Language = getActiveLanguage()) {
  return new Intl.NumberFormat(localeFor(language), {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value);
}

export function formatPercent(value: number, digits = 1, language: Language = getActiveLanguage()) {
  return `${formatNumber(value * 100, digits, language)}%`;
}

export function formatSeconds(seconds: number, language: Language = getActiveLanguage()) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const minuteRest = minutes % 60;
    if (language === 'en') {
      return `${hours}h ${minuteRest}m ${rest}s`;
    }
    return `${hours}時間${minuteRest}分${rest}秒`;
  }
  if (language === 'en') {
    return `${minutes}m ${rest}s`;
  }
  return `${minutes}分${rest}秒`;
}

export function csvEscape(value: string | number) {
  const text = String(value);
  if (!/[\",\n]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function resultsToCsv(results: CalcResult[], language: Language = getActiveLanguage()) {
  const header =
    language === 'en'
      ? [
          'Date',
          'Pokemon',
          'Lv',
          'Total Strength',
          'Berries',
          'Ingredients',
          'Skill',
          'Helps per Day',
          'Sleep Overflow Helps',
          'Calculated Help Time',
          'Ingredient Rate',
          'Skill Rate',
          'Expected Sleep Skill Triggers',
          'Sleep Skill Stock Limit'
        ]
      : [
          '日時',
          'ポケモン',
          'Lv',
          '総エナジー',
          'きのみ',
          '食材',
          'スキル',
          'おてつだい回数',
          '睡眠中あふれ回数',
          '計算上おてつだい時間',
          '食材確率',
          'スキル確率',
          '睡眠中スキル期待',
          '睡眠中スキル上限'
        ];
  const rows = results.map((result) => {
    const species = pokemonById.get(result.speciesId);
    return [
      result.createdAt,
      species ? pokemonName(species, language) : result.speciesName,
      result.level,
      Math.round(result.totalEnergy),
      Math.round(result.berryEnergy),
      Math.round(result.ingredientEnergy),
      Math.round(result.skillEnergy),
      result.helpsPerDay.toFixed(2),
      (result.sleepOverflowHelps ?? 0).toFixed(2),
      Math.round(result.displayedFrequency),
      (result.ingredientProbability * 100).toFixed(2),
      (result.skillProbability * 100).toFixed(2),
      (result.sleepSkillTriggers ?? 0).toFixed(3),
      result.sleepSkillStockLimit ?? 1
    ];
  });
  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}
