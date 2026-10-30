# news-scrap-notebook · 경제신문읽기

경제기사를 읽고 **WHAT · WHY · SO WHAT** 양식으로 매일 기록하는 반응형 스크랩 노트 웹앱입니다.
읽기 가이드를 앱 안에서 보면서 기록하고, 계정별로 서버에 저장해 PC와 모바일에서 이어 씁니다.

## 크레딧

| 역할 | 제공 |
| --- | --- |
| 템플릿·가이드라인 | 빠빠돈 \| 경제신문 읽는 아기 아빠 (contact.ppappadon@gmail.com) |
| 웹앱 제작 | yukdal_t |

가이드·템플릿 콘텐츠는 빠빠돈의 허락을 받아 포함했습니다.
**다른 곳에서 사용할 때는 반드시 출처를 남겨 주세요.** 자세한 조건은 [NOTICE.md](NOTICE.md)를 참고하세요.
원문 PDF와 실제 작성 예시 사진은 이 저장소에 포함하지 않습니다.

## 주요 기능

- **일일 스크랩**: 신문사, 기사 제목·이미지, 필수 3칸(WHAT·WHY·SO WHAT), 선택 기록(모르는 용어, 내 생각 한 줄)
- **기간 제한 없는 기록**: 같은 날짜에 여러 노트, 월별 달력, 날짜별 직접 체크, 월간 집계
- **주간 회고**: 임의의 주(월–일) 선택, 반복 키워드·기억에 남는 기사·새로 안 단어·다음 주 지켜볼 것
- **읽기 가이드**: 목차·본문 검색, 주제에서 노트 만들기, 노트에서 주제로 돌아가기
- **나만의 경제 용어장**: 용어·뜻 등록, 노트 연결, 검색, 복습 상태
- **기록 이미지(PNG) 내보내기**: 미리보기, 포함 항목 선택, 긴 기록은 최대 50장으로 분할
- **계정별 서버 저장·동기화**: 기기 임시 저장 후 서버 전송, 충돌 시 비교 후 선택
- **백업·복원**: 노트·이미지·용어·체크 상태를 담은 JSON
- **반응형**: PC는 가이드와 노트를 나란히, 모바일은 한 열과 하단 메뉴

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 화면 | 바닐라 JavaScript + CSS (`public/`), Next.js 진입점에서 초기화 |
| 서버 | Cloudflare Worker (Vinext 스타터) |
| 데이터 | Cloudflare D1 (SQLite) + Drizzle ORM |
| 이미지 파일 | Cloudflare R2 |
| 기기 임시 저장 | IndexedDB (사용자별 분리) |
| 로그인 | 배포 플랫폼(ChatGPT Sites)의 인증 헤더 |
| 런타임 | Node.js 22.13 이상 |

> 로그인은 배포 플랫폼이 넣어 주는 사용자 ID 헤더(`oai-authenticated-user-id`)에 의존합니다.
> 다른 환경(예: Cloudflare Workers 직접 배포)에서 쓰려면 인증 계층을 바꿔야 합니다.

## 빠른 시작

```bash
npm ci
npm run build
```

초기 로컬 DB 구조는 처음 한 번만 적용합니다.

```bash
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_stiff_piledriver.sql
```

개발 서버 실행:

```bash
npm run dev -- --port 4187 --hostname 127.0.0.1
```

`http://127.0.0.1:4187`에 접속해 로컬 로그인 버튼을 누릅니다.
로컬 로그인은 스타터의 테스트 계정이며 프로덕션 빌드에는 포함되지 않습니다.

## 검사

```bash
npm run check
```

구문 검사와 서버·데이터 테스트 17개(인증, 소유권, 버전 충돌, 재전송 중복 방지, 삭제 전파, 백업 호환, 날짜 계산 등)를 실행합니다.

로컬 QA 옵션(`127.0.0.1`에서만 동작):

- `?qa`: 저장 통신 실패 재현 버튼
- `?qa&device=desktop`, `?device=phone`: 같은 계정에서 독립 기기 역할 캐시

## 폴더 구조

```text
app/            Next.js 진입점, API 경로, 인증 헤더 처리
lib/            서버 저장·소유권·이미지 API (notebook-api.mjs)
db/, drizzle/   D1 스키마와 마이그레이션
public/         화면(app.js), 동기화(store.js, sync-core.js), PNG 출력, 가이드 콘텐츠(content.js)
scripts/        빌드·실행 스크립트
tests.mjs       서버·데이터 테스트
```

## 알아두기

- 동기화는 주기 확인 방식(앱 복귀·온라인 복귀·약 20초 간격)이며 실시간 공동 편집은 아닙니다.
- 최초 실행에는 계정 확인을 위한 연결이 필요합니다. 완전한 오프라인 앱은 아닙니다.
- 기사 이미지는 PNG·JPG·WebP, 장당 8MB, 노트당 최대 4장입니다.
- AI 요약·OCR·용어 자동 설명 기능은 없습니다.
- 앱은 실제 챌린지 인증 승인·제출을 처리하지 않습니다. 인증은 사용자가 직접 합니다.

## 라이선스

- 코드: [MIT](LICENSE)
- 가이드·템플릿 콘텐츠(`public/content.js`의 가이드 본문·양식 문구): MIT에 포함되지 않습니다. [NOTICE.md](NOTICE.md)의 조건을 따릅니다.
- 서드파티: `scripts/vite/sites-vite-plugin.LICENSE`(MIT), `vendor/shadcn-tailwind-4.13.0.LICENSE.md`
