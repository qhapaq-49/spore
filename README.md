# Pokemon Sleep Expected Value Checker

広告なしで GitHub Pages に置ける、ポケモンスリープの期待値チェッカーです。

## Commands

```bash
npm install
npm run update-data
npm run test
npm run build
npm run dev
```

`npm run update-data` は Neroli's Lab の公開データを取得し、アプリで使う `src/data/pokemon-sleep.generated.json` を生成します。

## Data Sources

- Pokemon species, ingredient, berry, nature, subskill, and main-skill data are derived from Neroli's Lab.
- Calculation formulas are implemented with reference to Pokemon Sleep community verification data on WIKIWIKI.

See `NOTICE` for attribution.

## Calculation Notes

仕様が未確定の計算論点は [`docs/spec-notes.md`](docs/spec-notes.md) にメモしています。
