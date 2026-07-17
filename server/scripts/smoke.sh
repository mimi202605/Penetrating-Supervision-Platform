#!/usr/bin/env bash
# 穿透式监管平台后端 Smoke 自测脚本
# 用法：bash scripts/smoke.sh [BASE_URL]
# 默认 BASE_URL=http://localhost:7077
# 功能：健康检查 → 登录拿 token → 遍历关键接口 → 汇总 X/Y 通过率
# 退出码：0 全部通过；1 有失败或无法连接
set -u

BASE_URL="${1:-http://localhost:7077}"
# 临时文件存放 token / 中间响应
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# 颜色（非 tty 时也安全，避免控制字符污染日志）
GREEN="\033[32m"
RED="\033[31m"
YELLOW="\033[33m"
RESET="\033[0m"
if [ ! -t 1 ]; then
  GREEN=""; RED=""; YELLOW=""; RESET=""
fi

PASS=0
FAIL=0
FAILED_ITEMS=()

# 检查后端是否在跑：先打 /health，失败给出明确提示
health_check=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "${BASE_URL}/health" 2>/dev/null || echo "000")
if [ "$health_check" = "000" ] || [ "$health_check" = "000" ]; then
  echo -e "${RED}[FATAL] 后端未响应（${BASE_URL}/health）。${RESET}"
  echo "请先启动后端：cd /workspace/server && pnpm dev"
  exit 1
fi
echo -e "${GREEN}[HEALTH] /health → ${health_check}${RESET}"

# 登录：admin/admin123，保存 token
LOGIN_RESP_FILE="${TMP_DIR}/login.json"
LOGIN_CODE=$(curl -s -o "$LOGIN_RESP_FILE" -w "%{http_code}" --max-time 5 \
  -X POST "${BASE_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' 2>/dev/null || echo "000")

if [ "$LOGIN_CODE" != "200" ]; then
  echo -e "${RED}[LOGIN] 登录失败 HTTP ${LOGIN_CODE}${RESET}"
  cat "$LOGIN_RESP_FILE" 2>/dev/null || true
  echo
  exit 1
fi

# 提取 token（兼容 jq 缺失：用 sed 兜底）
TOKEN=""
if command -v jq >/dev/null 2>&1; then
  TOKEN=$(jq -r '.token // empty' "$LOGIN_RESP_FILE" 2>/dev/null || echo "")
fi
if [ -z "$TOKEN" ]; then
  TOKEN=$(sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$LOGIN_RESP_FILE" | head -n1)
fi

if [ -z "$TOKEN" ]; then
  echo -e "${RED}[LOGIN] 登录响应中未取到 token${RESET}"
  cat "$LOGIN_RESP_FILE"
  echo
  exit 1
fi
echo -e "${GREEN}[LOGIN] /api/v1/auth/login → 200, token len=${#TOKEN}${RESET}"

# 单条 GET 校验：打印状态码，2xx 计 pass，否则计 fail
check_get() {
  local path="$1"
  local url="${BASE_URL}${path}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 \
    -H "Authorization: Bearer ${TOKEN}" "$url" 2>/dev/null || echo "000")
  if [[ "$code" =~ ^2 ]]; then
    echo -e "${GREEN}[PASS] GET ${path} → ${code}${RESET}"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}[FAIL] GET ${path} → ${code}${RESET}"
    FAIL=$((FAIL + 1))
    FAILED_ITEMS+=("GET ${path} → ${code}")
  fi
}

# 单条 POST 校验：传入 path 与 JSON body
check_post() {
  local path="$1"
  local body="$2"
  local url="${BASE_URL}${path}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -X POST "$url" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$body" 2>/dev/null || echo "000")
  if [[ "$code" =~ ^2 ]]; then
    echo -e "${GREEN}[PASS] POST ${path} → ${code}${RESET}"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}[FAIL] POST ${path} → ${code}${RESET}"
    FAIL=$((FAIL + 1))
    FAILED_ITEMS+=("POST ${path} → ${code}")
  fi
}

# 智慧监督中心
check_get "/api/v1/monitoring/overview"
check_get "/api/v1/monitoring/risk-warnings"
check_get "/api/v1/monitoring/graph/all"
check_get "/api/v1/monitoring/penetration/tree"
check_get "/api/v1/monitoring/trend"
check_get "/api/v1/monitoring/doughnut"
check_get "/api/v1/monitoring/health-bars"
check_get "/api/v1/monitoring/finance/risks"
check_get "/api/v1/monitoring/finance/trend"
check_get "/api/v1/monitoring/rules"

# 数据采集中心
check_get "/api/v1/collection/overview"
check_get "/api/v1/collection/tasks"
check_get "/api/v1/collection/sources"
check_get "/api/v1/collection/trend"

# 调度指挥中心
check_get "/api/v1/dispatch/work-orders"
check_get "/api/v1/dispatch/dashboard"

# 系统模块
check_get "/api/v1/system/audit"
check_get "/api/v1/system/settings"

# AI 网关
check_get "/api/v1/ai/health"
check_get "/api/v1/ai/sanitizer/policies"
check_post "/api/v1/ai/query" '{"query":"查看新兴铸管2026年三季度大额资金流向"}'
check_get "/api/v1/ai/logs"

# 汇总
TOTAL=$((PASS + FAIL))
echo
echo "================================ =========== =========="
echo "Smoke 汇总：${PASS} passed / ${TOTAL} total  (failed: ${FAIL})"
if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}失败项：${RESET}"
  for item in "${FAILED_ITEMS[@]}"; do
    echo -e "  - ${RED}${item}${RESET}"
  done
  exit 1
fi
echo -e "${GREEN}全部通过 ✓${RESET}"
exit 0
