# Stack Health — Claude Code 작업 지침

## 배포 인프라 — 반드시 숙지

### Blue-Green 배포 구조

| 슬롯 | 포트 | 상태 |
|------|------|------|
| blue | 8017 | 현재 활성 슬롯 (`.deploy-slot` 기준) |
| green | 8018 | 다음 배포 시 기동, 전환 후 종료 |

- 평상시에는 **한 슬롯만** 실행된다. 두 슬롯이 동시에 상시 실행되지 않는다.
- 배포 시에만 잠깐 두 슬롯이 겹치고, nginx 전환 후 이전 슬롯이 종료된다.
- 두 슬롯 모두 **동일한 PostgreSQL DB**를 바라본다.

### Nginx Upstream — 핵심 주의사항

**실제 nginx가 읽는 파일**: `/etc/nginx/conf.d/stackhealth-upstream.conf`

**repo 파일**: `nginx/upstream.conf` → nginx가 직접 읽지 않음. 참조용.

> **절대 하지 말 것**: `nginx/upstream.conf`만 수정하고 `nginx reload`해도 upstream이 바뀌지 않는다.
> upstream 변경이 필요하면 반드시 `/etc/nginx/conf.d/stackhealth-upstream.conf`를 수정해야 한다.

upstream 수동 변경 방법:
```bash
sudo bash -c 'cat > /etc/nginx/conf.d/stackhealth-upstream.conf << EOF
upstream stackhealth_app {
    server 127.0.0.1:8017;   # blue=8017, green=8018
    keepalive 32;
}
EOF'
sudo nginx -s reload
```

`deploy.sh`는 두 파일을 모두 업데이트하도록 수정되어 있다 (`scripts/deploy.sh` Step 7).

### 장애 이력 (2026-05-31)

- **증상**: `https://stackhealth.life` 전체 502/521, 데이터가 보이지 않음
- **원인**: deploy.sh가 `/etc/nginx/conf.d/stackhealth-upstream.conf`를 8018로 바꿨으나 green 슬롯이 실행되지 않았음. DB/백엔드 자체는 정상이었음.
- **해결**: `/etc/nginx/conf.d/stackhealth-upstream.conf`를 8017(blue)로 수정 후 reload
- **재발 방지**: `deploy.sh` Step 7이 실제 nginx 설정 파일을 직접 업데이트하도록 수정 완료
