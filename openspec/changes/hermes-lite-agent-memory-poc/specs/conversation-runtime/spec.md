## ADDED Requirements

### Requirement: Trusted owner-scoped conversation
The system SHALL derive the conversation owner from the server-side WeChat context and SHALL scope every message query and write to that owner.

#### Scenario: Two accounts use the same conversation identifier
- **WHEN** synthetic users A and B send or list messages using the same conversation identifier
- **THEN** each account sees only messages written under its own trusted owner identity

### Requirement: Idempotent durable turn
The system SHALL persist one user message before model execution and SHALL use an owner-scoped request identifier to prevent duplicate messages and duplicate completed replies.

#### Scenario: Model fails and the client retries
- **WHEN** a synthetic request fails after the user message is saved and is retried with the same request identifier
- **THEN** the system reuses the existing user message and creates at most one successful assistant message

### Requirement: Real model reply with explicit failure
The system SHALL return text produced by the configured model and MUST return an explicit unavailable error when no valid model reply can be obtained.

#### Scenario: Main model is unavailable
- **WHEN** the configured model times out or returns empty content
- **THEN** the system keeps the user message, returns a retryable model error, and does not create a fabricated assistant reply

### Requirement: Conversation history persistence
The system SHALL store user and assistant messages in the database with role, provenance, conversation, request and creation metadata.

#### Scenario: User reopens the preview
- **WHEN** a synthetic user sends a successful turn and reloads the conversation page
- **THEN** the page loads the stored user and assistant messages in chronological order
