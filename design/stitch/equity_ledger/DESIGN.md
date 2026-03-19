# Design System Document: The Executive Ledger

## 1. Overview & Creative North Star
**Creative North Star: "The Architectural Curator"**
This design system rejects the cluttered, line-heavy aesthetic of traditional financial tools. Instead, it adopts the persona of a high-end architectural portfolio. It is designed to feel "built" rather than "drawn." 

To move beyond the "standard dashboard" look, this system utilizes **Intentional Asymmetry** and **Tonal Depth**. We prioritize whitespace (breathing room) as a functional element that directs the eye toward critical financial data. The interface should feel like a series of premium, layered surfaces—mimicking the tactile experience of high-quality stationery and frosted glass partitions found in modern executive suites.

---

## 2. Colors & Surface Logic
The palette is rooted in deep, authoritative blues (`primary`) and grounded by sophisticated slate greys (`secondary`), with precision-targeted success greens (`tertiary`) for financial growth indicators.

### The "No-Line" Rule
**Strict Mandate:** Designers are prohibited from using 1px solid borders to section off content. 
Structure must be achieved through **Background Color Shifts**. For example, a global `background` (#f8f9fa) should house a sidebar in `surface_container_low` (#f3f4f5), and primary content cards in `surface_container_lowest` (#ffffff). This creates a sophisticated, seamless transition that feels expensive and custom-coded.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack. Use the container tiers to define "Importance through Elevation":
1.  **Base Layer:** `surface` (#f8f9fa)
2.  **Sectioning:** `surface_container` (#edeeef)
3.  **Active Workspace:** `surface_container_low` (#f3f4f5)
4.  **Priority Focus (Cards):** `surface_container_lowest` (#ffffff)

### The "Glass & Gradient" Rule
To add "soul" to the financial data, main CTAs and Hero Stats should use a subtle linear gradient from `primary` (#002f73) to `primary_container` (#06449e) at a 135-degree angle. Floating navigation or modal overlays must utilize **Glassmorphism**: use `surface_container_lowest` at 80% opacity with a `20px` backdrop-blur to maintain context of the data underneath.

---

## 3. Typography: Editorial Authority
We pair the geometric precision of **Manrope** for high-level data and headlines with the clinical legibility of **Inter** for tabular data and body text.

*   **Display & Headline (Manrope):** These are your "Statement" pieces. Use `display-md` (2.75rem) for total revenue or primary conference metrics. The wide aperture of Manrope conveys transparency and modernism.
*   **Title & Body (Inter):** Inter is used for "Workhorse" text. Use `title-sm` (1rem) for room allocation labels to ensure maximum readability in dense layouts.
*   **Label (Inter):** Use `label-md` and `label-sm` for micro-data (e.g., "Transaction ID"). Use `on_surface_variant` (#41474e) to keep these secondary to the actual numbers.

---

## 4. Elevation & Depth
In this system, depth is a tool for focus, not just decoration.

*   **The Layering Principle:** Achieve "lift" by stacking tokens. A `surface_container_lowest` card placed on a `surface_container` background creates a natural, soft separation.
*   **Ambient Shadows:** For "Floating" elements like dropdowns or active modals, use a custom shadow: `0 12px 32px rgba(25, 28, 29, 0.04)`. This mimics soft, natural ambient light rather than a harsh digital shadow.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility (e.g., in a high-density table), use `outline_variant` (#c1c7ce) at **20% opacity**. Never use 100% opacity for structural lines.
*   **Glassmorphism Depth:** When using glass layers, the `on_surface` text must remain high contrast (`#191c1d`) to ensure financial accessibility standards (WCAG 2.1) are met.

---

## 5. Components

### Buttons
*   **Primary:** Gradient fill (`primary` to `primary_container`), `xl` (0.75rem) roundedness. No border.
*   **Secondary:** `surface_container_high` fill with `on_surface` text.
*   **Tertiary:** Transparent background, `on_primary_fixed_variant` text, with a subtle underline appearing only on hover.

### Input Fields
*   **Style:** Minimalist. No bottom line or full box. Use a `surface_container_highest` (#e1e3e4) background with `sm` (0.125rem) roundedness. 
*   **Focus State:** A 2px "Ghost Border" of `surface_tint` (#2b5bb5) at 40% opacity.

### Cards & Financial Lists
*   **Rule:** Forbid the use of divider lines between list items. 
*   **Separation:** Use `spacing-4` (0.9rem) of vertical white space or alternating backgrounds (`surface_container_low` vs `surface_container_lowest`).
*   **Room Allocation Chips:** Use `secondary_container` (#cfe6f2) with `on_secondary_container` text. The roundedness should be `full` (9999px) for a distinct "pill" look that contrasts against the rectangularity of the dashboard.

### Data Visualization Components
*   **Progress Bars:** Use `tertiary_container` (#005613) for the track and `tertiary_fixed` (#a3f69c) for the progress fill. This creates a "glow" effect that symbolizes financial health.
*   **Allocation Maps:** Use the `spacing-1` (0.2rem) to create "gutters" between room blocks rather than lines.

---

## 6. Do's and Don'ts

### Do
*   **Do** use `spacing-10` (2.25rem) as your default margin for dashboard widgets to create an "Editorial" feel.
*   **Do** use `headline-sm` (Manrope) for widget titles to establish clear information hierarchy.
*   **Do** use `tertiary` (#003c0a) for all positive financial trends—it is deep, sophisticated, and more "trustworthy" than a bright neon green.

### Don't
*   **Don't** use 1px solid black or grey lines to separate data rows. Use tonal shifts or whitespace.
*   **Don't** use "Drop Shadows" on standard cards. Reserve shadows only for elements that physically move or float over the interface (e.g., Modals).
*   **Don't** mix the font families. Manrope is for "Reading the Story" (Headlines); Inter is for "Processing the Data" (Body/Labels).