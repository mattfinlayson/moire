---
title: AI Preset Content Policy — Copyright and Safety
date: 2026-05-02
category: conventions
module: ai-presets
problem_type: convention
component: documentation
severity: medium
applies_when:
  - "Adding presets that recreate or reference copyrighted artworks"
  - "Including options that depict illegal activities (vandalism, theft scenarios)"
  - "Reviewing preset content for brand/legal safety"
tags:
  - presets
  - copyright
  - content-moderation
  - legal-safety
  - vandalism
  - art-reproduction
  - ai-content-policy
---

# AI Preset Content Policy — Copyright and Safety

## Context

Moire includes ~1059 AI presets that transform user photos. Some presets directly recreated the styles of famous copyrighted artworks (Van Gogh, Warhol, Dali, etc.), referenced trademarked characters (Pokemon, Studio Ghibli), or depicted illegal activities (vandalism). The project made a deliberate decision to remove these for legal and content-safety reasons.

## What Was Removed

**22 presets deleted** in commit `89a0098`:

| Preset | Reason |
|--------|--------|
| AMERICAN GOTHIC | Grant Wood painting reproduction |
| ANDY WARHOL | Pop art style reproduction |
| DALI | Salvador Dali style reproduction |
| JOHANNES VERMEER | Dutch master style reproduction |
| O'KEEFFE | Georgia O'Keeffe style reproduction |
| POLLOCK | Jackson Pollock style reproduction |
| REMBRANDT | Dutch master style reproduction |
| VAN GOGH | Post-impressionist style reproduction |
| SECOND TO LAST SUPPER | Da Vinci "Last Supper" parody |
| GHIBLI CAM | Studio Ghibli animation style (highly litigious) |
| POKEMON MODE | Nintendo character IP |
| POKEDEX | Nintendo character IP |
| CHAPULIN COLORADO | Copyrighted Mexican TV character |
| DIA DE LOS MUERTOS | Cultural icon / trademark concerns |
| MILK CARTON | Missing persons aesthetic (problematic) |
| GENETIC BLUEPRINT, GEOMETRIC MONOCHROME RICE EXPRESSION, GHOST, HAITIAN NAIVE ART, JOSE GUADALUPE POSADA, MACRAME, MILLENNIALS | Miscellaneous removals |

**Vandalism option removed** from the BUSTED preset: option "002" — "Vandalism with spray paint, caught on camera."

## Guidance

When curating AI presets, remove any that:

1. Directly recreate the style or visual language of copyrighted artistic works — especially living artists or estates that actively enforce IP
2. Contain references to trademarked characters or brands (Pokemon, Ghibli, Nintendo, Disney, etc.)
3. Depict or glorify illegal activities (vandalism, theft) — even humorous ones create content liability
4. Could be interpreted as mocking or trivializing serious subject matter

## Why This Matters

- AI image generation is under active legal scrutiny worldwide. Copyright holders are increasingly aggressive about AI recreations of their IP
- App stores reject apps that facilitate copyright infringement or depict illegal activities
- The Rabbit R1 operates in a regulated marketplace — content liability falls on the app developer
- Preemptive removal is far cheaper than responding to DMCA takedowns, legal threats, or app store rejections

## When to Apply

- When reviewing new presets before merging: check for recognizable IP references (artist names, character names, trademarked terms)
- When a third-party platform updates their content guidelines
- Periodically re-audit presets as AI copyright law evolves (the legal landscape is changing rapidly)
- Before any public release or marketplace submission

## Examples

**Before (rejected):**
```json
{
  "name": "VAN GOGH",
  "prompt": "Transform this image into a Van Gogh painting with bold brushstrokes and vibrant colors"
}
```

**After (acceptable):**
```json
{
  "name": "POST-IMPRESSIONIST",
  "prompt": "Transform this image in a post-impressionist style with bold brushstrokes and vibrant colors"
}
```

The technique (brushstrokes, color palette) is fine. The artist's name as a brand is not.

## Related

- Commit `89a0098` — Remove art reproduction presets (copyright concerns) and vandalism option
