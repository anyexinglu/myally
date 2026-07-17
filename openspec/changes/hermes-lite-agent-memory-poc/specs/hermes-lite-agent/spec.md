## ADDED Requirements

### Requirement: Bounded capability and tool loop
The system SHALL select one allowed capability and MUST limit each request to at most three model steps.

#### Scenario: Model repeatedly requests tools
- **WHEN** the model requests another tool after the configured step budget is exhausted
- **THEN** the orchestrator stops the loop and produces an explicit bounded-degradation result without executing another tool

### Requirement: Versioned read-only skills
The system SHALL load only repository-versioned `general`, `personal_advice`, or `factual_research` skills and MUST NOT allow model output to modify production skill content.

#### Scenario: Model asks to rewrite a skill
- **WHEN** a model response attempts to create or change a production skill
- **THEN** the request is ignored or denied and no skill file or stored skill state changes

### Requirement: Allowlisted tool policy
The system SHALL execute only registered read-only tools whose arguments pass schema validation and whose policy permits the current mode.

#### Scenario: Model requests an unknown or write-capable tool
- **WHEN** the model requests `send_message`, shell execution, deletion, or another unregistered tool
- **THEN** the Policy Engine denies execution and returns a structured denial to the orchestrator

### Requirement: Tool result informs final answer
The system SHALL return tool output to the model before accepting the final answer and SHALL record the opaque tool name and status for the turn.

#### Scenario: Current-time question
- **WHEN** a synthetic user asks for the current date and the model requests `current_time`
- **THEN** the tool runs once and the final answer is generated using its returned timestamp

### Requirement: Realtime search does not fabricate availability
The realtime search tool MUST expose unavailable or failure status when no working adapter is configured.

#### Scenario: Search adapter is absent
- **WHEN** a factual-research turn requests realtime search without a configured adapter
- **THEN** the final response states that realtime verification was unavailable and does not claim fresh search results

### Requirement: Configurable workload model routing
The system SHALL allow ordinary/factual, personal-reasoning, multimodal, and memory-observer workloads to use independently configured models and SHALL fall back to one configured base model when specialized model names are absent.

#### Scenario: Specialized models are configured
- **WHEN** synthetic fast, reasoner, multimodal, and observer model names are configured
- **THEN** general or factual work uses fast, personal advice uses reasoner, image input uses multimodal, and memory extraction uses observer

#### Scenario: Only a base model is configured
- **WHEN** no specialized model names are configured
- **THEN** all four workloads use the base model without changing the Conversation or Agent contract
