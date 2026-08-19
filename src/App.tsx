import { BarChart3, Download, Eye, EyeOff, History, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { createContext, Fragment, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { berryById, dataset, ingredientById, mainSkillById, natureById, pokemonById, subskillById } from './data/dataset';
import { berryEnergyAtLevel, calculate, calculateWhistle } from './lib/calculate';
import {
  CANDY_BOOST_MODES,
  CANDY_EXP_NATURES,
  CANDY_EXP_TYPES,
  MAX_CANDY_LEVEL,
  candyExpAtLevel,
  dreamShardsPerCandy,
  expNatureFromModifier,
  expToNextLevel,
  inferCandyExpType,
  simulateCandyPlanQueue,
  simulateCandyUse,
  type CandyBoostMode,
  type CandyExpNature,
  type CandyExpType,
  type CandyPlanInput,
  type CandySimulationResult
} from './lib/candy';
import { simulateCookingChanceWeek, type CookingChanceSource } from './lib/cooking-chance';
import { analyzeDistribution, ingredientPatternLabel } from './lib/distribution';
import { formatNumber, formatPercent, formatSeconds, resultsToCsv } from './lib/format';
import {
  berryName,
  candyBoostLabel as localizedCandyBoostLabel,
  candyExpTypeLabel as localizedCandyExpTypeLabel,
  candyNatureLabel as localizedCandyNatureLabel,
  countWithUnit,
  ingredientName,
  loadInitialLanguage,
  localeFor,
  localizeCalcNote,
  mainSkillName,
  metricLabel as localizedMetricLabel,
  metricUnit as localizedMetricUnit,
  modifierLabel as localizedModifierLabel,
  natureName,
  persistLanguage,
  pokemonCandidateName,
  pokemonName,
  setActiveLanguage,
  shardLimitLabel,
  specialtyLabel as localizedSpecialtyLabel,
  subskillName,
  subskillRarityLabel as localizedSubskillRarityLabel,
  translate,
  updateUrlLanguage,
  type Language,
  type TranslationKey
} from './lib/i18n';
import { MAX_FIELD_BONUS, MAX_POKEMON_LEVEL, activeSubskillCountAtLevel, defaultInput, firstPlayableSpecies, inputForSpecies, normalizeInput } from './lib/input';
import type {
  CalcInput,
  CalcResult,
  IngredientBreakdown,
  IngredientDrop,
  MainSkill,
  PokemonSpecies,
  WhistlePokemonResult
} from './types';

const INPUT_STORAGE_KEY = 'pokemon-sleep-checker-input-v1';
const HISTORY_STORAGE_KEY = 'pokemon-sleep-checker-history-v1';
const DISTRIBUTION_VISIBILITY_STORAGE_KEY = 'pokemon-sleep-checker-distribution-visible-v1';
const SCORE_TEAM_STORAGE_KEY = 'pokemon-sleep-checker-score-team-v1';
const SCORE_SETTINGS_STORAGE_KEY = 'pokemon-sleep-checker-score-settings-v1';
const MAX_HISTORY = 10;
const MAX_SCORE_TEAM = 5;
const MAX_CANDY_PLANS = 12;
const DISTRIBUTION_LEVELS = [30, 50, 60, 70];
const MAX_SUBSKILLS = 5;
const TOOL_TABS = [
  { id: 'expected', labelKey: 'tabExpected' },
  { id: 'whistle', labelKey: 'tabWhistle' },
  { id: 'candy', labelKey: 'tabCandy' },
  { id: 'howto', labelKey: 'tabHowto' }
] as const;
const SUBSKILL_PRIORITY = [
  'Berry Finding S',
  'Helping Bonus',
  'Helping Speed M',
  'Helping Speed S',
  'Ingredient Finder M',
  'Ingredient Finder S',
  'Skill Trigger M',
  'Skill Trigger S',
  'Inventory Up L',
  'Inventory Up M',
  'Inventory Up S',
  'Skill Level Up M',
  'Skill Level Up S',
  'Energy Recovery Bonus',
  'Sleep EXP Bonus',
  'Research EXP Bonus',
  'Dream Shard Bonus'
];

interface HistoryEntry {
  id: string;
  input: CalcInput;
  result: CalcResult;
}

type ToolTab = (typeof TOOL_TABS)[number]['id'];

interface TeamSlot {
  id: string;
  input: CalcInput;
}

interface ScoreSettings {
  whistleCount: number;
  fieldBonus: number;
  goodCamp: boolean;
  energyMode: CalcInput['energyMode'];
}

interface CandyDraft {
  speciesId: string;
  currentLevel: number;
  currentExp: number;
  targetLevel: number;
  expType: CandyExpType;
  expNature: CandyExpNature;
  boostMode: CandyBoostMode;
  customShardMultiplier: number;
  candyLimit: number;
  shardLimit: number;
}

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside I18nContext.Provider');
  }
  return context;
}

