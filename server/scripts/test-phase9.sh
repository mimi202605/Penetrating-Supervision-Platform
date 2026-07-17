#!/bin/bash
# Phase 9 端到端 API 测试脚本：AI 智能体编排（Task 19）
# 验证链路：
#   Task 19.1: GET /ai/agents 返回 16 类智能体 spec；GET /ai/agents/:id 详情
#   Task 19.2: POST /ai/agents/info-extract/invoke 文本抽取（未配 LLM 返回占位）
#   Task 19.3: POST /ai/agents/text-compare/invoke cosine 相似度 + LCS diff
#   Task 19.4: POST /ai/agents/report-generate/invoke 风险报告生成（先造 risk_clue）
#   Task 19.5: POST /ai/agents/orchestrate 工作流编排（contract-review 三节点链）
#   Task 19.6/19.7: 路由鉴权 + sanitizeForAI 预处理 + 未实现 501 + 错误路径
# 全部通过 HTTP 端点验证；使用时间戳后缀 ID 实现幂等可重跑
set -e
BASE=http://localhost:7077/api/v1
LOGIN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
USER_ID=$(echo "$LOGIN" | python3 -c "import sys,json;print(json.load(sys.stdin)['user']['id'])")
AUTH="Authorization: Bearer $TOKEN"
PASS=0; FAIL=0
ok() { echo "  ✓ $1"; PASS=$((PASS+1)); }
no() { echo "  ✗ $1: $2"; FAIL=$((FAIL+1)); }

# JSON 构造辅助：用 python3 生成，避免 shell 转义地狱
json() { python3 -c "import sys,json;print(json.dumps($1))"; }

# 幂等 ID：时间戳后缀
TS=$(date +%s)
CLUE_SCENE="sc-fin-dup-pay"

echo "=========================================="
echo "  Phase 9 E2E：AI 智能体编排（Task 19）"
echo "  run-ts=$TS  user=$USER_ID"
echo "=========================================="

# ============================================================
# Part A：智能体 registry（Task 19.1）
# ============================================================
echo ""
echo "=== Part A：智能体 registry（Task 19.1） ==="

echo "--- T1 GET /ai/agents 返回 16 个智能体 ---"
T1=$(curl -s "$BASE/ai/agents" -H "$AUTH")
T1_CNT=$(echo "$T1" | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('list',[])))")
[ "$T1_CNT" = "16" ] && ok "返回 16 个智能体" || no "智能体数量" "expect 16, got $T1_CNT"

