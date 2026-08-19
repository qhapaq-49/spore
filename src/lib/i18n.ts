import type { Berry, Ingredient, MainSkill, Nature, PokemonSpecies, Specialty, Subskill } from '../types';

export type Language = 'ja' | 'en';

export const LANGUAGE_STORAGE_KEY = 'pokemon-sleep-checker-language-v1';

export const SUPPORTED_LANGUAGES: Language[] = ['ja', 'en'];

let activeLanguage: Language = 'ja';

export function setActiveLanguage(language: Language) {
  activeLanguage = language;
}

export function getActiveLanguage() {
  return activeLanguage;
}

export function isLanguage(value: unknown): value is Language {
  return value === 'ja' || value === 'en';
}

export function localeFor(language: Language) {
  return language === 'en' ? 'en-US' : 'ja-JP';
}

export function languageFromSearch(search: string): Language | null {
  const value = new URLSearchParams(search).get('lang');
  return isLanguage(value) ? value : null;
}

export function loadInitialLanguage(): Language {
  const queryLanguage = languageFromSearch(window.location.search);
  if (queryLanguage) {
    return queryLanguage;
  }

  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(stored)) {
      return stored;
    }
  } catch {
    // Ignore localStorage access failures.
  }

  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'ja';
}

export function persistLanguage(language: Language) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Ignore localStorage access failures.
  }
}

export function updateUrlLanguage(language: Language) {
  const url = new URL(window.location.href);
  url.searchParams.set('lang', language);
  window.history.replaceState({}, '', url);
}

