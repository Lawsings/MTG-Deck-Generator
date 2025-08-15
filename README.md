# MTG Deck Generator

This project builds Commander decks using Scryfall data.

## Fallback pool search

When generating the non-land card pool, the builder first queries Scryfall with `order:edhrec unique:prints` to prioritise common staples. If this query returns fewer than 70 legal cards, a second, broader search without `unique:prints` is issued and the balancing step is retried with the expanded pool. This ensures decks can still be generated for narrow commanders or color identities.