echo "--- T2 16 个 agent 均含 id/name/category/protocol/implemented 字段 ---"
T2_OK=$(echo "$T1" | python3 -c "
import sys,json
arr=json.load(sys.stdin).get('list',[])
ok=all(a.get('id') and a.get('name') and a.get('category') and a.get('protocol') and isinstance(a.get('implemented'),bool) for a in arr)
print('1' if ok else '0')
")
[ "$T2_OK" = "1" ] && ok "全部字段完整" || no "字段完整性" "存在缺失字段"

echo "--- T3 已实现 agent 恰好 3 个（info-extract/text-compare/report-generate） ---"
T3_IMPL=$(echo "$T1" | python3 -c "
import sys,json
arr=json.load(sys.stdin).get('list',[])
impl=sorted([a['id'] for a in arr if a.get('implemented')])
import json as j
print(j.dumps(impl))
")
T3_EXPECT='["info-extract", "report-generate", "text-compare"]'
[ "$T3_IMPL" = "$T3_EXPECT" ] && ok "已实现 agent = $T3_IMPL" || no "已实现 agent" "expect $T3_EXPECT, got $T3_IMPL"

echo "--- T4 GET /ai/agents/info-extract 返回完整 spec ---"
T4=$(curl -s "$BASE/ai/agents/info-extract" -H "$AUTH")
T4_ID=$(echo "$T4" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
T4_CAT=$(echo "$T4" | python3 -c "import sys,json;print(json.load(sys.stdin).get('category',''))")
T4_PROTO=$(echo "$T4" | python3 -c "import sys,json;print(json.load(sys.stdin).get('protocol',''))")
[ "$T4_ID" = "info-extract" ] && [ "$T4_CAT" = "extract" ] && [ "$T4_PROTO" = "internal" ] && ok "info-extract spec 完整 (category=extract, protocol=internal)" || no "info-extract spec" "id=$T4_ID cat=$T4_CAT proto=$T4_PROTO"

echo "--- T5 GET /ai/agents/nonexistent 404 ---"
T5_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/ai/agents/nonexistent" -H "$AUTH")
[ "$T5_CODE" = "404" ] && ok "不存在 agent 404" || no "404 路径" "expect 404, got $T5_CODE"

echo "--- T6 GET /ai/agents 未鉴权 401 ---"
T6_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/ai/agents")
[ "$T6_CODE" = "401" ] && ok "未鉴权 401" || no "鉴权" "expect 401, got $T6_CODE"

# ============================================================
# Part B：info-extract 信息抽取（Task 19.2）
# ============================================================
echo ""
echo "=== Part B：info-extract 信息抽取（Task 19.2） ==="

echo "--- T7 POST /ai/agents/info-extract/invoke 抽取合同字段（占位响应） ---"
T7=$(curl -s -X POST "$BASE/ai/agents/info-extract/invoke" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'text':'合同金额100万元，收款方为张三，身份证110101199001011234','fields':['amount','payee','idcard']}")")
T7_CFG=$(echo "$T7" | python3 -c "import sys,json;print(json.load(sys.stdin).get('configured'))")
T7_FIELDS=$(echo "$T7" | python3 -c "import sys,json;d=json.load(sys.stdin);print(isinstance(d.get('fields'),dict))")
[ "$T7_CFG" = "False" ] && [ "$T7_FIELDS" = "True" ] && ok "info-extract 占位响应 (configured=False, fields=dict)" || no "info-extract" "$T7"

echo "--- T8 info-extract 缺 text 入参 400 ---"
T8_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/ai/agents/info-extract/invoke" -H "$AUTH" -H "Content-Type: application/json" -d '{"fields":["amount"]}')
[ "$T8_CODE" = "400" ] && ok "缺 text 入参 400" || no "入参校验" "expect 400, got $T8_CODE"

echo "--- T9 sanitizeForAI 脱敏：orchestrate input 含 name/amount 敏感字段 → audit_logs 有 sanitize 记录 ---"
# orchestrate 的 input 是 z.record(passthrough)，route 层 sanitizeForAI 会递归遍历 input.name/amount
# sanitizer 按字段名匹配策略（name→姓名掩码，amount→金额区间化），命中即写 audit_logs(action=sanitize)
T9=$(curl -s -X POST "$BASE/ai/agents/orchestrate" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'workflow':'contract-review','input':{'text':'合同审查','name':'张三','amount':'500万'}}")")
# 查 audit_logs 最近一条 action=sanitize 记录（sanitizer 命中字段时写审计）
T9_AUDIT=$(curl -s "$BASE/system/audit?action=sanitize&pageSize=1" -H "$AUTH")
T9_HAS_SANITIZE=$(echo "$T9_AUDIT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items=d.get('list',[])
print('1' if items else '0')
")
[ "$T9_HAS_SANITIZE" = "1" ] && ok "sanitizeForAI 命中敏感字段并写 audit_logs(action=sanitize)" || no "脱敏验证" "未发现 sanitize 审计记录"

# ============================================================
# Part C：text-compare 文本比对（Task 19.3）
# ============================================================
echo ""
echo "=== Part C：text-compare 文本比对（Task 19.3） ==="

echo "--- T10 相似文本 cosine 相似度 > 0.8 + diff 含 add/del ---"
T10=$(curl -s -X POST "$BASE/ai/agents/text-compare/invoke" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'textA':'本合同由甲方与乙方签订金额100万','textB':'本合同由甲方与乙方签订金额200万'}")")
T10_SIM=$(echo "$T10" | python3 -c "import sys,json;print(json.load(sys.stdin).get('similarity',0))")
T10_DIFF=$(echo "$T10" | python3 -c "
import sys,json
d=json.load(sys.stdin)
diff=d.get('diff',[])
types=set(x.get('type') for x in diff)
print('1' if 'add' in types and 'del' in types else '0')
")
T10_SIM_OK=$(python3 -c "print('1' if $T10_SIM > 0.8 else '0')")
[ "$T10_SIM_OK" = "1" ] && [ "$T10_DIFF" = "1" ] && ok "相似文本 sim=$T10_SIM > 0.8 且 diff 含 add/del" || no "相似文本" "sim=$T10_SIM diff=$T10_DIFF"

echo "--- T11 完全相同文本 similarity=1 ---"
T11=$(curl -s -X POST "$BASE/ai/agents/text-compare/invoke" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'textA':'完全相同的文本','textB':'完全相同的文本'}")")
T11_SIM=$(echo "$T11" | python3 -c "import sys,json;print(json.load(sys.stdin).get('similarity',0))")
[ "$T11_SIM" = "1.0" ] || [ "$T11_SIM" = "1" ] && ok "相同文本 sim=1.0" || no "相同文本" "sim=$T11_SIM"

echo "--- T12 完全不同文本 similarity < 0.1 ---"
T12=$(curl -s -X POST "$BASE/ai/agents/text-compare/invoke" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'textA':'apple banana','textB':'橙子橘子'}")")
T12_SIM=$(echo "$T12" | python3 -c "import sys,json;print(json.load(sys.stdin).get('similarity',1))")
T12_OK=$(python3 -c "print('1' if $T12_SIM < 0.1 else '0')")
[ "$T12_OK" = "1" ] && ok "不同文本 sim=$T12_SIM < 0.1" || no "不同文本" "sim=$T12_SIM"

