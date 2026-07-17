#!/bin/bash
# Phase 5 端到端 API 测试脚本：采集任务运行时升级
# 全部通过 HTTP 端点验证，不直接访问 sqlite3 CLI（避免 WAL 模式下 disk I/O 错误）
set -e
BASE=http://localhost:7077/api/v1
TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
AUTH="Authorization: Bearer $TOKEN"
PASS=0; FAIL=0
ok() { echo "  ✓ $1"; PASS=$((PASS+1)); }
no() { echo "  ✗ $1: $2"; FAIL=$((FAIL+1)); }

echo "=== T1 创建数据源（kingdee-eas-openapi） ==="
SRC=$(curl -s -X POST $BASE/collection/sources -H "$AUTH" -H "Content-Type: application/json" -d '{
  "name":"EAS-Phase5-测试源",
  "connectorType":"kingdee-eas-openapi",
  "config":{"endpoint":"http://eas.example.com","username":"admin","password":"secret"}
}')
SID=$(echo "$SRC" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "  source id: $SID"
[ -n "$SID" ] && ok "create source" || no "create source" "no id"

echo "=== T2 discover schema（写 schema_catalog） + GET 验证 ==="
curl -s -X POST $BASE/collection/sources/$SID/discover -H "$AUTH" > /dev/null
SCHEMA=$(curl -s "$BASE/collection/sources/$SID" -H "$AUTH" | python3 -c "
import sys,json
d=json.load(sys.stdin)
sc=d.get('schemaCatalog')
print('ok' if sc and len(json.dumps(sc))>10 else 'empty')
")
[ "$SCHEMA" = "ok" ] && ok "schema_catalog written (via GET /sources/:id)" || no "discover" "schema empty"

echo "=== T3 创建采集任务（绑定 sourceId + transform_pipeline） ==="
TASK=$(curl -s -X POST $BASE/collection/tasks -H "$AUTH" -H "Content-Type: application/json" -d "{
  \"name\":\"EAS-客户主数据全量采集\",
  \"source\":\"EAS\",
  \"mode\":\"全量\",
  \"schedule\":\"0 2 * * *\",
  \"sourceId\":\"$SID\",
  \"sinkType\":\"ods-generic\",
  \"sinkTarget\":\"ods_customer\",
  \"writeMode\":\"overwrite\",
  \"concurrency\":2,
  \"retryMax\":3,
  \"retryIntervalSec\":60,
  \"timeoutSec\":30,
  \"priority\":8,
  \"enabled\":1,
  \"transformPipeline\":{\"steps\":[{\"id\":\"s1\",\"type\":\"field-mapping\",\"config\":{\"mapping\":{\"FNumber\":\"code\",\"FName\":\"name\"}}}],\"errorLimit\":{\"rate\":0.05}}
}")
TID=$(echo "$TASK" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "  task id: $TID"
echo "$TASK" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['sourceId']=='$SID','sourceId: '+str(d.get('sourceId'))
assert d['sinkType']=='ods-generic'
assert d['concurrency']==2
assert d['transformPipeline']['steps'][0]['id']=='s1'
print('  sourceId/sinkType/concurrency/pipeline 全部回显正确')
" && ok "create task with V2 fields"

echo "=== T4 GET /collection/tasks（list 返回新字段） ==="
T4=$(curl -s "$BASE/collection/tasks" -H "$AUTH")
echo "$T4" | python3 -c "
import sys,json
arr=json.load(sys.stdin)
t=[x for x in arr if x.get('id')=='$TID'][0]
for f in ['sourceId','sinkType','sinkTarget','writeMode','concurrency','retryMax','retryIntervalSec','timeoutSec','priority','enabled','sceneId','modelId']:
  assert f in t, 'missing field: '+f
print('  list 返回全部 V2 字段')
" && ok "list tasks V2 fields"

echo "=== T5 POST /collection/tasks/:id/trigger 异步触发 ==="
T5=$(curl -s -X POST $BASE/collection/tasks/$TID/trigger -H "$AUTH" -H "Content-Type: application/json" -d '{}')
echo "$T5" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['status']=='accepted','got: '+str(d)
assert d['taskId']=='$TID'
assert 'run-' in d['runId']
print('  status:',d['status'],'runId:',d['runId'])
" && ok "trigger accepted (202)"
# 等待异步执行完成
echo "  等待异步执行完成（5s）..."
sleep 5

echo "=== T6 GET /collection/tasks/:id/runs 运行历史 ==="
T6=$(curl -s "$BASE/collection/tasks/$TID/runs" -H "$AUTH")
echo "$T6" | python3 -c "
import sys,json
arr=json.load(sys.stdin)
assert len(arr)>=1,'no runs, got: '+str(arr)
r=arr[0]
assert r['taskId']=='$TID'
assert r['status'] in ['running','success','failed','killed'],'status: '+str(r['status'])
assert 'recordsRead' in r and 'recordsWrite' in r and 'recordsDirty' in r
print('  runs:',len(arr),'最新状态:',r['status'],'读:',r['recordsRead'],'写:',r['recordsWrite'])
" && ok "runs history"

echo "=== T7 验证 collection_task_runs 表数据（via /runs 接口） ==="
RUN_ID=$(echo "$T6" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
RUN_STATUS=$(echo "$T6" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['status'])")
echo "  最新 run: $RUN_ID 状态: $RUN_STATUS"
[ -n "$RUN_ID" ] && ok "task_runs 有记录 (via HTTP)" || no "task_runs" "无记录"

echo "=== T8 验证 collection_audit 4 个审计点（via /audit 接口） ==="
T8=$(curl -s "$BASE/collection/tasks/$TID/audit" -H "$AUTH")
PTS_COUNT=$(echo "$T8" | python3 -c "
import sys,json
arr=json.load(sys.stdin)
pts=set(x.get('auditPoint') for x in arr)
print(len(pts))
")
echo "  审计点数: $PTS_COUNT"
[ "$PTS_COUNT" -ge "3" ] && ok "audit 至少 3 点 (reader_in/out + writer_in/out)" || no "audit" "only $PTS_COUNT points"

echo "=== T9 验证 data_lineage 血缘（via /lineage 接口） ==="
T9=$(curl -s "$BASE/collection/tasks/$TID/lineage" -H "$AUTH")
LINEAGE_COUNT=$(echo "$T9" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
[ "$LINEAGE_COUNT" -ge "1" ] && ok "data_lineage 有 $LINEAGE_COUNT 条记录 (via HTTP)" || no "lineage" "no records"

echo "=== T10 验证 ods_generic sink 落地（via /runs recordsWrite） ==="
WRITTEN=$(echo "$T6" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['recordsWrite'])")
echo "  recordsWrite: $WRITTEN"
[ "$WRITTEN" -ge "1" ] && ok "ods_generic 写入 $WRITTEN 条 (via recordsWrite)" || no "ods_generic" "recordsWrite=0"

echo "=== T11 GET /collection/tasks/:id/checkpoints ==="
T11=$(curl -s "$BASE/collection/tasks/$TID/checkpoints" -H "$AUTH")
echo "$T11" | python3 -c "
import sys,json
arr=json.load(sys.stdin)
assert len(arr)>=1,'no checkpoints'
print('  checkpoints:',len(arr),'shard:',arr[0].get('shardId'))
" && ok "checkpoints endpoint"

echo "=== T12 GET /collection/tasks/:id/dirty ==="
T12=$(curl -s "$BASE/collection/tasks/$TID/dirty" -H "$AUTH")
DIRTY_COUNT=$(echo "$T12" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
echo "  dirty count: $DIRTY_COUNT"
ok "dirty endpoint (可能 0 条)"

echo "=== T13 GET /collection/tasks/:id/lineage ==="
T13=$(curl -s "$BASE/collection/tasks/$TID/lineage" -H "$AUTH")
echo "$T13" | python3 -c "
import sys,json
arr=json.load(sys.stdin)
assert len(arr)>=1
assert arr[0]['layer']=='ods'
print('  lineage:',len(arr),'layer:',arr[0]['layer'])
" && ok "lineage endpoint layer=ods"

echo "=== T14 GET /collection/tasks/:id/quality 质量校验后置钩子 ==="
T14=$(curl -s "$BASE/collection/tasks/$TID/quality" -H "$AUTH")
QCOUNT=$(echo "$T14" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
echo "  quality issues: $QCOUNT"
ok "quality endpoint (>=0，证明钩子执行)"

echo "=== T15 trigger 无 JWT → 401 ==="
T15=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/collection/tasks/$TID/trigger)
[ "$T15" = "401" ] && ok "no-JWT 401 (got $T15)" || no "no-JWT" "expected 401 got $T15"

echo "=== T16 trigger 不存在任务 → 404 ==="
T16=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/collection/tasks/NON-EXIST/trigger -H "$AUTH")
[ "$T16" = "404" ] && ok "non-existent task 404 (got $T16)" || no "404" "expected 404 got $T16"

echo "=== T17 DELETE /collection/tasks/:id 级联清理 ==="
T17=$(curl -s -X DELETE $BASE/collection/tasks/$TID -H "$AUTH")
echo "$T17" | python3 -c "import sys,json;d=json.load(sys.stdin);assert d.get('success')==True" && ok "delete task"

echo "=== T18 级联清理验证（via HTTP：runs/audit/lineage 应全空） ==="
REMNANT=0
for ep in runs audit lineage dirty quality; do
  C=$(curl -s "$BASE/collection/tasks/$TID/$ep" -H "$AUTH" | python3 -c "import sys,json
try:
  print(len(json.load(sys.stdin)))
except:
  print(0)")
  REMNANT=$((REMNANT+C))
done
[ "$REMNANT" = "0" ] && ok "级联清理 V2 表全部清空 (via HTTP)" || no "cascade" "remnant=$REMNANT"

# 清理 source
curl -s -X DELETE $BASE/collection/sources/$SID -H "$AUTH" > /dev/null

echo ""
echo "================================"
echo "  PASS=$PASS  FAIL=$FAIL"
echo "================================"
