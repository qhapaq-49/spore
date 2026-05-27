import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { Berry, Ingredient, MainSkill, Nature, PokemonSleepDataset, PokemonSpecies, Subskill } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const cacheDir = resolve(rootDir, '.cache', 'nerolis-lab');
const outputPath = resolve(rootDir, 'src', 'data', 'pokemon-sleep.generated.json');
const repoUrl = 'https://github.com/nerolis-lab/nerolis-lab.git';

const INGREDIENT_JA: Record<string, string> = {
  Apple: 'とくせんリンゴ',
  Milk: 'モーモーミルク',
  Soybean: 'ワカクサ大豆',
  Honey: 'あまいミツ',
  Sausage: 'マメミート',
  Ginger: 'あったかジンジャー',
  Tomato: 'あんみんトマト',
  Egg: 'とくせんエッグ',
  Oil: 'ピュアなオイル',
  Potato: 'ほっこりポテト',
  Herb: 'げきからハーブ',
  Corn: 'ワカクサコーン',
  Cacao: 'リラックスカカオ',
  Coffee: 'めざましコーヒー',
  Avocado: 'ワカクサアボカド',
  Mushroom: 'あじわいキノコ',
  Leek: 'ふといながねぎ',
  Pumpkin: 'おおきなパンプキン',
  Tail: 'おいしいシッポ',
  Locked: '未解放'
};

const BERRY_JA: Record<string, string> = {
  BELUE: 'ベリブのみ',
  BLUK: 'ブリーのみ',
  CHERI: 'クラボのみ',
  CHESTO: 'カゴのみ',
  DURIN: 'ドリのみ',
  FIGY: 'フィラのみ',
  GREPA: 'ウブのみ',
  LEPPA: 'ヒメリのみ',
  LUM: 'ラムのみ',
  MAGO: 'マゴのみ',
  ORAN: 'オレンのみ',
  PAMTRE: 'シーヤのみ',
  PECHA: 'モモンのみ',
  PERSIM: 'キーのみ',
  RAWST: 'チーゴのみ',
  SITRUS: 'オボンのみ',
  WIKI: 'ウイのみ',
  YACHE: 'ヤチェのみ'
};

const NATURE_JA: Record<string, string> = {
  Lonely: 'さみしがり',
  Adamant: 'いじっぱり',
  Naughty: 'やんちゃ',
  Brave: 'ゆうかん',
  Bold: 'ずぶとい',
  Impish: 'わんぱく',
  Lax: 'のうてんき',
  Relaxed: 'のんき',
  Modest: 'ひかえめ',
  Mild: 'おっとり',
  Rash: 'うっかりや',
  Quiet: 'れいせい',
  Calm: 'おだやか',
  Gentle: 'おとなしい',
  Careful: 'しんちょう',
  Sassy: 'なまいき',
  Timid: 'おくびょう',
  Hasty: 'せっかち',
  Jolly: 'ようき',
  Naive: 'むじゃき',
  Bashful: 'てれや',
  Hardy: 'がんばりや',
  Docile: 'すなお',
  Quirky: 'きまぐれ',
  Serious: 'まじめ'
};

const SUBSKILL_JA: Record<string, string> = {
  'Berry Finding S': 'きのみの数S',
  'Energy Recovery Bonus': 'げんき回復ボーナス',
  'Helping Bonus': 'おてつだいボーナス',
  'Helping Speed S': 'おてつだいスピードS',
  'Helping Speed M': 'おてつだいスピードM',
  'Ingredient Finder S': '食材確率アップS',
  'Ingredient Finder M': '食材確率アップM',
  'Inventory Up S': '最大所持数アップS',
  'Inventory Up M': '最大所持数アップM',
  'Inventory Up L': '最大所持数アップL',
  'Skill Level Up S': 'スキルレベルアップS',
  'Skill Level Up M': 'スキルレベルアップM',
  'Skill Trigger S': 'スキル確率アップS',
  'Skill Trigger M': 'スキル確率アップM',
  'Sleep EXP Bonus': '睡眠EXPボーナス',
  'Dream Shard Bonus': 'ゆめのかけらボーナス',
  'Research EXP Bonus': 'リサーチEXPボーナス'
};

