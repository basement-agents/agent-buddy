# SOUL/USER 파이프라인 개선 플랜

> 2026-04-25 분석 기반. 비평가·과학자·코드리뷰어·writer 4개 에이전트 병렬 분석 결과.

## 이미 완료된 수정 (2026-04-25)

- [x] `generateProfile()`에 `maxTokens: 8192` 추가 — SOUL/USER 절단 방지
- [x] `updateBuddy()`에서 feedback을 `approvalCriteria[]`에 push하던 해킹 제거 → `feedbackNotes` 파라미터로 분리
- [x] `buildSoulPrompt()`에 `feedbackNotes?` 파라미터 추가
- [x] `createMemoryEntry()`에서 `reviews.body`도 키워드 검색에 포함
- [x] `buildAnalysisPrompt()` JSON 스키마에 `stats` 필드 추가

---

## 미완료 — 우선순위 HIGH

### 1. `updateBuddy()` 누적 학습 실패

**파일**: `packages/core/src/analysis/pipeline.ts:186`

**문제**: 업데이트 시 새 PR만으로 분석하고 기존 `existing.soul`을 분석 입력에 전달하지 않아, 매 업데이트마다 이전 학습이 완전 소실된다.

```typescript
// 현재 (잘못됨)
const newAnalysis = await this.analyzeReviewerHistory(dataToProcess); // 새 PR만
const [newSoul, newUser] = ...; // 완전히 새로 생성 → 기존 학습 소실

// 개선 방향 (A): 기존 soul을 프롬프트 컨텍스트로 전달
// buildSoulPrompt에 existingSoul?: string 파라미터 추가
// "아래는 기존 프로파일입니다. 새 분석 결과를 반영해 업데이트하세요."

// 개선 방향 (B): 전체 PR 히스토리 누적 분석
// updateBuddy가 신규 PR + 기존 AnalysisResult JSON을 함께 LLM에 전달
// "merge & refine" 전략
```

**영향**: "buddy가 시간이 지나며 학습"이라는 핵심 product promise가 깨짐.

---

### 2. `SoulProfile` / `UserProfile` dead type 정리

**파일**: `packages/core/src/buddy/types.ts:17-31`

**문제**: `SoulProfile`, `UserProfile` 인터페이스가 정의·export 되어 있으나 실제 `BuddyProfile.soul/user`는 `string`이고 코드베이스 어디서도 인스턴스화되지 않는다.

**선택지**:
- (A) 인터페이스 삭제 — markdown 기반임을 명확히 함
- (B) 실제 활용 — `BuddyProfile.analysis: AnalysisResult`를 별도 저장, `soul`/`user`는 human-readable view로 유지. `buildCodeReviewPrompt`에서 구조화 필드를 직접 참조 가능해짐.

**권장**: (B). `metadata.json`에 `AnalysisResult`를 함께 저장하면 dead type 문제와 구조화 활용을 동시에 해결.

---

## 미완료 — 우선순위 MEDIUM

### 3. 2-hop 뉘앙스 손실 개선

**파일**: `packages/core/src/llm/prompts.ts`

**문제**: raw 리뷰 → JSON → SOUL.md의 2단계 변환 과정에서 리뷰어 특유의 표현, 어투, 문맥 의존적 판단이 `thoroughness: "thorough"` 같은 enum으로 평탄화됨. 모든 SOUL.md가 비슷한 톤으로 수렴할 위험.

**개선 방향** (2.5-hop hybrid):
1. `buildAnalysisPrompt`에 `representativeQuotes: { context: string; quote: string }[]` 필드 추가 — LLM이 단계 1에서 대표 인용구를 보존
2. `buildSoulPrompt`에 해당 quotes를 함께 전달 — JSON은 구조적 패턴, quotes는 톤/뉘앙스 책임

```typescript
// AnalysisResult에 추가
representativeQuotes: Array<{
  context: string; // "security feedback on PR #42"
  quote: string;   // 실제 리뷰어 코멘트
}>;
```

---

### 4. 메모리 카테고리화 일관성

**파일**: `packages/core/src/analysis/pipeline.ts:99-110`

**문제**:
- SOUL의 `focus[]`는 LLM이 의미 기반으로 추론 (10개 카테고리)
- MEMORY의 `categories`는 hardcoded 키워드 매칭 (5개, False Positive ~25%)
- 특히 `type` 키워드 FP 40%, `test` 키워드 FP 35%
- 두 소스가 다른 어휘를 써서 reconcile 불가

**개선 방향**:
- 키워드 목록을 `ReviewFocus` 타입과 일치하도록 확장 (현재 5개 → 10개)
- 부정 표현 필터 추가 ("no security issue", "no need to optimize" 등 false positive 방지)
- 또는 memory categorization도 LLM으로 전환 (비용 vs 품질 트레이드오프)

---

### 5. 최소 PR 수 경고 UI

**문제**: 과학자 에이전트 분석 결과, PR 3개 기준 thoroughness 분류 정확도 ~60% (무작위 대비 통계적으로 의미 없음). 신뢰할 수 있는 페르소나 생성의 최소 기준:
- 기본 판단 (focus 영역 유무): 최소 **3개**
- 신뢰할 수 있는 thoroughness 분류: 최소 **10개**
- 안정적 페르소나: 최소 **20개**

**개선**: buddy 생성/업데이트 시 PR 수가 10개 미만이면 경고 메시지 표시.

```typescript
// pipeline.ts createBuddy()에 추가
if (reviewData.length < 10) {
  // profile에 confidence 필드 추가 또는 로그 경고
  logger.warn(`Low confidence: only ${reviewData.length} PRs analyzed. Recommend 10+ for reliable persona.`);
}
```

---

## 미완료 — 우선순위 LOW (장기)

### 6. 프롬프트 전면 개선

**파일**: `packages/core/src/llm/prompts.ts`

writer 에이전트가 제안한 개선된 `buildSoulPrompt`:
- 각 섹션에 실행 가능한 체크리스트 + 구체적 코드 예시 요구
- JSON 필드를 직접 프롬프트에 데이터 바인딩 (현재는 전체 JSON을 덤프)
- **신규 섹션 추가**: Focus Areas by Technology, Edge Cases & Blind Spots, Approval Gates (MUST/SHOULD/NICE_TO_HAVE)
- USER.md를 리뷰 수행 시 "전문 분야 기반 집중도 조절"로 재정의

자세한 프롬프트 초안은 writer 에이전트 분석 결과 참고.

---

### 7. raw 코멘트 저장 방식 개선

**파일**: `packages/core/src/analysis/pipeline.ts:80-83`

**문제**: `createMemoryEntry()`가 리뷰어의 raw 코멘트를 그대로 저장. 내부 정보나 민감한 표현이 디스크에 남을 수 있음.

**개선**: 저장 전 LLM을 거쳐 핵심 학습 + 안전한 인용만 추출. 또는 raw 저장을 opt-in 플래그로 변경.

---

### 8. `parseMemoryFile()` regex — org에 하이픈 포함 시 파싱 실패

**파일**: `packages/core/src/buddy/storage.ts:387`

```typescript
// 현재 (문제)
const match = filename.match(/^([^-]+)-([^-]+)-pr-(\d+)\.md$/);
// "my-org-myrepo-pr-42.md" → org="my", repo="org" (잘못됨)

// 개선
// 파일명 포맷을 변경하거나 separator를 "__"로 교체
// 예: "my-org__myrepo__pr__42.md"
```

GitHub은 org 이름에 하이픈을 허용하므로 실제 사용자 환경에서 발생 가능.