echo "--- T13 diff 片段 eq/add/del 类型合法 ---"
T13_OK=$(echo "$T10" | python3 -c "
import sys,json
d=json.load(sys.stdin)
diff=d.get('diff',[])
ok=all(x.get('type') in ('eq','add','del') and isinstance(x.get('text'),str) for x in diff)
print('1' if ok and len(diff)>0 else '0')
")
[ "$T13_OK" = "1" ] && ok "diff 片段结构合法 (type ∈ eq/add/del, text=str)" || no "diff 结构" "非法片段"

echo "--- T14 text-compare 缺 textB 400 ---"
T14_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/ai/agents/text-compare/invoke" -H "$AUTH" -H "Content-Type: application/json" -d '{"textA":"abc"}')
[ "$T14_CODE" = "400" ] && ok "缺 textB 400" || no "入参校验" "expect 400, got $T14_CODE"

# ============================================================
# Part D：report-generate 风险报告生成（Task 19.4）
# ============================================================
echo ""
echo "=== Part D：report-generate 风险报告生成（Task 19.4） ==="

echo "--- T15 创建数据源 + 模型 + 任务（绑定 sceneId+modelId，复用 phase7 模式） ---"
DS_ID="DS-E2E-PH9-$TS"
RED_MODEL="m-e2e-ph9-$TS"
RED_TASK="T-E2E-PH9-$TS"
# 数据源
curl -s -X POST "$BASE/collection/sources" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'id':'$DS_ID','name':'E2E-Phase9源','connectorType':'treasury-sys','config':{'endpoint':'http://mock.local','token':'tk'}}")" > /dev/null
# discover 探测 schema（4 streams，否则 runtime splits 回退 default 不产记录）
curl -s -X POST "$BASE/collection/sources/$DS_ID/discover" -H "$AUTH" > /dev/null
# 红线模型（trigger==true, level=red，绑定 sc-fin-dup-pay 场景）
T15_M=$(curl -s -X POST "$BASE/regulatory/models" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'id':'$RED_MODEL','sceneId':'sc-fin-dup-pay','domain':'finance-risk','name':'E2E-Phase9红线模型','ruleDsl':{'conditions':{'all':[{'fact':'trigger','operator':'equal','value':True}]},'event':{'type':'risk-hit','params':{'level':'red','title':'E2E-Phase9命中'}}},'status':'online'}")")
T15_M_ID=$(echo "$T15_M" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
# 采集任务（绑定模型 + script transform 产出 trigger:true）
T15_T=$(curl -s -X POST "$BASE/collection/tasks" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'id':'$RED_TASK','name':'E2E-Phase9触发任务','source':'treasury-sys','mode':'全量','sourceId':'$DS_ID','sinkType':'ods-generic','sinkTarget':'ods_e2e_ph9','writeMode':'append','transformPipeline':{'steps':[{'id':'s1','type':'script','config':{'code':'return { trigger: true }'}}]},'concurrency':1,'sceneId':'sc-fin-dup-pay','modelId':'$RED_MODEL','enabled':1}")")
T15_T_MODEL=$(echo "$T15_T" | python3 -c "import sys,json;print(json.load(sys.stdin).get('modelId',''))")
[ "$T15_M_ID" = "$RED_MODEL" ] && [ "$T15_T_MODEL" = "$RED_MODEL" ] && ok "创建模型 $RED_MODEL + 任务 $RED_TASK (modelId 绑定)" || no "创建模型/任务" "model=$T15_M_ID task_model=$T15_T_MODEL"

