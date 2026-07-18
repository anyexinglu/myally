## ADDED Requirements

### Requirement: Cross-user privacy isolation

The system SHALL guarantee that one user's profile items and memories are never accessible to another user's conversation context.

#### Scenario: User B does not see user A's financial data
- **WHEN** synthetic user A states "我每个月要还房贷1万"
- **THEN** memoryStatus=completed for user A
- **AND WHEN** synthetic user B (a different account) asks "帮我做财务规划" in a separate conversation
- **THEN** the assistant reply to user B SHALL NOT reference mortgage or loan terms related to user A

### Requirement: Temporary mode bypass

When temporary=true is set on a message, the system SHALL skip both memory writing and memory retrieval.

#### Scenario: Temporary turn does not create memory
- **WHEN** a synthetic user sends "我最近在考虑换工作" with temporary=true
- **THEN** memoryStatus=skipped and createdMemories.length=0

#### Scenario: Temporary turn does not influence subsequent normal turns
- **WHEN** a synthetic user sends a temporary=true message
- **AND THEN** sends a follow-up in a new conversation without temporary=true
- **THEN** the reply SHALL NOT reference the temporary turn content