const MAIN_SKILL_JA: Record<string, string> = {
  'Berry Burst': 'きのみバースト',
  'Berry Juice (Energy For Everyone S)': 'きのみジュース（げんきオールS）',
  'Disguise (Berry Burst)': 'ばけのかわ（きのみバースト）',
  'Charge Energy S': 'げんきチャージS',
  'Moonlight (Charge Energy S)': 'つきのひかり（げんきチャージS）',
  'Charge Strength S': 'エナジーチャージS',
  'Charge Strength S (Range)': 'エナジーチャージS（ランダム）',
  'Charge Strength S Range': 'エナジーチャージS（ランダム）',
  'Stockpile (Charge Strength S)': 'たくわえる（エナジーチャージS）',
  'Charge Strength M': 'エナジーチャージM',
  'Bad Dreams (Charge Strength M)': 'あくむ（エナジーチャージM）',
  'Cooking Assist S (Bulk Up)': 'ビルドアップ（料理サポートS）',
  'Bulk Up (Cooking Assist S)': 'ビルドアップ（料理サポートS）',
  'Cooking Power-Up S': '料理パワーアップS',
  'Cooking Power-Up S Minus': '料理パワーアップSマイナス',
  'Minus (Cooking Power-Up S)': '料理パワーアップSマイナス',
  'Dream Shard Magnet S': 'ゆめのかけらゲットS',
  'Dream Shard Magnet S (Range)': 'ゆめのかけらゲットS（ランダム）',
  'Dream Shard Magnet S Range': 'ゆめのかけらゲットS（ランダム）',
  'Energizing Cheer S': 'げんきエールS',
  'Heal Pulse (Energizing Cheer S)': 'いやしのはどう（げんきエールS）',
  'Nuzzle (Energizing Cheer S)': 'ほっぺすりすり（げんきエールS）',
  'Energy for Everyone S': 'げんきオールS',
  'Energy For Everyone S': 'げんきオールS',
  'Berry Juice (Energy for Everyone S)': 'きのみジュース（げんきオールS）',
  'Lunar Blessing (Energy for Everyone S)': 'みかづきのいのり（げんきオールS）',
  'Lunar Blessing (Energy For Everyone S)': 'みかづきのいのり（げんきオールS）',
  'Extra Helpful S': 'おてつだいサポートS',
  'Helper Boost': 'おてつだいブースト',
  'Ingredient Draw S': '食材セレクトS',
  'Hyper Cutter (Ingredient Draw S)': 'かいりきバサミ（食材セレクトS）',
  'Super Luck (Ingredient Draw S)': 'きょううん（食材セレクトS）',
  'Ingredient Magnet S': '食材ゲットS',
  'Ingredient Magnet S Plus': '食材ゲットSプラス',
  'Plus (Ingredient Magnet S)': '食材ゲットSプラス',
  'Present (Ingredient Magnet S)': 'プレゼント（食材ゲットS）',
  Metronome: 'ゆびをふる',
  'Mimic (Skill Copy)': 'ものまね',
  'Transform (Skill Copy)': 'へんしん',
  'Tasty Chance S': '料理チャンスS'
};

