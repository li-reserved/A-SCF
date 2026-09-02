# Design QA

## Comparison Target

- Source visual truth: `/var/folders/80/9dqcly3n15n7nl6rcg0dw5wr0000gn/T/codex-clipboard-1524d731-7a6b-40bb-8d6e-6da22f0a1725.jpg`
- GS frequency reference: `/var/folders/80/9dqcly3n15n7nl6rcg0dw5wr0000gn/T/codex-clipboard-676f2969-454b-4899-b4a8-36000794d4c7.png`
- Funding-group reference: `/var/folders/80/9dqcly3n15n7nl6rcg0dw5wr0000gn/T/codex-clipboard-093402fb-4ba8-4578-876f-1473ecf67135.png`
- Implementation: `http://127.0.0.1:5177/after-hours?code=600183`
- Desktop evidence: `design-qa-artifacts/after-hours-single-stock-desktop.png`
- Mobile evidence: `design-qa-artifacts/after-hours-single-stock-mobile.png`
- Combined source/implementation evidence: `design-qa-artifacts/comparison-after-hours-single-stock.png`
- GS single-trigger desktop evidence: `design-qa-artifacts/after-hours-gs-single-trigger-600183.png`
- GS single-trigger mobile evidence: `design-qa-artifacts/after-hours-gs-single-trigger-mobile.png`
- GS single-trigger comparison: `design-qa-artifacts/comparison-after-hours-gs-single-trigger.png`
- Funding-group desktop evidence: `design-qa-artifacts/after-hours-fund-grouping-desktop.png`
- Funding-group mobile evidence: `design-qa-artifacts/after-hours-fund-grouping-mobile-focused.png`
- Funding-group focused comparison: `design-qa-artifacts/comparison-after-hours-fund-grouping.png`
- State: light product shell, dark single-stock analysis panel, live `600183 生益科技` data and latest confirmed G signal.

## Dimensions And Normalization

- Source: 797 x 536 px.
- GS frequency reference: 932 x 330 px.
- Desktop implementation: 1280 x 720 px from a 1280 x 720 CSS viewport; browser DPR 2 with CSS-normalized screenshot output.
- Mobile implementation: 390 x 844 px from a 390 x 844 CSS viewport; browser DPR 1.
- Combined comparison: 2047 x 536 px. The source remains 797 x 536; the implementation's analysis panel was cropped from the desktop capture and proportionally normalized to 1226 x 536, with a 24 px divider.
- GS comparison: 1677 x 330 px. The 932 x 330 reference remains at native size; the implementation panel was proportionally normalized to 721 x 330, with a 24 px divider.
- Funding-group comparison: the reference funding region and implementation funding section were normalized to 476 px high and placed side by side with a 24 px divider.
- Funding-group proportions: desktop rendered 272.88 px for main funds and 136.45 px for retail; mobile rendered 209.33 px and 104.66 px. Both are a stable 2:1 split.

## Findings

- No actionable P0, P1, or P2 differences remain.
- P3: the reference uses candlesticks inside a legacy trading terminal, while the implementation uses the product's existing Recharts price, MA5 and dark-flow lines. This is intentional: it preserves the requested G/S turning points and price-direction context without introducing a second chart system.
- P3: promotional arrows and explanatory overlays from the reference are represented as persistent G/S definitions and an explicit public-proxy disclosure, so the operational screen remains scannable.
- The prior dense G/S markers were a P1 behavioral mismatch. The chart now confirms a regime only after three consecutive same-direction dark-flow observations and displays at most the latest G and latest S.
- The prior equal-width 明盘/暗盘/散户 layout was a P1 hierarchy mismatch. The final layout groups 明盘 and 暗盘 inside the left-side 主力资金 region and places 散户资金 independently on the right.
- Both funding regions use the same symmetric Y-axis domain, so bar heights remain directly comparable instead of being independently scaled.

## Fidelity Surfaces

- Fonts and typography: the existing Inter/PingFang stack, tabular numbers, compact labels and zero letter spacing remain consistent with the product. Current quote and G/S state form the dominant hierarchy; labels do not wrap or collide at either viewport.
- Spacing and layout: the desktop panel separates quote, signal, trend and funding structure through restrained borders. At 390 px, these regions stack in the same order with no horizontal overflow (`scrollWidth = innerWidth = 390`).
- Colors and tokens: terminal black, muted dividers, rose/red inflow and G states, emerald/green outflow and S states match the source semantics and the application's A-share conventions. No gradients or heavy shadows were added.
- Image and asset quality: the supplied image is behavior and composition reference rather than an application image asset. Charts use the existing Recharts dependency and icons use the installed Lucide set; there are no placeholder images, handcrafted SVGs, CSS illustrations or rasterized UI substitutes.
- Copy and content: the screen contains `G 信号 / 趋势有望启动` and `S 信号 / 趋势暂缓或结束`, labels 明盘、暗盘、散户, the confirmation date, the three-day same-direction rule, and a clear statement that the public proxy is not proprietary L2 data or investment advice.

