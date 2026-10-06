# 0047. Grounded comparisons: signs and simulated differences, exactly

- Status: Accepted
- Date: 2026-10-05
- Amends: [0035](0035-chat-tool-loop.md)

## Context

The chat holds every number in an answer to the tool results (ADR-0035):
a number is grounded when a source holds it, as written or rounded to the
answer's precision, and anything else is sent back once and then masked.
That rule compares numbers by size. For team comparisons (ADR-0046) it is
too loose in two ways:

- **Signs.** "Raiden with The Catch: +8.6%" passed when the tool said
  −8.6%: the size matched, the meaning was the opposite.
- **Pairs.** A simulated difference is a pair, the difference and its 95%
  interval ("+7.4% ± 1.2%"). Checked number by number, "+7% ± 1%" passed by
  rounding, and one variant's difference with another variant's interval
  passed because both numbers exist somewhere in the result.

PLAN asks that explanations cite sim outputs and that the numbers match
the tool output exactly, tested.

## Decision

- **A signed number keeps its sign.** A number written with a sign attached
  ("+7.4", "−8.6", "-8.6") is grounded only by a source number of the same
  sign (rounding as before). A hyphen inside a word, a date or a range
  ("m1-17", "2026-01-02", "3.2-1200.5") is not a sign.
- **A comparison is copied, not computed.** Anything written as
  "x% ± y%" (with or without a sign) must be, character for character up
  to the minus glyph, one of the comparisons a tool wrote
  (`simulate_team`'s `vsBase.text`): no rounding, no sign of its own, no
  interval from elsewhere. It is checked and masked as one unit.
- **The models are told.** The tool instructions (MCP and the chat) say to
  cite each variant as "<label>: <vsBase.text> team DPS", to call a variant
  inside the noise no different from the base, and to say why a variant has
  no numbers. The revision request names the rule that was broken.

## Consequences

- An explanation can only state a simulated difference the simulator
  produced, in the direction it produced it, with its own interval; a
  rounded or swapped one is masked, so the owner sees "[?]" rather than a
  wrong figure.
- The rule is stricter than the general one on purpose: rounding a
  comparison would hide whether it is inside the noise.
- Tested end to end with a scripted model: one chat request runs three
  variants and every comparison in the answer is the tool's text; rounded
  and sign-flipped ones are sent back and masked.