export function App() {
  const [language, setLanguageState] = useState<Language>(() => loadInitialLanguage());
  setActiveLanguage(language);
  const t = (key: TranslationKey) => translate(language, key);
  const i18nValue = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage: (nextLanguage) => {
        setActiveLanguage(nextLanguage);
        setLanguageState(nextLanguage);
      },
      t: (key) => translate(language, key)
    }),
    [language]
  );

  const [input, setInput] = useState<CalcInput>(() => loadInput());
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolTab>('expected');
  const [hasOpenedCandy, setHasOpenedCandy] = useState(false);
  const [scoreTeam, setScoreTeam] = useState<TeamSlot[]>(() => loadScoreTeam());
  const [scoreSettings, setScoreSettings] = useState<ScoreSettings>(() => loadScoreSettings());

  const species = pokemonById.get(input.speciesId) ?? firstPlayableSpecies();
  const normalizedInput = useMemo(() => normalizeInput(input, species), [input, species]);
  const result = useMemo(() => calculate(normalizedInput), [normalizedInput]);
  const selectedHistory = history.find((item) => item.id === selectedHistoryId);
  const detailResult = selectedHistory?.result ?? result;
  const detailInput = selectedHistory?.input ?? normalizedInput;

  useLayoutEffect(() => {
    setActiveLanguage(language);
    persistLanguage(language);
    updateUrlLanguage(language);
    document.documentElement.lang = language;
    document.title = translate(language, 'appTitle');
    document.querySelector('meta[name="description"]')?.setAttribute('content', translate(language, 'appDescription'));
  }, [language]);

  useEffect(() => {
    localStorage.setItem(INPUT_STORAGE_KEY, JSON.stringify(normalizedInput));
  }, [normalizedInput]);

  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem(SCORE_TEAM_STORAGE_KEY, JSON.stringify(scoreTeam));
  }, [scoreTeam]);

  useEffect(() => {
    localStorage.setItem(SCORE_SETTINGS_STORAGE_KEY, JSON.stringify(scoreSettings));
  }, [scoreSettings]);

  useEffect(() => {
    if (activeTool === 'candy') {
      setHasOpenedCandy(true);
    }
  }, [activeTool]);

  function updateInput(patch: Partial<CalcInput>) {
    setInput((current) => ({ ...current, ...patch }));
    setSelectedHistoryId(null);
  }

  function handleSpeciesChange(speciesId: string) {
    const nextSpecies = pokemonById.get(speciesId);
    if (!nextSpecies) {
      return;
    }
    setInput((current) => inputForSpecies(current, nextSpecies));
    setSelectedHistoryId(null);
  }

  function saveResult() {
    const saved = calculate(normalizedInput);
    const entry = { id: saved.id, input: normalizedInput, result: saved };
    setHistory((current) => [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, MAX_HISTORY));
    setSelectedHistoryId(entry.id);
  }

  function selectHistory(entry: HistoryEntry) {
    const nextSpecies = pokemonById.get(entry.input.speciesId);
    setInput(nextSpecies ? normalizeInput(entry.input, nextSpecies) : entry.input);
    setSelectedHistoryId(entry.id);
  }

  function deleteHistory(id: string) {
    setHistory((current) => current.filter((item) => item.id !== id));
    if (selectedHistoryId === id) {
      setSelectedHistoryId(null);
    }
  }

  function resetInput() {
    const next = defaultInput(firstPlayableSpecies());
    setInput(next);
    setSelectedHistoryId(null);
  }

  function addCurrentToScoreTeam() {
    addInputToScoreTeam(normalizedInput);
  }

  function addHistoryToScoreTeam(entry: HistoryEntry) {
    addInputToScoreTeam(entry.input);
  }

  function addInputToScoreTeam(source: CalcInput) {
    const sourceSpecies = pokemonById.get(source.speciesId);
    if (!sourceSpecies) {
      return;
    }
    const normalized = normalizeInput({ ...source, favoriteBerry: false }, sourceSpecies);
    setScoreTeam((current) => {
      if (current.length >= MAX_SCORE_TEAM) {
        return current;
      }
      return [...current, { id: makeClientId(), input: normalized }];
    });
  }

  function updateScoreSettings(patch: Partial<ScoreSettings>) {
    setScoreSettings((current) => normalizeScoreSettings({ ...current, ...patch }));
  }

  function updateScoreTeamSlot(id: string, patch: Partial<CalcInput>) {
    setScoreTeam((current) =>
      current.map((slot) => {
        if (slot.id !== id) {
          return slot;
        }
        const nextInput = { ...slot.input, ...patch };
        const nextSpecies = pokemonById.get(nextInput.speciesId);
        return {
          ...slot,
          input: nextSpecies ? normalizeInput(nextInput, nextSpecies) : nextInput
        };
      })
    );
  }

  function removeScoreTeamSlot(id: string) {
    setScoreTeam((current) => current.filter((slot) => slot.id !== id));
  }

  function downloadCsv() {
    const rows = history.length > 0 ? history.map((entry) => entry.result) : [result];
    const blob = new Blob([resultsToCsv(rows, language)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'pokemon-sleep-expected-results.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <I18nContext.Provider value={i18nValue}>
      <main className="app">
      <header className="app-header">
        <div>
          <h1>{t('appTitle')}</h1>
          <p>SPORE: Super POkemon-sleep Rating Engine</p>
        </div>
        <div className="app-header-actions">
          <div className="language-control" aria-label={t('languageLabel')}>
            <button type="button" className={language === 'ja' ? 'active' : ''} onClick={() => i18nValue.setLanguage('ja')}>
              {t('japanese')}
            </button>
            <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => i18nValue.setLanguage('en')}>
              {t('english')}
            </button>
          </div>
          <div className="source-pill">
            {t('sourceData')}: {dataset.source.name}
            <span>{dataset.generatedAt.slice(0, 10)}</span>
          </div>
        </div>
      </header>

      <nav className="tool-tabs" aria-label={t('toolTabsAria')}>
        {TOOL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTool === tab.id ? 'active' : ''}
            onClick={() => setActiveTool(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </nav>

      {activeTool === 'expected' ? (
        <section className="workspace">
          <form className="panel controls" onSubmit={(event) => event.preventDefault()}>
            <div className="panel-heading">
              <h2>{t('input')}</h2>
              <button type="button" className="icon-button" onClick={resetInput} title={t('resetInput')}>
                <RotateCcw size={18} />
              </button>
            </div>

            <div className="field wide">
              <PokemonSearch speciesId={normalizedInput.speciesId} onChange={handleSpeciesChange} />
            </div>

            <div className="field-grid">
              <NumberField
                label="Lv"
                value={normalizedInput.level}
                min={1}
                max={MAX_POKEMON_LEVEL}
                onChange={(level) => updateInput({ level })}
              />
              <NumberField
                label={t('skillLevel')}
                value={normalizedInput.skillLevel}
                min={1}
                max={8}
                onChange={(skillLevel) => updateInput({ skillLevel })}
              />
              <NumberField
                label={t('otherHelpingBonus')}
                value={normalizedInput.helpingBonusCount}
                min={0}
                max={4}
                onChange={(helpingBonusCount) => updateInput({ helpingBonusCount })}
              />
            </div>

            <fieldset>
              <legend>{t('ingredients')}</legend>
              <IngredientSelect
                label="Lv1"
                drops={species.ingredient0}
                value={normalizedInput.ingredient0Id}
                onChange={(ingredient0Id) => updateInput({ ingredient0Id })}
              />
              <IngredientSelect
                label="Lv30"
                drops={species.ingredient30}
                value={normalizedInput.ingredient30Id}
                disabled={normalizedInput.level < 30}
                onChange={(ingredient30Id) => updateInput({ ingredient30Id })}
              />
              <IngredientSelect
                label="Lv60"
                drops={species.ingredient60}
                value={normalizedInput.ingredient60Id}
                disabled={normalizedInput.level < 60}
                onChange={(ingredient60Id) => updateInput({ ingredient60Id })}
              />
            </fieldset>

            <NaturePicker value={normalizedInput.natureId} onChange={(natureId) => updateInput({ natureId })} />

            <fieldset>
              <legend>{t('subskills')}</legend>
              <SubskillCheckboxPicker value={normalizedInput.subskillIds} onChange={(subskillIds) => updateInput({ subskillIds })} />
            </fieldset>

            <fieldset>
              <legend>{t('modifiers')}</legend>
              <div className="field-grid">
                <NumberField
                  label={t('fieldBonusPercent')}
                  value={normalizedInput.fieldBonus}
                  min={0}
                  max={MAX_FIELD_BONUS}
                  onChange={(fieldBonus) => updateInput({ fieldBonus })}
                />
                <div className="field">
                  <label htmlFor="energy-mode">{t('energy')}</label>
                  <select
                    id="energy-mode"
                    value={normalizedInput.energyMode}
                    onChange={(event) => updateInput({ energyMode: event.target.value as CalcInput['energyMode'] })}
                  >
                    <option value="normal">{t('normalEnergy')}</option>
                    <option value="morningPillow">{t('morningPillow')}</option>
                    <option value="constant80">{t('constant80')}</option>
                  </select>
                </div>
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={normalizedInput.favoriteBerry}
                  disabled={normalizedInput.exMode || normalizedInput.mapMode !== 'normal'}
                  onChange={(event) => updateInput({ favoriteBerry: event.target.checked })}
                />
                <span>{t('favoriteBerry')}</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={normalizedInput.goodCamp}
                  onChange={(event) => updateInput({ goodCamp: event.target.checked })}
                />
                <span>{t('goodCamp')}</span>
              </label>
              <div className="field">
                <label htmlFor="ex-map-mode">{t('exField')}</label>
                <select
                  id="ex-map-mode"
                  value={normalizedInput.mapMode}
                  onChange={(event) => updateInput({ mapMode: event.target.value as CalcInput['mapMode'], exMode: false })}
                >
                  <option value="normal">{t('normalField')}</option>
                  <option value="wakakusaEx">{t('wakakusaEx')}</option>
                  <option value="cyanEx">{t('cyanEx')}</option>
                </select>
              </div>
              {normalizedInput.exMode || normalizedInput.mapMode !== 'normal' ? (
                <div className="field-grid">
                  <div className="field">
                    <label htmlFor="ex-berry">{t('exBerry')}</label>
                    <select
                      id="ex-berry"
                      value={normalizedInput.exBerryMode}
                      onChange={(event) => updateInput({ exBerryMode: event.target.value as CalcInput['exBerryMode'] })}
                    >
                      <option value="main">{t('mainMatch')}</option>
                      <option value="sub">{t('subMatch')}</option>
                    <option value="none">{t('noMatchSpeedDown')}</option>
                  </select>
                </div>
                  <div className="field">
                    <label htmlFor="ex-bonus">{t('exBonus')}</label>
                    <select
                      id="ex-bonus"
                      value={normalizedInput.exBonusMode}
                      onChange={(event) => updateInput({ exBonusMode: event.target.value as CalcInput['exBonusMode'] })}
                    >
                      <option value="berry">{t('berry24x')}</option>
                      <option value="ingredient">{t('ingredientPlus')}</option>
                      <option value="skill">{t('skill125x')}</option>
                    </select>
                  </div>
                </div>
              ) : null}
            </fieldset>

            <div className="action-row">
              <button type="button" className="primary-button" onClick={saveResult}>
                <Save size={18} />
                {t('saveHistory')}
              </button>
              <button type="button" className="secondary-button" onClick={addCurrentToScoreTeam} disabled={scoreTeam.length >= MAX_SCORE_TEAM}>
                <Plus size={18} />
                {t('addTeamShort')}
              </button>
              <button type="button" className="secondary-button" onClick={downloadCsv}>
                <Download size={18} />
                CSV
              </button>
            </div>
          </form>

          <section className="results-column">
            <ResultSummary result={result} species={species} />
            <DistributionPanel input={normalizedInput} species={species} />
            <ResultDetail result={detailResult} input={detailInput} selectedHistoryId={selectedHistoryId} />
            <HistoryTable
              history={history}
              selectedId={selectedHistoryId}
              onSelect={selectHistory}
              onDelete={deleteHistory}
              onDownload={downloadCsv}
            />
          </section>
        </section>
      ) : null}

      {activeTool === 'whistle' ? (
        <WhistleSimulator
          currentInput={normalizedInput}
          history={history}
          team={scoreTeam}
          settings={scoreSettings}
          onAddCurrent={addCurrentToScoreTeam}
          onAddHistory={addHistoryToScoreTeam}
          onRemoveSlot={removeScoreTeamSlot}
          onUpdateSlot={updateScoreTeamSlot}
          onSettingsChange={updateScoreSettings}
        />
      ) : null}

      {activeTool === 'candy' || hasOpenedCandy ? (
        <div hidden={activeTool !== 'candy'}>
          <CandySimulator currentInput={normalizedInput} />
        </div>
      ) : null}

      {activeTool === 'howto' ? <HowToPanel /> : null}
      </main>
    </I18nContext.Provider>
  );
}


function CandySimulator({ currentInput }: { currentInput: CalcInput }) {
  const { language, t } = useI18n();
  const [draft, setDraft] = useState<CandyDraft>(() => candyDraftFromInput(currentInput));
  const [plans, setPlans] = useState<CandyPlanInput[]>([]);
  const [sharedShardLimit, setSharedShardLimit] = useState(0);
  const species = pokemonById.get(draft.speciesId) ?? firstPlayableSpecies();
  const currentExpMax = Math.max(0, expToNextLevel(draft.currentLevel, draft.expType) - 1);
  const candyExp = candyExpAtLevel(draft.currentLevel, draft.expNature, draft.boostMode);
  const shardCost = dreamShardsPerCandy(draft.currentLevel, draft.boostMode, draft.customShardMultiplier);
  const targetResult = useMemo(
    () => simulateCandyUse({ ...draft, candyLimit: undefined, shardLimit: undefined }),
    [draft]
  );
  const budgetResult = useMemo(
    () => simulateCandyUse({ ...draft, targetLevel: MAX_CANDY_LEVEL, candyLimit: draft.candyLimit, shardLimit: draft.shardLimit }),
    [draft]
  );
  const queue = useMemo(() => simulateCandyPlanQueue(plans, sharedShardLimit), [plans, sharedShardLimit]);

  function updateDraft(patch: Partial<CandyDraft>) {
    setDraft((current) => normalizeCandyDraft({ ...current, ...patch }));
  }

  function handleCandySpeciesChange(speciesId: string) {
    setDraft((current) => normalizeCandyDraft({ ...current, speciesId, expType: inferCandyExpType(speciesId) }));
  }

  function applyCurrentInput() {
    setDraft(candyDraftFromInput(currentInput));
  }

  function addTargetPlan() {
    const normalized = normalizeCandyDraft(draft);
    const planSpecies = pokemonById.get(normalized.speciesId) ?? firstPlayableSpecies();
    addCandyPlan({
      ...normalized,
      candyLimit: undefined,
      shardLimit: undefined,
      mode: 'target',
      label: pokemonName(planSpecies, language) + ' Lv' + normalized.currentLevel + ' -> ' + normalized.targetLevel
    });
  }

  function addBudgetPlan() {
    const normalized = normalizeCandyDraft(draft);
    const planSpecies = pokemonById.get(normalized.speciesId) ?? firstPlayableSpecies();
    addCandyPlan({
      ...normalized,
      targetLevel: MAX_CANDY_LEVEL,
      candyLimit: normalized.candyLimit,
      shardLimit: undefined,
      mode: 'budget',
      label: pokemonName(planSpecies, language) + ' Lv' + normalized.currentLevel + ' +' + countWithUnit(formatNumber(normalized.candyLimit), 'pieces', language)
    });
  }

  function addCandyPlan(plan: Omit<CandyPlanInput, 'id'>) {
    setPlans((current) => {
      if (current.length >= MAX_CANDY_PLANS) {
        return current;
      }
      return [...current, { ...plan, id: makeClientId() }];
    });
  }

  function removePlan(id: string) {
    setPlans((current) => current.filter((plan) => plan.id !== id));
  }

  return (
    <section className="candy-tool">
      <form className="panel candy-panel" onSubmit={(event) => event.preventDefault()}>
        <div className="panel-heading">
          <h2>{t('tabCandy')}</h2>
          <span>{pokemonName(species, language)}</span>
        </div>

        <div className="field wide">
          <PokemonSearch speciesId={draft.speciesId} onChange={handleCandySpeciesChange} />
        </div>

        <section className="candy-input-section">
          <div className="section-heading">
            <h3>{t('targetCost')}</h3>
            <span>{levelRangeLabel(draft.currentLevel, draft.targetLevel, language)}</span>
          </div>
          <div className="field-grid">
            <NumberField label={t('currentLevel')} value={draft.currentLevel} min={1} max={MAX_CANDY_LEVEL} onChange={(currentLevel) => updateDraft({ currentLevel })} />
            <NumberField label={t('levelExp')} value={draft.currentExp} min={0} max={currentExpMax} onChange={(currentExp) => updateDraft({ currentExp })} />
            <NumberField label={t('targetLevel')} value={draft.targetLevel} min={draft.currentLevel} max={MAX_CANDY_LEVEL} onChange={(targetLevel) => updateDraft({ targetLevel })} />
          </div>

          <div className="settings-grid candy-settings-grid">
            <div className="field">
              <label htmlFor="candy-exp-type">{t('expType')}</label>
              <select id="candy-exp-type" value={draft.expType} onChange={(event) => updateDraft({ expType: Number(event.target.value) as CandyExpType })}>
                {CANDY_EXP_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {localizedCandyExpTypeLabel(type.id, language)} x{formatNumber(type.multiplier, 1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="candy-exp-nature">{t('expNature')}</label>
              <select id="candy-exp-nature" value={draft.expNature} onChange={(event) => updateDraft({ expNature: event.target.value as CandyExpNature })}>
                {CANDY_EXP_NATURES.map((nature) => (
                  <option key={nature.id} value={nature.id}>
                    {localizedCandyNatureLabel(nature.id, language)} x{formatNumber(nature.multiplier, 2)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="candy-boost-mode">{t('boostType')}</label>
              <select id="candy-boost-mode" value={draft.boostMode} onChange={(event) => updateDraft({ boostMode: event.target.value as CandyBoostMode })}>
                {CANDY_BOOST_MODES.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {localizedCandyBoostLabel(mode.id, language)}
                  </option>
                ))}
              </select>
            </div>
            {draft.boostMode === 'custom' ? (
              <NumberField label={t('shardMultiplier')} value={draft.customShardMultiplier} min={1} max={20} onChange={(customShardMultiplier) => updateDraft({ customShardMultiplier })} />
            ) : null}
          </div>
          <button type="button" className="primary-button add-plan-button" onClick={addTargetPlan} disabled={plans.length >= MAX_CANDY_PLANS}>
            <Plus size={18} />
            {t('addTargetPlan')}
          </button>
        </section>

        <section className="candy-input-section">
          <div className="section-heading">
            <h3>{t('reachableLevel')}</h3>
            <span>{shardLimitLabel(draft.shardLimit, formatNumber(draft.shardLimit), language)}</span>
          </div>
          <div className="field-grid">
            <NumberField label={t('heldCandy')} value={draft.candyLimit} min={0} max={99999} onChange={(candyLimit) => updateDraft({ candyLimit })} />
            <NumberField label={t('heldShards')} value={draft.shardLimit} min={0} max={999999999} onChange={(shardLimit) => updateDraft({ shardLimit })} />
          </div>
          <button type="button" className="secondary-button add-plan-button" onClick={addBudgetPlan} disabled={plans.length >= MAX_CANDY_PLANS || draft.candyLimit <= 0}>
            <Plus size={18} />
            {t('addBudgetPlan')}
          </button>
        </section>

        <div className="action-row candy-actions">
          <button type="button" className="secondary-button" onClick={applyCurrentInput}>
            <RotateCcw size={18} />
            {t('applyExpectedInput')}
          </button>
        </div>
      </form>

      <section className="panel candy-results">
        <div className="panel-heading">
          <h2>{t('candySimulator')}</h2>
          <span>{candyExpTypeLabel(draft.expType, language)} / {candyNatureLabel(draft.expNature, language)}</span>
        </div>

        <section className="candy-section candy-primary-section">
          <div className="section-heading">
            <h3>{t('targetCost')}</h3>
            <span>{levelRangeLabel(draft.currentLevel, draft.targetLevel, language)}</span>
          </div>
          <div className="candy-cost-summary">
            <Metric label={t('requiredCandy')} value={countWithUnit(formatNumber(targetResult.usedCandy), 'pieces', language)} />
            <Metric label={t('requiredShards')} value={formatNumber(targetResult.usedShards)} />
          </div>
          <div className="score-summary candy-summary">
            <Metric label={t('requiredExp')} value={formatNumber(targetResult.neededExp)} />
            <Metric label={t('reached')} value={formatCandyLevelResult(targetResult)} />
            <Metric label={t('candyOne')} value={`${formatNumber(candyExp)} EXP / ${countWithUnit(formatNumber(shardCost), 'shards', language)}`} />
            <Metric label={t('currentPosition')} value={formatCandyCurrentLevel(draft)} />
          </div>
        </section>

        <section className="candy-section">
          <div className="section-heading">
            <h3>{t('reachableLevel')}</h3>
            <span>{countWithUnit(formatNumber(draft.candyLimit), 'pieces', language)} / {shardLimitLabel(draft.shardLimit, formatNumber(draft.shardLimit), language)}</span>
          </div>
          <div className="score-summary candy-summary">
            <Metric label={t('reachedLevel')} value={formatCandyLevelResult(budgetResult)} />
            <Metric label={t('usedCandy')} value={`${formatNumber(budgetResult.usedCandy)} / ${countWithUnit(formatNumber(draft.candyLimit), 'pieces', language)}`} />
            <Metric label={t('usedShards')} value={formatCandyShardBudget(budgetResult, draft.shardLimit, language)} />
            <Metric label={t('stopped')} value={candyStoppedByLabel(budgetResult, language)} />
          </div>
        </section>

        <section className="candy-section">
          <div className="section-heading">
            <h3>{t('multiPokemonTraining')}</h3>
            <span>{plans.length}/{MAX_CANDY_PLANS}</span>
          </div>
          <div className="candy-inline-controls">
            <NumberField label={t('sharedShards')} value={sharedShardLimit} min={0} max={999999999} onChange={setSharedShardLimit} />
            <div className="candy-inline-stat">
              <span>{t('remainingShards')}</span>
              <strong>{queue.isShardUnlimited ? t('unlimited') : formatNumber(queue.remainingShards)}</strong>
            </div>
          </div>
          {plans.length === 0 ? (
            <div className="candy-empty">
              <p>{t('plansEmpty')}</p>
              <span>{t('addCandidatesFromLeft')}</span>
            </div>
          ) : (
            <>
              <div className="score-summary candy-summary">
                <Metric label={t('plannedCandyTotal')} value={countWithUnit(formatNumber(queue.totals.targetCandy), 'pieces', language)} />
                <Metric label={t('plannedShardTotal')} value={formatNumber(queue.totals.targetShards)} />
                <Metric label={t('executionTotal')} value={`${countWithUnit(formatNumber(queue.totals.budgetCandy), 'pieces', language)} / ${formatNumber(queue.totals.budgetShards)}`} />
                <Metric label={t('complete')} value={`${queue.totals.targetReachedCount}/${countWithUnit(plans.length, 'pokemon', language)}`} />
              </div>
              <div className="candy-plan-list">
                {queue.results.map((row, index) => {
                  const progress = candyProgressPercent(row.target, row.budget);
                  return (
                    <article key={row.plan.id} className="candy-plan-card">
                      <div className="candy-plan-head">
                        <div>
                          <strong>{row.plan.label}</strong>
                          <span>{index + 1}. {candyPlanMeta(row.plan, language)}</span>
                        </div>
                        <button type="button" className="icon-button history-delete" onClick={() => removePlan(row.plan.id)} title={t('removePlan')}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="candy-plan-status">
                        <span>{candyPlanModeLabel(row.plan, language)}</span>
                        <strong>{candyPlanResultLabel(row.plan, row.budget, language)}</strong>
                      </div>
                      <div className="score-mini-grid candy-plan-metrics">
                        <Metric label={candyPlanPlannedCostLabel(row.plan, language)} value={`${countWithUnit(formatNumber(row.target.usedCandy), 'pieces', language)} / ${formatNumber(row.target.usedShards)}`} />
                        <Metric label={t('executionTotal')} value={`${countWithUnit(formatNumber(row.budget.usedCandy), 'pieces', language)} / ${formatNumber(row.budget.usedShards)}`} />
                        <Metric label={t('reachedLevel')} value={formatCandyLevelResult(row.budget)} />
                      </div>
                      <div className="candy-progress" aria-label={t('targetExpProgress')}>
                        <span style={{ width: progress + '%' }} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </section>
    </section>
  );
}

function candyDraftFromInput(input: CalcInput): CandyDraft {
  const species = pokemonById.get(input.speciesId) ?? firstPlayableSpecies();
  const nature = natureById.get(input.natureId);
  const currentLevel = clampNumber(input.level, 1, MAX_CANDY_LEVEL, 1);
  return normalizeCandyDraft({
    speciesId: species.id,
    currentLevel,
    currentExp: 0,
    targetLevel: nextCandyTargetLevel(currentLevel),
    expType: inferCandyExpType(species.id),
    expNature: expNatureFromModifier(nature?.exp ?? 1),
    boostMode: 'none',
    customShardMultiplier: 5,
    candyLimit: 0,
    shardLimit: 0
  });
}

function normalizeCandyDraft(value: CandyDraft): CandyDraft {
  const speciesId = pokemonById.has(value.speciesId) ? value.speciesId : firstPlayableSpecies().id;
  const expType = isCandyExpType(value.expType) ? value.expType : inferCandyExpType(speciesId);
  const currentLevel = clampNumber(value.currentLevel, 1, MAX_CANDY_LEVEL, 1);
  const targetLevel = clampNumber(value.targetLevel, currentLevel, MAX_CANDY_LEVEL, nextCandyTargetLevel(currentLevel));
  const currentExpMax = Math.max(0, expToNextLevel(currentLevel, expType) - 1);
  return {
    speciesId,
    currentLevel,
    currentExp: clampNumber(value.currentExp, 0, currentExpMax, 0),
    targetLevel,
    expType,
    expNature: isCandyExpNature(value.expNature) ? value.expNature : 'neutral',
    boostMode: isCandyBoostMode(value.boostMode) ? value.boostMode : 'none',
    customShardMultiplier: clampNumber(value.customShardMultiplier, 1, 20, 5),
    candyLimit: clampNumber(value.candyLimit, 0, 99999, 0),
    shardLimit: clampNumber(value.shardLimit, 0, 999999999, 0)
  };
}

function nextCandyTargetLevel(level: number) {
  if (level < 30) {
    return 30;
  }
  if (level < 50) {
    return 50;
  }
  if (level < 60) {
    return 60;
  }
  return MAX_CANDY_LEVEL;
}

function isCandyExpType(value: number): value is CandyExpType {
  return CANDY_EXP_TYPES.some((type) => type.id === value);
}

function isCandyExpNature(value: string): value is CandyExpNature {
  return CANDY_EXP_NATURES.some((nature) => nature.id === value);
}

function isCandyBoostMode(value: string): value is CandyBoostMode {
  return CANDY_BOOST_MODES.some((mode) => mode.id === value);
}

function levelRangeLabel(fromLevel: number, toLevel: number, language: Language) {
  return language === 'en' ? `Lv${fromLevel} to Lv${toLevel}` : `Lv${fromLevel} から Lv${toLevel}`;
}

function candyExpTypeLabel(expType: CandyExpType, language: Language) {
  return localizedCandyExpTypeLabel(expType, language);
}

function candyNatureLabel(expNature: CandyExpNature, language: Language) {
  return localizedCandyNatureLabel(expNature, language);
}

function candyBoostLabel(boostMode: CandyBoostMode, language: Language) {
  return localizedCandyBoostLabel(boostMode, language);
}

function candyPlanMeta(plan: CandyPlanInput, language: Language) {
  return (
    candyPlanModeLabel(plan, language) +
    ' / ' +
    candyExpTypeLabel(plan.expType, language) +
    ' / ' +
    candyNatureLabel(plan.expNature, language) +
    ' / ' +
    candyBoostLabel(plan.boostMode, language)
  );
}

function candyPlanModeLabel(plan: CandyPlanInput, language: Language) {
  if (plan.mode === 'budget') {
    return language === 'en'
      ? 'Budget ' + countWithUnit(formatNumber(plan.candyLimit ?? 0), 'pieces', language)
      : '手持ち消費 ' + countWithUnit(formatNumber(plan.candyLimit ?? 0), 'pieces', language);
  }
  return (language === 'en' ? 'Target ' : '目標 ') + 'Lv' + plan.targetLevel;
}

function candyPlanPlannedCostLabel(plan: CandyPlanInput, language: Language) {
  return plan.mode === 'budget' ? translate(language, 'plannedUse') : translate(language, 'untilTarget');
}

function candyPlanResultLabel(plan: CandyPlanInput, result: CandySimulationResult, language: Language) {
  if (plan.mode === 'budget' && result.stoppedBy === 'candy') {
    return translate(language, 'usedAsPlanned');
  }
  return candyStoppedByLabel(result, language);
}

function formatCandyCurrentLevel(draft: CandyDraft) {
  if (draft.currentLevel >= MAX_CANDY_LEVEL) {
    return 'Lv' + MAX_CANDY_LEVEL;
  }
  return 'Lv' + draft.currentLevel + ' +' + formatNumber(draft.currentExp) + '/' + formatNumber(expToNextLevel(draft.currentLevel, draft.expType));
}

function formatCandyLevelResult(result: CandySimulationResult) {
  if (result.finalLevel >= MAX_CANDY_LEVEL) {
    return 'Lv' + MAX_CANDY_LEVEL;
  }
  return 'Lv' + result.finalLevel + ' +' + formatNumber(result.finalExp) + '/' + formatNumber(result.expToNext);
}

function formatCandyShardBudget(result: CandySimulationResult, shardLimit: number, language: Language) {
  return formatNumber(result.usedShards) + (shardLimit > 0 ? ' / ' + formatNumber(shardLimit) : '');
}

function candyStoppedByLabel(result: CandySimulationResult, language: Language) {
  if (result.finalLevel >= MAX_CANDY_LEVEL) {
    return translate(language, 'levelCap');
  }
  if (result.stoppedBy === 'target') {
    return translate(language, 'targetReached');
  }
  if (result.stoppedBy === 'candy') {
    return translate(language, 'outOfCandy');
  }
  if (result.stoppedBy === 'shards') {
    return translate(language, 'outOfShards');
  }
  return translate(language, 'levelCap');
}

function candyProgressPercent(target: CandySimulationResult, budget: CandySimulationResult) {
  if (target.neededExp <= 0 || budget.targetReached) {
    return 100;
  }
  return Math.max(0, Math.min(100, (budget.gainedExp / target.neededExp) * 100));
}

function HowToPanel() {
  const { language, t } = useI18n();

  if (language === 'en') {
    return (
      <section className="panel howto">
        <div className="panel-heading">
          <h2>{t('howtoTitle')}</h2>
          <span>{t('howtoSubtitle')}</span>
        </div>

        <div className="howto-grid">
          <section className="howto-section">
            <h3>1. Check an individual Pokemon</h3>
            <div className="howto-flow" aria-label="Expected tab flow">
              <div>Input</div>
              <span />
              <div>Modifiers</div>
              <span />
              <div>Result</div>
            </div>
            <ol>
              <li>Choose a Pokemon in the Expected tab. The search box matches partial names.</li>
              <li>Enter level, skill level, ingredients, nature, and subskills.</li>
              <li>Set field bonus, energy mode, favorite berry, camp, and EX field modifiers.</li>
              <li>Read total strength and the berry, ingredient, skill, and detail breakdowns.</li>
            </ol>
            <p>
              <strong>Morning pillow x1</strong> assumes daytime production starts at 150% energy. <strong>Always 80+</strong> is also useful as an approximation for maintaining high energy.
            </p>
          </section>

          <section className="howto-section">
            <h3>2. Read the individual distribution</h3>
            <div className="howto-rank-diagram" aria-label="How to read the distribution rank">
              <div className="rank-axis">
                <span>Lower</span>
                <i />
                <b>Current</b>
                <span>Upper</span>
              </div>
              <div className="rank-caption">
                <span>Same ingredients</span>
                <span>Fixed level</span>
                <span>Same selection rules</span>
              </div>
            </div>
            <ol>
              <li>Open Individual Distribution on the right side of the Expected tab.</li>
              <li>Select a fixed Lv30, Lv50, Lv60, or Lv70 evaluation level.</li>
              <li>The current ingredient pattern is fixed, so AAA is compared against the AAA population.</li>
              <li>Current uses your nature and subskills; population mean is the random individual average.</li>
              <li>Top % is the share of the population that is at least as good as the current individual.</li>
            </ol>
          </section>

          <section className="howto-section">
            <h3>3. Use history</h3>
            <ol>
              <li>Save a result after the input is ready.</li>
              <li>Click a history row to restore that Pokemon input.</li>
              <li>Use the trash button to delete unwanted rows.</li>
              <li>Add current or historical Pokemon to the Team tab for team output.</li>
            </ol>
          </section>

          <section className="howto-section">
            <h3>4. Check team output</h3>
            <div className="howto-team-diagram" aria-label="Team productivity structure">
              <div className="team-slots">
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
                <span>5</span>
              </div>
              <div className="team-output">
                <strong>Daily</strong>
                <strong>Whistle</strong>
                <strong>Tasty Chance</strong>
              </div>
            </div>
            <ol>
              <li>Add up to five Pokemon in the Team tab.</li>
              <li>Set field bonus, energy mode, and camp for the team.</li>
              <li>EX field modifiers are configured per team card.</li>
              <li>Review total daily output, each member's breakdown, and Helper Whistle gain.</li>
            </ol>
          </section>

          <section className="howto-section">
            <h3>5. Check Helper Whistle</h3>
            <ol>
              <li>Enter the number of Helper Whistles.</li>
              <li>The tool shows the team and member gains for three hours at maximum energy efficiency.</li>
              <li>Main skills, Good Camp, EX speed, and EX ingredient +1 are not included for whistles.</li>
            </ol>
          </section>

          <section className="howto-section">
            <h3>6. Check Tasty Chance</h3>
            <div className="howto-cooking-diagram" aria-label="Weekly Tasty Chance score distribution">
              <span style={{ height: '28%' }} />
              <span style={{ height: '48%' }} />
              <span style={{ height: '76%' }} />
              <span style={{ height: '100%' }} />
              <span style={{ height: '62%' }} />
              <span style={{ height: '38%' }} />
              <span style={{ height: '20%' }} />
            </div>
            <ol>
              <li>Tasty Chance S users on the team are detected automatically.</li>
              <li>Enter the in-game base meal score (including the current recipe level, capped at Lv70) to simulate 21 meals across one week.</li>
              <li>Manual mode lets you enter triggers per day and effect percent directly.</li>
            </ol>
          </section>

          <section className="howto-section">
            <h3>7. Use the candy simulator</h3>
            <ol>
              <li>Enter current level, current EXP, target level, EXP type, EXP nature, and boost type.</li>
              <li>The right side shows candy and dream shard cost to reach the target.</li>
              <li>Use Candy Owned and Shards Owned to see the reachable level from current resources.</li>
              <li>Multi-Pokemon Plans apply plans from top to bottom until shared shards run out.</li>
            </ol>
          </section>
        </div>

        <div className="howto-note">
          <strong>{t('premise')}</strong>
          <p>This calculator is for comparing expected value, selection quality, score attack output, and training plans. Unknown game mechanics and event modifiers are reflected only where they are explicit in the tool.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel howto">
      <div className="panel-heading">
        <h2>使い方</h2>
        <span>期待値・個体値・チーム評価・育成計画の読み方</span>
      </div>

      <div className="howto-grid">
        <section className="howto-section">
          <h3>1. 個体の期待値を見る</h3>
          <div className="howto-flow" aria-label="期待値タブの流れ">
            <div>入力</div>
            <span />
            <div>補正</div>
            <span />
            <div>結果</div>
          </div>
          <ol>
            <li>期待値タブでポケモン名を入力します。途中まで打つと近い候補が出ます。</li>
            <li>Lv、スキルLv、食材、性格、サブスキルを入力します。</li>
            <li>補正でフィールドボーナス、げんき条件、好みのきのみ、キャンプ、EXフィールドを設定します。</li>
            <li>右側の合計エナジー、きのみ、食材、スキル、詳細内訳を見ます。</li>
          </ol>
          <p>
            げんき条件の <strong>朝イチ枕1個</strong> は、日中をげんき150%スタートとして計算します。
            <strong>常に80以上</strong> は、枕を複数使うような高げんき維持の近似にも使えます。
          </p>
        </section>

        <section className="howto-section">
          <h3>2. 個体値分布を見る</h3>
          <div className="howto-rank-diagram" aria-label="個体値分布の読み方">
            <div className="rank-axis">
              <span>下位</span>
              <i />
              <b>現在個体</b>
              <span>上位</span>
            </div>
            <div className="rank-caption">
              <span>同じ食材構成</span>
              <span>同じ固定Lv</span>
              <span>同じ厳選条件</span>
            </div>
          </div>
          <ol>
            <li>期待値タブ右側の個体値分布を開きます。</li>
            <li>Lv30/50/60/70の固定Lvを選びます。厳選評価は入力Lvそのものではなく、この固定Lvに投影します。</li>
            <li>食材構成は現在入力の構成で固定されます。AAA個体はAAAの母集団内で評価されます。</li>
            <li>現在個体は入力した性格・サブスキルでの期待値、母集団平均は同条件のランダム個体の平均です。</li>
            <li>上位%は、その母集団で現在個体以上の個体が出る割合です。</li>
          </ol>
          <p>
            <strong>おてつだいボーナスをチーム価値込みで評価</strong> をONにすると、おてボ持ちに他4匹分の速度価値を足して評価します。
            <strong>金固定</strong> はフレンドレベル等で先頭サブスキル枠が金固定になる母集団を指定します。
          </p>
        </section>

        <section className="howto-section">
          <h3>3. 履歴を使う</h3>
          <ol>
            <li>入力が固まったら履歴に保存します。</li>
            <li>履歴をクリックすると、その個体の入力状態に戻ります。</li>
            <li>不要な履歴はゴミ箱ボタンで削除できます。</li>
            <li>チーム評価に使う個体は、現在入力または履歴からチームへ追加します。</li>
          </ol>
        </section>

        <section className="howto-section">
          <h3>4. チーム生産性を見る</h3>
          <div className="howto-team-diagram" aria-label="チーム生産性の構成">
            <div className="team-slots">
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
              <span>5</span>
            </div>
            <div className="team-output">
              <strong>チーム日産</strong>
              <strong>ホイッスル</strong>
              <strong>料理チャンス</strong>
            </div>
          </div>
          <ol>
            <li>チームタブで最大5匹を追加します。</li>
            <li>チーム画面のフィールドボーナス、げんき条件、キャンプを設定します。</li>
            <li>EXフィールド補正は全体設定ではなく、各チームカードで個別に設定します。</li>
            <li>日産の合計、各メンバーの内訳、ホイッスル使用時の増分を見ます。</li>
          </ol>
          <p>
            チーム内のおてつだいボーナスは、解放済みサブスキルから自動集計します。本人のおてボ5%は本人のサブスキルとして効き、
            他メンバー分だけが追加の「他のおてボ数」として入ります。
          </p>
        </section>

        <section className="howto-section">
          <h3>5. ホイッスルを見る</h3>
          <ol>
            <li>おてつだいホイッスル欄の使用数を入力します。</li>
            <li>最大げんき効率の3時間分として、チーム全体と各メンバーの増分を表示します。</li>
            <li>ホイッスルではメインスキル、いいキャンプ、EX速度、EX食材+1は反映しません。</li>
          </ol>
        </section>

        <section className="howto-section">
          <h3>6. 料理チャンスを見る</h3>
          <div className="howto-cooking-diagram" aria-label="料理チャンスの週スコア分布">
            <span style={{ height: '28%' }} />
            <span style={{ height: '48%' }} />
            <span style={{ height: '76%' }} />
            <span style={{ height: '100%' }} />
            <span style={{ height: '62%' }} />
            <span style={{ height: '38%' }} />
            <span style={{ height: '20%' }} />
          </div>
          <ol>
            <li>チーム内の料理チャンスS持ちは自動検出されます。</li>
            <li>料理素点（現在のレシピLvを反映したゲーム内表示値。レシピLv上限70）を入力すると、1週間21食の料理スコア分布をMonte Carloで表示します。</li>
            <li>手入力に切り替えると、発動回数/日と効果量%を直接指定できます。</li>
          </ol>
          <p>
            平日10%、日曜30%を基礎大成功率とし、料理チャンスは最大+70%までスタック、大成功時にスタックを0へ戻す近似です。
            料理チャンス持ちを途中で引っ込める運用はまだ扱っていません。
          </p>
        </section>

        <section className="howto-section">
          <h3>7. アメシミュレータを見る</h3>
          <ol>
            <li>アメタブ上段の「目標までのコスト」に現在Lv、Lv内EXP、目標Lv、経験値タイプ、EXP補正、ブースト種類を入れます。</li>
            <li>右側の必要アメと必要かけらが、そのLvまで育てるためのコストです。</li>
            <li>下段の「手持ちで到達できるLv」には所持アメと所持かけらを入れます。所持かけら0は無制限として扱います。</li>
            <li>複数個体育成では、目標までのプランを追加すると、上から順に目標Lvまで育て、共通所持かけらが尽きた時点で止まります。</li>
            <li>手持ち消費のプランを追加すると、その個体には指定した所持アメ数まで使う計画として扱います。</li>
          </ol>
        </section>
      </div>

      <div className="howto-note">
        <strong>前提</strong>
        <p>
          このツールは厳選・スコアアタックの比較を目的にした期待値計算器です。ゲーム内の未確定仕様やイベント補正は、分かっている範囲だけを明示的に反映しています。
        </p>
      </div>
    </section>
  );
}


function metricUnitSuffix(metricId: string, language: Language) {
  const unit = localizedMetricUnit(metricId, language);
  return language === 'en' && unit ? ` ${unit}` : unit;
}

function distributionNoteText(pattern: string, activeSubskillCount: number, language: Language) {
  if (language === 'en') {
    return `The Monte Carlo comparison fixes ingredient pattern ${pattern}. Only the first ${activeSubskillCount} selected subskills are counted, and skill level follows the current input. Current value is this individual's expected value; population mean is the random individual average under the same conditions. Top % is the share of the population at least as good as the current individual. Gold lock fixes gold subskills from the first slot, and team value adds four teammates worth of speed value to Helping Bonus owners.`;
  }
  return `食材構成${pattern}に固定して性格・サブスキルをMonte Carlo比較します。サブスキルは選択順の先頭${activeSubskillCount}個だけを反映し、スキルLvは現在入力に合わせます。表示値は現在個体の期待値、母集団平均は同条件のランダム個体の平均です。上位%は母集団内で現在個体以上の個体が出る割合です。金固定は先頭枠から指定数だけ金スキル確定として母集団を作ります。おてボ価値込みでは、おてつだいボーナス持ちに他4匹分の速度価値を加えます。`;
}

function distributionWarningText(selectedCount: number, level: number, activeCount: number, language: Language) {
  if (language === 'en') {
    return `You selected ${selectedCount} subskills. Matching the Lv${level} unlocked slot count of ${activeCount} makes the comparison more stable.`;
  }
  return `現在の選択サブスキル数は${selectedCount}個です。Lv${level}評価の解放枠${activeCount}個に合わせると比較が安定します。`;
}

function distributionUnavailableText(reason: string | undefined, language: Language) {
  if (language === 'ja') {
    return reason ?? 'この条件の分布はまだありません。';
  }
  if (!reason) {
    return 'No distribution is available for this condition yet.';
  }
  return 'No distribution is available because this condition is outside the supported baseline.';
}

function DistributionPanel({ input, species }: { input: CalcInput; species: PokemonSpecies }) {
  const { language, t } = useI18n();
  const [evaluationLevel, setEvaluationLevel] = useState(60);
  const [isExpanded, setIsExpanded] = useState(() => loadDistributionVisibility());
  const [helpingBonusTeamValue, setHelpingBonusTeamValue] = useState(false);
  const [goldFixedSlots, setGoldFixedSlots] = useState(0);

  useEffect(() => {
    localStorage.setItem(DISTRIBUTION_VISIBILITY_STORAGE_KEY, isExpanded ? 'true' : 'false');
  }, [isExpanded]);

  const activeSubskillCount = activeSubskillCountAtLevel(evaluationLevel);
  const evaluationInput = useMemo(
    () =>
      normalizeInput(
        {
          ...input,
          level: evaluationLevel,
          subskillIds: input.subskillIds.slice(0, activeSubskillCount)
        },
        species
      ),
    [activeSubskillCount, evaluationLevel, input, species]
  );
  const evaluationResultInput = useMemo(
    () =>
      normalizeInput(
        {
          ...evaluationInput,
          helpingBonusCount: helpingBonusTeamValue && hasActiveSubskill(evaluationInput, 'Helping Bonus') ? 4 : evaluationInput.helpingBonusCount
        },
        species
      ),
    [evaluationInput, helpingBonusTeamValue, species]
  );
  const evaluationResult = useMemo(() => calculate(evaluationResultInput), [evaluationResultInput]);
  const analysis = useMemo(
    () =>
      isExpanded
        ? analyzeDistribution(evaluationResult, evaluationInput, species, { helpingBonusTeamValue, goldFixedSlots })
        : null,
    [evaluationInput, evaluationResult, goldFixedSlots, helpingBonusTeamValue, isExpanded, species]
  );
  const ingredientPattern = ingredientPatternLabel(evaluationInput, species, evaluationLevel);

  return (
    <section className={`panel distribution ${isExpanded ? '' : 'collapsed'}`}>
      <div className="panel-heading">
        <h2>
          <BarChart3 size={18} />
          {t('distribution')}
        </h2>
        <button
          type="button"
          className="secondary-button compact-button"
          onClick={() => setIsExpanded((current) => !current)}
          title={isExpanded ? t('hideDistribution') : t('showDistribution')}
        >
          {isExpanded ? <EyeOff size={16} /> : <Eye size={16} />}
          {isExpanded ? t('hide') : t('show')}
        </button>
      </div>
      {!isExpanded ? null : (
        <>
          <div className="level-tabs" aria-label={t('distributionLevelAria')}>
            {DISTRIBUTION_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                className={evaluationLevel === level ? 'active' : ''}
                onClick={() => setEvaluationLevel(level)}
              >
                Lv{level}
              </button>
            ))}
          </div>
          <label className="check-row distribution-option">
            <input
              type="checkbox"
              checked={helpingBonusTeamValue}
              onChange={(event) => setHelpingBonusTeamValue(event.target.checked)}
            />
            <span>{t('helpingBonusTeamValue')}</span>
          </label>
          <div className="field distribution-select">
            <label htmlFor="gold-fixed-slots">{t('friendLevelGold')}</label>
            <select id="gold-fixed-slots" value={goldFixedSlots} onChange={(event) => setGoldFixedSlots(Number(event.target.value))}>
              <option value={0}>{t('noGoldLock')}</option>
              <option value={1}>{t('firstGoldLock')}</option>
              <option value={2}>{t('firstTwoGoldLock')}</option>
              <option value={3}>{t('firstThreeGoldLock')}</option>
            </select>
          </div>
          {!analysis ? (
            <div className="distribution-empty">
              <p>{t('distributionLoading')}</p>
              <span>{pokemonName(species, language)} Lv30/50/60/70{t('distributionUsesMonteCarlo')}</span>
            </div>
          ) : analysis.scenario ? (
            <>
              <div className="distribution-meta">
                <span>{t('target')}: {pokemonName(species, language)} Lv{analysis.scenario.level}</span>
                <span>{t('skillLevel')}: {analysis.scenario.skillLevel}</span>
                <span>{t('favoriteBerryMeta')}: {analysis.scenario.favoriteBerry ? 'on' : 'off'}</span>
                <span>{t('ingredientPattern')}: {analysis.scenario.ingredientPattern ?? ingredientPattern}</span>
                <span>{t('helpingBonusValue')}: {analysis.scenario.helpingBonusTeamValue ? t('teamIncluded') : t('selfOnly')}</span>
                <span>{t('goldLock')}: {analysis.scenario.goldFixedSlots ? countWithUnit(analysis.scenario.goldFixedSlots, 'pieces', language) : t('none')}</span>
                <span>{t('unlockedSubskills')}: {analysis.scenario.activeSubskillCount}</span>
                <span>{t('samples')}: {analysis.scenario.sampleSize.toLocaleString(localeFor(language))}</span>
              </div>
              <div className="rank-list">
                {analysis.ranks.map((rank) => (
                  <div key={rank.id} className="rank-item">
                    <div>
                      <strong>{localizedMetricLabel(rank.id, language)}</strong>
                      <span>
                        {t('currentIndividual')} {formatNumber(rank.value, rank.precision)}
                        {metricUnitSuffix(rank.id, language)} / {t('populationMean')} {formatNumber(rank.mean, rank.precision)}
                        {metricUnitSuffix(rank.id, language)}
                      </span>
                    </div>
                    <div className="rank-gauge" aria-label={`${localizedMetricLabel(rank.id, language)} ${t('top')} ${formatNumber(rank.topPercent, 1)}%`}>
                      <span style={{ width: `${Math.max(3, Math.min(100, rank.percentile))}%` }} />
                    </div>
                    <b>{t('top')} {formatNumber(rank.topPercent, 1)}%</b>
                    <DistributionShapePlot rank={rank} />
                  </div>
                ))}
              </div>
              <p className="distribution-note">
                {distributionNoteText(analysis.scenario.ingredientPattern ?? ingredientPattern, analysis.scenario.activeSubskillCount, language)}
              </p>
              {input.subskillIds.length !== analysis.scenario.activeSubskillCount ? (
                <p className="distribution-warning">
                  {distributionWarningText(input.subskillIds.length, analysis.scenario.level, analysis.scenario.activeSubskillCount, language)}
                </p>
              ) : null}
            </>
          ) : (
            <div className="distribution-empty">
              <p>{distributionUnavailableText(analysis.unavailableReasons[0], language)}</p>
              <span>{t('distributionSupported')}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function DistributionShapePlot({ rank }: { rank: ReturnType<typeof analyzeDistribution>['ranks'][number] }) {
  const { language, t } = useI18n();
  const shape = rank.shape;
  const iqrWidth = Math.max(1, shape.p75Percent - shape.p25Percent);

  return (
    <div className="shape-plot" aria-label={`${localizedMetricLabel(rank.id, language)} distribution`}>
      <div className="shape-bars" aria-hidden="true">
        {shape.bins.map((bin) => (
          <span key={bin.id} style={{ height: `${bin.height * 100}%` }} />
        ))}
        <i className="shape-iqr" style={{ left: `${shape.p25Percent}%`, width: `${iqrWidth}%` }} />
        <i className="shape-median" style={{ left: `${shape.medianPercent}%` }} />
        <i className="shape-marker" style={{ left: `${shape.markerPercent}%` }} />
      </div>
      <div className="shape-scale">
        <span>{formatNumber(shape.min, rank.precision)}</span>
        <span>{t('median')} {formatNumber(shape.median, rank.precision)}</span>
        <span>{formatNumber(shape.max, rank.precision)}</span>
      </div>
    </div>
  );
}

interface ScoreToolProps {
  currentInput: CalcInput;
  history: HistoryEntry[];
  team: TeamSlot[];
  settings: ScoreSettings;
  onAddCurrent: () => void;
  onAddHistory: (entry: HistoryEntry) => void;
  onRemoveSlot: (id: string) => void;
  onUpdateSlot: (id: string, patch: Partial<CalcInput>) => void;
  onSettingsChange: (patch: Partial<ScoreSettings>) => void;
}

function WhistleSimulator({
  currentInput,
  history,
  team,
  settings,
  onAddCurrent,
  onAddHistory,
  onRemoveSlot,
  onUpdateSlot,
  onSettingsChange
}: ScoreToolProps) {
  const { language, t } = useI18n();
  const { whistleCount, fieldBonus, goodCamp, energyMode } = settings;
  const [cookingMode, setCookingMode] = useState<'team' | 'manual'>('team');
  const [manualCookingTriggers, setManualCookingTriggers] = useState(1);
  const [manualCookingChance, setManualCookingChance] = useState(6);
  const [cookingTarget, setCookingTarget] = useState(8);
  const [baseCookingScore, setBaseCookingScore] = useState(10_000);
  const dailyRows = useMemo(
    () =>
      team.map((slot) => {
        const preparedInput = prepareTeamInput(slot.input, team, { fieldBonus, goodCamp, energyMode });
        return {
          slot,
          input: preparedInput,
          result: calculate(preparedInput)
        };
      }),
    [energyMode, fieldBonus, goodCamp, team]
  );
  const whistleRows = useMemo(
    () =>
      team.map((slot) => {
        const preparedInput = prepareTeamInput(slot.input, team, { fieldBonus, goodCamp: false });
        return {
          slot,
          result: calculateWhistle(preparedInput, whistleCount)
        };
      }),
    [fieldBonus, team, whistleCount]
  );
  const dailyAggregate = useMemo(() => summarizeCalcResults(dailyRows.map((row) => row.result)), [dailyRows]);
  const whistleAggregate = useMemo(() => summarizeWhistleResults(whistleRows.map((row) => row.result)), [whistleRows]);
  const teamCookingSources = useMemo(
    () => dailyRows.map((row) => cookingChanceSourceFor(row.input, row.result, language)).filter((source): source is CookingChanceSource => source !== null),
    [dailyRows, language]
  );
  const cookingSources = useMemo(
    () =>
      cookingMode === 'team'
        ? teamCookingSources
        : [
            {
              id: 'manual',
              label: translate(language, 'manualInput'),
              triggersPerDay: manualCookingTriggers,
              chancePercent: manualCookingChance
            }
          ],
    [cookingMode, language, manualCookingChance, manualCookingTriggers, teamCookingSources]
  );
  const cookingSimulation = useMemo(
    () =>
      simulateCookingChanceWeek({
        sources: cookingSources,
        baseMealScore: baseCookingScore,
        targetSuccesses: cookingTarget,
        seed: cookingSimulationSeed(cookingSources, cookingTarget, baseCookingScore)
      }),
    [baseCookingScore, cookingSources, cookingTarget]
  );

  return (
    <section className="score-tool">
      <ScoreTeamPanel
        currentInput={currentInput}
        history={history}
        team={team}
        settings={settings}
        onAddCurrent={onAddCurrent}
        onAddHistory={onAddHistory}
        onRemoveSlot={onRemoveSlot}
        onUpdateSlot={onUpdateSlot}
        onSettingsChange={onSettingsChange}
      />

      <section className="panel score-results">
        <div className="panel-heading">
          <h2>{t('teamProductivity')}</h2>
          <span>{t('dailyAndWhistle')}</span>
        </div>
        <div className="settings-grid team-settings-grid">
          <NumberField
            label={t('fieldBonusPercent')}
            value={fieldBonus}
            min={0}
            max={MAX_FIELD_BONUS}
            onChange={(value) => onSettingsChange({ fieldBonus: value })}
          />
          <div className="field">
            <label htmlFor="team-energy-mode">{t('energy')}</label>
            <select
              id="team-energy-mode"
              value={energyMode}
              onChange={(event) => onSettingsChange({ energyMode: event.target.value as CalcInput['energyMode'] })}
            >
              <option value="normal">{t('normalEnergy')}</option>
              <option value="morningPillow">{t('morningPillow')}</option>
              <option value="constant80">{t('constant80')}</option>
            </select>
          </div>
          <label className="check-row score-check">
            <input type="checkbox" checked={goodCamp} onChange={(event) => onSettingsChange({ goodCamp: event.target.checked })} />
            <span>{t('dailyGoodCamp')}</span>
          </label>
        </div>

        {dailyRows.length === 0 ? (
          <ScoreEmpty />
        ) : (
          <>
            <section className="score-section">
              <div className="section-heading">
                <h3>{t('teamDailyOutput')}</h3>
                <span>{dailyRows.length} {t('totalPokemon')}</span>
              </div>
              <div className="score-summary">
                <Metric label={t('totalEnergy')} value={formatNumber(dailyAggregate.totalEnergy)} />
                <Metric label={t('berries')} value={formatNumber(dailyAggregate.berryEnergy)} />
                <Metric label={t('ingredients')} value={formatNumber(dailyAggregate.ingredientEnergy)} />
                <Metric label={t('skill')} value={formatNumber(dailyAggregate.skillEnergy)} />
              </div>
              <IngredientBreakdownList title={t('dailyIngredients')} breakdown={dailyAggregate.ingredientBreakdown} />
              <div className="member-list compact-member-list">
                {dailyRows.map(({ slot, input: preparedInput, result }) => (
                  <div key={slot.id} className="member-result">
                    <div>
                      <strong>
                        {pokemonName(pokemonById.get(result.speciesId) ?? firstPlayableSpecies(), language)} Lv{result.level}
                      </strong>
                      <span>
                        {formatSkillTitle(preparedInput, language)} / {t('displayedHelpTime')} {formatSeconds(result.displayedFrequency)}
                      </span>
                    </div>
                    <b>{formatNumber(result.totalEnergy)}</b>
                    <div className="score-mini-grid">
                      <Metric label={t('berries')} value={formatNumber(result.berryEnergy)} />
                      <Metric label={t('ingredients')} value={formatNumber(result.ingredientEnergy)} />
                      <Metric label={t('skill')} value={`${formatNumber(result.skillEnergy)} / ${countWithUnit(formatNumber(result.expectedSkillTriggers, 2), 'times', language)}`} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <CookingChancePanel
              mode={cookingMode}
              onModeChange={setCookingMode}
              teamSources={teamCookingSources}
              manualTriggers={manualCookingTriggers}
              onManualTriggersChange={setManualCookingTriggers}
              manualChance={manualCookingChance}
              onManualChanceChange={setManualCookingChance}
              target={cookingTarget}
              onTargetChange={setCookingTarget}
              baseScore={baseCookingScore}
              onBaseScoreChange={setBaseCookingScore}
              simulation={cookingSimulation}
            />

            <section className="score-section">
              <div className="section-heading">
                <h3>{t('whistle')}</h3>
                <span>{countWithUnit(whistleRows.length, 'pokemon', language)} x {countWithUnit(whistleCount, 'pieces', language)} / {language === 'en' ? '3 hours at max energy efficiency' : '最大げんき効率の3時間分'}</span>
              </div>
              <div className="score-summary">
                <div className="metric metric-control">
                  <span>{t('whistleUseCount')}</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={whistleCount}
                    onChange={(event) => onSettingsChange({ whistleCount: Number(event.target.value) })}
                  />
                </div>
                <Metric label={t('totalEnergy')} value={formatNumber(whistleAggregate.totalEnergy)} />
                <Metric label={t('berries')} value={`${formatNumber(whistleAggregate.berryEnergy)} / ${countWithUnit(formatNumber(whistleAggregate.berryAmount, 0), 'pieces', language)}`} />
                <Metric label={t('ingredients')} value={formatNumber(whistleAggregate.ingredientEnergy)} />
              </div>
              <IngredientBreakdownList title={t('whistleIngredients')} breakdown={whistleAggregate.ingredientBreakdown} />
              <div className="member-list compact-member-list">
                {whistleRows.map(({ slot, result }) => (
                  <div key={slot.id} className="member-result">
                    <div>
                      <strong>
                        {pokemonName(pokemonById.get(result.speciesId) ?? firstPlayableSpecies(), language)} Lv{result.level}
                      </strong>
                      <span>
                        {berryName(berryById.get(result.berryId)!, language)} {countWithUnit(formatNumber(result.berryAmount, 0), 'pieces', language)} / {t('displayedHelpTime')} {formatSeconds(result.displayedFrequency)}
                      </span>
                    </div>
                    <b>{formatNumber(result.totalEnergy)}</b>
                    <div className="score-mini-grid">
                      <Metric label={t('berries')} value={formatNumber(result.berryEnergy)} />
                      <Metric label={t('ingredients')} value={formatNumber(result.ingredientEnergy)} />
                      <Metric label={t('helpsPerWhistle')} value={countWithUnit(formatNumber(result.helpsPerWhistle, 2), 'times', language)} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <ul className="notes">
              {teamNotes(language).map((note) => (
                <li key={note}>{localizeCalcNote(note, language)}</li>
              ))}
            </ul>
          </>
        )}
      </section>
    </section>
  );
}

function CookingChancePanel({
  mode,
  onModeChange,
  teamSources,
  manualTriggers,
  onManualTriggersChange,
  manualChance,
  onManualChanceChange,
  target,
  onTargetChange,
  baseScore,
  onBaseScoreChange,
  simulation
}: {
  mode: 'team' | 'manual';
  onModeChange: (mode: 'team' | 'manual') => void;
  teamSources: CookingChanceSource[];
  manualTriggers: number;
  onManualTriggersChange: (value: number) => void;
  manualChance: number;
  onManualChanceChange: (value: number) => void;
  target: number;
  onTargetChange: (value: number) => void;
  baseScore: number;
  onBaseScoreChange: (value: number) => void;
  simulation: ReturnType<typeof simulateCookingChanceWeek>;
}) {
  const { language, t } = useI18n();
  const maxScoreProbability = Math.max(...simulation.scoreHistogram.map((bin) => bin.probability), 0.01);
  const maxSuccessProbability = Math.max(...simulation.histogram.map((bin) => bin.probability), 0.01);

  return (
    <section className="score-section cooking-section">
      <div className="section-heading">
        <h3>{t('cookingChanceDistribution')}</h3>
        <span>{countWithUnit(simulation.weeks.toLocaleString(localeFor(language)), 'weeks', language)} Monte Carlo</span>
      </div>
      <div className="settings-grid cooking-settings-grid">
        <div className="field">
          <label htmlFor="cooking-source-mode">{t('sourceInput')}</label>
          <select id="cooking-source-mode" value={mode} onChange={(event) => onModeChange(event.target.value as 'team' | 'manual')}>
            <option value="team">{t('aggregateFromTeam')}</option>
            <option value="manual">{t('manualInput')}</option>
          </select>
        </div>
        {mode === 'manual' ? (
          <>
            <NumberField label={t('triggersPerDay')} value={manualTriggers} min={0} max={20} onChange={onManualTriggersChange} />
            <NumberField label={t('effectPercent')} value={manualChance} min={0} max={70} onChange={onManualChanceChange} />
          </>
        ) : (
          <div className="cooking-source-list">
            {teamSources.length > 0 ? (
              teamSources.map((source) => (
                <span key={source.id}>
                  {source.label}: {countWithUnit(formatNumber(source.triggersPerDay, 2), 'times', language)}/{countWithUnit(1, 'days', language)} x {formatNumber(source.chancePercent, 1)}%
                </span>
              ))
            ) : (
              <span>{t('noCookingChance')}</span>
            )}
          </div>
        )}
        <NumberField label={t('baseMealScore')} value={baseScore} min={0} max={999999} onChange={onBaseScoreChange} />
        <NumberField label={t('targetCritsWeek')} value={target} min={0} max={21} onChange={onTargetChange} />
      </div>

      <div className="score-summary">
        <Metric label={t('meanWeeklyMealScore')} value={formatNumber(simulation.meanScore, 0)} />
        <Metric label={t('median')} value={formatNumber(simulation.medianScore, 0)} />
        <Metric label="p10-p90" value={`${formatNumber(simulation.p10Score, 0)}-${formatNumber(simulation.p90Score, 0)}`} />
        <Metric label={t('scoreRatio')} value={formatPercent(simulation.energyRatio - 1, 2)} />
      </div>
      <div className="distribution-meta cooking-meta">
        <span>{t('expectedTriggers')} {countWithUnit(formatNumber(simulation.totalTriggersPerDay, 2), 'times', language)}/{countWithUnit(1, 'days', language)}</span>
        <span>{t('meanCrits')} {countWithUnit(formatNumber(simulation.meanSuccesses, 2), 'times', language)}/{countWithUnit(1, 'weeks', language)}</span>
        <span>{language === 'en' ? `${target}${t('orMore')}` : `週${target}回以上`} {formatPercent(simulation.probabilityAtLeastTarget)}</span>
        <span>{t('cookingMultiplier')} {formatNumber(simulation.meanEnergyMultiplier, 2)}x</span>
      </div>
      <div className="score-histogram" aria-label={t('weeklyMealEnergyAria')}>
        {simulation.scoreHistogram.map((bin) => (
          <div key={bin.id}>
            <span style={{ height: `${Math.max(2, (bin.probability / maxScoreProbability) * 100)}%` }} />
            <small>{formatNumber((bin.min + bin.max) / 2, 0)}</small>
          </div>
        ))}
      </div>
      <div className="cooking-histogram" aria-label={t('weeklyMealCritAria')}>
        {simulation.histogram.map((bin) => (
          <div key={bin.successes} className={bin.successes >= target ? 'target-bin' : ''}>
            <span style={{ height: `${Math.max(2, (bin.probability / maxSuccessProbability) * 100)}%` }} />
            <small>{bin.successes}</small>
          </div>
        ))}
      </div>
      <ul className="notes">
        {cookingNotes(language).map((note) => (
          <li key={note}>{localizeCalcNote(note, language)}</li>
        ))}
      </ul>
    </section>
  );
}

function ScoreTeamPanel({
  currentInput,
  history,
  team,
  onAddCurrent,
  onAddHistory,
  onRemoveSlot,
  onUpdateSlot
}: ScoreToolProps) {
  const { language, t } = useI18n();
  const isFull = team.length >= MAX_SCORE_TEAM;
  return (
    <section className="panel team-panel">
      <div className="panel-heading">
        <h2>{t('team')}</h2>
        <span>{team.length}/{MAX_SCORE_TEAM}</span>
      </div>
      <button type="button" className="primary-button add-team-button" onClick={onAddCurrent} disabled={isFull}>
        <Plus size={18} />
        {t('addCurrentInput')}
      </button>
      <p className="score-note">{t('teamNote')}</p>
      <div className="team-list">
        {team.map((slot) => (
          <TeamSlotCard key={slot.id} slot={slot} onRemove={onRemoveSlot} onUpdate={onUpdateSlot} />
        ))}
      </div>
      {history.length > 0 ? (
        <>
          <h3 className="team-subheading">{t('addFromHistory')}</h3>
          <div className="team-picks">
            {history.map((entry) => (
              <button key={entry.id} type="button" disabled={isFull} onClick={() => onAddHistory(entry)}>
                <strong>
                  {pokemonName(pokemonById.get(entry.input.speciesId) ?? firstPlayableSpecies(), language)} Lv{entry.input.level}
                </strong>
                <span>
                  {formatNatureName(entry.input.natureId, language)} / {formatShortSubskills(entry.input, language)}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <div className="current-input-chip">
        <span>{t('currentInput')}</span>
        <strong>{formatTeamInputTitle(currentInput, language)}</strong>
      </div>
    </section>
  );
}

function TeamSlotCard({
  slot,
  onRemove,
  onUpdate
}: {
  slot: TeamSlot;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<CalcInput>) => void;
}) {
  const { language, t } = useI18n();
  const input = slot.input;
  const species = pokemonById.get(input.speciesId);
  if (!species) {
    return null;
  }
  const isExpertMode = input.exMode || input.mapMode !== 'normal';
  return (
    <article className="team-card">
      <div className="team-card-main">
        <strong>{formatTeamInputTitle(input, language)}</strong>
        <span>
          {formatNatureName(input.natureId, language)} / {formatSkillTitle(input, language)}
        </span>
        <HistorySubskillTags input={input} />
      </div>
      <div className="team-card-actions">
        <label className="check-row compact-check" title={isExpertMode ? t('wakakusaExTitle') : undefined}>
          <input
            type="checkbox"
            checked={input.favoriteBerry}
            disabled={isExpertMode}
            onChange={(event) => onUpdate(slot.id, { favoriteBerry: event.target.checked })}
          />
          <span>{t('favoriteShort')}</span>
        </label>
        <button type="button" className="icon-button" onClick={() => onRemove(slot.id)} title={t('removeFromTeam')}>
          <X size={17} />
        </button>
      </div>
      <div className="team-ex-controls">
        <div className="field compact-field">
          <label>{t('exField')}</label>
          <select
            value={input.mapMode}
            onChange={(event) => onUpdate(slot.id, { mapMode: event.target.value as CalcInput['mapMode'], exMode: false })}
          >
            <option value="normal">{t('normalField')}</option>
            <option value="wakakusaEx">{t('wakakusaEx')}</option>
            <option value="cyanEx">{t('cyanEx')}</option>
          </select>
        </div>
        {isExpertMode ? (
          <div className="team-ex-grid">
            <div className="field compact-field">
              <label>{t('exBerry')}</label>
              <select
                value={input.exBerryMode}
                onChange={(event) => onUpdate(slot.id, { exBerryMode: event.target.value as CalcInput['exBerryMode'], exMode: false })}
              >
                <option value="main">{t('mainMatch')}</option>
                <option value="sub">{t('subMatch')}</option>
                <option value="none">{t('noMatchSpeedDown')}</option>
              </select>
            </div>
            <div className="field compact-field">
              <label>{t('exBonus')}</label>
              <select
                value={input.exBonusMode}
                onChange={(event) => onUpdate(slot.id, { exBonusMode: event.target.value as CalcInput['exBonusMode'], exMode: false })}
              >
                <option value="berry">{t('berry24x')}</option>
                <option value="ingredient">{t('ingredientPlus')}</option>
                <option value="skill">{t('skill125x')}</option>
              </select>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ScoreEmpty() {
  const { t } = useI18n();
  return (
    <div className="score-empty">
      <p>{t('teamEmpty')}</p>
      <span>{t('teamEmptyHint')}</span>
    </div>
  );
}

function IngredientBreakdownList({ title, breakdown }: { title: string; breakdown: IngredientBreakdown[] }) {
  const { language, t } = useI18n();
  return (
    <div className="breakdown score-breakdown">
      <h3>{title}</h3>
      {breakdown.length > 0 ? (
        <ul>
          {breakdown.map((item) => {
            const ingredient = ingredientById.get(item.ingredientId);
            return (
              <li key={item.ingredientId}>
                <span>{ingredient ? ingredientName(ingredient, language) : item.ingredientId}</span>
                <strong>
                  {countWithUnit(formatNumber(item.amount, 1), 'pieces', language)} / {formatNumber(item.energy)}
                </strong>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>{t('noIngredients')}</p>
      )}
    </div>
  );
}

function ResultSummary({ result, species }: { result: CalcResult; species: PokemonSpecies }) {
  const { language, t } = useI18n();
  const berry = berryById.get(species.berryId);
  const skill = mainSkillById.get(species.skillId);
  return (
    <section className="panel summary">
      <div className="summary-title">
        <div>
          <h2>{pokemonName(species, language)}</h2>
          <p>
            {localizedSpecialtyLabel(species.specialty, language)} / {berry ? berryName(berry, language) : species.berryId} / {skill ? mainSkillName(skill, language) : species.skillId}
          </p>
        </div>
        <strong>{formatNumber(result.totalEnergy)}</strong>
      </div>
      <div className="stat-grid">
        <Metric label={t('berries')} value={formatNumber(result.berryEnergy)} />
        <Metric label={t('ingredients')} value={formatNumber(result.ingredientEnergy)} />
        <Metric label={t('skill')} value={formatNumber(result.skillEnergy)} />
        <Metric label={t('helping')} value={countWithUnit(formatNumber(result.helpsPerDay, 1), 'times', language)} />
      </div>
    </section>
  );
}

function ResultDetail({
  result,
  input,
  selectedHistoryId
}: {
  result: CalcResult;
  input: CalcInput;
  selectedHistoryId: string | null;
}) {
  const { language, t } = useI18n();
  const skillTitle = formatSkillTitle(input, language);
  const skillSummary = formatSkillEffectSummary(input, language);

  return (
    <section className="panel detail">
      <div className="panel-heading">
        <h2>{selectedHistoryId ? t('historyDetail') : t('currentDetail')}</h2>
        <span>{new Date(result.createdAt).toLocaleString(localeFor(language))}</span>
      </div>
      <div className="skill-info">
        <span>{t('mainSkill')}</span>
        <strong>{skillTitle}</strong>
        <p>{skillSummary}</p>
      </div>
      <div className="detail-grid">
        <Metric label={t('calculatedHelpTime')} value={formatSeconds(result.displayedFrequency)} />
        <Metric label={t('inventoryLimit')} value={`${result.inventoryLimit}`} />
        <Metric label={t('ingredientRate')} value={formatPercent(result.ingredientProbability)} />
        <Metric label={t('skillRate')} value={formatPercent(result.skillProbability)} />
        <Metric label={t('skillTriggers')} value={countWithUnit(formatNumber(result.expectedSkillTriggers, 2), 'times', language)} />
        <Metric label={t('sleepSkill')} value={`${formatNumber(result.sleepSkillTriggers ?? 0, 2)} / ${result.sleepSkillStockLimit ?? 1}`} />
        <Metric label={t('berriesPerHelp')} value={countWithUnit(formatNumber(result.berriesPerHelp, 1), 'pieces', language)} />
        <Metric label={t('sleepOverflow')} value={countWithUnit(formatNumber(result.sleepOverflowHelps ?? 0, 1), 'times', language)} />
      </div>
      <div className="breakdown">
        <h3>{t('ingredientBreakdown')}</h3>
        {result.ingredientBreakdown.length > 0 ? (
          <ul>
            {result.ingredientBreakdown.map((item) => {
              const ingredient = ingredientById.get(item.ingredientId);
              return (
                <li key={item.ingredientId}>
                  <span>{ingredient ? ingredientName(ingredient, language) : item.ingredientId}</span>
                  <strong>
                    {countWithUnit(formatNumber(item.amount, 1), 'pieces', language)} / {formatNumber(item.energy)}
                  </strong>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>{t('noUnlockedIngredients')}</p>
        )}
      </div>
      <ul className="notes">
        {result.notes.map((note) => (
          <li key={note}>{localizeCalcNote(note, language)}</li>
        ))}
      </ul>
    </section>
  );
}

function HistoryTable({
  history,
  selectedId,
  onSelect,
  onDelete,
  onDownload
}: {
  history: HistoryEntry[];
  selectedId: string | null;
  onSelect: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onDownload: () => void;
}) {
  const { language, t } = useI18n();
  return (
    <section className="panel history">
      <div className="panel-heading">
        <h2>
          <History size={18} />
          {t('latestTen')}
        </h2>
        <button type="button" className="icon-button" onClick={onDownload} title={t('exportHistoryCsv')}>
          <Download size={18} />
        </button>
      </div>
      {history.length === 0 ? (
        <p className="empty">{t('noSavedResults')}</p>
      ) : (
        <div className="history-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('dateTime')}</th>
                <th>{t('pokemon')}</th>
                <th>Lv</th>
                <th>{t('selectedNature')}</th>
                <th>{t('subskills')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr
                  key={item.id}
                  className={selectedId === item.id ? 'selected' : ''}
                  onClick={() => onSelect(item)}
                >
                  <td data-label={t('dateTime')}>
                    {new Date(item.result.createdAt).toLocaleTimeString(localeFor(language), { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td data-label={t('pokemon')}>{pokemonName(pokemonById.get(item.input.speciesId) ?? firstPlayableSpecies(), language)}</td>
                  <td data-label="Lv">{item.input.level}</td>
                  <td data-label={t('selectedNature')}>{formatNatureName(item.input.natureId, language)}</td>
                  <td data-label={t('subskills')}>
                    <HistorySubskillTags input={item.input} />
                  </td>
                  <td className="history-action-cell">
                    <button
                      type="button"
                      className="icon-button history-delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(item.id);
                      }}
                      title={t('deleteHistory')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const MATRIX_MODIFIERS = ['speed', 'ingredient', 'skill', 'energy', 'exp'];
const NEUTRAL_NATURE_IDS = ['Bashful', 'Hardy', 'Docile', 'Quirky', 'Serious'];

function NaturePicker({ value, onChange }: { value: string; onChange: (natureId: string) => void }) {
  const { language, t } = useI18n();
  const selected = natureById.get(value);

  return (
    <fieldset className="nature-matrix-fieldset">
      <legend>{t('nature')}</legend>
      <div className="nature-selected">
        <strong>{selected ? natureName(selected, language) : value}</strong>
        <span>
          {localizedModifierLabel(selected?.positiveModifier ?? 'neutral', language)}↑ / {localizedModifierLabel(selected?.negativeModifier ?? 'neutral', language)}↓
        </span>
      </div>
      <div className="nature-matrix" role="grid" aria-label={t('natureModifierAria')}>
        <div className="matrix-corner" />
        {MATRIX_MODIFIERS.map((modifier) => (
          <div key={`down-${modifier}`} className="matrix-axis down">
            {localizedModifierLabel(modifier, language)}↓
          </div>
        ))}
        {MATRIX_MODIFIERS.map((positiveModifier, rowIndex) => (
          <Fragment key={positiveModifier}>
            <div key={`up-${positiveModifier}`} className="matrix-axis up">
              {localizedModifierLabel(positiveModifier, language)}↑
            </div>
            {MATRIX_MODIFIERS.map((negativeModifier, columnIndex) => {
              const nature = natureForMatrixCell(positiveModifier, negativeModifier, rowIndex);
              const isSelected = nature?.id === value;
              return (
                <button
                  key={`${positiveModifier}-${negativeModifier}`}
                  type="button"
                  className={isSelected ? 'nature-cell selected' : 'nature-cell'}
                  onClick={() => {
                    if (nature) {
                      onChange(nature.id);
                    }
                  }}
                >
                  <strong>{nature ? natureName(nature, language) : '-'}</strong>
                  {positiveModifier === negativeModifier ? <span>{t('noModifier')}</span> : null}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </fieldset>
  );
}

function SubskillCheckboxPicker({ value, onChange }: { value: string[]; onChange: (subskillIds: string[]) => void }) {
  const { language, t } = useI18n();
  const [query, setQuery] = useState('');
  const selected = new Set(value);
  const normalizedQuery = normalizeSearchText(query);
  const subskills = useMemo(
    () =>
      dataset.subskills
        .slice()
        .sort((left, right) => subskillSortRank(left.name) - subskillSortRank(right.name) || subskillName(left, language).localeCompare(subskillName(right, language), localeFor(language)))
        .filter((subskill) => {
          if (!normalizedQuery) {
            return true;
          }
          return normalizeSearchText(`${subskill.nameJa} ${subskill.name} ${subskill.shortName} ${subskillRarityLabel(subskill.rarity, language)}`).includes(
            normalizedQuery
          );
        }),
    [language, normalizedQuery]
  );

  function toggleSubskill(subskillId: string, checked: boolean) {
    if (checked) {
      if (value.includes(subskillId) || value.length >= MAX_SUBSKILLS) {
        return;
      }
      onChange([...value, subskillId]);
      return;
    }
    onChange(value.filter((id) => id !== subskillId));
  }

  return (
    <div className="subskill-picker">
      {value.length > 0 ? (
        <div className="subskill-selected">
          {value.map((id, index) => {
            const subskill = subskillById.get(id);
            return (
              <button key={`${id}-${index}`} type="button" onClick={() => toggleSubskill(id, false)} title={t('clearSelection')}>
                <b>{index + 1}</b>
                <span>{subskill ? subskillName(subskill, language) : id}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <input
        type="search"
        value={query}
        placeholder={t('filterSubskills')}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="subskill-check-grid">
        {subskills.map((subskill) => {
          const checked = selected.has(subskill.id);
          const disabled = !checked && value.length >= MAX_SUBSKILLS;
          return (
            <label key={subskill.id} className={`subskill-option ${checked ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => toggleSubskill(subskill.id, event.target.checked)}
              />
              <span className={`rarity-badge rarity-${subskill.rarity}`}>{subskillRarityLabel(subskill.rarity, language)}</span>
              <strong>{subskillName(subskill, language)}</strong>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function HistorySubskillTags({ input }: { input: CalcInput }) {
  const { language, t } = useI18n();
  if (input.subskillIds.length === 0) {
    return <span className="history-tag muted">{t('noSubskills')}</span>;
  }

  const visibleSubskills = input.subskillIds.slice(0, 4);
  const hiddenCount = input.subskillIds.length - visibleSubskills.length;

  return (
    <div className="history-tags">
      {visibleSubskills.map((id) => {
        const subskill = subskillById.get(id);
        return (
          <span key={id} className="history-tag" title={subskill ? subskillName(subskill, language) : id}>
            {subskill ? subskillName(subskill, language) : id}
          </span>
        );
      })}
      {hiddenCount > 0 ? <span className="history-tag muted">+{hiddenCount}</span> : null}
    </div>
  );
}

function natureForMatrixCell(positiveModifier: string, negativeModifier: string, neutralOffset: number) {
  if (positiveModifier === negativeModifier) {
    const neutralNatureId = NEUTRAL_NATURE_IDS[neutralOffset % NEUTRAL_NATURE_IDS.length];
    return natureById.get(neutralNatureId) ?? dataset.natures.find((nature) => nature.positiveModifier === 'neutral');
  }
  return dataset.natures.find(
    (nature) => nature.positiveModifier === positiveModifier && nature.negativeModifier === negativeModifier
  );
}

function subskillSortRank(name: string) {
  const index = SUBSKILL_PRIORITY.indexOf(name);
  return index >= 0 ? index : SUBSKILL_PRIORITY.length;
}

function subskillRarityLabel(rarity: string, language: Language) {
  return localizedSubskillRarityLabel(rarity, language);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PokemonSearch({ speciesId, onChange }: { speciesId: string; onChange: (speciesId: string) => void }) {
  const { language, t } = useI18n();
  const selected = pokemonById.get(speciesId) ?? firstPlayableSpecies();
  const [query, setQuery] = useState(formatPokemonCandidate(selected, language));
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestions = useMemo(() => searchPokemon(query, selected.id), [query, selected.id]);

  useEffect(() => {
    setQuery(formatPokemonCandidate(selected, language));
  }, [language, selected]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function choose(pokemon: PokemonSpecies) {
    setQuery(formatPokemonCandidate(pokemon, language));
    setIsOpen(false);
    onChange(pokemon.id);
  }

  return (
    <div className="combobox">
      <label htmlFor="species-search">{t('pokemon')}</label>
      <input
        id="species-search"
        type="search"
        value={query}
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            setIsOpen(false);
            setQuery(formatPokemonCandidate(selected, language));
          }, 120);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((current) => Math.min(current + 1, Math.max(0, suggestions.length - 1)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((current) => Math.max(current - 1, 0));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            const candidate = suggestions[activeIndex] ?? suggestions[0];
            if (candidate) {
              choose(candidate);
            }
          } else if (event.key === 'Escape') {
            setIsOpen(false);
            setQuery(formatPokemonCandidate(selected, language));
          }
        }}
      />
      {isOpen && suggestions.length > 0 ? (
        <div className="suggestions" role="listbox">
          {suggestions.map((pokemon, index) => (
            <button
              key={pokemon.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'active' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(pokemon)}
            >
              <strong>{pokemonName(pokemon, language)}</strong>
              <span>{language === 'en' ? pokemon.displayNameJa : pokemon.displayName}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatPokemonCandidate(pokemon: PokemonSpecies, language: Language) {
  return pokemonCandidateName(pokemon, language);
}

function searchPokemon(query: string, selectedId: string) {
  const normalizedQuery = normalizePokemonSearch(query);
  if (!normalizedQuery) {
    return dataset.pokemon.slice(0, 12);
  }

  return dataset.pokemon
    .map((pokemon) => ({ pokemon, score: scorePokemon(pokemon, normalizedQuery, selectedId) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => a.score - b.score || a.pokemon.pokedexNumber - b.pokemon.pokedexNumber)
    .slice(0, 10)
    .map((item) => item.pokemon);
}

function scorePokemon(pokemon: PokemonSpecies, query: string, selectedId: string) {
  const terms = [
    pokemon.displayNameJa,
    pokemon.displayName,
    pokemon.name,
    pokemon.name.replace(/_/g, ' ')
  ].map(normalizePokemonSearch);
  let best = pokemon.id === selectedId ? 4 : Number.POSITIVE_INFINITY;

  for (const term of terms) {
    if (!term) {
      continue;
    }
    if (term === query) {
      best = Math.min(best, 0);
    } else if (term.startsWith(query)) {
      best = Math.min(best, 10 + term.length - query.length);
    } else {
      const index = term.indexOf(query);
      if (index >= 0) {
        best = Math.min(best, 35 + index + term.length - query.length);
      }
    }

    const fuzzy = fuzzySubsequenceScore(term, query);
    if (fuzzy !== null) {
      best = Math.min(best, 80 + fuzzy);
    }

    const distance = levenshteinDistance(term, query);
    if (distance <= Math.max(1, Math.ceil(query.length / 3))) {
      best = Math.min(best, 120 + distance * 12 + Math.abs(term.length - query.length));
    }
  }

  return best;
}

function normalizePokemonSearch(value: string) {
  return normalizeSearchText(value);
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[()[\]{}（）・ー_\s/-]/g, '');
}

function fuzzySubsequenceScore(term: string, query: string) {
  let position = 0;
  let score = 0;
  for (const char of query) {
    const next = term.indexOf(char, position);
    if (next < 0) {
      return null;
    }
    score += next - position;
    position = next + 1;
  }
  return score + term.length - query.length;
}

function levenshteinDistance(a: string, b: string) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function IngredientSelect({
  label,
  drops,
  value,
  disabled,
  onChange
}: {
  label: string;
  drops: IngredientDrop[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { language } = useI18n();
  return (
    <div className="field ingredient-field">
      <label>{label}</label>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {drops.map((drop, index) => {
          const ingredient = ingredientById.get(drop.ingredientId);
          return (
            <option key={`${drop.ingredientId}-${index}`} value={drop.ingredientId}>
              {ingredient ? ingredientName(ingredient, language) : drop.ingredientId} x{drop.amount}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) {
      setDraft(String(value));
    }
  }, [value]);

  function commit() {
    editing.current = false;
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.max(min, Math.min(max, Math.round(parsed)));
    setDraft(String(next));
    onChange(next);
  }

  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onFocus={() => { editing.current = true; }}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          const parsed = Number(nextDraft);
          if (nextDraft !== "" && Number.isInteger(parsed) && parsed >= min && parsed <= max) {
            onChange(parsed);
          }
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

function prepareTeamInput(
  input: CalcInput,
  team: TeamSlot[],
  options: {
    fieldBonus: number;
    goodCamp: boolean;
    energyMode?: CalcInput['energyMode'];
  }
) {
  const species = pokemonById.get(input.speciesId);
  if (!species) {
    return input;
  }
  const normalized = normalizeInput(input, species);
  const helpingBonusOwners = team.filter((slot) => hasActiveSubskill(slot.input, 'Helping Bonus')).length;
  const selfHasHelpingBonus = hasActiveSubskill(normalized, 'Helping Bonus');
  const mapMode = normalized.exMode ? 'wakakusaEx' : normalized.mapMode;
  return normalizeInput(
    {
      ...normalized,
      fieldBonus: options.fieldBonus,
      goodCamp: options.goodCamp,
      energyMode: options.energyMode ?? normalized.energyMode,
      mapMode,
      exMode: false,
      helpingBonusCount: Math.max(0, helpingBonusOwners - (selfHasHelpingBonus ? 1 : 0))
    },
    species
  );
}

function hasActiveSubskill(input: CalcInput, subskillName: string) {
  return input.subskillIds
    .slice(0, activeSubskillCountAtLevel(input.level))
    .some((id) => subskillById.get(id)?.name === subskillName);
}

function summarizeWhistleResults(results: WhistlePokemonResult[]) {
  return {
    totalEnergy: results.reduce((sum, result) => sum + result.totalEnergy, 0),
    berryEnergy: results.reduce((sum, result) => sum + result.berryEnergy, 0),
    berryAmount: results.reduce((sum, result) => sum + result.berryAmount, 0),
    ingredientEnergy: results.reduce((sum, result) => sum + result.ingredientEnergy, 0),
    ingredientBreakdown: mergeIngredientBreakdowns(results.flatMap((result) => result.ingredientBreakdown))
  };
}

function summarizeCalcResults(results: CalcResult[]) {
  return {
    totalEnergy: results.reduce((sum, result) => sum + result.totalEnergy, 0),
    berryEnergy: results.reduce((sum, result) => sum + result.berryEnergy, 0),
    ingredientEnergy: results.reduce((sum, result) => sum + result.ingredientEnergy, 0),
    skillEnergy: results.reduce((sum, result) => sum + result.skillEnergy, 0),
    ingredientBreakdown: mergeIngredientBreakdowns(results.flatMap((result) => result.ingredientBreakdown))
  };
}

function cookingChanceSourceFor(input: CalcInput, result: CalcResult, language: Language): CookingChanceSource | null {
  const species = pokemonById.get(input.speciesId);
  const skill = species ? mainSkillById.get(species.skillId) : undefined;
  if (!species || !skill) {
    return null;
  }
  const activation = skill.activations.find((item) => item.unit.toLowerCase() === 'crit chance');
  if (!activation) {
    return null;
  }
  const skillLevel = effectiveSkillLevel(input, species, skill);
  const chancePercent = activation.amounts[Math.min(skillLevel, activation.amounts.length) - 1] ?? 0;
  if (chancePercent <= 0 || result.expectedSkillTriggers <= 0) {
    return null;
  }
  return {
    id: result.speciesId,
    label: `${pokemonName(species, language)} Lv${skillLevel}`,
    triggersPerDay: result.expectedSkillTriggers,
    chancePercent
  };
}

function cookingSimulationSeed(sources: CookingChanceSource[], target: number, baseScore: number) {
  const text = `${target}:${baseScore}:${sources.map((source) => `${source.id}:${source.triggersPerDay.toFixed(4)}:${source.chancePercent}`).join('|')}`;
  let hash = 0x9e37_79b9;
  for (const char of text) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16_777_619);
  }
  return hash >>> 0;
}

function mergeIngredientBreakdowns(items: IngredientBreakdown[]) {
  const map = new Map<string, IngredientBreakdown>();
  for (const item of items) {
    const current = map.get(item.ingredientId) ?? { ingredientId: item.ingredientId, amount: 0, energy: 0 };
    current.amount += item.amount;
    current.energy += item.energy;
    map.set(item.ingredientId, current);
  }
  return Array.from(map.values()).filter((item) => Math.abs(item.amount) > 0.0001 || Math.abs(item.energy) > 0.0001);
}

function formatNatureName(natureId: string, language: Language) {
  const nature = natureById.get(natureId);
  return nature ? natureName(nature, language) : natureId;
}

function formatTeamInputTitle(input: CalcInput, language: Language) {
  const species = pokemonById.get(input.speciesId);
  return `${species ? pokemonName(species, language) : input.speciesId} Lv${input.level}`;
}

function formatShortSubskills(input: CalcInput, language: Language) {
  if (input.subskillIds.length === 0) {
    return translate(language, 'noSubskills');
  }
  const labels = input.subskillIds
    .slice(0, 2)
    .map((id) => {
      const subskill = subskillById.get(id);
      return subskill ? subskillName(subskill, language) : id;
    })
    .join(' / ');
  const hiddenCount = input.subskillIds.length - 2;
  return hiddenCount > 0 ? `${labels} +${hiddenCount}` : labels;
}

function formatSkillTitle(input: CalcInput, language: Language) {
  const species = pokemonById.get(input.speciesId);
  const skill = species ? mainSkillById.get(species.skillId) : undefined;
  return `${skill ? mainSkillName(skill, language) : species?.skillId ?? translate(language, 'mainSkillFallback')} Lv${skill && species ? effectiveSkillLevel(input, species, skill) : input.skillLevel}`;
}

function formatSkillEffectSummary(input: CalcInput, language: Language) {
  const species = pokemonById.get(input.speciesId);
  const skill = species ? mainSkillById.get(species.skillId) : undefined;
  if (!species || !skill) {
    return translate(language, 'noMainSkillData');
  }
  const skillLevel = effectiveSkillLevel(input, species, skill);
  const labels = skill.activations
    .map((activation) => skillActivationLabel(activation, skillLevel, input, species, language))
    .filter((label) => label.length > 0);
  if (labels.length === 0) {
    return translate(language, 'unsupportedSkillEffect');
  }
  return labels.join(' + ');
}

function effectiveSkillLevel(input: CalcInput, species: PokemonSpecies, skill: MainSkill) {
  const exMainBerry = (input.exMode || input.mapMode !== 'normal') && input.exBerryMode === 'main';
  return Math.max(1, Math.min(input.skillLevel + (exMainBerry ? 1 : 0), Math.max(skill.maxLevel, 1)));
}

function skillActivationLabel(
  activation: MainSkill['activations'][number],
  skillLevel: number,
  input: CalcInput,
  species: PokemonSpecies,
  language: Language
) {
  const amount = activation.amounts[Math.min(skillLevel, activation.amounts.length) - 1] ?? 0;
  const unit = activation.unit.toLowerCase();
  if (amount === 0) {
    return '';
  }
  if (unit === 'strength') {
    return language === 'en' ? `${formatNumber(amount)} strength` : `${formatNumber(amount)}エナジー`;
  }
  if (unit === 'energy' || unit === 'team energy') {
    return language === 'en' ? `${formatNumber(amount, 1)} energy recovery` : `${formatNumber(amount, 1)}げんき回復`;
  }
  if (unit === 'ingredients' || unit === 'random ingredients') {
    return language === 'en' ? `${countWithUnit(formatNumber(amount, 1), 'pieces', language)} ingredients` : `${formatNumber(amount, 1)}個の食材`;
  }
  if (unit === 'berries') {
    const berry = berryById.get(species.berryId);
    const berryEnergy = skillBerryEnergyPerBerry(input, species);
    return language === 'en'
      ? `${berry ? berryName(berry, language) : translate(language, 'berries')} ${countWithUnit(formatNumber(amount, 1), 'pieces', language)} (${formatNumber(amount * berryEnergy)} strength equivalent)`
      : `${berry ? berryName(berry, language) : 'きのみ'} ${formatNumber(amount, 1)}個（${formatNumber(amount * berryEnergy)}エナジー相当）`;
  }
  if (unit === 'helps' || unit === 'extra helpful') {
    return language === 'en' ? `${countWithUnit(formatNumber(amount, 1), 'times', language)} helps` : `${formatNumber(amount, 1)}回分のおてつだい`;
  }
  if (unit === 'items') {
    return language === 'en' ? `${countWithUnit(formatNumber(amount, 1), 'pieces', language)} special effects` : `${formatNumber(amount, 1)}個の特殊効果`;
  }
  return `${formatNumber(amount, 1)} ${activation.unit}`;
}

function skillBerryEnergyPerBerry(input: CalcInput, species: PokemonSpecies) {
  const berry = berryById.get(species.berryId);
  if (!berry) {
    return 0;
  }
  const exMode = input.exMode || input.mapMode !== 'normal';
  const exFavoriteBerry = exMode && input.exBerryMode !== 'none';
  const favoriteMultiplier = exMode
    ? input.exBonusMode === 'berry' && exFavoriteBerry
      ? 2.4
      : exFavoriteBerry
        ? 2
        : 1
    : input.favoriteBerry
      ? 2
      : 1;
  return Math.ceil(berryEnergyAtLevel(berry.energy, input.level) * (1 + input.fieldBonus / 100) * favoriteMultiplier);
}

function loadInput() {
  try {
    const loaded = JSON.parse(localStorage.getItem(INPUT_STORAGE_KEY) ?? 'null') as CalcInput | null;
    if (loaded && pokemonById.has(loaded.speciesId)) {
      return loaded;
    }
  } catch {
    // Ignore invalid localStorage payloads.
  }
  return defaultInput(firstPlayableSpecies());
}

function loadScoreTeam() {
  try {
    const loaded = JSON.parse(localStorage.getItem(SCORE_TEAM_STORAGE_KEY) ?? '[]') as unknown[];
    if (!Array.isArray(loaded)) {
      return [];
    }
    return loaded.map(scoreTeamSlotFromStored).filter((slot): slot is TeamSlot => slot !== null).slice(0, MAX_SCORE_TEAM);
  } catch {
    return [];
  }
}

function loadScoreSettings(): ScoreSettings {
  try {
    const loaded = JSON.parse(localStorage.getItem(SCORE_SETTINGS_STORAGE_KEY) ?? 'null') as Partial<ScoreSettings> | null;
    return normalizeScoreSettings(loaded ?? {});
  } catch {
    return normalizeScoreSettings({});
  }
}

function normalizeScoreSettings(value: Partial<ScoreSettings>): ScoreSettings {
  return {
    whistleCount: clampNumber(value.whistleCount, 1, 99, 1),
    fieldBonus: clampNumber(value.fieldBonus, 0, MAX_FIELD_BONUS, 0),
    goodCamp: typeof value.goodCamp === 'boolean' ? value.goodCamp : false,
    energyMode: isEnergyMode(value.energyMode) ? value.energyMode : 'normal'
  };
}

function scoreTeamSlotFromStored(value: unknown): TeamSlot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const item = value as Partial<TeamSlot>;
  if (!item.input || typeof item.input.speciesId !== 'string') {
    return null;
  }
  const species = pokemonById.get(item.input.speciesId);
  if (!species) {
    return null;
  }
  return {
    id: typeof item.id === 'string' ? item.id : makeClientId(),
    input: normalizeInput(item.input, species)
  };
}

function loadHistory() {
  try {
    const loaded = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) ?? '[]') as unknown[];
    return Array.isArray(loaded) ? loaded.map(historyEntryFromStored).filter((item): item is HistoryEntry => item !== null).slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function historyEntryFromStored(value: unknown): HistoryEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const item = value as Partial<HistoryEntry> & Partial<CalcResult>;
  if (item.input && item.result && item.id) {
    const species = pokemonById.get(item.input.speciesId);
    return {
      id: item.id,
      input: species ? normalizeInput(item.input, species) : item.input,
      result: item.result
    };
  }

  if (typeof item.id === 'string' && typeof item.speciesId === 'string' && typeof item.level === 'number') {
    return legacyHistoryEntry(item as CalcResult);
  }

  return null;
}

function legacyHistoryEntry(result: CalcResult): HistoryEntry | null {
  const species = pokemonById.get(result.speciesId);
  if (!species) {
    return null;
  }

  const fallback = defaultInput(species);
  return {
    id: result.id,
    input: normalizeInput(
      {
        ...fallback,
        level: result.level,
        ingredient0Id: result.selectedIngredients[0]?.ingredientId ?? fallback.ingredient0Id,
        ingredient30Id: result.selectedIngredients[1]?.ingredientId ?? fallback.ingredient30Id,
        ingredient60Id: result.selectedIngredients[2]?.ingredientId ?? fallback.ingredient60Id
      },
      species
    ),
    result
  };
}

function loadDistributionVisibility() {
  try {
    return localStorage.getItem(DISTRIBUTION_VISIBILITY_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function isEnergyMode(value: unknown): value is CalcInput['energyMode'] {
  return value === 'normal' || value === 'morningPillow' || value === 'constant80';
}

function makeClientId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function teamNotes(language: Language) {
  if (language === 'en') {
    return [
      'Daily output uses the team energy mode. Morning pillow x1 assumes daytime production starts at 150% energy.',
      "EX field modifiers use each team card\'s individual setting.",
      'Helper Whistle excludes main skill activations, Good Camp Ticket, EX speed, and EX ingredient +1.',
      "Helping Bonus within the team is counted automatically and overwrites each Pokemon\'s other Helping Bonus count."
    ];
  }
  return [
    '日産はチーム画面のげんき条件を使います。朝イチ枕1個は日中をげんき150%スタートとして計算します。',
    'EXフィールド補正は各チームカードの個別設定を使います。',
    'ホイッスルはメインスキルが発動せず、いいキャンプチケット・EX速度・EX食材+1も反映しません。',
    'チーム内のおてつだいボーナスは自動集計し、各個体の「他のおてボ数」を上書きしています。'
  ];
}

function cookingNotes(language: Language) {
  if (language === 'en') {
    return [
      'Weekdays use a 10% base extra-tasty rate and Sunday uses 30%. Tasty Chance stacks up to +70% and resets to 0 after an extra-tasty meal.',
      'Trigger timing is approximated by assigning activations to the pre-meal windows for three meals per day with a Poisson distribution.'
    ];
  }
  return [
    '平日10%、日曜30%を基礎大成功率とし、料理チャンスは最大+70%までスタック、実際に大成功したらスタックを0に戻します。',
    '発動タイミングは1日3食の各食前区間にポアソン分布で割り振る近似です。'
  ];
}