## Interaction And Runtime Checks

- Default query: `000001` rendered 平安银行 with current quote, 90 daily dark-flow points, funding bars and G signal.
- Stock switch: submitting `600519` changed the URL and rendered 贵州茅台, refreshed quote, funding amounts and G/S state.
- Invalid input: submitting `123` showed `请输入 6 位 A 股代码`, retained the 贵州茅台 result and did not change the URL.
- GS frequency: `600183` rendered one S at `2026-06-18` and one G at `2026-08-06`; no other historical GS labels remain in the 60-day view.
- GS basis: the state machine reads only actual `superLarge` public-proxy values. Price determines the vertical marker position but does not trigger a signal.
- Refresh behavior: the security endpoint refreshes every 30 seconds through the existing `useMarketData` lifecycle.
- Console: the tab retained one historical `dailyPoints.map` error from before the boundary fix. After the fix was loaded at `2026-08-14T04:11:34.646Z`, switching stocks, testing invalid input and returning to `000001` produced no new error entries.
- Validation: `npm run typecheck`, both modified server-script syntax checks, `git diff --check`, and `npm run build` passed.

## Full-View And Focused Evidence

- Full view: `after-hours-fund-grouping-desktop.png` confirms the query, quote, current signal, G/S definitions, 60-day chart and grouped funding structure are visible in the first desktop viewport.
- Focused comparison: `comparison-after-hours-fund-grouping.png` places the supplied funding reference and the rendered funding section in one image. It confirms the left-side 主力资金 group with 明盘/暗盘 children and the independent right-side 散户资金 group.
- GS comparison: `comparison-after-hours-gs-single-trigger.png` places the supplied one-S/one-G reference beside the `600183` implementation. Both show one exit marker near the earlier high region and one entry marker near the later recovery region, without repeated labels.
- Responsive view: `after-hours-single-stock-mobile.png` confirms the search remains usable, the quote and current signal stack cleanly, and the chart continues below the first viewport without clipping the page horizontally.
- Updated responsive view: `after-hours-gs-single-trigger-mobile.png` confirms the longer funding-confirmation labels fit at 390 x 844 with `scrollWidth = innerWidth = 390`.
- Funding responsive view: `after-hours-fund-grouping-mobile-focused.png` confirms the 2:1 main/retail relationship remains visible at 390 x 844 with no horizontal overflow.

## Comparison History

- Runtime pass 1 finding: the first API response after the backend shape changed could omit `fundFlow.dailyPoints`, causing a render-time TypeError.
- Runtime pass 1 fix: normalized that external-data boundary with `(data.fundFlow.dailyPoints ?? [])` before building the historical map.
- Post-fix evidence: the `600519`, invalid `123`, and restored `000001` states completed with no new console errors.
- Visual pass 1 evidence: the combined comparison found no P0/P1/P2 mismatch; only the intentional P3 chart-style and annotation differences above remain.
- GS pass 1 finding: every daily dark-flow sign change produced another marker, creating a dense series unrelated to the reference's one-time regime signals.
- GS pass 1 fix: introduced a three-consecutive-day funding confirmation state machine and retained only the most recent event of each type.
- GS pass 2 evidence: `after-hours-gs-single-trigger-600183.png` and the combined comparison show exactly one S and one G; desktop/mobile layout, console, types and production build passed.
- Funding pass 1 finding: 明盘、暗盘、散户 were presented as three equal peers, obscuring that 主力资金 is the sum of 明盘 and 暗盘.
- Funding pass 1 fix: introduced a 2:1 main/retail split, moved 明盘 and 暗盘 into the main region, added visible bar amounts and removed the duplicate bottom summary.
- Funding pass 2 evidence: the focused source/implementation comparison confirms the hierarchy; `600519` query and return to `600183` passed, the browser reported no errors or warnings, and typecheck/build/diff checks passed.

## Implementation Checklist

- [x] Replace the former industry overview with a six-digit single-stock query.
- [x] Show current 明盘、暗盘、散户 funding structure and public proxy definitions.
- [x] Present 主力资金 on the left with 明盘/暗盘 children and 散户资金 independently on the right using one shared chart scale.
- [x] Derive G/S only from confirmed funding direction and show no more than one recent G and one recent S.
- [x] Verify default, stock-switch, invalid, desktop and mobile states.
- [x] Pass type, syntax, diff and production-build validation.

final result: passed
