#!/bin/bash
# Phase 7 端到端 API 测试脚本：风险闭环运营（Task 14-16）
# 验证链路：
#   Task 16: collection.task.done → evaluateRegulatoryModel → monitoring.rule.hit
#   Task 14: createClue → risk.clue.created → dispatchClue(red/orange 自动派单)
#            线索 CRUD + dispose + close + my-todos + claim + complete
#   Task 15: dispatch 工单七态状态机 + V1 向后兼容（verify/rectify/review 别名）
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
DS_ID="DS-E2E-$TS"
RED_MODEL="m-e2e-red-$TS"
RED_TASK="T-E2E-RED-$TS"
YELLOW_MODEL="m-e2e-yellow-$TS"
YELLOW_TASK="T-E2E-YELLOW-$TS"

echo "=========================================="
echo "  Phase 7 E2E：风险闭环运营（Task 14-16）"
echo "  run-ts=$TS  user=$USER_ID"
echo "=========================================="

# ============================================================
# Part A：全链路 — 采集任务 → 模型评估 → 线索创建（Task 16 + 14）
# ============================================================
echo ""
echo "=== Part A：全链路触发（collection.task.done → model → clue） ==="

echo "--- T1 创建数据源 $DS_ID（treasury-sys mock） ---"
T1=$(curl -s -X POST "$BASE/collection/sources" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'id':'$DS_ID','name':'E2E风险测试源','connectorType':'treasury-sys','config':{'endpoint':'http://mock-treasury.local','token':'mock-token-123'}}")")
T1_ID=$(echo "$T1" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
[ "$T1_ID" = "$DS_ID" ] && ok "创建数据源 $DS_ID" || no "创建数据源" "$T1"

echo "--- T2 discover 探测 schema（4 streams） ---"
T2=$(curl -s -X POST "$BASE/collection/sources/$DS_ID/discover" -H "$AUTH")
T2_CNT=$(echo "$T2" | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('streams',[])))")
[ "$T2_CNT" = "4" ] && ok "discover 返回 4 streams" || no "discover" "expect 4 streams, got $T2_CNT"

echo "--- T3 创建红线测试模型 $RED_MODEL（trigger==true, level=red） ---"
T3=$(curl -s -X POST "$BASE/regulatory/models" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'id':'$RED_MODEL','sceneId':'sc-fin-dup-pay','domain':'finance-risk','name':'E2E红线模型','ruleDsl':{'conditions':{'all':[{'fact':'trigger','operator':'equal','value':True}]},'event':{'type':'risk-hit','params':{'level':'red','title':'E2E红线命中'}}},'status':'online'}")")
T3_ID=$(echo "$T3" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
[ "$T3_ID" = "$RED_MODEL" ] && ok "创建红线模型 $RED_MODEL" || no "创建红线模型" "$T3"

echo "--- T4 创建采集任务 $RED_TASK（绑定 $RED_MODEL + script transform） ---"
T4=$(curl -s -X POST "$BASE/collection/tasks" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'id':'$RED_TASK','name':'E2E红线触发任务','source':'treasury-sys','mode':'全量','sourceId':'$DS_ID','sinkType':'ods-generic','sinkTarget':'ods_e2e_red','writeMode':'append','transformPipeline':{'steps':[{'id':'s1','type':'script','config':{'code':'return { trigger: true }'}}]},'concurrency':1,'sceneId':'sc-fin-dup-pay','modelId':'$RED_MODEL','enabled':1}")")
T4_MODEL=$(echo "$T4" | python3 -c "import sys,json;print(json.load(sys.stdin).get('modelId',''))")
[ "$T4_MODEL" = "$RED_MODEL" ] && ok "创建任务 $RED_TASK (modelId=$RED_MODEL)" || no "创建任务" "$T4"

echo "--- T5 触发任务 ---"
T5=$(curl -s -X POST "$BASE/collection/tasks/$RED_TASK/trigger" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
T5_STATUS=$(echo "$T5" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))")
[ "$T5_STATUS" = "accepted" ] && ok "任务触发已受理 (status=accepted)" || no "触发任务" "$T5"