echo "--- T16 触发任务 ---"
T16=$(curl -s -X POST "$BASE/collection/tasks/$RED_TASK/trigger" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
T16_STATUS=$(echo "$T16" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))")
[ "$T16_STATUS" = "accepted" ] && ok "任务触发已受理 (status=accepted)" || no "触发任务" "$T16"

echo "--- T17 轮询任务运行成功（最多 30s） ---"
RUN_OK=0
for i in $(seq 1 30); do
  sleep 1
  T17=$(curl -s "$BASE/collection/tasks/$RED_TASK/runs" -H "$AUTH")
  T17_STATUS=$(echo "$T17" | python3 -c "import sys,json;runs=json.load(sys.stdin);print(runs[0]['status'] if runs else 'none')" 2>/dev/null || echo "err")
  if [ "$T17_STATUS" = "success" ]; then RUN_OK=1; break; fi
done
[ "$RUN_OK" = "1" ] && ok "任务运行成功 (status=success)" || no "任务运行" "最后状态: $T17_STATUS"

echo "--- T18 轮询 /risk/clues 直到红线线索出现（最多 15s，等模型评估桥接） ---"
CLUE_ID=""
for i in $(seq 1 15); do
  sleep 1
  T18=$(curl -s "$BASE/risk/clues?riskLevel=red&limit=5" -H "$AUTH")
  CLUE_ID=$(echo "$T18" | python3 -c "import sys,json;arr=json.load(sys.stdin);print(arr[0]['id'] if arr else '')" 2>/dev/null || echo "")
  if [ -n "$CLUE_ID" ]; then break; fi
done
[ -n "$CLUE_ID" ] && ok "查询到红线风险线索 $CLUE_ID" || no "查询线索" "无线索产生"

echo "--- T19 POST /ai/agents/report-generate/invoke 生成报告（含 clueId） ---"
if [ -n "$CLUE_ID" ]; then
  T19=$(curl -s -X POST "$BASE/ai/agents/report-generate/invoke" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'clueIds':['$CLUE_ID'],'template':'standard'}")")
  T19_REPORT=$(echo "$T19" | python3 -c "import sys,json;d=json.load(sys.stdin);r=d.get('report','');print('1' if r and len(r)>50 else '0')")
  T19_CNT=$(echo "$T19" | python3 -c "import sys,json;print(json.load(sys.stdin).get('clueCount',0))")
  T19_CFG=$(echo "$T19" | python3 -c "import sys,json;print(json.load(sys.stdin).get('configured'))")
  [ "$T19_REPORT" = "1" ] && [ "$T19_CNT" = "1" ] && ok "报告生成成功 (clueCount=1, configured=$T19_CFG, report len>50)" || no "报告生成" "$T19"
else
  no "报告生成" "无可用 clueId，跳过"
fi

echo "--- T21 report-generate 不存在 clueId 404 ---"
T21_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/ai/agents/report-generate/invoke" -H "$AUTH" -H "Content-Type: application/json" -d '{"clueIds":["CLUE-NONEXISTENT-9999"]}')
[ "$T21_CODE" = "404" ] && ok "不存在 clueId 404" || no "404 路径" "expect 404, got $T21_CODE"

