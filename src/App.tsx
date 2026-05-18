import { Download, History, RotateCcw, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { berryById, dataset, ingredientById, mainSkillById, pokemonById, subskillById } from './data/dataset';
import { calculate } from './lib/calculate';
import { formatNumber, formatPercent, formatSeconds, resultsToCsv } from './lib/format';
import { defaultInput, firstPlayableSpecies, inputForSpecies, normalizeInput } from './lib/input';
import type { CalcInput, CalcResult, IngredientDrop, PokemonSpecies } from './types';

const INPUT_STORAGE_KEY = 'pokemon-sleep-checker-input-v1';
const HISTORY_STORAGE_KEY = 'pokemon-sleep-checker-history-v1';
const MAX_HISTORY = 10;

export function App() {
  const [input, setInput] = useState<CalcInput>(() => loadInput());
  const [history, setHistory] = useState<CalcResult[]>(() => loadHistory());
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  const species = pokemonById.get(input.speciesId) ?? firstPlayableSpecies();
  const normalizedInput = useMemo(() => normalizeInput(input, species), [input, species]);
  const result = useMemo(() => calculate(normalizedInput), [normalizedInput]);
  const selectedHistory = history.find((item) => item.id === selectedHistoryId);
  const detailResult = selectedHistory ?? result;

  useEffect(() => {
    localStorage.setItem(INPUT_STORAGE_KEY, JSON.stringify(normalizedInput));
  }, [normalizedInput]);

  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }, [history]);

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
    setHistory((current) => [saved, ...current.filter((item) => item.id !== saved.id)].slice(0, MAX_HISTORY));
    setSelectedHistoryId(saved.id);
  }

  function resetInput() {
    const next = defaultInput(firstPlayableSpecies());
    setInput(next);
    setSelectedHistoryId(null);
  }

  function downloadCsv() {
    const rows = history.length > 0 ? history : [result];
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
          <h1>ポケスリ期待値チェッカー</h1>
          <p>広告なし・GitHub Pages向けの静的計算器</p>
        </div>
        <div className="source-pill">
          data: {dataset.source.name}
          <span>{dataset.generatedAt.slice(0, 10)}</span>
        </div>
      </header>

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
              label="進化回数"
              value={normalizedInput.evolutionCount}
              min={0}
              max={2}
              onChange={(evolutionCount) => updateInput({ evolutionCount })}
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

          <div className="field wide">
            <label htmlFor="nature">せいかく</label>
            <select id="nature" value={normalizedInput.natureId} onChange={(event) => updateInput({ natureId: event.target.value })}>
              {dataset.natures.map((nature) => (
                <option key={nature.id} value={nature.id}>
                  {nature.nameJa}（{modifierLabel(nature.positiveModifier)}↑ / {modifierLabel(nature.negativeModifier)}↓）
                </option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend>サブスキル</legend>
            <div className="subskill-list">
              {dataset.subskills.map((subskill) => (
                <label key={subskill.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={normalizedInput.subskillIds.includes(subskill.id)}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...normalizedInput.subskillIds, subskill.id]
                        : normalizedInput.subskillIds.filter((id) => id !== subskill.id);
                      updateInput({ subskillIds: next });
                    }}
                  />
                  <span>{subskill.nameJa}</span>
                </label>
              ))}
            </div>
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
                checked={normalizedInput.excludeSelfEnergySkill}
                onChange={(event) => updateInput({ excludeSelfEnergySkill: event.target.checked })}
              />
              <span>自身のげんき回復を速度補正から外す</span>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={normalizedInput.exMode}
                onChange={(event) => updateInput({ exMode: event.target.checked })}
              />
              <span>EXモード</span>
            </label>
            {normalizedInput.exMode ? (
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
                    <option value="none">不一致</option>
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
            <button type="button" className="secondary-button" onClick={downloadCsv}>
              <Download size={18} />
              CSV
            </button>
          </div>
        </form>

        <section className="results-column">
          <ResultSummary result={result} species={species} />
          <ResultDetail result={detailResult} currentResultId={result.id} selectedHistoryId={selectedHistoryId} />
          <HistoryTable history={history} selectedId={selectedHistoryId} onSelect={setSelectedHistoryId} onDownload={downloadCsv} />
        </section>
      </section>
    </main>
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
  selectedHistoryId
}: {
  result: CalcResult;
  currentResultId: string;
  selectedHistoryId: string | null;
}) {
  return (
    <section className="panel detail">
      <div className="panel-heading">
        <h2>{selectedHistoryId ? '履歴詳細' : '現在の詳細'}</h2>
        <span>{new Date(result.createdAt).toLocaleString('ja-JP')}</span>
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
  onDownload
}: {
  history: CalcResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
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
                <th>総エナジー</th>
                <th>内訳</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr
                  key={item.id}
                  className={selectedId === item.id ? 'selected' : ''}
                  onClick={() => onSelect(item.id)}
                >
                  <td>{new Date(item.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{item.speciesName}</td>
                  <td>{item.level}</td>
                  <td>{formatNumber(item.totalEnergy)}</td>
                  <td>
                    {formatNumber(item.berryEnergy)} / {formatNumber(item.ingredientEnergy)} / {formatNumber(item.skillEnergy)}
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

function loadHistory() {
  try {
    const loaded = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) ?? '[]') as CalcResult[];
    return Array.isArray(loaded) ? loaded.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
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
