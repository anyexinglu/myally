## ADDED Requirements

### Requirement: User-source-only observation
The Memory Observer SHALL receive only the original user message and MUST reject assistant, retrieved-memory and tool-output sources.

#### Scenario: Assistant states a personal fact
- **WHEN** an assistant reply invents or suggests a synthetic personal preference
- **THEN** no Observation or Profile Item is created from that assistant text

### Requirement: Confirmed and candidate separation
The system SHALL store every valid extraction as an Observation but SHALL make only explicit user statements or corrections eligible for confirmed Profile Items and retrieval.

#### Scenario: Model infers a trait
- **WHEN** the Observer infers a synthetic personality trait not explicitly stated by the user
- **THEN** it remains candidate and is excluded from future context injection

### Requirement: Provenance and temporal metadata
Every Profile Item SHALL record owner, source message, source type, observation time, validity fields, extractor version, sensitivity, confidence and status.

#### Scenario: User views a confirmed memory
- **WHEN** a synthetic user opens the memory center after explicitly stating a preference
- **THEN** the item displays its value, type, source time and confirmation source without exposing another account's identifiers

### Requirement: Relevant bounded retrieval
The Retriever SHALL return only current, confirmed, undeleted items relevant to the request and SHALL enforce item and character budgets.

#### Scenario: Many unrelated memories exist
- **WHEN** a synthetic account has more than eight confirmed items across unrelated topics
- **THEN** the context includes at most eight relevant items and does not inject the complete profile

### Requirement: Explicit correction preserves a memory timeline
An explicit user correction SHALL supersede the current confirmed Profile Item with the same owner and semantic key, close its validity interval, and make only the replacement current for retrieval.

#### Scenario: User corrects a preference
- **WHEN** a synthetic user explicitly changes a previously confirmed preference
- **THEN** the old item is marked superseded with `validTo`, the new item is confirmed, and retrieval returns only the new value

#### Scenario: Another owner has the same semantic key
- **WHEN** one synthetic user corrects a memory whose key also exists for another owner
- **THEN** only the correcting user's current version is superseded

### Requirement: Observer failure isolation
Memory extraction failure MUST NOT replace, fabricate or discard an otherwise successful assistant reply.

#### Scenario: Observer returns invalid JSON
- **WHEN** the main model reply succeeds but the Observer output cannot be parsed
- **THEN** the assistant reply is stored, no memory is written, and the turn reports memory extraction failure
