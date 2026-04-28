# External References

Copies, summaries, or links to external materials (third-party docs, RFCs, vendor SDKs, articles) that the project depends on or compares against.

Internal domain contracts go in [`../internal/`](../internal/). The two are kept separate on purpose: internal docs change with our code; external docs change with someone else's.

## When to add a file here

- An external API or SDK we depend on whose behavior is not obvious from its public docs.
- An article or RFC whose conclusions we cite in our own design.
- A snapshot of a third-party page we expect to drift.

## When not to add

- General library docs that are easy to find and unlikely to change unexpectedly.
- One-off web search results.

Each file should start with a `Source:` line linking the original.
