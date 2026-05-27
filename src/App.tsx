import { BarChart3, Download, Eye, EyeOff, History, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { berryById, dataset, ingredientById, mainSkillById, natureById, pokemonById, subskillById } from './data/dataset';
import { berryEnergyAtLevel, calculate, calculateWhistle } from './lib/calculate';
import { simulateCookingChanceWeek, type CookingChanceSource } from './lib/cooking-chance';
import { analyzeDistribution, ingredientPatternLabel } from './lib/distribution';
import { formatNumber, formatPercent, formatSeconds, resultsToCsv } from './lib/format';
import { activeSubskillCountAtLevel, defaultInput, firstPlayableSpecies, inputForSpecies, normalizeInput } from './lib/input';
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
const DISTRIBUTION_LEVELS = [30, 50, 60];
const MAX_SUBSKILLS = 5;
const TOOL_TABS = [
  { id: 'expected', label: '期待値' },
  { id: 'whistle', label: 'チーム' },
  { id: 'howto', label: '使い方' }
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

export function App() {
  const [input, setInput] = useState<CalcInput>(() => loadInput());
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolTab>('expected');
  const [scoreTeam, setScoreTeam] = useState<TeamSlot[]>(() => loadScoreTeam());
  const [scoreSettings, setScoreSettings] = useState<ScoreSettings>(() => loadScoreSettings());

  const species = pokemonById.get(input.speciesId) ?? firstPlayableSpecies();
  const normalizedInput = useMemo(() => normalizeInput(input, species), [input, species]);
  const result = useMemo(() => calculate(normalizedInput), [normalizedInput]);
  const selectedHistory = history.find((item) => item.id === selectedHistoryId);
  const detailResult = selectedHistory?.result ?? result;
  const detailInput = selectedHistory?.input ?? normalizedInput;

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
    const blob = new Blob([resultsToCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'pokemon-sleep-expected-results.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <h1>ポケスリ計算機</h1>
          <p>SPORE: Super POkemon-sleep Rating Engine</p>
        </div>
        <div className="source-pill">
          data: {dataset.source.name}
          <span>{dataset.generatedAt.slice(0, 10)}</span>
        </div>
      </header>

      <nav className="tool-tabs" aria-label="ツール切替">
        {TOOL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTool === tab.id ? 'active' : ''}
            onClick={() => setActiveTool(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTool === 'expected' ? (
        <section className="workspace">
          <form className="panel controls" onSubmit={(event) => event.preventDefault()}>
            <div className="panel-heading">
              <h2>入力</h2>
              <button type="button" className="icon-button" onClick={resetInput} title="入力を初期化">
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
                max={100}
                onChange={(level) => updateInput({ level })}
              />
              <NumberField
                label="スキルLv"
                value={normalizedInput.skillLevel}
                min={1}
                max={8}
                onChange={(skillLevel) => updateInput({ skillLevel })}
              />
              <NumberField
                label="他のおてボ数"
                value={normalizedInput.helpingBonusCount}
                min={0}
                max={4}
                onChange={(helpingBonusCount) => updateInput({ helpingBonusCount })}
              />
            </div>

            <fieldset>
              <legend>食材</legend>
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
              <legend>サブスキル</legend>
              <SubskillCheckboxPicker value={normalizedInput.subskillIds} onChange={(subskillIds) => updateInput({ subskillIds })} />
            </fieldset>

            <fieldset>
              <legend>補正</legend>
              <div className="field-grid">
                <NumberField
                  label="フィールドボーナス%"
                  value={normalizedInput.fieldBonus}
                  min={0}
                  max={100}
                  onChange={(fieldBonus) => updateInput({ fieldBonus })}
                />
                <div className="field">
                  <label htmlFor="energy-mode">げんき</label>
                  <select
                    id="energy-mode"
                    value={normalizedInput.energyMode}
                    onChange={(event) => updateInput({ energyMode: event.target.value as CalcInput['energyMode'] })}
                  >
                    <option value="normal">通常推移</option>
                    <option value="morningPillow">朝イチ枕1個</option>
                    <option value="constant80">常に80以上</option>
                  </select>
                </div>
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={normalizedInput.favoriteBerry}
                  disabled={normalizedInput.exMode}
                  onChange={(event) => updateInput({ favoriteBerry: event.target.checked })}
                />
                <span>好みのきのみ一致</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={normalizedInput.goodCamp}
                  onChange={(event) => updateInput({ goodCamp: event.target.checked })}
                />
                <span>いいキャンプチケット</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={normalizedInput.exMode}
                  onChange={(event) => updateInput({ exMode: event.target.checked })}
                />
                <span>EXモード</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={normalizedInput.mapMode === 'wakakusaEx'}
                  onChange={(event) => updateInput({ mapMode: event.target.checked ? 'wakakusaEx' : 'normal' })}
                />
                <span>ワカクサEXマップ補正</span>
              </label>
              {normalizedInput.exMode || normalizedInput.mapMode === 'wakakusaEx' ? (
                <div className="field-grid">
                  <div className="field">
                    <label htmlFor="ex-berry">EXきのみ</label>
                    <select
                      id="ex-berry"
                      value={normalizedInput.exBerryMode}
                      onChange={(event) => updateInput({ exBerryMode: event.target.value as CalcInput['exBerryMode'] })}
                    >
                      <option value="main">メイン一致</option>
                      <option value="sub">サブ一致</option>
                    <option value="none">不一致（速度15%低下）</option>
                  </select>
                </div>
                  <div className="field">
                    <label htmlFor="ex-bonus">EX効果</label>
                    <select
                      id="ex-bonus"
                      value={normalizedInput.exBonusMode}
                      onChange={(event) => updateInput({ exBonusMode: event.target.value as CalcInput['exBonusMode'] })}
                    >
                      <option value="berry">きのみ2.4倍</option>
                      <option value="ingredient">食材+</option>
                      <option value="skill">スキル1.25倍</option>
                    </select>
                  </div>
                </div>
              ) : null}
            </fieldset>

            <div className="action-row">
              <button type="button" className="primary-button" onClick={saveResult}>
                <Save size={18} />
                履歴に保存
              </button>
              <button type="button" className="secondary-button" onClick={addCurrentToScoreTeam} disabled={scoreTeam.length >= MAX_SCORE_TEAM}>
                <Plus size={18} />
                チーム
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

      {activeTool === 'howto' ? <HowToPanel /> : null}
    </main>
  );
}

function HowToPanel() {
  return (
    <section className="panel howto">
      <div className="panel-heading">
        <h2>使い方</h2>
        <span>期待値・個体値・チーム評価の読み方</span>
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
            <li>補正でフィールドボーナス、げんき条件、好みのきのみ、キャンプ、EX/ワカクサEXを設定します。</li>
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
            <li>Lv30/50/60の固定Lvを選びます。厳選評価は入力Lvそのものではなく、この固定Lvに投影します。</li>
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
            <li>ワカクサEXは全体設定ではなく、各チームカードで個別に設定します。</li>
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
            <li>料理素点を入力すると、1週間21食の料理スコア分布をMonte Carloで表示します。</li>
            <li>手入力に切り替えると、発動回数/日と効果量%を直接指定できます。</li>
          </ol>
          <p>
            平日10%、日曜30%を基礎大成功率とし、料理チャンスは最大+70%までスタック、大成功時にスタックを0へ戻す近似です。
            料理チャンス持ちを途中で引っ込める運用はまだ扱っていません。
          </p>
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

function DistributionPanel({ input, species }: { input: CalcInput; species: PokemonSpecies }) {
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
          個体値分布
        </h2>
        <button
          type="button"
          className="secondary-button compact-button"
          onClick={() => setIsExpanded((current) => !current)}
          title={isExpanded ? '個体値分布を隠す' : '個体値分布を表示'}
        >
          {isExpanded ? <EyeOff size={16} /> : <Eye size={16} />}
          {isExpanded ? '隠す' : '表示'}
        </button>
      </div>
      {!isExpanded ? null : (
        <>
          <div className="level-tabs" aria-label="個体値評価レベル">
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
            <span>おてつだいボーナスをチーム価値込みで評価</span>
          </label>
          <div className="field distribution-select">
            <label htmlFor="gold-fixed-slots">フレンドレベル/金固定</label>
            <select id="gold-fixed-slots" value={goldFixedSlots} onChange={(event) => setGoldFixedSlots(Number(event.target.value))}>
              <option value={0}>金固定なし</option>
              <option value={1}>1枠目金固定</option>
              <option value={2}>1-2枠目金固定</option>
              <option value={3}>1-3枠目金固定</option>
            </select>
          </div>
          {!analysis ? (
            <div className="distribution-empty">
              <p>分布データを計算中です。</p>
              <span>{species.displayNameJa} Lv30/50/60 の食材構成別Monte Carlo分布を使います。</span>
            </div>
          ) : analysis.scenario ? (
            <>
              <div className="distribution-meta">
                <span>対象: {evaluationResult.speciesName} Lv{analysis.scenario.level}</span>
                <span>スキルLv: {analysis.scenario.skillLevel}</span>
                <span>好みのきのみ: {analysis.scenario.favoriteBerry ? 'on' : 'off'}</span>
                <span>食材構成: {analysis.scenario.ingredientPattern ?? ingredientPattern}</span>
                <span>おてボ価値: {analysis.scenario.helpingBonusTeamValue ? 'チーム込み' : '本人のみ'}</span>
                <span>金固定: {analysis.scenario.goldFixedSlots ? `${analysis.scenario.goldFixedSlots}枠` : 'なし'}</span>
                <span>解放サブスキル: {analysis.scenario.activeSubskillCount}</span>
                <span>サンプル: {analysis.scenario.sampleSize.toLocaleString('ja-JP')}</span>
              </div>
              <div className="rank-list">
                {analysis.ranks.map((rank) => (
                  <div key={rank.id} className="rank-item">
                    <div>
                      <strong>{rank.label}</strong>
                      <span>
                        現在個体 {formatNumber(rank.value, rank.precision)}
                        {rank.unit} / 母集団平均 {formatNumber(rank.mean, rank.precision)}
                        {rank.unit}
                      </span>
                    </div>
                    <div className="rank-gauge" aria-label={`${rank.label} 上位 ${formatNumber(rank.topPercent, 1)}%`}>
                      <span style={{ width: `${Math.max(3, Math.min(100, rank.percentile))}%` }} />
                    </div>
                    <b>上位 {formatNumber(rank.topPercent, 1)}%</b>
                    <DistributionShapePlot rank={rank} />
                  </div>
                ))}
              </div>
              <p className="distribution-note">
                食材構成{analysis.scenario.ingredientPattern ?? ingredientPattern}に固定して性格・サブスキルをMonte Carlo比較します。サブスキルは選択順の先頭
                {analysis.scenario.activeSubskillCount}個だけを反映し、スキルLvは現在入力に合わせます。表示値は現在個体の期待値、母集団平均は同条件のランダム個体の平均です。上位%は母集団内で現在個体以上の個体が出る割合です。金固定は先頭枠から指定数だけ金スキル確定として母集団を作ります。おてボ価値込みでは、おてつだいボーナス持ちに他4匹分の速度価値を加えます。
              </p>
              {input.subskillIds.length !== analysis.scenario.activeSubskillCount ? (
                <p className="distribution-warning">
                  現在の選択サブスキル数は{input.subskillIds.length}個です。Lv{analysis.scenario.level}
                  評価の解放枠{analysis.scenario.activeSubskillCount}個に合わせると比較が安定します。
                </p>
              ) : null}
            </>
          ) : (
            <div className="distribution-empty">
              <p>{analysis.unavailableReasons[0] ?? 'この条件の分布はまだありません。'}</p>
              <span>対応条件は Lv30/50/60、FB0%、キャンプoff、通常マップ、EX off、他のおてボ0です。</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function DistributionShapePlot({ rank }: { rank: ReturnType<typeof analyzeDistribution>['ranks'][number] }) {
  const shape = rank.shape;
  const iqrWidth = Math.max(1, shape.p75Percent - shape.p25Percent);

  return (
    <div className="shape-plot" aria-label={`${rank.label}の分布`}>
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
        <span>中央値 {formatNumber(shape.median, rank.precision)}</span>
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
    () => dailyRows.map((row) => cookingChanceSourceFor(row.input, row.result)).filter((source): source is CookingChanceSource => source !== null),
    [dailyRows]
  );
  const cookingSources = useMemo(
    () =>
      cookingMode === 'team'
        ? teamCookingSources
        : [
            {
              id: 'manual',
              label: '手入力',
              triggersPerDay: manualCookingTriggers,
              chancePercent: manualCookingChance
            }
          ],
    [cookingMode, manualCookingChance, manualCookingTriggers, teamCookingSources]
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
          <h2>チーム生産性</h2>
          <span>日産とホイッスル</span>
        </div>
        <div className="settings-grid team-settings-grid">
          <NumberField
            label="フィールドボーナス%"
            value={fieldBonus}
            min={0}
            max={100}
            onChange={(value) => onSettingsChange({ fieldBonus: value })}
          />
          <div className="field">
            <label htmlFor="team-energy-mode">げんき</label>
            <select
              id="team-energy-mode"
              value={energyMode}
              onChange={(event) => onSettingsChange({ energyMode: event.target.value as CalcInput['energyMode'] })}
            >
              <option value="normal">通常推移</option>
              <option value="morningPillow">朝イチ枕1個</option>
              <option value="constant80">常に80以上</option>
            </select>
          </div>
          <label className="check-row score-check">
            <input type="checkbox" checked={goodCamp} onChange={(event) => onSettingsChange({ goodCamp: event.target.checked })} />
            <span>日産にいいキャンプチケット</span>
          </label>
        </div>

        {dailyRows.length === 0 ? (
          <ScoreEmpty />
        ) : (
          <>
            <section className="score-section">
              <div className="section-heading">
                <h3>チーム日産</h3>
                <span>{dailyRows.length}匹合計</span>
              </div>
              <div className="score-summary">
                <Metric label="合計エナジー" value={formatNumber(dailyAggregate.totalEnergy)} />
                <Metric label="きのみ" value={formatNumber(dailyAggregate.berryEnergy)} />
                <Metric label="食材" value={formatNumber(dailyAggregate.ingredientEnergy)} />
                <Metric label="スキル" value={formatNumber(dailyAggregate.skillEnergy)} />
              </div>
              <IngredientBreakdownList title="日産食材内訳" breakdown={dailyAggregate.ingredientBreakdown} />
              <div className="member-list compact-member-list">
                {dailyRows.map(({ slot, input: preparedInput, result }) => (
                  <div key={slot.id} className="member-result">
                    <div>
                      <strong>
                        {result.speciesName} Lv{result.level}
                      </strong>
                      <span>
                        {formatSkillTitle(preparedInput)} / 表示おてつだい時間 {formatSeconds(result.displayedFrequency)}
                      </span>
                    </div>
                    <b>{formatNumber(result.totalEnergy)}</b>
                    <div className="score-mini-grid">
                      <Metric label="きのみ" value={formatNumber(result.berryEnergy)} />
                      <Metric label="食材" value={formatNumber(result.ingredientEnergy)} />
                      <Metric label="スキル" value={`${formatNumber(result.skillEnergy)} / ${formatNumber(result.expectedSkillTriggers, 2)}回`} />
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
                <h3>おてつだいホイッスル</h3>
                <span>{whistleRows.length}匹 x {whistleCount}個 / 最大げんき効率の3時間分</span>
              </div>
              <div className="score-summary">
                <div className="metric metric-control">
                  <span>ホイッスル使用数</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={whistleCount}
                    onChange={(event) => onSettingsChange({ whistleCount: Number(event.target.value) })}
                  />
                </div>
                <Metric label="合計エナジー" value={formatNumber(whistleAggregate.totalEnergy)} />
                <Metric label="きのみ" value={`${formatNumber(whistleAggregate.berryEnergy)} / ${formatNumber(whistleAggregate.berryAmount, 0)}個`} />
                <Metric label="食材" value={formatNumber(whistleAggregate.ingredientEnergy)} />
              </div>
              <IngredientBreakdownList title="ホイッスル食材内訳" breakdown={whistleAggregate.ingredientBreakdown} />
              <div className="member-list compact-member-list">
                {whistleRows.map(({ slot, result }) => (
                  <div key={slot.id} className="member-result">
                    <div>
                      <strong>
                        {result.speciesName} Lv{result.level}
                      </strong>
                      <span>
                        {result.berryName} {formatNumber(result.berryAmount, 0)}個 / 表示おてつだい時間 {formatSeconds(result.displayedFrequency)}
                      </span>
                    </div>
                    <b>{formatNumber(result.totalEnergy)}</b>
                    <div className="score-mini-grid">
                      <Metric label="きのみ" value={formatNumber(result.berryEnergy)} />
                      <Metric label="食材" value={formatNumber(result.ingredientEnergy)} />
                      <Metric label="おてつだい/個" value={`${formatNumber(result.helpsPerWhistle, 2)}回`} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <ul className="notes">
              <li>日産はチーム画面のげんき条件を使います。朝イチ枕1個は日中をげんき150%スタートとして計算します。</li>
              <li>ワカクサEX補正は各チームカードの個別設定を使います。</li>
              <li>ホイッスルはメインスキルが発動せず、いいキャンプチケット・EX速度・EX食材+1も反映しません。</li>
              <li>チーム内のおてつだいボーナスは自動集計し、各個体の「他のおてボ数」を上書きしています。</li>
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
  const maxScoreProbability = Math.max(...simulation.scoreHistogram.map((bin) => bin.probability), 0.01);
  const maxSuccessProbability = Math.max(...simulation.histogram.map((bin) => bin.probability), 0.01);

  return (
    <section className="score-section cooking-section">
      <div className="section-heading">
        <h3>料理チャンス週間スコア分布</h3>
        <span>{simulation.weeks.toLocaleString('ja-JP')}週 Monte Carlo</span>
      </div>
      <div className="settings-grid cooking-settings-grid">
        <div className="field">
          <label htmlFor="cooking-source-mode">入力</label>
          <select id="cooking-source-mode" value={mode} onChange={(event) => onModeChange(event.target.value as 'team' | 'manual')}>
            <option value="team">チームから集計</option>
            <option value="manual">手入力</option>
          </select>
        </div>
        {mode === 'manual' ? (
          <>
            <NumberField label="発動回数/日" value={manualTriggers} min={0} max={20} onChange={onManualTriggersChange} />
            <NumberField label="効果量%" value={manualChance} min={0} max={70} onChange={onManualChanceChange} />
          </>
        ) : (
          <div className="cooking-source-list">
            {teamSources.length > 0 ? (
              teamSources.map((source) => (
                <span key={source.id}>
                  {source.label}: {formatNumber(source.triggersPerDay, 2)}回/日 x {formatNumber(source.chancePercent, 1)}%
                </span>
              ))
            ) : (
              <span>料理チャンスS持ちがチームにいません。</span>
            )}
          </div>
        )}
        <NumberField label="料理素点" value={baseScore} min={0} max={999999} onChange={onBaseScoreChange} />
        <NumberField label="目標大成功/週" value={target} min={0} max={21} onChange={onTargetChange} />
      </div>

      <div className="score-summary">
        <Metric label="平均週間料理点" value={formatNumber(simulation.meanScore, 0)} />
        <Metric label="中央値" value={formatNumber(simulation.medianScore, 0)} />
        <Metric label="p10-p90" value={`${formatNumber(simulation.p10Score, 0)}-${formatNumber(simulation.p90Score, 0)}`} />
        <Metric label="素点比" value={formatPercent(simulation.energyRatio - 1, 2)} />
      </div>
      <div className="distribution-meta cooking-meta">
        <span>発動期待 {formatNumber(simulation.totalTriggersPerDay, 2)}回/日</span>
        <span>平均大成功 {formatNumber(simulation.meanSuccesses, 2)}回/週</span>
        <span>週{target}回以上 {formatPercent(simulation.probabilityAtLeastTarget)}</span>
        <span>料理倍率 {formatNumber(simulation.meanEnergyMultiplier, 2)}x</span>
      </div>
      <div className="score-histogram" aria-label="1週間の料理エナジー分布">
        {simulation.scoreHistogram.map((bin) => (
          <div key={bin.id}>
            <span style={{ height: `${Math.max(2, (bin.probability / maxScoreProbability) * 100)}%` }} />
            <small>{formatNumber((bin.min + bin.max) / 2, 0)}</small>
          </div>
        ))}
      </div>
      <div className="cooking-histogram" aria-label="1週間の料理大成功回数分布">
        {simulation.histogram.map((bin) => (
          <div key={bin.successes} className={bin.successes >= target ? 'target-bin' : ''}>
            <span style={{ height: `${Math.max(2, (bin.probability / maxSuccessProbability) * 100)}%` }} />
            <small>{bin.successes}</small>
          </div>
        ))}
      </div>
      <ul className="notes">
        <li>平日10%、日曜30%を基礎大成功率とし、料理チャンスは最大+70%までスタック、実際に大成功したらスタックを0に戻します。</li>
        <li>発動タイミングは1日3食の各食前区間にポアソン分布で割り振る近似です。</li>
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
  const isFull = team.length >= MAX_SCORE_TEAM;
  return (
    <section className="panel team-panel">
      <div className="panel-heading">
        <h2>チーム</h2>
        <span>{team.length}/{MAX_SCORE_TEAM}</span>
      </div>
      <button type="button" className="primary-button add-team-button" onClick={onAddCurrent} disabled={isFull}>
        <Plus size={18} />
        現在の入力を追加
      </button>
      <p className="score-note">期待値タブで作った個体か、履歴から最大5匹まで追加します。</p>
      <div className="team-list">
        {team.map((slot) => (
          <TeamSlotCard key={slot.id} slot={slot} onRemove={onRemoveSlot} onUpdate={onUpdateSlot} />
        ))}
      </div>
      {history.length > 0 ? (
        <>
          <h3 className="team-subheading">履歴から追加</h3>
          <div className="team-picks">
            {history.map((entry) => (
              <button key={entry.id} type="button" disabled={isFull} onClick={() => onAddHistory(entry)}>
                <strong>
                  {entry.result.speciesName} Lv{entry.input.level}
                </strong>
                <span>
                  {natureById.get(entry.input.natureId)?.nameJa ?? entry.input.natureId} / {formatShortSubskills(entry.input)}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <div className="current-input-chip">
        <span>現在の入力</span>
        <strong>{formatTeamInputTitle(currentInput)}</strong>
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
  const input = slot.input;
  const species = pokemonById.get(input.speciesId);
  if (!species) {
    return null;
  }
  const isWakakusaEx = input.mapMode === 'wakakusaEx' || input.exMode;
  return (
    <article className="team-card">
      <div className="team-card-main">
        <strong>{formatTeamInputTitle(input)}</strong>
        <span>
          {natureById.get(input.natureId)?.nameJa ?? input.natureId} / {formatSkillTitle(input)}
        </span>
        <HistorySubskillTags input={input} />
      </div>
      <div className="team-card-actions">
        <label className="check-row compact-check" title={isWakakusaEx ? 'ワカクサEX時はEXきのみ設定を使います' : undefined}>
          <input
            type="checkbox"
            checked={input.favoriteBerry}
            disabled={isWakakusaEx}
            onChange={(event) => onUpdate(slot.id, { favoriteBerry: event.target.checked })}
          />
          <span>好み</span>
        </label>
        <button type="button" className="icon-button" onClick={() => onRemove(slot.id)} title="チームから削除">
          <X size={17} />
        </button>
      </div>
      <div className="team-ex-controls">
        <label className="check-row compact-check">
          <input
            type="checkbox"
            checked={isWakakusaEx}
            onChange={(event) => onUpdate(slot.id, { mapMode: event.target.checked ? 'wakakusaEx' : 'normal', exMode: false })}
          />
          <span>ワカクサEX</span>
        </label>
        {isWakakusaEx ? (
          <div className="team-ex-grid">
            <div className="field compact-field">
              <label>EXきのみ</label>
              <select
                value={input.exBerryMode}
                onChange={(event) => onUpdate(slot.id, { exBerryMode: event.target.value as CalcInput['exBerryMode'], exMode: false })}
              >
                <option value="main">メイン一致</option>
                <option value="sub">サブ一致</option>
                <option value="none">不一致（速度15%低下）</option>
              </select>
            </div>
            <div className="field compact-field">
              <label>EX効果</label>
              <select
                value={input.exBonusMode}
                onChange={(event) => onUpdate(slot.id, { exBonusMode: event.target.value as CalcInput['exBonusMode'], exMode: false })}
              >
                <option value="berry">きのみ2.4倍</option>
                <option value="ingredient">食材+</option>
                <option value="skill">スキル1.25倍</option>
              </select>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ScoreEmpty() {
  return (
    <div className="score-empty">
      <p>まだチームが空です。</p>
      <span>期待値タブの現在入力か履歴から、スコアアタック対象を追加してください。</span>
    </div>
  );
}

function IngredientBreakdownList({ title, breakdown }: { title: string; breakdown: IngredientBreakdown[] }) {
  return (
    <div className="breakdown score-breakdown">
      <h3>{title}</h3>
      {breakdown.length > 0 ? (
        <ul>
          {breakdown.map((item) => {
            const ingredient = ingredientById.get(item.ingredientId);
            return (
              <li key={item.ingredientId}>
                <span>{ingredient?.nameJa ?? item.ingredientId}</span>
                <strong>
                  {formatNumber(item.amount, 1)}個 / {formatNumber(item.energy)}
                </strong>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>対象食材はありません。</p>
      )}
    </div>
  );
}

function ResultSummary({ result, species }: { result: CalcResult; species: PokemonSpecies }) {
  const berry = berryById.get(species.berryId);
  const skill = mainSkillById.get(species.skillId);
  return (
    <section className="panel summary">
      <div className="summary-title">
        <div>
          <h2>{result.speciesName}</h2>
          <p>
            {specialtyLabel(species.specialty)} / {berry?.nameJa ?? species.berryId} / {skill?.nameJa ?? species.skillId}
          </p>
        </div>
        <strong>{formatNumber(result.totalEnergy)}</strong>
      </div>
      <div className="stat-grid">
        <Metric label="きのみ" value={formatNumber(result.berryEnergy)} />
        <Metric label="食材" value={formatNumber(result.ingredientEnergy)} />
        <Metric label="スキル" value={formatNumber(result.skillEnergy)} />
        <Metric label="おてつだい" value={`${formatNumber(result.helpsPerDay, 1)}回`} />
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
  const skillTitle = formatSkillTitle(input);
  const skillSummary = formatSkillEffectSummary(input);

  return (
    <section className="panel detail">
      <div className="panel-heading">
        <h2>{selectedHistoryId ? '履歴詳細' : '現在の詳細'}</h2>
        <span>{new Date(result.createdAt).toLocaleString('ja-JP')}</span>
      </div>
      <div className="skill-info">
        <span>メインスキル</span>
        <strong>{skillTitle}</strong>
        <p>{skillSummary}</p>
      </div>
      <div className="detail-grid">
        <Metric label="計算上おてつだい時間" value={formatSeconds(result.displayedFrequency)} />
        <Metric label="最大所持数" value={`${result.inventoryLimit}`} />
        <Metric label="食材確率" value={formatPercent(result.ingredientProbability)} />
        <Metric label="スキル確率" value={formatPercent(result.skillProbability)} />
        <Metric label="スキル発動期待" value={`${formatNumber(result.expectedSkillTriggers, 2)}回`} />
        <Metric label="睡眠中スキル" value={`${formatNumber(result.sleepSkillTriggers ?? 0, 2)} / ${result.sleepSkillStockLimit ?? 1}`} />
        <Metric label="きのみ/回" value={`${formatNumber(result.berriesPerHelp, 1)}個`} />
        <Metric label="睡眠中あふれ" value={`${formatNumber(result.sleepOverflowHelps ?? 0, 1)}回`} />
      </div>
      <div className="breakdown">
        <h3>食材内訳</h3>
        {result.ingredientBreakdown.length > 0 ? (
          <ul>
            {result.ingredientBreakdown.map((item) => {
              const ingredient = ingredientById.get(item.ingredientId);
              return (
                <li key={item.ingredientId}>
                  <span>{ingredient?.nameJa ?? item.ingredientId}</span>
                  <strong>
                    {formatNumber(item.amount, 1)}個 / {formatNumber(item.energy)}
                  </strong>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>解放済み食材がありません。</p>
        )}
      </div>
      <ul className="notes">
        {result.notes.map((note) => (
          <li key={note}>{note}</li>
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
  return (
    <section className="panel history">
      <div className="panel-heading">
        <h2>
          <History size={18} />
          最新10件
        </h2>
        <button type="button" className="icon-button" onClick={onDownload} title="履歴をCSV出力">
          <Download size={18} />
        </button>
      </div>
      {history.length === 0 ? (
        <p className="empty">まだ保存された結果はありません。</p>
      ) : (
        <div className="history-table-wrap">
          <table>
            <thead>
              <tr>
                <th>日時</th>
                <th>ポケモン</th>
                <th>Lv</th>
                <th>せいかく</th>
                <th>サブスキル</th>
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
                  <td data-label="日時">
                    {new Date(item.result.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td data-label="ポケモン">{item.result.speciesName}</td>
                  <td data-label="Lv">{item.input.level}</td>
                  <td data-label="せいかく">{natureById.get(item.input.natureId)?.nameJa ?? item.input.natureId}</td>
                  <td data-label="サブスキル">
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
                      title="履歴を削除"
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
  const selected = natureById.get(value);

  return (
    <fieldset className="nature-matrix-fieldset">
      <legend>せいかく</legend>
      <div className="nature-selected">
        <strong>{selected?.nameJa ?? value}</strong>
        <span>
          {modifierLabel(selected?.positiveModifier ?? 'neutral')}↑ / {modifierLabel(selected?.negativeModifier ?? 'neutral')}↓
        </span>
      </div>
      <div className="nature-matrix" role="grid" aria-label="せいかく補正">
        <div className="matrix-corner" />
        {MATRIX_MODIFIERS.map((modifier) => (
          <div key={`down-${modifier}`} className="matrix-axis down">
            {modifierLabel(modifier)}↓
          </div>
        ))}
        {MATRIX_MODIFIERS.map((positiveModifier, rowIndex) => (
          <Fragment key={positiveModifier}>
            <div key={`up-${positiveModifier}`} className="matrix-axis up">
              {modifierLabel(positiveModifier)}↑
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
                  <strong>{nature?.nameJa ?? '-'}</strong>
                  {positiveModifier === negativeModifier ? <span>無補正</span> : null}
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
  const [query, setQuery] = useState('');
  const selected = new Set(value);
  const normalizedQuery = normalizeSearchText(query);
  const subskills = useMemo(
    () =>
      dataset.subskills
        .slice()
        .sort((left, right) => subskillSortRank(left.name) - subskillSortRank(right.name) || left.nameJa.localeCompare(right.nameJa, 'ja'))
        .filter((subskill) => {
          if (!normalizedQuery) {
            return true;
          }
          return normalizeSearchText(`${subskill.nameJa} ${subskill.name} ${subskill.shortName} ${subskillRarityLabel(subskill.rarity)}`).includes(
            normalizedQuery
          );
        }),
    [normalizedQuery]
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
              <button key={`${id}-${index}`} type="button" onClick={() => toggleSubskill(id, false)} title="選択を解除">
                <b>{index + 1}</b>
                <span>{subskill?.nameJa ?? id}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <input
        type="search"
        value={query}
        placeholder="サブスキル名で絞り込み"
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
              <span className={`rarity-badge rarity-${subskill.rarity}`}>{subskillRarityLabel(subskill.rarity)}</span>
              <strong>{subskill.nameJa}</strong>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function HistorySubskillTags({ input }: { input: CalcInput }) {
  if (input.subskillIds.length === 0) {
    return <span className="history-tag muted">サブスキルなし</span>;
  }

  const visibleSubskills = input.subskillIds.slice(0, 4);
  const hiddenCount = input.subskillIds.length - visibleSubskills.length;

  return (
    <div className="history-tags">
      {visibleSubskills.map((id) => {
        const subskill = subskillById.get(id);
        return (
          <span key={id} className="history-tag" title={subskill?.nameJa ?? id}>
            {subskill?.nameJa ?? id}
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

function subskillRarityLabel(rarity: string) {
  if (rarity === 'gold') {
    return '金';
  }
  if (rarity === 'silver') {
    return '青';
  }
  return '白';
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
  const selected = pokemonById.get(speciesId) ?? firstPlayableSpecies();
  const [query, setQuery] = useState(formatPokemonCandidate(selected));
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestions = useMemo(() => searchPokemon(query, selected.id), [query, selected.id]);

  useEffect(() => {
    setQuery(formatPokemonCandidate(selected));
  }, [selected]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function choose(pokemon: PokemonSpecies) {
    setQuery(formatPokemonCandidate(pokemon));
    setIsOpen(false);
    onChange(pokemon.id);
  }

  return (
    <div className="combobox">
      <label htmlFor="species-search">ポケモン</label>
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
            setQuery(formatPokemonCandidate(selected));
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
            setQuery(formatPokemonCandidate(selected));
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
              <strong>{pokemon.displayNameJa}</strong>
              <span>{pokemon.displayName}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatPokemonCandidate(pokemon: PokemonSpecies) {
  return `${pokemon.displayNameJa} / ${pokemon.displayName}`;
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
  return (
    <div className="field ingredient-field">
      <label>{label}</label>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {drops.map((drop, index) => {
          const ingredient = ingredientById.get(drop.ingredientId);
          return (
            <option key={`${drop.ingredientId}-${index}`} value={drop.ingredientId}>
              {ingredient?.nameJa ?? drop.ingredientId} x{drop.amount}
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
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
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
  const mapMode = normalized.mapMode === 'wakakusaEx' || normalized.exMode ? 'wakakusaEx' : 'normal';
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

function cookingChanceSourceFor(input: CalcInput, result: CalcResult): CookingChanceSource | null {
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
    label: `${result.speciesName} Lv${skillLevel}`,
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

function formatTeamInputTitle(input: CalcInput) {
  const species = pokemonById.get(input.speciesId);
  return `${species?.displayNameJa ?? input.speciesId} Lv${input.level}`;
}

function formatShortSubskills(input: CalcInput) {
  if (input.subskillIds.length === 0) {
    return 'サブスキルなし';
  }
  const labels = input.subskillIds
    .slice(0, 2)
    .map((id) => subskillById.get(id)?.nameJa ?? id)
    .join(' / ');
  const hiddenCount = input.subskillIds.length - 2;
  return hiddenCount > 0 ? `${labels} +${hiddenCount}` : labels;
}

function formatSkillTitle(input: CalcInput) {
  const species = pokemonById.get(input.speciesId);
  const skill = species ? mainSkillById.get(species.skillId) : undefined;
  return `${skill?.nameJa ?? species?.skillId ?? 'メインスキル'} Lv${skill && species ? effectiveSkillLevel(input, species, skill) : input.skillLevel}`;
}

function formatSkillEffectSummary(input: CalcInput) {
  const species = pokemonById.get(input.speciesId);
  const skill = species ? mainSkillById.get(species.skillId) : undefined;
  if (!species || !skill) {
    return 'メインスキルの効果データがありません。';
  }
  const skillLevel = effectiveSkillLevel(input, species, skill);
  const labels = skill.activations
    .map((activation) => skillActivationLabel(activation, skillLevel, input, species))
    .filter((label) => label.length > 0);
  if (labels.length === 0) {
    return 'このスキルは特殊効果を含むため、現状の数値換算では未対応の部分があります。';
  }
  return labels.join(' + ');
}

function effectiveSkillLevel(input: CalcInput, species: PokemonSpecies, skill: MainSkill) {
  const exMainBerry = (input.exMode || input.mapMode === 'wakakusaEx') && input.exBerryMode === 'main';
  return Math.max(1, Math.min(input.skillLevel + (exMainBerry ? 1 : 0), Math.max(skill.maxLevel, 1)));
}

function skillActivationLabel(
  activation: MainSkill['activations'][number],
  skillLevel: number,
  input: CalcInput,
  species: PokemonSpecies
) {
  const amount = activation.amounts[Math.min(skillLevel, activation.amounts.length) - 1] ?? 0;
  const unit = activation.unit.toLowerCase();
  if (amount === 0) {
    return '';
  }
  if (unit === 'strength') {
    return `${formatNumber(amount)}エナジー`;
  }
  if (unit === 'energy' || unit === 'team energy') {
    return `${formatNumber(amount, 1)}げんき回復`;
  }
  if (unit === 'ingredients' || unit === 'random ingredients') {
    return `${formatNumber(amount, 1)}個の食材`;
  }
  if (unit === 'berries') {
    const berry = berryById.get(species.berryId);
    const berryEnergy = skillBerryEnergyPerBerry(input, species);
    return `${berry?.nameJa ?? 'きのみ'} ${formatNumber(amount, 1)}個（${formatNumber(amount * berryEnergy)}エナジー相当）`;
  }
  if (unit === 'helps' || unit === 'extra helpful') {
    return `${formatNumber(amount, 1)}回分のおてつだい`;
  }
  if (unit === 'items') {
    return `${formatNumber(amount, 1)}個の特殊効果`;
  }
  return `${formatNumber(amount, 1)} ${activation.unit}`;
}

function skillBerryEnergyPerBerry(input: CalcInput, species: PokemonSpecies) {
  const berry = berryById.get(species.berryId);
  if (!berry) {
    return 0;
  }
  const exMode = input.exMode || input.mapMode === 'wakakusaEx';
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
    fieldBonus: clampNumber(value.fieldBonus, 0, 100, 0),
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

function specialtyLabel(specialty: string) {
  if (specialty === 'berry') {
    return 'きのみ得意';
  }
  if (specialty === 'ingredient') {
    return '食材得意';
  }
  if (specialty === 'skill') {
    return 'スキル得意';
  }
  return 'オール得意';
}

function modifierLabel(modifier: string) {
  const labels: Record<string, string> = {
    speed: 'スピード',
    ingredient: '食材',
    skill: 'スキル',
    energy: 'げんき',
    exp: 'EXP',
    neutral: 'なし'
  };
  return labels[modifier] ?? modifier;
}