echo "--- T22 report-generate 缺 clueIds 400 ---"
T22_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/ai/agents/report-generate/invoke" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
[ "$T22_CODE" = "400" ] && ok "缺 clueIds 400" || no "入参校验" "expect 400, got $T22_CODE"

# ============================================================
# Part E：orchestrate 工作流编排（Task 19.5）
# ============================================================
echo ""
echo "=== Part E：orchestrate 工作流编排（Task 19.5） ==="

echo "--- T23 POST /ai/agents/orchestrate contract-review 工作流（三节点链） ---"
T23=$(curl -s -X POST "$BASE/ai/agents/orchestrate" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'workflow':'contract-review','input':{'text':'合同金额100万元，收款方张三'}}")")
T23_STATUS=$(echo "$T23" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))")
T23_NODES=$(echo "$T23" | python3 -c "
import sys,json
d=json.load(sys.stdin)
nodes=d.get('nodes',[])
names=[n.get('node') for n in nodes]
print(','.join(names))
")
[ "$T23_STATUS" = "success" ] && [ "$T23_NODES" = "info-extract,graph-build,report-generate" ] && ok "contract-review 工作流 success (三节点: $T23_NODES)" || no "工作流编排" "$T23"

echo "--- T24 每个节点含 status/latencyMs，状态合法 ---"
T24_OK=$(echo "$T23" | python3 -c "
import sys,json
d=json.load(sys.stdin)
nodes=d.get('nodes',[])
ok=all(n.get('status') in ('success','failed','skipped','pending','running') and isinstance(n.get('latencyMs'),int) for n in nodes)
print('1' if ok and len(nodes)==3 else '0')
")
[ "$T24_OK" = "1" ] && ok "三节点 status/latencyMs 字段合法" || no "节点结构" "字段缺失或非法"

echo "--- T25 orchestrate 不存在工作流 404 ---"
T25_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/ai/agents/orchestrate" -H "$AUTH" -H "Content-Type: application/json" -d '{"workflow":"nonexistent","input":{}}')
[ "$T25_CODE" = "404" ] && ok "不存在工作流 404" || no "404 路径" "expect 404, got $T25_CODE"

echo "--- T26 orchestrate 缺 workflow 入参 400 ---"
T26_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/ai/agents/orchestrate" -H "$AUTH" -H "Content-Type: application/json" -d '{"input":{}}')
[ "$T26_CODE" = "400" ] && ok "缺 workflow 400" || no "入参校验" "expect 400, got $T26_CODE"

echo "--- T27 orchestrate 响应含 totalLatencyMs > 0 ---"
T27_LAT=$(echo "$T23" | python3 -c "import sys,json;print(json.load(sys.stdin).get('totalLatencyMs',0))")
T27_OK=$(python3 -c "print('1' if $T27_LAT > 0 else '0')")
[ "$T27_OK" = "1" ] && ok "totalLatencyMs=$T27_LAT > 0" || no "总耗时" "totalLatencyMs=$T27_LAT"

# ============================================================
# Part F：未实现 agent + 错误路径
# ============================================================
echo ""
echo "=== Part F：未实现 agent + 错误路径（Task 19.6） ==="

echo "--- T28 POST /ai/agents/entity-resolve/invoke 未实现 501 ---"
T28_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/ai/agents/entity-resolve/invoke" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
[ "$T28_CODE" = "501" ] && ok "entity-resolve 未实现 501" || no "501 路径" "expect 501, got $T28_CODE"

echo "--- T29 POST /ai/agents/graph-build/invoke 未实现 501 ---"
T29_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/ai/agents/graph-build/invoke" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
[ "$T29_CODE" = "501" ] && ok "graph-build 未实现 501" || no "501 路径" "expect 501, got $T29_CODE"

echo "--- T30 POST /ai/agents/:id/invoke 未鉴权 401 ---"
T30_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/ai/agents/info-extract/invoke" -H "Content-Type: application/json" -d '{"text":"test"}')
[ "$T30_CODE" = "401" ] && ok "未鉴权 invoke 401" || no "鉴权" "expect 401, got $T30_CODE"

echo "--- T31 POST /ai/agents/orchestrate 未鉴权 401 ---"
T31_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/ai/agents/orchestrate" -H "Content-Type: application/json" -d '{"workflow":"contract-review","input":{}}')
[ "$T31_CODE" = "401" ] && ok "未鉴权 orchestrate 401" || no "鉴权" "expect 401, got $T31_CODE"

# ============================================================
# Part G：向后兼容（现有 AI 端点不破坏）
# ============================================================
echo ""
echo "=== Part G：向后兼容（现有 AI 端点不破坏） ==="

echo "--- T32 POST /ai/query 仍可用 ---"
T32=$(curl -s -X POST "$BASE/ai/query" -H "$AUTH" -H "Content-Type: application/json" -d '{"query":"查询新兴铸管账户"}')
T32_OK=$(echo "$T32" | python3 -c "import sys,json;d=json.load(sys.stdin);print('1' if d.get('understood') is not None else '0')")
[ "$T32_OK" = "1" ] && ok "/ai/query 仍可用" || no "/ai/query" "$T32"

echo "--- T33 POST /ai/contract-review 仍可用 ---"
T33=$(curl -s -X POST "$BASE/ai/contract-review" -H "$AUTH" -H "Content-Type: application/json" -d '{"contractText":"本合同金额100万元"}')
T33_OK=$(echo "$T33" | python3 -c "import sys,json;d=json.load(sys.stdin);print('1' if 'review' in d else '0')")
[ "$T33_OK" = "1" ] && ok "/ai/contract-review 仍可用" || no "/ai/contract-review" "$T33"

echo "--- T34 GET /ai/health 仍可用 ---"
T34=$(curl -s "$BASE/ai/health" -H "$AUTH")
T34_OK=$(echo "$T34" | python3 -c "import sys,json;d=json.load(sys.stdin);print('1' if 'configured' in d else '0')")
[ "$T34_OK" = "1" ] && ok "/ai/health 仍可用" || no "/ai/health" "$T34"

echo "--- T35 GET /ai/logs 仍可用（查询 ai_call_logs） ---"
T35=$(curl -s "$BASE/ai/logs?pageSize=5" -H "$AUTH")
T35_OK=$(echo "$T35" | python3 -c "import sys,json;d=json.load(sys.stdin);print('1' if 'list' in d and 'total' in d else '0')")
[ "$T35_OK" = "1" ] && ok "/ai/logs 仍可用" || no "/ai/logs" "$T35"

# ============================================================
# Part H：AI 调用日志记录（Task 19.6 跨切面）
# ============================================================
echo ""
echo "=== Part H：AI 调用日志记录（跨切面） ==="

echo "--- T36 ai_call_logs 含本次测试产生的 agent 调用记录 ---"
T36=$(curl -s "$BASE/ai/logs?endpoint=agents&pageSize=20" -H "$AUTH")
T36_CNT=$(echo "$T36" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items=d.get('list',[])
# 统计 endpoint 含 /ai/agents/ 的记录
agent_calls=[x for x in items if '/ai/agents/' in x.get('endpoint','')]
print(len(agent_calls))
")
T36_OK=$(python3 -c "print('1' if $T36_CNT >= 3 else '0')")
[ "$T36_OK" = "1" ] && ok "ai_call_logs 含 $T36_CNT 条 agent 调用记录 (>=3)" || no "AI 日志" "仅 $T36_CNT 条 agent 调用"

echo "--- T37 info-extract 调用日志 endpoint = /ai/agents/info-extract/invoke ---"
T37=$(curl -s "$BASE/ai/logs?endpoint=info-extract&pageSize=1" -H "$AUTH")
T37_EP=$(echo "$T37" | python3 -c "import sys,json;d=json.load(sys.stdin);items=d.get('list',[]);print(items[0].get('endpoint','') if items else '')")
[ "$T37_EP" = "/ai/agents/info-extract/invoke" ] && ok "info-extract 日志 endpoint 正确" || no "日志 endpoint" "got $T37_EP"

# ============================================================
# 汇总
# ============================================================
echo ""
echo "=========================================="
echo "  Phase 9 E2E 汇总：PASS=$PASS  FAIL=$FAIL"
echo "=========================================="
[ "$FAIL" = "0" ] && echo "✅ 全部通过" || echo "❌ 存在失败"
exit $FAIL