const POKEMON_JA: Record<string, string> = {
  DARKRAI: 'ダークライ',
  CATERPIE: 'キャタピー',
  METAPOD: 'トランセル',
  BUTTERFREE: 'バタフリー',
  RATTATA: 'コラッタ',
  RATICATE: 'ラッタ',
  EKANS: 'アーボ',
  ARBOK: 'アーボック',
  PIKACHU: 'ピカチュウ',
  PIKACHU_HALLOWEEN: 'ハロウィンピカチュウ',
  PIKACHU_HOLIDAY: 'ホリデーピカチュウ',
  RAICHU: 'ライチュウ',
  CLEFAIRY: 'ピッピ',
  CLEFABLE: 'ピクシー',
  VULPIX: 'ロコン',
  VULPIX_ALOLAN: 'ロコン（アローラ）',
  NINETALES: 'キュウコン',
  NINETALES_ALOLAN: 'キュウコン（アローラ）',
  MANKEY: 'マンキー',
  PRIMEAPE: 'オコリザル',
  DODUO: 'ドードー',
  DODRIO: 'ドードリオ',
  ONIX: 'イワーク',
  CUBONE: 'カラカラ',
  MAROWAK: 'ガラガラ',
  EEVEE_HOLIDAY: 'ホリデーイーブイ',
  CHIKORITA: 'チコリータ',
  BAYLEEF: 'ベイリーフ',
  MEGANIUM: 'メガニウム',
  CYNDAQUIL: 'ヒノアラシ',
  QUILAVA: 'マグマラシ',
  TYPHLOSION: 'バクフーン',
  TOTODILE: 'ワニノコ',
  CROCONAW: 'アリゲイツ',
  FERALIGATR: 'オーダイル',
  NATU: 'ネイティ',
  XATU: 'ネイティオ',
  PICHU: 'ピチュー',
  CLEFFA: 'ピィ',
  STEELIX: 'ハガネール',
  SNEASEL: 'ニューラ',
  HOUNDOUR: 'デルビル',
  HOUNDOOM: 'ヘルガー',
  TORCHIC: 'アチャモ',
  COMBUSKEN: 'ワカシャモ',
  BLAZIKEN: 'バシャーモ',
  MUDKIP: 'ミズゴロウ',
  MARSHTOMP: 'ヌマクロー',
  SWAMPERT: 'ラグラージ',
  SLAKOTH: 'ナマケロ',
  VIGOROTH: 'ヤルキモノ',
  SLAKING: 'ケッキング',
  SWABLU: 'チルット',
  ALTARIA: 'チルタリス',
  SHUPPET: 'カゲボウズ',
  BANETTE: 'ジュペッタ',
  SPHEAL: 'タマザラシ',
  SPHEAL_HOLIDAY: 'ホリデータマザラシ',
  SEALEO: 'トドグラー',
  WALREIN: 'トドゼルガ',
  BAGON: 'タツベイ',
  SHELGON: 'コモルー',
  SALAMENCE: 'ボーマンダ',
  WEAVILE: 'マニューラ',
  MUNNA: 'ムンナ',
  MUSHARNA: 'ムシャーナ',
  TYRUNT: 'チゴラス',
  TYRANTRUM: 'ガチゴラス',
  BULBASAUR: 'フシギダネ',
  IVYSAUR: 'フシギソウ',
  VENUSAUR: 'フシギバナ',
  CHARMANDER: 'ヒトカゲ',
  CHARMELEON: 'リザード',
  CHARIZARD: 'リザードン',
  SQUIRTLE: 'ゼニガメ',
  WARTORTLE: 'カメール',
  BLASTOISE: 'カメックス',
  DIGLETT: 'ディグダ',
  DUGTRIO: 'ダグトリオ',
  BELLSPROUT: 'マダツボミ',
  WEEPINBELL: 'ウツドン',
  VICTREEBEL: 'ウツボット',
  GEODUDE: 'イシツブテ',
  GRAVELER: 'ゴローン',
  GOLEM: 'ゴローニャ',
  FARFETCHD: 'カモネギ',
  GASTLY: 'ゴース',
  HAUNTER: 'ゴースト',
  GENGAR: 'ゲンガー',
  KANGASKHAN: 'ガルーラ',
  CHANSEY: 'ラッキー',
  BLISSEY: 'ハピナス',
  MR_MIME: 'バリヤード',
  MIME_JR: 'マネネ',
  PINSIR: 'カイロス',
  DITTO: 'メタモン',
  DRATINI: 'ミニリュウ',
  DRAGONAIR: 'ハクリュー',
  DRAGONITE: 'カイリュー',
  WOOPER: 'ウパー',
  WOOPER_PALDEAN: 'ウパー（パルデア）',
  QUAGSIRE: 'ヌオー',
  CLODSIRE: 'ドオー',
  DELIBIRD: 'デリバード',
  LARVITAR: 'ヨーギラス',
  PUPITAR: 'サナギラス',
  TYRANITAR: 'バンギラス',
  MAWILE: 'クチート',
  ARON: 'ココドラ',
  LAIRON: 'コドラ',
  AGGRON: 'ボスゴドラ',
  TRAPINCH: 'ナックラー',
  VIBRAVA: 'ビブラーバ',
  FLYGON: 'フライゴン',
  ABSOL: 'アブソル',
  SHINX: 'コリンク',
  LUXIO: 'ルクシオ',
  LUXRAY: 'レントラー',
  HAPPINY: 'ピンプク',
  SPIRITOMB: 'ミカルゲ',
  CROAGUNK: 'グレッグル',
  TOXICROAK: 'ドクロッグ',
  SNOVER: 'ユキカブリ',
  ABOMASNOW: 'ユキノオー',
  PUMPKABOO_SMALL: 'バケッチャ（ちいさい）',
  PUMPKABOO_MEDIUM: 'バケッチャ（ふつう）',
  PUMPKABOO_LARGE: 'バケッチャ（おおきい）',
  PUMPKABOO_JUMBO: 'バケッチャ（とくだい）',
  GOURGEIST_SMALL: 'パンプジン（ちいさい）',
  GOURGEIST_MEDIUM: 'パンプジン（ふつう）',
  GOURGEIST_LARGE: 'パンプジン（おおきい）',
  GOURGEIST_JUMBO: 'パンプジン（とくだい）',
  GRUBBIN: 'アゴジムシ',
  CHARJABUG: 'デンヂムシ',
  VIKAVOLT: 'クワガノン',
  CUTIEFLY: 'アブリー',
  RIBOMBEE: 'アブリボン',
  STUFFUL: 'ヌイコグマ',
  BEWEAR: 'キテルグマ',
  COMFEY: 'キュワワー',
  CRAMORANT: 'ウッウ',
  SPRIGATITO: 'ニャオハ',
  FLORAGATO: 'ニャローテ',
  MEOWSCARADA: 'マスカーニャ',
  FUECOCO: 'ホゲータ',
  CROCALOR: 'アチゲータ',
  SKELEDIRGE: 'ラウドボーン',
  QUAXLY: 'クワッス',
  QUAXWELL: 'ウェルカモ',
  QUAQUAVAL: 'ウェーニバル',
  CETODDLE: 'アルクジラ',
  CETITAN: 'ハルクジラ',
  SANDSHREW: 'サンド',
  SANDSLASH: 'サンドパン',
  JIGGLYPUFF: 'プリン',
  WIGGLYTUFF: 'プクリン',
  IGGLYBUFF: 'ププリン',
  MEOWTH: 'ニャース',
  PERSIAN: 'ペルシアン',
  PSYDUCK: 'コダック',
  GOLDUCK: 'ゴルダック',
  GROWLITHE: 'ガーディ',
  ARCANINE: 'ウインディ',
  SLOWPOKE: 'ヤドン',
  SLOWBRO: 'ヤドラン',
  SLOWKING: 'ヤドキング',
  MAGNEMITE: 'コイル',
  MAGNETON: 'レアコイル',
  MAGNEZONE: 'ジバコイル',
  EEVEE: 'イーブイ',
  EEVEE_HALLOWEEN: 'ハロウィンイーブイ',
  VAPOREON: 'シャワーズ',
  JOLTEON: 'サンダース',
  FLAREON: 'ブースター',
  ESPEON: 'エーフィ',
  UMBREON: 'ブラッキー',
  LEAFEON: 'リーフィア',
  GLACEON: 'グレイシア',
  SYLVEON: 'ニンフィア',
  TOGEPI: 'トゲピー',
  TOGETIC: 'トゲチック',
  TOGEKISS: 'トゲキッス',
  MAREEP: 'メリープ',
  FLAAFFY: 'モココ',
  AMPHAROS: 'デンリュウ',
  SUDOWOODO: 'ウソッキー',
  BONSLY: 'ウソハチ',
  MURKROW: 'ヤミカラス',
  HONCHKROW: 'ドンカラス',
  WOBBUFFET: 'ソーナンス',
  WYNAUT: 'ソーナノ',
  SHUCKLE: 'ツボツボ',
  HERACROSS: 'ヘラクロス',
  RAIKOU: 'ライコウ',
  ENTEI: 'エンテイ',
  SUICUNE: 'スイクン',
  TREECKO: 'キモリ',
  GROVYLE: 'ジュプトル',
  SCEPTILE: 'ジュカイン',
  RALTS: 'ラルトス',
  KIRLIA: 'キルリア',
  GARDEVOIR: 'サーナイト',
  GALLADE: 'エルレイド',
  SABLEYE: 'ヤミラミ',
  PLUSLE: 'プラスル',
  MINUN: 'マイナン',
  GULPIN: 'ゴクリン',
  SWALOT: 'マルノーム',
  LATIAS: 'ラティアス',
  DRIFLOON: 'フワンテ',
  DRIFBLIM: 'フワライド',
  RIOLU: 'リオル',
  LUCARIO: 'ルカリオ',
  CRESSELIA: 'クレセリア',
  DWEBBLE: 'イシズマイ',
  CRUSTLE: 'イワパレス',
  RUFFLET: 'ワシボン',
  BRAVIARY: 'ウォーグル',
  DEDENNE: 'デデンネ',
  NOIBAT: 'オンバット',
  NOIVERN: 'オンバーン',
  TOGEDEMARU: 'トゲデマル',
  MIMIKYU: 'ミミッキュ',
  TOXEL: 'エレズン',
  TOXTRICITY_AMPED: 'ストリンダー（ハイ）',
  TOXTRICITY_LOW_KEY: 'ストリンダー（ロー）',
  PAWMI: 'パモ',
  PAWMO: 'パモット',
  PAWMOT: 'パーモット'
};

