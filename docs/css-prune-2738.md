# Dead global CSS removed in #2738

Deleted whole rules only (postcss `root.toString()`, no reformatting of kept rules). A rule was deleted only when every selector in it contained a class that is referenced nowhere under `frontend/src` (tests included), `frontend/e2e`, `frontend/index.html`, `frontend/public`, `frontend/scripts` or `scripts/`, is not a prefix built by a template literal, string concatenation or quoted prefix, has no suffix built at runtime (`${x}__name`), is not a BEM modifier of a used base whose `base--` prefix appears in source, and is not a class emitted by recharts, maplibre-gl, react-router, TanStack, pmtiles or react-dom (checked against their dist tokens, plus a blanket keep for `recharts-*`/`maplibregl-*`/`maplibre-*`/`react-*`/`rc-*`). Selectors with `[class...]` attribute matches were kept. Classes inside `:not()/:is()/:where()/:has()` were ignored when deciding. Nested rules inside kept rules were treated the same way. Empty `@media` shells left behind were removed.

Not touched: `dark-mode.css`, `buttons.css`, `index.css`, `tokens/rt-brand-v1.css`.

## frontend/src/styles/components/typography.css (34 rules)

Every `.tm-typography`/`.tm-headline-*`/`.tm-text-*`/`.tm-font-*`/`.tm-leading-*` class. No literal use anywhere; no template prefix `tm-text-${`, `tm-font-${` or `tm-leading-${` exists (grep of `tm-(text|font|leading|headline)-` hits only CSS and the guard test); the live `.tm-body` and `.tm-h2` rules are kept.

- `.tm-typography`
- `.tm-headline-h1`
- `.tm-headline-h2`
- `.tm-headline-h3`
- `.tm-nav-text`
- `.tm-body-large`
- `.tm-caption`
- `.tm-headline-h1`
- `.tm-headline-h2`
- `.tm-headline-h3`
- `.tm-body-large`
- `.tm-headline-h1`
- `.tm-headline-h2`
- `.tm-headline-h3`
- `.tm-text-xs`
- `.tm-text-sm`
- `.tm-text-base`
- `.tm-text-lg`
- `.tm-text-xl`
- `.tm-text-2xl`
- `.tm-text-3xl`
- `.tm-text-4xl`
- `.tm-text-5xl`
- `.tm-text-6xl`
- `.tm-font-regular`
- `.tm-font-medium`
- `.tm-font-semibold`
- `.tm-font-bold`
- `.tm-font-black`
- `.tm-leading-tight`
- `.tm-leading-snug`
- `.tm-leading-normal`
- `.tm-leading-relaxed`
- `.tm-leading-loose`

## frontend/src/styles/components/navigation.css (15 rules)

Every `.tm-nav*` class. None is referenced outside CSS; no`tm-nav-${`/`tm-nav-` + concatenation exists, no clsx/cn map names these.

- `.tm-navigation`
- `.tm-nav`
- `.tm-nav-item`
- `.tm-nav-item:hover:not(:disabled)`
- `.tm-nav-item:active:not(:disabled)`
- `.tm-nav-item:focus-visible`
- `.tm-nav-item[aria-current="page"], .tm-nav-item.active`
- `.tm-nav-item:disabled`
- `.tm-nav-item:disabled:hover`
- `.tm-nav-menu`
- `.tm-nav-menu`
- `.tm-nav-item`
- `.tm-nav-brand`
- `.tm-nav-brand:hover`
- `.tm-nav-brand:focus-visible`

## frontend/src/styles/components/headers.css (19 rules)

Every `.tm-header*` rule (including `.tm-header-title`/`.tm-header-content`). No component renders a `tm-header*` class; no `tm-header-${` template or concatenation exists. The only `${id}-title` / `${id}-content` strings in source are element ids (CollapsibleSection, RollupPanels, ...), not class names, and none is ever given the `tm-header` base.

