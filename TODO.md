## 1. agent-buddy 개요

GitHub에서 PR이 생성되거나, PR에서 `@agent-buddy review`를 언급하여 호출하는 경우 코드리뷰를 하는 봇을 만들 것임.

봇은 코드리뷰를 하는 것이 목적이며, diff 뿐만 아니라 diff에서 생성한 컴포넌트나 코드의 영향도를 분석하고, 해당 코드가 없더라도 문제를 해결할 수 있었는지를 판단하여 가이드를 하는 역할임.
즉, 저맥락과 고맥락 리뷰를 모두 진행하는 것임.

현재 gemini-code-assist, codex code review, coderabbit 등 여러 AI 코드리뷰 솔루션의 경우 고맥락의 코드리뷰를 지원하지 않는 문제점이 존재함.

---

## 2. Buddy 개념

코드리뷰는 buddy가 해준다고 생각하면 됨.
사용자는 buddy를 지정할 수 있는 대시보드에 접근할 수 있음.

즉, 코드 리뷰어가 buddy이며, 영혼이 존재한다고 보면 됨.

---

## 3. Buddy 정의 및 데이터 구조

buddy는 내 친구, 상급자, 시니어 개발자 등 AI가 분석하고 학습한 사용자를 의미함.

agent-buddy 프로젝트를 설치하면 (`npm install -g agent-buddy` 등), 대시보드에 분석할 레포를 등록할 수 있음.
레포를 등록하면 지금까지의 PR을 분석하면서 상급자의 코드 리뷰 내역을 모두 분석함.
즉, 기존의 코드 리뷰 결과를 기반으로 buddy를 생성하는 것임.

### 저장 구조

* `~/.agent-buddy/buddy/[id]/SOUL.md`
* `~/.agent-buddy/buddy/[id]/USER.md`
* `~/.agent-buddy/buddy/[id]/MEMORY.md`
* `~/.agent-buddy/buddy/[id]/memory/*.md`

memory의 경우:

* `org-repo-pr-[num].md` 형식으로 저장
* 해당 사용자가 어떤 PR에 어떤 리뷰를 남겼는지를 기록

SOUL, USER, MEMORY 구조는 openclaw.ai, hermes-agent.nousresearch.com 등 AI 비서 시스템 방식을 차용

---

## 4. 사용자 흐름

1. agent-buddy 설치

2. GitHub에서 레포지토리 연결

3. 레포 기여자 분석 또는 수동 선택으로 buddy 지정

4. 해당 레포의 PR을 반복 분석하며 다음 파일 업데이트:

   * SOUL
   * USER
   * MEMORY
   * memory/*.md

   (리뷰 스타일, 사고 방식, 말투 등을 학습 및 저장)

5. 트리거 레포 설정 후:

   * PR 생성 시
   * 또는 특정 멘션 발생 시

   코드리뷰 수행 (1번 항목 기준)

---

## 5. 참고 레포지토리

다음 레포가 일부 기능을 이미 반영하고 있으므로 심층 분석 필요:

* [https://github.com/titanwings/colleague-skill](https://github.com/titanwings/colleague-skill)

---

## 6. 구현 요구사항 (strict)

* 웹 검색:

  * agent-browser CLI 또는 agent-reach 스킬 사용

* Ralph Loop:

  * 최소 100회 반복

  * 필요 시 200회로 확장

  * 각 루프에서:

    * 플래너
    * 비평가
    * 과학자
    * 디자이너
    * 디자인 엔지니어
      등을 병렬 호출

  * 과정:

    * 플래닝 → 구현 → 검증 → 수정 → 재검증 반복

* 리서치 자료 관리:

  * 외부 자료: `research/external`
  * 내부 자료: `research/internal`
  * 적극 활용 필수

* 기술 스택:

  * TypeScript 기반
  * 최신 트렌드 반영

  ### 프론트엔드

  * React
  * Vite
  * TanStack Router (또는 Start)
  * Tailwind CSS v4
  * shadcn/ui
  * @base-ui/react

  ### 백엔드/기타

  * Rust / Go / Python 등 목적에 맞게 선택

* 개발 프로세스:

  * Ralph loop 1회당:

    1. 브랜치 생성
    2. 기능 구현
    3. PR 생성
    4. 스쿼시 머지

  * 레포 룰:

    * 무조건 squash merge

* 테스트:

  * 과도한 테스트는 불필요
  * 하지만 핵심 기능 테스트는 필수
  * 테스트 베스트 프랙티스 준수
  * 기능 구현 후 반드시 테스트 실행