echo "--- T6 轮询任务运行状态直到 success（最多 30s） ---"
RUN_OK=0
for i in $(seq 1 30); do
  sleep 1
  T6=$(curl -s "$BASE/collection/tasks/$RED_TASK/runs" -H "$AUTH")
  T6_STATUS=$(echo "$T6" | python3 -c "import sys,json;runs=json.load(sys.stdin);print(runs[0]['status'] if runs else 'none')" 2>/dev/null || echo "err")
  if [ "$T6_STATUS" = "success" ]; then RUN_OK=1; break; fi
done
[ "$RUN_OK" = "1" ] && ok "任务运行成功 (status=success)" || no "任务运行" "最后状态: $T6_STATUS"

echo "--- T7 轮询 /risk/clues 直到红线线索出现（最多 15s，等模型评估桥接） ---"
RED_CLUES=0
for i in $(seq 1 15); do
  sleep 1
  T7=$(curl -s "$BASE/risk/clues?riskLevel=red&limit=5" -H "$AUTH")
  T7_CNT=$(echo "$T7" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
  if [ "$T7_CNT" -gt "0" ] 2>/dev/null; then RED_CLUES=1; break; fi
done
[ "$RED_CLUES" = "1" ] && ok "红线线索已创建 (count=$T7_CNT)" || no "线索创建" "无红线线索出现"

echo "--- T8 验证红线线索已自动派单（status=dispatched，red/orange 自动派单） ---"
T8=$(curl -s "$BASE/risk/clues?riskLevel=red&limit=5" -H "$AUTH")
T8_STATUS=$(echo "$T8" | python3 -c "
import sys,json
arr=json.load(sys.stdin)
assert len(arr)>0,'no red clues'
s=arr[0].get('status','')
print(s)
")
[ "$T8_STATUS" = "dispatched" ] && ok "红线线索已自动派单 (status=dispatched)" || no "自动派单" "status=$T8_STATUS"

# ============================================================
# Part B：风险线索端点测试（Task 14）
# ============================================================
echo ""
echo "=== Part B：风险线索端点（dispatch/dispose/close/disposals） ==="

# 取一个红线线索做后续测试（按 detected_at 最新优先）
RED_CLUE_ID=$(curl -s "$BASE/risk/clues?riskLevel=red&status=dispatched&limit=1" -H "$AUTH" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")

echo "--- T9 GET /risk/clues/:id 线索详情 ---"
T9=$(curl -s "$BASE/risk/clues/$RED_CLUE_ID" -H "$AUTH")
echo "$T9" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['id']=='$RED_CLUE_ID','id mismatch'
assert d['riskLevel']=='red','riskLevel mismatch'
assert d['status']=='dispatched','status mismatch'
assert d.get('workOrderId'),'workOrderId missing'
assert d.get('sceneId')=='sc-fin-dup-pay','sceneId mismatch'
print('  线索详情完整：riskLevel=red, status=dispatched, workOrderId=',d['workOrderId'])
" && ok "线索详情字段完整" || no "线索详情" "$T9"

echo "--- T10 GET /risk/clues/:id/disposals 初始应为空（dispatchClue 不记处置流水） ---"
T10=$(curl -s "$BASE/risk/clues/$RED_CLUE_ID/disposals" -H "$AUTH")
T10_CNT=$(echo "$T10" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
[ "$T10_CNT" = "0" ] && ok "初始处置流水为空 (0)" || no "处置流水初始" "expect 0, got $T10_CNT"

echo "--- T11 POST /risk/clues/:id/dispose 添加处置记录 ---"
T11=$(curl -s -X POST "$BASE/risk/clues/$RED_CLUE_ID/dispose" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'step':'dispose','handler':'$USER_ID','comment':'E2E处置记录','roleCode':'inspector'}")")
T11_STEP=$(echo "$T11" | python3 -c "import sys,json;print(json.load(sys.stdin).get('step',''))")
[ "$T11_STEP" = "dispose" ] && ok "处置记录已添加 (step=dispose)" || no "添加处置" "$T11"

echo "--- T12 GET /risk/clues/:id/disposals 应有 1 条 ---"
T12=$(curl -s "$BASE/risk/clues/$RED_CLUE_ID/disposals" -H "$AUTH")
T12_CNT=$(echo "$T12" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
[ "$T12_CNT" = "1" ] && ok "处置流水 1 条" || no "处置流水" "expect 1, got $T12_CNT"

echo "--- T13 POST /risk/clues/:id/close 销警关闭 ---"
T13=$(curl -s -X POST "$BASE/risk/clues/$RED_CLUE_ID/close" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
T13_OK=$(echo "$T13" | python3 -c "import sys,json;print(json.load(sys.stdin).get('success',False))")
[ "$T13_OK" = "True" ] && ok "线索已关闭 (success=true)" || no "关闭线索" "$T13"

echo "--- T14 GET /risk/clues/:id 验证 status=closed ---"
T14=$(curl -s "$BASE/risk/clues/$RED_CLUE_ID" -H "$AUTH")
T14_STATUS=$(echo "$T14" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))")
[ "$T14_STATUS" = "closed" ] && ok "线索状态=closed" || no "关闭状态" "status=$T14_STATUS"

# ============================================================
# Part C：黄线线索 — 人工认领流程 + 待办（Task 14）
# ============================================================
echo ""
echo "=== Part C：黄线线索人工流程（不自动派单 + todos + claim + complete） ==="

echo "--- T15 创建黄线测试模型 $YELLOW_MODEL（level=yellow） ---"
T15=$(curl -s -X POST "$BASE/regulatory/models" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'id':'$YELLOW_MODEL','sceneId':'sc-fin-private-pay','domain':'finance-risk','name':'E2E黄线模型','ruleDsl':{'conditions':{'all':[{'fact':'trigger','operator':'equal','value':True}]},'event':{'type':'risk-hit','params':{'level':'yellow','title':'E2E黄线命中'}}},'status':'online'}")")
T15_ID=$(echo "$T15" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
[ "$T15_ID" = "$YELLOW_MODEL" ] && ok "创建黄线模型 $YELLOW_MODEL" || no "创建黄线模型" "$T15"

echo "--- T16 创建+触发黄线任务 $YELLOW_TASK ---"
curl -s -X POST "$BASE/collection/tasks" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'id':'$YELLOW_TASK','name':'E2E黄线触发任务','source':'treasury-sys','mode':'全量','sourceId':'$DS_ID','sinkType':'ods-generic','sinkTarget':'ods_e2e_yellow','writeMode':'append','transformPipeline':{'steps':[{'id':'s1','type':'script','config':{'code':'return { trigger: true }'}}]},'concurrency':1,'sceneId':'sc-fin-private-pay','modelId':'$YELLOW_MODEL','enabled':1}")" > /dev/null
curl -s -X POST "$BASE/collection/tasks/$YELLOW_TASK/trigger" -H "$AUTH" -H "Content-Type: application/json" -d '{}' > /dev/null
ok "黄线任务已触发"

echo "--- T17 轮询黄线线索出现（status=pending，不自动派单） ---"
YELLOW_OK=0
for i in $(seq 1 15); do
  sleep 1
  T17=$(curl -s "$BASE/risk/clues?riskLevel=yellow&status=pending&limit=5" -H "$AUTH")
  T17_CNT=$(echo "$T17" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
  if [ "$T17_CNT" -gt "0" ] 2>/dev/null; then YELLOW_OK=1; break; fi
done
[ "$YELLOW_OK" = "1" ] && ok "黄线线索已创建 (count=$T17_CNT)" || no "黄线线索" "未出现"

T17_STATUS=$(curl -s "$BASE/risk/clues?riskLevel=yellow&status=pending&limit=1" -H "$AUTH" | python3 -c "import sys,json;print(json.load(sys.stdin)[0].get('status',''))")
[ "$T17_STATUS" = "pending" ] && ok "黄线线索未自动派单 (status=pending)" || no "黄线状态" "status=$T17_STATUS (应为 pending)"

YELLOW_CLUE_ID=$(curl -s "$BASE/risk/clues?riskLevel=yellow&status=pending&limit=1" -H "$AUTH" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")

echo "--- T18 GET /risk/my-todos 待办列表（admin 可见全部） ---"
T18=$(curl -s "$BASE/risk/my-todos" -H "$AUTH")
T18_CNT=$(echo "$T18" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
[ "$T18_CNT" -gt "0" ] 2>/dev/null && ok "待办列表非空 (count=$T18_CNT)" || no "待办列表" "空"

echo "--- T19 POST /risk/todos/:id/claim 认领黄线待办 ---"
T19=$(curl -s -X POST "$BASE/risk/todos/$YELLOW_CLUE_ID/claim" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
T19_OK=$(echo "$T19" | python3 -c "import sys,json;print(json.load(sys.stdin).get('ok',False))")
[ "$T19_OK" = "True" ] && ok "待办已认领 (ok=true)" || no "认领待办" "$T19"

echo "--- T20 验证认领后 assignedTo=$USER_ID + 处置流水 receive ---"
T20=$(curl -s "$BASE/risk/clues/$YELLOW_CLUE_ID" -H "$AUTH")
T20_OWNER=$(echo "$T20" | python3 -c "import sys,json;print(json.load(sys.stdin).get('assignedTo',''))")
T20_DISP=$(curl -s "$BASE/risk/clues/$YELLOW_CLUE_ID/disposals" -H "$AUTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['step'] if d else 'none')")
[ "$T20_OWNER" = "$USER_ID" ] && [ "$T20_DISP" = "receive" ] && ok "认领后 assignedTo=$USER_ID + receive 处置流水" || no "认领校验" "owner=$T20_OWNER disp=$T20_DISP (期望 $USER_ID)"

echo "--- T21 POST /risk/todos/:id/complete 完成处置 ---"
T21=$(curl -s -X POST "$BASE/risk/todos/$YELLOW_CLUE_ID/complete" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'comment':'E2E处置完成'}")")
T21_OK=$(echo "$T21" | python3 -c "import sys,json;print(json.load(sys.stdin).get('ok',False))")
[ "$T21_OK" = "True" ] && ok "待办处置完成 (ok=true)" || no "完成待办" "$T21"

echo "--- T22 验证完成后 status=disposed + dispose 处置流水 ---"
T22=$(curl -s "$BASE/risk/clues/$YELLOW_CLUE_ID" -H "$AUTH")
T22_STATUS=$(echo "$T22" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))")
T22_DISP_STEPS=$(curl -s "$BASE/risk/clues/$YELLOW_CLUE_ID/disposals" -H "$AUTH" | python3 -c "import sys,json;print(','.join(d['step'] for d in json.load(sys.stdin)))")
[ "$T22_STATUS" = "disposed" ] && ok "黄线线索 status=disposed (流水: $T22_DISP_STEPS)" || no "完成状态" "status=$T22_STATUS"

# ============================================================
# Part D：七态工作流 + V1 向后兼容（Task 15）
# ============================================================
echo ""
echo "=== Part D：dispatch 工单七态状态机 + V1 兼容 ==="

echo "--- T23 创建工单（POST /dispatch/work-orders，V1 初始节点 verify） ---"
T23=$(curl -s -X POST "$BASE/dispatch/work-orders" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'riskSource':'E2E七态测试工单','owner':'$USER_ID'}")")
WO_ID=$(echo "$T23" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
T23_NODE=$(echo "$T23" | python3 -c "import sys,json;print(json.load(sys.stdin).get('currentNode',''))")
T23_PROG=$(echo "$T23" | python3 -c "import sys,json;print(json.load(sys.stdin).get('progress',''))")
[ "$T23_NODE" = "verify" ] && [ "$T23_PROG" = "20" ] && ok "工单创建 currentNode=verify progress=20 (V1)" || no "创建工单" "node=$T23_NODE prog=$T23_PROG"

echo "--- T24 推进 1：verify → dispose（V1 verify 归一为 receive，推进至 dispose） ---"
T24=$(curl -s -X POST "$BASE/dispatch/work-orders/$WO_ID/advance" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
T24_FROM=$(echo "$T24" | python3 -c "import sys,json;print(json.load(sys.stdin).get('fromNode',''))")
T24_TO=$(echo "$T24" | python3 -c "import sys,json;print(json.load(sys.stdin).get('toNode',''))")
T24_PROG=$(echo "$T24" | python3 -c "import sys,json;print(json.load(sys.stdin).get('order',{}).get('progress',''))")
[ "$T24_FROM" = "receive" ] && [ "$T24_TO" = "dispose" ] && [ "$T24_PROG" = "50" ] && ok "verify→dispose (from=receive 归一, progress=50)" || no "推进1" "from=$T24_FROM to=$T24_TO prog=$T24_PROG"

echo "--- T25 推进 2：dispose → approve (progress=75) ---"
T25=$(curl -s -X POST "$BASE/dispatch/work-orders/$WO_ID/advance" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
T25_TO=$(echo "$T25" | python3 -c "import sys,json;print(json.load(sys.stdin).get('toNode',''))")
T25_PROG=$(echo "$T25" | python3 -c "import sys,json;print(json.load(sys.stdin).get('order',{}).get('progress',''))")
[ "$T25_TO" = "approve" ] && [ "$T25_PROG" = "75" ] && ok "dispose→approve (progress=75)" || no "推进2" "to=$T25_TO prog=$T25_PROG"

echo "--- T26 推进 3：approve → close (progress=90) ---"
T26=$(curl -s -X POST "$BASE/dispatch/work-orders/$WO_ID/advance" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
T26_TO=$(echo "$T26" | python3 -c "import sys,json;print(json.load(sys.stdin).get('toNode',''))")
T26_PROG=$(echo "$T26" | python3 -c "import sys,json;print(json.load(sys.stdin).get('order',{}).get('progress',''))")
[ "$T26_TO" = "close" ] && [ "$T26_PROG" = "90" ] && ok "approve→close (progress=90)" || no "推进3" "to=$T26_TO prog=$T26_PROG"

echo "--- T27 推进 4：close → archive (progress=100, status=archived) ---"
T27=$(curl -s -X POST "$BASE/dispatch/work-orders/$WO_ID/advance" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
T27_TO=$(echo "$T27" | python3 -c "import sys,json;print(json.load(sys.stdin).get('toNode',''))")
T27_PROG=$(echo "$T27" | python3 -c "import sys,json;print(json.load(sys.stdin).get('order',{}).get('progress',''))")
T27_STATUS=$(echo "$T27" | python3 -c "import sys,json;print(json.load(sys.stdin).get('order',{}).get('status',''))")
[ "$T27_TO" = "archive" ] && [ "$T27_PROG" = "100" ] && [ "$T27_STATUS" = "archived" ] && ok "close→archive (progress=100, status=archived)" || no "推进4归档" "to=$T27_TO prog=$T27_PROG status=$T27_STATUS"

echo "--- T28 推进 5：已归档工单再次推进应报错 ---"
T28_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/dispatch/work-orders/$WO_ID/advance" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
[ "$T28_HTTP" = "400" ] && ok "已归档工单推进返回 400" || no "归档后推进" "http=$T28_HTTP"

# ============================================================
# Part E：dispatchClue 工单七态（从 dispatch 节点起）
# ============================================================
echo ""
echo "=== Part E：风险线索派单工单七态（dispatch→...→archive） ==="

# 取另一个红线线索（未被关闭的）
FRESH_RED_ID=$(curl -s "$BASE/risk/clues?riskLevel=red&status=dispatched&limit=5" -H "$AUTH" | python3 -c "
import sys,json
arr=json.load(sys.stdin)
for c in arr:
    if c.get('status')=='dispatched':
        print(c['id']); break
")
FRESH_ORDER=$(curl -s "$BASE/risk/clues/$FRESH_RED_ID" -H "$AUTH" | python3 -c "import sys,json;print(json.load(sys.stdin).get('workOrderId') or '')")

if [ -n "$FRESH_RED_ID" ] && [ -n "$FRESH_ORDER" ]; then
  echo "--- T29 验证派单工单初始节点=dispatch (progress=15) ---"
  T29=$(curl -s "$BASE/dispatch/work-orders/$FRESH_ORDER" -H "$AUTH")
  T29_NODE=$(echo "$T29" | python3 -c "import sys,json;print(json.load(sys.stdin).get('currentNode',''))")
  T29_PROG=$(echo "$T29" | python3 -c "import sys,json;print(json.load(sys.stdin).get('progress',''))")
  [ "$T29_NODE" = "dispatch" ] && [ "$T29_PROG" = "15" ] && ok "派单工单 currentNode=dispatch progress=15" || no "派单工单初始" "node=$T29_NODE prog=$T29_PROG"

  echo "--- T30 推进至 archive 并验证线索联动关闭 ---"
  # dispatch → receive → dispose → approve → close → archive (5 次推进)
  ADV_OK=1
  for step in receive dispose approve close archive; do
    R=$(curl -s -X POST "$BASE/dispatch/work-orders/$FRESH_ORDER/advance" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
    TO=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('toNode',''))" 2>/dev/null || echo "err")
    if [ "$TO" != "$step" ]; then ADV_OK=0; echo "  期望 $step 实际 $TO"; break; fi
  done
  # 验证线索联动关闭
  CLUE_STATUS=$(curl -s "$BASE/risk/clues/$FRESH_RED_ID" -H "$AUTH" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))")
  [ "$ADV_OK" = "1" ] && [ "$CLUE_STATUS" = "closed" ] && ok "工单 archive 后线索联动关闭 (status=closed)" || no "联动关闭" "adv=$ADV_OK clue=$CLUE_STATUS"
else
  echo "  (跳过 T29-T30：无可用红线线索)"
fi

# ============================================================
# Part F：错误路径
# ============================================================
echo ""
echo "=== Part F：错误路径 ==="

echo "--- T31 GET /risk/clues/nonexistent → 404 ---"
T31_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/risk/clues/CLUE-NONEXISTENT" -H "$AUTH")
[ "$T31_HTTP" = "404" ] && ok "不存在线索返回 404" || no "404" "http=$T31_HTTP"

echo "--- T32 POST /risk/clues/:id/close 重复关闭已关闭线索 → 400 ---"
T32_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/risk/clues/$RED_CLUE_ID/close" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
[ "$T32_HTTP" = "400" ] && ok "重复关闭返回 400" || no "重复关闭" "http=$T32_HTTP"

echo "--- T33 POST /risk/todos/nonexistent/claim → 400 ---"
T33_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/risk/todos/CLUE-NONEXISTENT/claim" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
[ "$T33_HTTP" = "400" ] && ok "认领不存在待办返回 400" || no "认领不存在" "http=$T33_HTTP"

echo "--- T34 GET /risk/clues?status=closed 验证过滤生效 ---"
T34=$(curl -s "$BASE/risk/clues?status=closed&limit=10" -H "$AUTH")
T34_OK=$(echo "$T34" | python3 -c "
import sys,json
arr=json.load(sys.stdin)
ok=all(c.get('status')=='closed' for c in arr)
print('1' if ok else '0')
")
[ "$T34_OK" = "1" ] && ok "status=closed 过滤生效" || no "状态过滤" "存在非 closed 记录"

# ============================================================
# 汇总
# ============================================================
echo ""
echo "=========================================="
echo "  Phase 7 E2E 汇总：PASS=$PASS  FAIL=$FAIL"
echo "=========================================="
[ "$FAIL" = "0" ] && echo "✅ 全部通过" || echo "❌ 存在失败"
exit $FAIL