interface UpstreamIngredient {
  name: string;
  value: number;
  longName: string;
}

interface UpstreamBerry {
  name: string;
  value: number;
  type: string;
}

interface UpstreamIngredientDrop {
  ingredient: UpstreamIngredient;
  amount: number;
}

interface UpstreamPokemon {
  name: string;
  displayName: string;
  pokedexNumber: number;
  specialty: PokemonSpecies['specialty'];
  frequency: number;
  ingredientPercentage: number;
  skillPercentage: number;
  berry: UpstreamBerry;
  carrySize: number;
  previousEvolutions: number;
  remainingEvolutions: number;
  ingredient0: UpstreamIngredientDrop[];
  ingredient30: UpstreamIngredientDrop[];
  ingredient60: UpstreamIngredientDrop[];
  skill: UpstreamMainSkill;
}

interface UpstreamNature {
  name: string;
  positiveModifier: string;
  negativeModifier: string;
  frequency: number;
  ingredient: number;
  skill: number;
  energy: number;
  exp: number;
}

interface UpstreamSubskill {
  name: string;
  shortName: string;
  amount: number;
  rarity: string;
}

interface UpstreamActivation {
  unit: string;
  amount: (params: { skillLevel: number; extra?: number; ingredient?: UpstreamIngredient }) => number;
}

