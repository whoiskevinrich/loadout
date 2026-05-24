---
name: add-catalog-items
description: Add or edit entries in apps/web/src/games/subnautica.json (or other game catalogs). Verifies recipes against the Subnautica wiki, preserves the file's column-aligned formatting, generates ids, and handles dependency chains (new raw materials, intermediate components, new categories). Use whenever the user asks to add craftable items, update a recipe, or extend the catalog.
---

# Adding catalog items

Use this skill when the user asks to add or edit entries in `apps/web/src/games/subnautica.json` (or another game JSON in `apps/web/src/games/`). Goal: extend the catalog correctly the first time, with verified recipes and zero formatting damage.

## Workflow

1. **List what's requested.** Echo back the items as a short checklist so the user can correct typos before any work happens.

2. **Verify recipes against the Subnautica wiki.** For each item, fetch `https://subnautica.fandom.com/wiki/<Item_Name>` (replace spaces with underscores). Extract the recipe (inputs + crafting station) from the infobox or recipe section. If a recipe contradicts what the user specified, flag the divergence inline and ask which to use — do not silently pick. If the wiki lookup fails, say so and ask for the recipe explicitly.

3. **Resolve dependencies.** For every input referenced in a recipe, check whether the input item already exists in the catalog (`grep` for the id). For each that doesn't:
   - If it's a raw material, add it to the raws section with biomes/sources from the wiki.
   - If it's an intermediate component (e.g., Aerogel for Cyclops Engine Efficiency), recursively apply this workflow to add it first.
   - Never reference a non-existent input id in a recipe — the rollup will silently treat it as raw.

4. **Pick the right category.** Use the `ItemCategory` union from `apps/web/src/games/types.ts` (`raw | component | tool | equipment | upgrade | vehicle | base | consumable`). If you need a new category, you must also:
   - Add it to the union in `types.ts`
   - Add a filter button to `FILTERS` in `apps/web/src/routes/Inventory.tsx`
   - Tell the user about the two-file change.

5. **Generate ids.** kebab-case from the item name. Disambiguate when needed (e.g., `fabricator-base` for the placeable Fabricator vs. the conceptual station "Fabricator" used in `craftedAt`).

6. **Preserve alignment.** The items array in `subnautica.json` is column-aligned. Use **Edit** with a small anchor (an existing item near where the new one belongs) — never Write the whole file. Match spacing of neighboring entries.

7. **Add the recipe.** Append the recipe object to the `recipes` array in `subnautica.json`. Match the surrounding format.

8. **Verify.** After all edits, run `pnpm --filter @loadout/web typecheck` (or `pnpm typecheck`) and `pnpm build`. The JSON validity hook will also fire on the edits. If typecheck or build fails, fix before reporting done.

9. **Report.** Tell the user how many items + recipes were added, and call out any wiki divergences, new categories, or supporting items added beyond what they explicitly asked for.

## Notes

- Recipes with `outputQty > 1` are valid but rare in vanilla Subnautica. Default to `outputQty: 1` unless the wiki says otherwise.
- Items with `craftedAt: "Cyclops Upgrade Console"` or `"Vehicle Upgrade Console"` are upgrades — categorize as `upgrade`, not `equipment`.
- Torpedoes and decoys go in the `consumable` category.
- If the wiki shows a recipe that depends on items truly outside scope (e.g., creature drops we don't model), substitute the closest available raw material and add a `notes` field explaining the approximation.