const TRANSLATIONS = {
  appTitle: { ja: 'ポケスリ計算機', en: 'Pokemon Sleep Calculator' },
  appDescription: {
    ja: 'ポケモンスリープの個体評価と育成計画を扱うポケスリ計算機',
    en: 'A Pokemon Sleep calculator for individual evaluation, team output, and candy planning.'
  },
  sourceData: { ja: 'data', en: 'data' },
  languageLabel: { ja: '言語', en: 'Language' },
  japanese: { ja: '日本語', en: 'Japanese' },
  english: { ja: 'English', en: 'English' },
  tabExpected: { ja: '期待値', en: 'Expected' },
  tabWhistle: { ja: 'チーム', en: 'Team' },
  tabCandy: { ja: 'アメ', en: 'Candy' },
  tabHowto: { ja: '使い方', en: 'Guide' },
  toolTabsAria: { ja: 'ツール切替', en: 'Tool tabs' },
  input: { ja: '入力', en: 'Input' },
  resetInput: { ja: '入力を初期化', en: 'Reset input' },
  pokemon: { ja: 'ポケモン', en: 'Pokemon' },
  skillLevel: { ja: 'スキルLv', en: 'Skill Lv' },
  otherHelpingBonus: { ja: '他のおてボ数', en: 'Other Helping Bonus' },
  ingredients: { ja: '食材', en: 'Ingredients' },
  nature: { ja: 'せいかく', en: 'Nature' },
  subskills: { ja: 'サブスキル', en: 'Subskills' },
  modifiers: { ja: '補正', en: 'Modifiers' },
  fieldBonusPercent: { ja: 'フィールドボーナス%', en: 'Field Bonus %' },
  energy: { ja: 'げんき', en: 'Energy' },
  normalEnergy: { ja: '通常推移', en: 'Normal' },
  morningPillow: { ja: '朝イチ枕1個', en: 'Morning pillow x1' },
  constant80: { ja: '常に80以上', en: 'Always 80+' },
  favoriteBerry: { ja: '好みのきのみ一致', en: 'Favorite berry match' },
  goodCamp: { ja: 'いいキャンプチケット', en: 'Good Camp Ticket' },
  exMode: { ja: 'EXモード', en: 'EX Mode' },
  exField: { ja: 'EXフィールド補正', en: 'EX field modifier' },
  normalField: { ja: '通常フィールド', en: 'Normal field' },
  wakakusaExMap: { ja: 'ワカクサEXマップ補正', en: 'Greengrass EX map bonus' },
  exBerry: { ja: 'EXきのみ', en: 'EX berry' },
  exBonus: { ja: 'EX効果', en: 'EX bonus' },
  mainMatch: { ja: 'メイン一致', en: 'Main match' },
  subMatch: { ja: 'サブ一致', en: 'Sub match' },
  noMatchSpeedDown: { ja: '不一致（フィールド固有の速度低下）', en: 'No match (field-specific speed penalty)' },
  berry24x: { ja: 'きのみ2.4倍', en: 'Berry x2.4' },
  ingredientPlus: { ja: '食材+', en: 'Ingredient +' },
  skill125x: { ja: 'スキル1.25倍', en: 'Skill x1.25' },
  saveHistory: { ja: '履歴に保存', en: 'Save' },
  addTeamShort: { ja: 'チーム', en: 'Team' },
  targetCost: { ja: '目標までのコスト', en: 'Cost to Target' },
  reachableLevel: { ja: '手持ちで到達できるLv', en: 'Reachable Level' },
  currentLevel: { ja: '現在Lv', en: 'Current Lv' },
  levelExp: { ja: 'Lv内EXP', en: 'Current EXP' },
  targetLevel: { ja: '目標Lv', en: 'Target Lv' },
  expType: { ja: '経験値タイプ', en: 'EXP Type' },
  expNature: { ja: 'EXP補正', en: 'EXP Nature' },
  boostType: { ja: 'ブースト種類', en: 'Boost Type' },
  shardMultiplier: { ja: 'かけら倍率', en: 'Shard Multiplier' },
  addTargetPlan: { ja: '目標までをプランに追加', en: 'Add Target Plan' },
  heldCandy: { ja: '所持アメ', en: 'Candy Owned' },
  heldShards: { ja: '所持かけら', en: 'Shards Owned' },
  addBudgetPlan: { ja: '手持ち消費をプランに追加', en: 'Add Budget Plan' },
  applyExpectedInput: { ja: '期待値入力を反映', en: 'Use Expected Input' },
  candySimulator: { ja: '育成シミュレータ', en: 'Candy Simulator' },
  requiredCandy: { ja: '必要アメ', en: 'Candy Needed' },
  requiredShards: { ja: '必要かけら', en: 'Shards Needed' },
  requiredExp: { ja: '必要EXP', en: 'EXP Needed' },
  reached: { ja: '到達', en: 'Reached' },
  candyOne: { ja: 'アメ1個', en: 'Per Candy' },
  currentPosition: { ja: '現在位置', en: 'Current Position' },
  reachedLevel: { ja: '到達Lv', en: 'Reached Lv' },
  usedCandy: { ja: '使ったアメ', en: 'Candy Used' },
  usedShards: { ja: '使ったかけら', en: 'Shards Used' },
  stopped: { ja: '停止', en: 'Stopped' },
  multiPokemonTraining: { ja: '複数個体育成', en: 'Multi-Pokemon Plans' },
  sharedShards: { ja: '共通所持かけら', en: 'Shared Shards' },
  remainingShards: { ja: 'かけら残り', en: 'Shards Left' },
  unlimited: { ja: '無制限', en: 'Unlimited' },
  plansEmpty: { ja: 'プランが空です。', en: 'No plans yet.' },
  addCandidatesFromLeft: { ja: '左の入力から育成候補を追加します。', en: 'Add candidates from the input panel.' },
  plannedCandyTotal: { ja: '予定アメ合計', en: 'Planned Candy' },
  plannedShardTotal: { ja: '予定かけら合計', en: 'Planned Shards' },
  executionTotal: { ja: '実行消費合計', en: 'Actual Cost' },
  complete: { ja: '完了', en: 'Complete' },
  removePlan: { ja: 'プランから削除', en: 'Remove plan' },
  targetExpProgress: { ja: '目標EXP進捗', en: 'Target EXP progress' },
  plannedUse: { ja: '予定消費', en: 'Planned Cost' },
  untilTarget: { ja: '目標まで', en: 'To Target' },
  usedAsPlanned: { ja: '予定分使用', en: 'Used as Planned' },
  levelCap: { ja: 'Lv上限', en: 'Level Cap' },
  targetReached: { ja: '目標到達', en: 'Target Reached' },
  outOfCandy: { ja: 'アメ切れ', en: 'Out of Candy' },
  outOfShards: { ja: 'かけら切れ', en: 'Out of Shards' },
  distribution: { ja: '個体値分布', en: 'Individual Distribution' },
  hideDistribution: { ja: '個体値分布を隠す', en: 'Hide distribution' },
  showDistribution: { ja: '個体値分布を表示', en: 'Show distribution' },
  hide: { ja: '隠す', en: 'Hide' },
  show: { ja: '表示', en: 'Show' },
  distributionLevelAria: { ja: '個体値評価レベル', en: 'Evaluation level' },
  helpingBonusTeamValue: { ja: 'おてつだいボーナスをチーム価値込みで評価', en: 'Value Helping Bonus with team effect' },
  friendLevelGold: { ja: 'フレンドレベル/金固定', en: 'Friend Level / Gold Lock' },
  noGoldLock: { ja: '金固定なし', en: 'No gold lock' },
  firstGoldLock: { ja: '1枠目金固定', en: 'Slot 1 gold-locked' },
  firstTwoGoldLock: { ja: '1-2枠目金固定', en: 'Slots 1-2 gold-locked' },
  firstThreeGoldLock: { ja: '1-3枠目金固定', en: 'Slots 1-3 gold-locked' },
  distributionLoading: { ja: '分布データを計算中です。', en: 'Calculating distribution data.' },
  distributionUsesMonteCarlo: { ja: 'の食材構成別Monte Carlo分布を使います。', en: ' Monte Carlo distributions by ingredient pattern are used.' },
  target: { ja: '対象', en: 'Target' },
  favoriteBerryMeta: { ja: '好みのきのみ', en: 'Favorite berry' },
  ingredientPattern: { ja: '食材構成', en: 'Ingredient pattern' },
  helpingBonusValue: { ja: 'おてボ価値', en: 'Helping Bonus value' },
  teamIncluded: { ja: 'チーム込み', en: 'Team included' },
  selfOnly: { ja: '本人のみ', en: 'Self only' },
  goldLock: { ja: '金固定', en: 'Gold lock' },
  none: { ja: 'なし', en: 'None' },
  unlockedSubskills: { ja: '解放サブスキル', en: 'Unlocked subskills' },
  samples: { ja: 'サンプル', en: 'Samples' },
  currentIndividual: { ja: '現在個体', en: 'Current' },
  populationMean: { ja: '母集団平均', en: 'Population mean' },
  top: { ja: '上位', en: 'Top' },
  median: { ja: '中央値', en: 'Median' },
  distributionUnavailable: { ja: 'この条件の分布はまだありません。', en: 'No distribution is available for this condition yet.' },
  distributionSupported: {
    ja: '対応条件は Lv30/50/60/70、FB0%、キャンプoff、通常マップ、EX off、他のおてボ0です。',
    en: 'Supported conditions: Lv30/50/60/70, FB 0%, Camp off, normal map, EX off, and 0 other Helping Bonus.'
  },
  teamProductivity: { ja: 'チーム生産性', en: 'Team Output' },
  dailyAndWhistle: { ja: '日産とホイッスル', en: 'Daily output and whistles' },
  dailyGoodCamp: { ja: '日産にいいキャンプチケット', en: 'Good Camp for daily output' },
  teamDailyOutput: { ja: 'チーム日産', en: 'Team Daily Output' },
  totalPokemon: { ja: '匹合計', en: 'Pokemon total' },
  totalEnergy: { ja: '合計エナジー', en: 'Total Strength' },
  berries: { ja: 'きのみ', en: 'Berries' },
  skill: { ja: 'スキル', en: 'Skill' },
  dailyIngredients: { ja: '日産食材内訳', en: 'Daily Ingredient Breakdown' },
  displayedHelpTime: { ja: '表示おてつだい時間', en: 'Displayed help time' },
  whistle: { ja: 'おてつだいホイッスル', en: 'Helper Whistle' },
  whistleUseCount: { ja: 'ホイッスル使用数', en: 'Whistle Count' },
  whistleIngredients: { ja: 'ホイッスル食材内訳', en: 'Whistle Ingredient Breakdown' },
  helpsPerWhistle: { ja: 'おてつだい/個', en: 'Helps / whistle' },
  cookingChanceDistribution: { ja: '料理チャンス週間スコア分布', en: 'Weekly Tasty Chance Score Distribution' },
  sourceInput: { ja: '入力', en: 'Source' },
  aggregateFromTeam: { ja: 'チームから集計', en: 'From team' },
  manualInput: { ja: '手入力', en: 'Manual' },
  triggersPerDay: { ja: '発動回数/日', en: 'Triggers / day' },
  effectPercent: { ja: '効果量%', en: 'Effect %' },
  noCookingChance: { ja: '料理チャンスS持ちがチームにいません。', en: 'No Tasty Chance S user is on the team.' },
  baseMealScore: { ja: '料理素点', en: 'Base meal score' },
  targetCritsWeek: { ja: '目標大成功/週', en: 'Target crits / week' },
  meanWeeklyMealScore: { ja: '平均週間料理点', en: 'Mean weekly meal score' },
  scoreRatio: { ja: '素点比', en: 'Vs. base score' },
  expectedTriggers: { ja: '発動期待', en: 'Expected triggers' },
  meanCrits: { ja: '平均大成功', en: 'Mean crits' },
  orMore: { ja: '回以上', en: '+ crits' },
  cookingMultiplier: { ja: '料理倍率', en: 'Meal multiplier' },
  weeklyMealEnergyAria: { ja: '1週間の料理エナジー分布', en: 'Weekly meal strength distribution' },
  weeklyMealCritAria: { ja: '1週間の料理大成功回数分布', en: 'Weekly meal crit distribution' },
  team: { ja: 'チーム', en: 'Team' },
  addCurrentInput: { ja: '現在の入力を追加', en: 'Add Current Input' },
  teamNote: {
    ja: '期待値タブで作った個体か、履歴から最大5匹まで追加します。',
    en: 'Add up to five Pokemon from the Expected tab or history.'
  },
  addFromHistory: { ja: '履歴から追加', en: 'Add from History' },
  currentInput: { ja: '現在の入力', en: 'Current Input' },
  favoriteShort: { ja: '好み', en: 'Favorite' },
  removeFromTeam: { ja: 'チームから削除', en: 'Remove from team' },
  wakakusaEx: { ja: 'ワカクサEX', en: 'Greengrass EX' },
  cyanEx: { ja: 'シアンEX', en: 'Cyan EX' },
  wakakusaExTitle: { ja: 'EXフィールドではEXきのみ設定を使います', en: 'EX fields use the EX berry setting' },
  teamEmpty: { ja: 'まだチームが空です。', en: 'The team is empty.' },
  teamEmptyHint: {
    ja: '期待値タブの現在入力か履歴から、スコアアタック対象を追加してください。',
    en: 'Add Pokemon from the current input or saved history.'
  },
  noIngredients: { ja: '対象食材はありません。', en: 'No ingredients.' },
  summaryBerry: { ja: 'きのみ', en: 'Berry' },
  helping: { ja: 'おてつだい', en: 'Helps' },
  historyDetail: { ja: '履歴詳細', en: 'History Detail' },
  currentDetail: { ja: '現在の詳細', en: 'Current Detail' },
  mainSkill: { ja: 'メインスキル', en: 'Main Skill' },
  calculatedHelpTime: { ja: '計算上おてつだい時間', en: 'Calculated help time' },
  inventoryLimit: { ja: '最大所持数', en: 'Inventory limit' },
  ingredientRate: { ja: '食材確率', en: 'Ingredient rate' },
  skillRate: { ja: 'スキル確率', en: 'Skill rate' },
  skillTriggers: { ja: 'スキル発動期待', en: 'Expected skill triggers' },
  sleepSkill: { ja: '睡眠中スキル', en: 'Sleep skill' },
  berriesPerHelp: { ja: 'きのみ/回', en: 'Berries / help' },
  sleepOverflow: { ja: '睡眠中あふれ', en: 'Sleep overflow' },
  ingredientBreakdown: { ja: '食材内訳', en: 'Ingredient Breakdown' },
  noUnlockedIngredients: { ja: '解放済み食材がありません。', en: 'No unlocked ingredients.' },
  latestTen: { ja: '最新10件', en: 'Latest 10' },
  exportHistoryCsv: { ja: '履歴をCSV出力', en: 'Export history as CSV' },
  noSavedResults: { ja: 'まだ保存された結果はありません。', en: 'No saved results yet.' },
  dateTime: { ja: '日時', en: 'Time' },
  selectedNature: { ja: 'せいかく', en: 'Nature' },
  deleteHistory: { ja: '履歴を削除', en: 'Delete history' },
  natureModifierAria: { ja: 'せいかく補正', en: 'Nature modifier matrix' },
  noModifier: { ja: '無補正', en: 'Neutral' },
  clearSelection: { ja: '選択を解除', en: 'Clear selection' },
  filterSubskills: { ja: 'サブスキル名で絞り込み', en: 'Filter subskills' },
  noSubskills: { ja: 'サブスキルなし', en: 'No subskills' },
  mainSkillFallback: { ja: 'メインスキル', en: 'Main Skill' },
  noMainSkillData: { ja: 'メインスキルの効果データがありません。', en: 'No main skill effect data is available.' },
  unsupportedSkillEffect: {
    ja: 'このスキルは特殊効果を含むため、現状の数値換算では未対応の部分があります。',
    en: 'This skill includes special effects that are not fully converted into numeric value yet.'
  },
  howtoTitle: { ja: '使い方', en: 'Guide' },
  howtoSubtitle: {
    ja: '期待値・個体値・チーム評価・育成計画の読み方',
    en: 'How to read expected value, distribution, team output, and candy plans'
  },
  premise: { ja: '前提', en: 'Assumptions' }
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS;

export function translate(language: Language, key: TranslationKey) {
  return TRANSLATIONS[key][language];
}

export function pokemonName(pokemon: PokemonSpecies, language: Language) {
  return language === 'en' ? pokemon.displayName : pokemon.displayNameJa;
}

export function pokemonCandidateName(pokemon: PokemonSpecies, language: Language) {
  return language === 'en'
    ? `${pokemon.displayName} / ${pokemon.displayNameJa}`
    : `${pokemon.displayNameJa} / ${pokemon.displayName}`;
}

export function ingredientName(ingredient: Ingredient, language: Language) {
  return language === 'en' ? ingredient.name : ingredient.nameJa;
}

export function berryName(berry: Berry, language: Language) {
  if (language === 'ja') {
    return berry.nameJa;
  }
  const name = titleCase(berry.name);
  return name.toLowerCase().endsWith('berry') ? name : `${name} Berry`;
}

export function natureName(nature: Nature, language: Language) {
  return language === 'en' ? nature.name : nature.nameJa;
}

export function subskillName(subskill: Subskill, language: Language) {
  return language === 'en' ? subskill.name : subskill.nameJa;
}

export function mainSkillName(skill: MainSkill, language: Language) {
  return language === 'en' ? skill.name : skill.nameJa;
}

export function specialtyLabel(specialty: Specialty, language: Language) {
  const labels: Record<Specialty, Record<Language, string>> = {
    berry: { ja: 'きのみ得意', en: 'Berry specialist' },
    ingredient: { ja: '食材得意', en: 'Ingredient specialist' },
    skill: { ja: 'スキル得意', en: 'Skill specialist' },
    all: { ja: 'オール得意', en: 'All-rounder' }
  };
  return labels[specialty]?.[language] ?? specialty;
}

export function modifierLabel(modifier: string, language: Language) {
  const labels: Record<string, Record<Language, string>> = {
    speed: { ja: 'スピード', en: 'Speed' },
    ingredient: { ja: '食材', en: 'Ingredient' },
    skill: { ja: 'スキル', en: 'Skill' },
    energy: { ja: 'げんき', en: 'Energy' },
    exp: { ja: 'EXP', en: 'EXP' },
    neutral: { ja: 'なし', en: 'None' }
  };
  return labels[modifier]?.[language] ?? modifier;
}

export function subskillRarityLabel(rarity: string, language: Language) {
  if (rarity === 'gold') {
    return language === 'en' ? 'Gold' : '金';
  }
  if (rarity === 'silver') {
    return language === 'en' ? 'Blue' : '青';
  }
  return language === 'en' ? 'White' : '白';
}

export function candyExpTypeLabel(expType: number, language: Language) {
  return language === 'en' ? `${expType} type` : `${expType}タイプ`;
}

export function candyNatureLabel(expNature: string, language: Language) {
  const labels: Record<string, Record<Language, string>> = {
    up: { ja: 'EXP↑', en: 'EXP Up' },
    neutral: { ja: '補正なし', en: 'Neutral' },
    down: { ja: 'EXP↓', en: 'EXP Down' }
  };
  return labels[expNature]?.[language] ?? expNature;
}

export function candyBoostLabel(boostMode: string, language: Language) {
  const labels: Record<string, Record<Language, string>> = {
    none: { ja: '通常', en: 'Normal' },
    mini: { ja: 'ミニブースト', en: 'Mini Boost' },
    regular: { ja: 'アメブースト', en: 'Candy Boost' },
    custom: { ja: '手入力', en: 'Custom' }
  };
  return labels[boostMode]?.[language] ?? boostMode;
}

export function metricLabel(metricId: string, language: Language) {
  const labels: Record<string, Record<Language, string>> = {
    berryEnergy: { ja: 'きのみエナジー', en: 'Berry strength' },
    ingredientTotal: { ja: '合計食材数', en: 'Total ingredients' },
    ingredientEnergy: { ja: '食材エナジー', en: 'Ingredient strength' },
    skillTriggers: { ja: 'スキル発動回数', en: 'Skill triggers' }
  };
  return labels[metricId]?.[language] ?? metricId;
}

export function metricUnit(metricId: string, language: Language) {
  if (metricId === 'ingredientTotal') {
    return language === 'en' ? 'items' : '個';
  }
  if (metricId === 'skillTriggers') {
    return language === 'en' ? 'times' : '回';
  }
  return '';
}

export function countWithUnit(value: string | number, unit: 'pieces' | 'times' | 'pokemon' | 'weeks' | 'days' | 'shards', language: Language) {
  const text = String(value);
  if (language === 'ja') {
    const labels = {
      pieces: '個',
      times: '回',
      pokemon: '匹',
      weeks: '週',
      days: '日',
      shards: 'かけら'
    };
    return `${text}${labels[unit]}`;
  }
  const labels = {
    pieces: 'pcs',
    times: 'times',
    pokemon: 'Pokemon',
    weeks: 'weeks',
    days: 'days',
    shards: 'shards'
  };
  return `${text} ${labels[unit]}`;
}

export function shardLimitLabel(value: number, formattedValue: string, language: Language) {
  if (value > 0) {
    return countWithUnit(formattedValue, 'shards', language);
  }
  return language === 'en' ? 'Unlimited shards' : 'かけら無制限';
}

export function localizeCalcNote(note: string, language: Language) {
  if (language === 'ja') {
    return note;
  }

  const exact: Record<string, string> = {
    '日中は定期回収、睡眠中は8.5時間の未回収として1日期待値を計算しています。':
      'Daily expected value assumes regular collection while awake and 8.5 hours of uncollected sleep production.',
    '朝イチげんきマクラ1個を使い、日中はげんき150%スタートとして計算しています。':
      'Morning pillow x1 assumes daytime production starts from 150% energy.',
    'げんきは常に80以上として計算しています。枕2個以上を同じ個体に使う場合の近似にも使えます。':
      'Always 80+ assumes energy stays at or above 80, which can approximate using multiple pillows on the same Pokemon.'
  };
  if (exact[note]) {
    return exact[note];
  }

  let match = note.match(/^げんき回復スキルは期待回復量 ([0-9.]+) を速度補正に換算しています。$/);
  if (match) {
    return `Energy recovery skills convert expected recovery ${match[1]} into a speed modifier.`;
  }

  match = note.match(/^スキル連続不発天井([0-9]+)回を反映し、みなしスキル確率を([0-9.]+)%として計算しています。$/);
  if (match) {
    return `The skill pity ceiling of ${match[1]} failed helps is reflected, using an effective skill rate of ${match[2]}%.`;
  }

  match = note.match(/^睡眠8\.5時間中の所持数あふれを反映し、約([0-9.]+)回分は食材・スキルなしのきのみのみで計算しています。$/);
  if (match) {
    return `Sleep inventory overflow is reflected; about ${match[1]} helps are counted as berry-only production without ingredients or skills.`;
  }

  match = note.match(/^睡眠中のスキル発動はストック上限([0-9]+)回を反映し、期待値を([0-9.]+)回に丸めています。$/);
  if (match) {
    return `Sleep skill triggers reflect the stock limit of ${match[1]}, capping the expected value at ${match[2]}.`;
  }

  if (note.startsWith('EXモード')) {
    return 'EX mode adjustments are reflected for the selected berry match and bonus.';
  }

  return note;
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
