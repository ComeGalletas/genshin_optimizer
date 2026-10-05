# Review: Nahida Aggravate (Raiden) (`nahida-aggravate`)

- Status: draft. Source: adapted, KQM Sim Database: Raiden Aggravate with Kuki Nahida Kazuha (https://db.kqm.gg/db/kntc7TFbnPKp). Fischl in Kazuha's place: her skill (even rotations) or burst (odd) and two normal attacks where Kazuha's skill, plunge and burst were; Kazuha's second skill and plunge dropped. Of N2, N3 and N4 as the filler, N2 scored best on the reference builds; Nahida ran short of energy, so burst waits are filled with attacks. Kuki's start_hp and the print() call left out.
- Fingerprint: `9399b618a0309c241c1e52167982bd0b499e96e749089819b2bb3e130c8f1a8a`
- gcsim v2.48.8, 2026-10-05, on the reference builds; burst waits attack.

## Result

47,049 DPS ± 1,007 over 72.6 s (1000 iterations). Warnings: none.

| Character    |    DPS | Share | On field (s) | Waited for energy (s) |
| ------------ | -----: | ----: | -----------: | --------------------: |
| raidenshogun | 17,423 |   37% |         41.4 |                   0.0 |
| kukishinobu  |  5,434 |   12% |          8.5 |                   0.0 |
| fischl       | 15,496 |   33% |          9.6 |                   0.0 |
| nahida       |  8,696 |   18% |         13.2 |                   0.0 |

Reactions per run: aggravate 175, quicken 35, spread 34.

## One fight, step by step (seed 13242287705001360207, 72.8 s)

| Time (s)  | On field     | Actions                | Team damage | Reactions                |
| --------- | ------------ | ---------------------- | ----------: | ------------------------ |
| 0.0–0.8   | raidenshogun | E                      |           0 |                          |
| 0.8–3.4   | nahida       | E Q                    |       8,501 |                          |
| 3.4–5.5   | kukishinobu  | E Q                    |      62,040 | aggravate ×3, spread ×1  |
| 5.5–7.0   | fischl       | E N2                   |     131,999 | aggravate ×7, spread ×1  |
| 7.0–16.4  | raidenshogun | Q N4 D N4 E N4 D N3    |     571,507 | aggravate ×29, spread ×4 |
| 16.4–21.9 | nahida       | E N5 Q                 |     114,144 | spread ×5, aggravate ×6  |
| 21.9–24.0 | kukishinobu  | E Q                    |      57,295 | aggravate ×3, spread ×1  |
| 24.0–27.3 | fischl       | Q N2                   |     159,789 | aggravate ×8, spread ×2  |
| 27.3–36.7 | raidenshogun | Q N4 D N4 E N4 D N3    |     621,585 | aggravate ×29, spread ×4 |
| 36.7–39.3 | nahida       | E Q                    |      41,959 | spread ×1, aggravate ×4  |
| 39.3–41.4 | kukishinobu  | E Q                    |      57,039 | aggravate ×3, spread ×1  |
| 41.4–42.9 | fischl       | E N2                   |     106,796 | aggravate ×6, spread ×1  |
| 42.9–54.8 | raidenshogun | N5 Q N4 D N4 E N4 D N3 |     686,908 | aggravate ×34, spread ×5 |
| 54.8–57.4 | nahida       | E Q                    |      11,388 | spread ×1                |
| 57.4–59.5 | kukishinobu  | E Q                    |      48,655 | aggravate ×3, spread ×1  |
| 59.5–62.7 | fischl       | Q N2                   |     195,617 | aggravate ×9, spread ×2  |
| 62.7–72.8 | raidenshogun | N3 Q N4 D N4 E N4 D N3 |     677,137 | aggravate ×32, spread ×5 |

## Template

```text
# Nahida Aggravate with Raiden on field, four rotations of about 20 s:
# Nahida E Q > Kuki E Q > Fischl E N2 (even rotations) or Q N2 (odd) >
# Raiden Q N4D N4 E N4D N3
# DRAFT: adapted from a Raiden/Kuki/Nahida/Kazuha config, Fischl in
# Kazuha's place; not yet reviewed by the owner.
{{raiden}} skill;
for let i = 0; i < 4; i = i + 1 {
  {{nahida}} skill, burst;
  {{kuki}} skill, burst;
  if is_even(i) {
    {{fischl}} skill, attack:2;
  } else {
    {{fischl}} burst, attack:2;
  }
  {{raiden}} burst, attack:4, dash, attack:4, skill, attack:4, dash, attack:3;
}
```

## Promote

If this is right, the owner promotes it with `npm run rotations -- promote nahida-aggravate`. Any change to its files after this review needs a new review.