interface UpstreamMainSkill {
  name: string;
  maxLevel: number;
  activations: Record<string, UpstreamActivation>;
}

function run(command: string, args: string[], cwd = rootDir) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

function runText(command: string, args: string[], cwd = rootDir) {
  return execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
}

function refreshUpstream() {
  rmSync(cacheDir, { force: true, recursive: true });
  mkdirSync(dirname(cacheDir), { recursive: true });
  run('git', ['clone', '--depth=1', '--filter=blob:none', '--sparse', repoUrl, cacheDir]);
  run('git', ['sparse-checkout', 'set', 'common'], cacheDir);
}

async function importTs<T>(path: string): Promise<T> {
  const url = pathToFileURL(resolve(cacheDir, path));
  url.searchParams.set('t', Date.now().toString());
  return (await import(url.href)) as T;
}

function activationAmounts(skill: UpstreamMainSkill, activation: UpstreamActivation, fallbackIngredient: UpstreamIngredient) {
  const maxLevel = Math.max(skill.maxLevel, 8);
  return Array.from({ length: maxLevel }, (_, index) => {
    const skillLevel = index + 1;
    try {
      return activation.amount({ skillLevel, ingredient: fallbackIngredient, extra: 0 });
    } catch {
      return 0;
    }
  });
}

function ingredientDrop(drop: UpstreamIngredientDrop) {
  return {
    ingredientId: drop.ingredient.name,
    amount: drop.amount
  };
}

function normalizeMainSkill(skill: UpstreamMainSkill, fallbackIngredient: UpstreamIngredient): MainSkill {
  return {
    id: skill.name,
    name: skill.name,
    nameJa: MAIN_SKILL_JA[skill.name] ?? skill.name,
    maxLevel: skill.maxLevel,
    activations: Object.entries(skill.activations).map(([name, activation]) => ({
      name,
      unit: activation.unit,
      amounts: activationAmounts(skill, activation, fallbackIngredient)
    }))
  };
}

function normalizePokemon(pokemon: UpstreamPokemon): PokemonSpecies {
  return {
    id: pokemon.name,
    name: pokemon.name,
    displayName: pokemon.displayName,
    displayNameJa: POKEMON_JA[pokemon.name] ?? pokemon.displayName,
    pokedexNumber: pokemon.pokedexNumber,
    specialty: pokemon.specialty,
    frequency: pokemon.frequency,
    ingredientPercentage: pokemon.ingredientPercentage,
    skillPercentage: pokemon.skillPercentage,
    berryId: pokemon.berry.name,
    carrySize: pokemon.carrySize,
    previousEvolutions: pokemon.previousEvolutions,
    remainingEvolutions: pokemon.remainingEvolutions,
    ingredient0: pokemon.ingredient0.map(ingredientDrop),
    ingredient30: pokemon.ingredient30.map(ingredientDrop),
    ingredient60: pokemon.ingredient60.map(ingredientDrop),
    skillId: pokemon.skill.name
  };
}

