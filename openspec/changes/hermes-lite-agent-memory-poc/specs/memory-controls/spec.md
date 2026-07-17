## ADDED Requirements

### Requirement: Owner-only memory center
The system SHALL list memory items only for the server-authenticated owner and SHALL never accept a client-selected owner identifier.

#### Scenario: Account B guesses an item identifier
- **WHEN** synthetic account B lists or deletes a memory identifier owned by account A
- **THEN** the system returns no private content and leaves account A's memory unchanged

### Requirement: Deletion stops retrieval
Deleting a Profile Item SHALL exclude it from all subsequent memory listing and retrieval paths for normal use.

#### Scenario: User deletes a preference
- **WHEN** a synthetic user deletes a previously confirmed preference and asks a related follow-up
- **THEN** the deleted preference is not injected or cited in the new answer

### Requirement: Temporary conversation isolation
Temporary mode SHALL NOT read long-term memory, run `memory_search`, invoke the Memory Observer, or create Profile Items.

#### Scenario: Temporary follow-up with existing memory
- **WHEN** a synthetic user with confirmed memory starts a temporary conversation
- **THEN** the reply does not receive that memory and the temporary user message creates no Observation or Profile Item

### Requirement: Answer-level memory disclosure
The conversation response SHALL include opaque references for the memories actually injected into that answer and the UI SHALL indicate when personal memory was used.

#### Scenario: Second turn uses an explicit preference
- **WHEN** a synthetic first turn creates a confirmed low-risk preference and a second turn requests a plan
- **THEN** the answer uses that constraint and the UI can display the referenced memory and its source time
