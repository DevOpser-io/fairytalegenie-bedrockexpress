# Fairytale Genie Product Requirements Document

## 1. Document Meta

| Field | Value |
|-------|-------|
| Product | Fairytale Genie |
| Version | v0.9-draft (2025-06-25) |
| Author / Eng Owner | Liat Hoffman |
| AI Agent | Claude Code (primary), fallback: OpenAI GPT-4o |
| Code Base | github.com/DevOpser-io/fairytalegenie-bedrockexpress |
| Target Launch | 4-week sprint to prod (2025-07-23) |
| Reviewers | Product, Design, DevOps, Security Ops |

## 2. Problem & Goal

**Problem**: Parents want personalized bedtime stories but lack time/skill to craft them.

**Goal (MVP)**: In ≤90 seconds, generate an illustrated, age-appropriate fairytale whose characters and imagery stay consistent across pages, based on simple parent inputs.

**Success is** ≥80% of Beta users telling us the output "felt uniquely tailored" (survey) and ≤10% abandon during first use (funnel analytics).

## 3. Personas & Journeys

| Persona | Scenario | Job-to-Be-Done |
|---------|----------|----------------|
| Busy Parent | On phone after dinner, needs quick story for 6-year-old | "Type a few ideas, click 'Create', show kid a beautiful storybook." |

**Journey (happy-path)**:
1. Parent visits `/` ➜ Input form.
2. Fills Keywords, Child Age, Preferred Character Names (opt.), Additional Notes.
3. Click Generate.
4. Progress bar (≤90 s).
5. Reader view: paginated story sections (text + image).
6. Option to Download PDF or Share Link.

## 4. Scope

### Must-Have (MVP)

| # | Requirement | Acceptance Criteria |
|---|-------------|---------------------|
| 1 | Input Form | Fields show placeholder examples; validation: ≤5 keywords, Age 1-12, Additional Notes ≤600 chars. |
| 2 | Story Generation API | POST /v1/story returns JSON: `{title, sections:[{id, text, imageKey, promptSeed}]}`. Claude Code prompt ensures consistent character descriptions via shared seed token. |
| 3 | Image Generation Worker | For each section, call Bedrock (Stable Diffusion) with identical `character_descriptor` seed; store PNG to S3. |
| 4 | Reader UI | SSR React component paginates; lazy-loads images; PDF export via pdf-lib. |
| 5 | Rate Limiting | 5 stories/day per IP (env var). |
| 6 | Content Moderation | AWS Comprehend + Bedrock moderation; block profanity or disallowed notes. |
| 7 | Observability | CloudWatch dashboards (latency <2 s p95 for API, image gen <60 s per story). |
| 8 | CI/CD | Reuse DevOpser GitHub Actions ▶︎ Docker ▶︎ ECR ▶︎ EKS; infra in Terraform Cloud workspace `fairytale-genie-mvp`. |

### Nice-to-Have / Next
- Account system & story history.
- Voice-over (Polly) & ebook export (EPUB).
- Style presets (comic, watercolor, LEGO®) with deterministic palettes.

**Out-of-Scope Now**: Mobile app wrapper, multi-language support, subscription billing.

## 5. Detailed Functional Requirements

### 5.1 Front-End
- **Stack**: React 18 + Tailwind; live in `/client`.
- **State**: `storyState: {loading, error, data}` via React Query.
- **Accessibility**: WCAG 2.1 AA; screen-reader-friendly alt text auto-generated from prompts.
- **Security**: Strict CSP, SameSite=Lax cookies, Helmet headers.

### 5.2 Back-End

| Layer | Tech | Notes |
|-------|------|-------|
| API | Express.js (existing template) | Add controller `storyController.generate()` |
| AI Service | Claude 3 Haiku via AWS Bedrock | System prompt includes JSON schema & seed usage guidelines. |
| Image Worker | Serverless on AWS Lambda (Node 20) | Triggered by SQS "story-created"; uses Bedrock SDXL. |
| Storage | DynamoDB Stories (PK `storyId`) + S3 `stories/${storyId}/${sectionId}.png` |
| Auth (future) | Cognito (guest & federated), but MVP unauthenticated. |
| Caching | Redis (Elasticache) for idempotent requests & in-progress status. |

### 5.3 APIs

```
POST /v1/story
Request: {
  keywords: ["lava", "helicopter"],
  age: 6,
  notes: "Include a lesson about sharing"
}
Response: 202 Accepted, {storyId}

GET /v1/story/{storyId}
Response: 200 OK, {title, sections: [...]}
```

### 5.4 Story Consistency Strategy
- **Seed Descriptor**: Claude returns `global_character_descriptor` (e.g., "Brave dragon Pip with emerald eyes"), included in every image prompt.
- **Prompt Template**: `Draw {scene_text}. Character(s): ${global_descriptor}. Style: vibrant storybook, seed {hash(storyId)}`.
- Persist `promptSeed` per section to re-render on demand.

## 6. Non-Functional Requirements

| Category | Goal |
|----------|------|
| Performance | TTFB <500 ms for GET story; End-to-end generation ≤90 s. |
| Scalability | 100 concurrent generations; autoscale worker Lambda by SQS backlog. |
| Cost | ≤$0.20/story at 1× SDXL pass; track via CostExplorer. |
| Security | Follow OWASP Node Top 10. Secrets in AWS Secrets Manager. COPPA & GDPR ready (no PII stored). |
| Reliability | 99.9% monthly uptime. Blue/Green deploy via EKS. |
| Logging & Tracing | Winston ➜ CloudWatch; X-Ray instrumentation. |

## 7. Analytics & Metrics

| Funnel Stage | Metric |
|--------------|--------|
| Visit ➜ Submit | Form completion rate |
| Submit ➜ Generated | Success rate, mean generation time |
| Generated ➜ Download | Download CTR |
| CSAT | 👍/👎 after reading |

## 8. Dependencies & Risks

| Dependency | Mitigation |
|------------|------------|
| Bedrock image limits / queue | Pre-signed URLs + SQS retry, fallback to open-source model on EC2 GPU. |
| Consistency complexity | Store seed & descriptor; test with >3-section stories early. |
| Child-sensitive content | Comply with COPPA; integrate AWS Comprehend toxicity + image moderation. |

## 9. Milestones (4-Week Plan)

| Week | Deliverable |
|------|-------------|
| W1 | Finalize PRD, infra Terraform workspace, API scaffold, input UI. |
| W2 | Claude prompt, story JSON schema, SQS/Lambda image pipeline. |
| W3 | Reader UI, PDF export, observability dashboard, moderation hooks. |
| W4 | Load/penetration testing, polish UX, Beta launch, feedback loop. |

## 10. Open Questions
1. **Auth & Story History**: Enable anonymous + optional login in MVP?
2. **Image Gen Provider**: Stick with Bedrock SDXL or try DALL·E 3 for style quality?
3. **PDF Storage**: Generate on-the-fly or persist finished books in S3?

## Next Steps for Claude Code
1. ✅ Import this PRD as PRODUCT_PRD.md in repo root.
2. Generate GitHub Issues (one per Must-Have).
3. Create scaffold PR: routes, controller, DynamoDB model stubs, Terraform module boilerplate.
4. Flag any missing clarifications in Open Questions.