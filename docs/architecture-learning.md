# Architecture Learning Resources

A curated reading path for the domain-first / clean-architecture refactor (v6.1). Organized from core concepts to practical engineering, with the canonical sources the industry actually cites.

## Core architecture concepts (start here)

1. **Clean Architecture** — Robert C. Martin (Uncle Bob). The essay that defined the layering/independence model.
   - https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
   - Book: *Clean Architecture* (2017) — "frameworks are details."

2. **Hexagonal Architecture (Ports & Adapters)** — Alistair Cockburn. The original "domain in the middle, adapters at the edges" model.
   - https://alistair.cockburn.us/hexagonal-architecture/
   - https://martinfowler.com/bliki/HexagonalArchitecture.html (Fowler's summary)

3. **Functional Core, Imperative Shell** — Gary Bernhardt, "Boundaries" (~30-min talk, hugely influential).
   - https://www.destroyallsoftware.com/talks/boundaries

4. **Domain-Driven Design** — the vocabulary (aggregates, value objects, domain services).
   - *Domain-Driven Design* (Eric Evans, "the Blue Book")
   - *Implementing Domain-Driven Design* (Vaughn Vernon, "the Red Book" — more practical)

5. **Vertical Slice Architecture** — Jimmy Bogard. The counter-argument to anemic layering; pairs well with domain-first.
   - https://jimmybogard.com/vertical-slice-architecture/

6. **Feature-Sliced Design** — a modern frontend methodology with concrete rules (domain folders, thin UI).
   - https://feature-sliced.design/

## Practical / operational

7. **Twelve-Factor App** — config-injected, no env reads inside logic.
   - https://12factor.net/

8. **Refactoring** — Martin Fowler, for when and how to extract safely.
   - https://refactoring.com/

9. **Bulletproof Node.js** — a real, widely-cited layered/testable Node reference.
   - https://github.com/santiq/bulletproof-nodejs

10. **A Philosophy of Software Design** — John Ousterhout. Best modern book on complexity and deep modules.

11. **Microsoft DDD guidance** — concrete patterns applied to services/APIs.
    - https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/

## Suggested 3-step path

1. Read the **Clean Architecture** essay + watch Bernhardt's **Boundaries** (1–2 hrs total) to internalize "pure core, thin edges."
2. Read **Cockburn/Fowler on Hexagonal** to get the adapter vocabulary.
3. Use the **Twelve-Factor config rule** + the **Bulletproof-Node.js** structure as the concrete checklist during the refactor.
