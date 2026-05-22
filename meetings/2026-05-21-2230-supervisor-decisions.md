# 회의록 — 감독자 결정 반영

- **일시**: 2026-05-21 22:30 (Asia/Seoul)
- **안건**: 이전 회의 감독자 결정 3건 확정 + 계획 업데이트
- **감독자**: 한입 비트코인
- **성격**: 감독자 지시 → 계획 반영 (토론 없음)

---

## 감독자 결정 결과

### 결정 1 — Lightning 지급 방식 ✅ 확정

**지시**: "Lightning은 URL로 처리하면 간단해. LNbits 같은 복잡한 거 쓰지 말고."

**기술 해석 및 확정**:

Lightning Address (`user@domain.com`) 직접 지급 방식으로 구현한다.

```
구현 흐름:
1. 사용자가 자신의 Lightning Address 등록 (예: user@walletofsatoshi.com)
2. 주간 claim 시:
   GET https://{domain}/.well-known/lnurlp/{user} → LNURL-pay 정보
   GET {callback}?amount={msats} → BOLT11 invoice 수신
   POST Blink GraphQL API → 운영자 Blink 계정으로 invoice 결제
3. 결제 완료 → DB status: paid
```

**선택 API**: **Blink API** (글로벌, 무료, 한국 가능, GraphQL 단일 엔드포인트)
- 운영자가 Blink 계정 보유 → API 키 1개를 서버 env에 설정
- `lnInvoicePaymentSend` mutation으로 invoice 결제
- LNbits 자체 배포 완전 불필요

**변경사항**:
- ❌ LNbits self-hosted on Railway → 제거
- ❌ Day 3 LNbits 체크포인트 → 제거
- ✅ `BLINK_API_KEY` env 변수 추가
- ✅ Day 4에 Blink API 테스트 지급 1건 확인으로 대체 (30분 작업)

---

### 결정 2 — VASP 규제 ✅ 확정

**지시**: "사용자의 가상자산을 수탁하는 게 아니라 VASP 규제는 문제없어."

**확정**: 규제 우려 해소. 별도 법률 검토 착수 불필요.

근거: 서버는 사용자 BTC를 보관하지 않음. 포인트(서비스 내 단위) → 사용자 본인 지갑(Lightning Address)으로 직접 전송. 비수탁 구조 확인.

**변경사항**:
- ❌ "VASP 법률 검토 착수" 후속과제 → 제거
- ✅ 약관에 "포인트는 서비스 내 단위, Lightning 전송은 비수탁" 문구만 명시

---

### 결정 3 — 초기 운영비 ✅ 확정

**지시**: "초기 운영비 10만원, 기존 광고비로 확보."

**확정**: 초기 3개월 운영비 **10만원 (약 $70)** 으로 확정.

**재무 분석**:
| 항목 | 비용 |
|------|------|
| Railway (3개월) | ~$15 (약 21,000원) |
| Cloudflare R2 (3개월) | $0 (무료 구간) |
| 도메인 (1년) | ~$10 (약 14,000원) |
| Blink API | $0 (무료) |
| BTC 리워드 초기 재원 | ~35,000원 분 sats |
| **합계** | **약 70,000원 이내** |

10만원으로 3개월 인프라 + 초기 리워드 지급 모두 커버 가능.

---

## 업데이트된 기술 스택

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| Lightning 지급 | LNbits self-hosted | Blink API (운영자 계정) |
| env 변수 | `LNBITS_URL`, `LNBITS_API_KEY` | `BLINK_API_KEY` |
| Day 3 체크포인트 | LNbits 노드 연결 테스트 | Blink API 테스트 지급 (Day 4 포함) |
| Lightning claim 구현 난이도 | 중상 | **하** (API 호출 1개) |

---

## Lightning Claim API 구현 (확정)

```python
import httpx

BLINK_API_URL = "https://api.blink.sv/graphql"
BLINK_API_KEY = os.getenv("BLINK_API_KEY")

async def pay_lightning_address(ln_address: str, satoshi_amount: int) -> dict:
    user, domain = ln_address.split("@")
    
    # 1. LNURL-pay 정보 조회
    lnurl_resp = await httpx.get(
        f"https://{domain}/.well-known/lnurlp/{user}"
    )
    lnurl_data = lnurl_resp.json()
    
    # 2. Invoice 요청 (msats 단위)
    invoice_resp = await httpx.get(
        f"{lnurl_data['callback']}?amount={satoshi_amount * 1000}"
    )
    invoice = invoice_resp.json()["pr"]
    
    # 3. Blink API로 결제
    mutation = """
    mutation LnInvoicePaymentSend($input: LnInvoicePaymentInput!) {
      lnInvoicePaymentSend(input: $input) {
        status
        errors { message }
      }
    }
    """
    result = await httpx.post(
        BLINK_API_URL,
        headers={"X-API-KEY": BLINK_API_KEY},
        json={"query": mutation, "variables": {
            "input": {"paymentRequest": invoice, "memo": f"workout reward"}
        }}
    )
    return result.json()
```

---

## 후속과제

| 과제 | 담당 | 우선순위 |
|------|------|---------|
| Blink 계정 생성 + API 키 발급 | 운영 | P0 |
| `.env` 에서 LNbits 변수 → BLINK_API_KEY 교체 | 개발 | P0 |
| 1week-schedule.md Day 3 체크포인트 수정 | 기획 | P0 |
| 약관 초안 (비수탁 문구) | 기획 | P1 |
