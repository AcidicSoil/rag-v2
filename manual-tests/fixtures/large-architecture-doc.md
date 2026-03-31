# Platform Architecture Review

## Overview
The platform is split into API, session, billing, and analytics services. The primary deployment target is Kubernetes.

## Session Service
The session service uses PostgreSQL for durable session state.
The document notes a tradeoff: PostgreSQL provides transactional consistency and easier operational visibility, but it adds write latency compared with an in-memory cache-first design.
The team accepted this because session invalidation correctness was prioritized over peak throughput.

## Billing Service
The billing service uses a message queue for retryable invoice work.
A compensating transaction pattern is used when downstream payment updates fail.

## Analytics Service
The analytics service uses ClickHouse for event aggregation.
A tradeoff mentioned here is that fast scans come with a more specialized operational footprint.

## Search Index
The search index is refreshed every 15 minutes.
The indexing pipeline can fall back to the previous snapshot if validation fails.

## Security Notes
All internal service-to-service traffic is authenticated.
Secrets are injected at runtime and are not stored in the repository.

## Release Process
Staging deploys happen on Tuesdays.
Production deploys happen on Thursdays after the change review meeting.

## Incident Response
The incident commander owns the timeline and external stakeholder updates.
Post-incident reviews must be published within five business days.

## Additional Notes
This document is intentionally longer than the small note fixtures and should be suitable for retrieval-oriented validation.
To make retrieval more realistic, the answer to a question should often be localized to a single section rather than repeated throughout the file.
The session service section is the best target for questions about the database choice and its tradeoffs.
