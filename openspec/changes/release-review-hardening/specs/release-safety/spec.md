## ADDED Requirements

### Requirement: Production package excludes internal surfaces

The release package SHALL expose only user-facing product pages and SHALL NOT register developer evaluation, raw-model comparison, caregiver sharing, or legacy record surfaces.

#### Scenario: Reviewer opens every registered page

- **WHEN** a synthetic reviewer enumerates all pages in the production manifest
- **THEN** only conversation, personal memory/data controls, and service information pages are registered

### Requirement: Text safety fails closed

The system SHALL check user text before persistence/model execution and SHALL check generated text before persistence/display. A non-pass result or unavailable safety service MUST stop that stage without logging the text.

#### Scenario: Unsafe user input

- **WHEN** the text safety adapter returns a risky result for a synthetic user message
- **THEN** no user message is persisted and the model is not called

#### Scenario: Unsafe generated output

- **WHEN** the model returns text that the safety adapter marks risky
- **THEN** the assistant text is not persisted or returned as a successful reply

### Requirement: AI disclosure and service information

The UI SHALL visibly identify assistant content as AI-generated and SHALL provide service boundaries, data-use information, deletion controls and a feedback/complaint entry.

#### Scenario: First-time user inspects a reply

- **WHEN** a synthetic user receives an assistant reply and opens service information
- **THEN** the AI label, non-professional-service boundary, handled data types, deletion route and feedback route are visible

### Requirement: Owner-scoped conversation deletion

The user SHALL be able to delete the current conversation, and the server SHALL scope deletion to the trusted owner and requested conversation identifier.

#### Scenario: Account B guesses account A conversation identifier

- **WHEN** synthetic account B requests deletion using account A's conversation identifier
- **THEN** account A's messages remain unchanged and no private content is returned

### Requirement: No client-selected model bypass

The production conversation function SHALL ignore client attempts to choose a raw or alternate execution mode.

#### Scenario: Client submits raw mode

- **WHEN** a synthetic client includes `mode=raw` in a send request
- **THEN** the request still follows the validated production conversation pipeline