function normalizeIngredient(ingredient: UpstreamIngredient): Ingredient {
  return {
    id: ingredient.name,
    name: ingredient.longName,
    nameJa: INGREDIENT_JA[ingredient.name] ?? ingredient.longName,
    energy: ingredient.value
  };
}

function normalizeBerry(berry: UpstreamBerry): Berry {
  return {
    id: berry.name,
    name: berry.name,
    nameJa: BERRY_JA[berry.name] ?? berry.name,
    type: berry.type,
    energy: berry.value
  };
}

function normalizeNature(nature: UpstreamNature): Nature {
  return {
    id: nature.name,
    name: nature.name,
    nameJa: NATURE_JA[nature.name] ?? nature.name,
    positiveModifier: nature.positiveModifier,
    negativeModifier: nature.negativeModifier,
    frequency: nature.frequency,
    ingredient: nature.ingredient,
    skill: nature.skill,
    energy: nature.energy,
    exp: nature.exp
  };
}

function normalizeSubskill(subskill: UpstreamSubskill): Subskill {
  return {
    id: subskill.name,
    name: subskill.name,
    nameJa: SUBSKILL_JA[subskill.name] ?? subskill.name,
    shortName: subskill.shortName,
    amount: subskill.amount,
    rarity: subskill.rarity
  };
}

async function main() {
  refreshUpstream();

  const [{ COMPLETE_POKEDEX }, { INGREDIENTS_WITH_LOCKED }, { BERRIES }, { NATURES }, { SUBSKILLS }] =
    await Promise.all([
      importTs<{ COMPLETE_POKEDEX: UpstreamPokemon[] }>('common/src/types/pokemon/pokemon.ts'),
      importTs<{ INGREDIENTS_WITH_LOCKED: UpstreamIngredient[] }>('common/src/types/ingredient/ingredients.ts'),
      importTs<{ BERRIES: UpstreamBerry[] }>('common/src/types/berry/berries.ts'),
      importTs<{ NATURES: UpstreamNature[] }>('common/src/types/nature/nature.ts'),
      importTs<{ SUBSKILLS: UpstreamSubskill[] }>('common/src/types/subskill/subskills.ts')
    ]);

  const pokemon = COMPLETE_POKEDEX.map(normalizePokemon).sort(
    (a, b) => a.pokedexNumber - b.pokedexNumber || a.displayNameJa.localeCompare(b.displayNameJa, 'ja')
  );
  const ingredients = INGREDIENTS_WITH_LOCKED.map(normalizeIngredient);
  const berries = BERRIES.map(normalizeBerry);
  const natures = NATURES.map(normalizeNature);
  const subskills = SUBSKILLS.map(normalizeSubskill);
  const firstIngredient = INGREDIENTS_WITH_LOCKED.find((ingredient) => ingredient.value > 0) ?? INGREDIENTS_WITH_LOCKED[0];
  const mainSkillMap = new Map<string, MainSkill>();
  for (const species of COMPLETE_POKEDEX) {
    mainSkillMap.set(species.skill.name, normalizeMainSkill(species.skill, firstIngredient));
  }

  const dataset: PokemonSleepDataset = {
    generatedAt: new Date().toISOString(),
    source: {
      name: 'Neroli\'s Lab',
      url: repoUrl,
      commit: runText('git', ['rev-parse', 'HEAD'], cacheDir)
    },
    pokemon,
    ingredients,
    berries,
    mainSkills: Array.from(mainSkillMap.values()).sort((a, b) => a.nameJa.localeCompare(b.nameJa, 'ja')),
    natures,
    subskills
  };

  writeFileSync(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
  console.log(`${pokemon.length} pokemon, ${ingredients.length} ingredients, ${berries.length} berries`);

  const { generateDistributions } = await import('./generate-distributions');
  generateDistributions();
  console.log('Wrote public/distributions/pokemon-distributions.generated.json and species distributions');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