- `.tm-header`
- `.tm-header-primary`
- `.tm-header-secondary`
- `.tm-header-content`
- `.tm-header-title`
- `.tm-header-title.tm-h1`
- `.tm-header-title.tm-h2`
- `.tm-header-title.tm-h3`
- `.tm-header-actions`
- `.tm-header-actions.align-left`
- `.tm-header-actions.align-center`
- `.tm-header-actions.align-right`
- `.tm-header`
- `.tm-header-content`
- `.tm-header-actions`
- `.tm-header-title`
- `.tm-header + .tm-navigation, .tm-navigation + .tm-header`
- `.tm-header [role="banner"]`
- `.tm-header .tm-header-title:focus-visible`

## frontend/src/styles/components/forms.css (2 rules)

`.tm-form-*-wrapper--disabled`: FormCheckbox.tsx and FormRadio.tsx put `tm-form-checkbox--disabled` / `tm-form-radio--disabled` on the wrapper (`stateClasses`), never `*-wrapper--disabled`, and neither builds the modifier from a template (`tm-form-checkbox-wrapper ${stateClasses}` is a fixed base plus the two fixed state strings).

- `.tm-form-checkbox-wrapper--disabled, .tm-form-radio-wrapper--disabled`
- `.tm-form-checkbox-wrapper--disabled .tm-form-checkbox__label, .tm-form-radio-wrapper--disabled .tm-form-radio__label`

## frontend/src/styles/responsive.css (63 rules)

The `.tm-interactive`, `.tm-responsive-*`, `.tm-fluid-text`, `.tm-brand-*`, `.tm-*-fluid`, `.tm-gradient-*`, `.tm-show-*`/`.tm-hide-*` utilities and the nested `.tm-nav-items`/`.tm-nav-item` rules under `.tm-nav-responsive`. No literal use; show/hide is only ever written as a full literal in CSS; no template prefix for any of those stems. Also the `.tm-btn-responsive`, `.tm-btn-primary-responsive`, `.tm-btn-secondary-responsive`, `.tm-card-responsive` and `.tm-nav-responsive` family: the only occurrences in the repo are in this file (Card.tsx uses the `tm-card-default|elevated|outlined|padding-*|interactive` literals instead; the single `-responsive` template in source is a Jest-style test name in componentTestUtils.tsx, not a class).

- `.tm-interactive`
- `.tm-responsive-container`
- `.tm-fluid-text`
- `.tm-brand-header`
- `.tm-brand-nav`
- `.tm-responsive-container`
- `.tm-fluid-text`
- `.tm-interactive`
- `.tm-brand-nav`
- `.tm-brand-header`
- `.tm-responsive-container`
- `.tm-fluid-text`
- `.tm-interactive`
- `.tm-brand-nav`
- `.tm-brand-header`
- `.tm-responsive-container`
- `.tm-fluid-text`
- `.tm-interactive`
- `.tm-brand-nav`
- `.tm-brand-header`
- `.tm-h1-fluid`
- `.tm-h2-fluid`
- `.tm-h3-fluid`
- `.tm-body-fluid`
- `.tm-nav-fluid`
- `.tm-gradient-optimized`
- `.tm-gradient-optimized`
- `.tm-gradient-loyal-blue-mobile`
- `.tm-gradient-true-maroon-mobile`
- `.tm-gradient-cool-gray-mobile`
- `.tm-btn-responsive`
- `.tm-btn-primary-responsive`
- `.tm-btn-secondary-responsive`
- `.tm-card-responsive`
- `.tm-nav-responsive`
- `.tm-nav-items`
- `.tm-nav-item`
- `.tm-nav-items`
- `.tm-nav-item`
- `.tm-nav-item`
- `.tm-nav-item`
- `.tm-brand-header, .tm-brand-nav`
- `.tm-interactive`
- `.tm-btn-responsive, .tm-nav-item, .tm-interactive`
- `.tm-show-mobile`
- `.tm-hide-mobile`
- `.tm-show-mobile`
- `.tm-hide-mobile`
- `.tm-show-tablet`
- `.tm-hide-tablet`
- `.tm-show-tablet`
- `.tm-hide-tablet`
- `.tm-show-desktop`
- `.tm-hide-desktop`
- `.tm-show-desktop`
- `.tm-hide-desktop`
- `.tm-show-wide`
- `.tm-hide-wide`
- `.tm-responsive-spacing`
- `.tm-responsive-grid`
- `.tm-brand-header, .tm-brand-nav`
- `.tm-btn-responsive`
- `.tm-hide-print`
